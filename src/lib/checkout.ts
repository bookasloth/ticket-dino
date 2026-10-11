import { z } from 'zod';
import { normalizeIndianPhone } from './phone';
import { quote, type FeeConfig, type PricedItem } from './pricing';

export const checkoutInput = z.object({
  eventId: z.guid(),
  items: z.array(z.object({ ticketTypeId: z.guid(), qty: z.number().int().min(0).max(50) })).min(1).max(20),
  buyer: z.object({
    name: z.string().trim().min(1).max(100),
    email: z.email().max(200),
    phone: z.string().max(25),
  }),
  consent: z.literal(true),
  utm: z.record(z.string(), z.string().max(200)).optional(),
});
export type CheckoutInput = z.infer<typeof checkoutInput>;

export type CheckoutEvent = FeeConfig & {
  id: string;
  ticketTypes: { id: string; name: string; pricePaise: number; gstRate: number; maxPerOrder: number }[];
};

export class UnavailableError extends Error {
  constructor(public ticketTypeId: string) {
    super(`UNAVAILABLE:${ticketTypeId}`);
  }
}

export type CheckoutDeps = {
  loadEvent(eventId: string): Promise<CheckoutEvent | null>;
  createOrder(order: Record<string, unknown>, items: Record<string, unknown>[]): Promise<{ id: string; accessKey: string }>;
  createRazorpayOrder(orderId: string, amountPaise: number): Promise<string>;
  attachRazorpayOrder(orderId: string, rzpOrderId: string): Promise<void>;
  failOrder(orderId: string): Promise<void>;
  finalizeFree(orderId: string): Promise<void>;
};

export type CheckoutResult =
  | { ok: true; free: true; orderId: string; accessKey: string }
  | { ok: true; free: false; orderId: string; accessKey: string; razorpayOrderId: string; amountPaise: number }
  | { ok: false; status: 400 | 404 | 409 | 502; error: string; ticketTypeId?: string };

const fail = (status: 400 | 404 | 409 | 502, error: string, ticketTypeId?: string): CheckoutResult => ({
  ok: false, status, error, ...(ticketTypeId ? { ticketTypeId } : {}),
});

/** Brief rule 8: the server owns the price. The client sends only ticket ids and quantities. */
export async function placeOrder(deps: CheckoutDeps, input: CheckoutInput): Promise<CheckoutResult> {
  const phone = normalizeIndianPhone(input.buyer.phone);
  if (!phone) return fail(400, 'Enter a valid 10-digit Indian mobile number.');

  const event = await deps.loadEvent(input.eventId);
  if (!event) return fail(404, 'This event is not on sale.');

  const qtyByType = new Map<string, number>();
  for (const it of input.items) qtyByType.set(it.ticketTypeId, (qtyByType.get(it.ticketTypeId) ?? 0) + it.qty);

  const priced: PricedItem[] = [];
  for (const [id, qty] of qtyByType) {
    if (qty === 0) continue;
    const tt = event.ticketTypes.find((t) => t.id === id);
    if (!tt) return fail(400, 'One of the selected tickets is not part of this event.');
    if (qty > tt.maxPerOrder) return fail(400, `You can buy up to ${tt.maxPerOrder} ${tt.name} tickets per order.`, id);
    priced.push({ ticketTypeId: id, qty, unitPricePaise: tt.pricePaise, gstRate: tt.gstRate });
  }
  if (priced.length === 0) return fail(400, 'Choose at least one ticket.');

  const q = quote(priced, event);
  let order: { id: string; accessKey: string };
  try {
    order = await deps.createOrder(
      {
        event_id: event.id,
        buyer_name: input.buyer.name,
        buyer_email: input.buyer.email.toLowerCase(),
        buyer_phone: phone,
        subtotal_paise: q.subtotalPaise,
        fee_paise: q.feePaise,
        gst_paise: q.gstPaise,
        total_paise: q.totalPaise,
        utm: input.utm ?? null,
      },
      priced.map((p) => ({ ticket_type_id: p.ticketTypeId, qty: p.qty, unit_price_paise: p.unitPricePaise, gst_rate: p.gstRate })),
    );
  } catch (e) {
    if (!(e instanceof UnavailableError)) throw e;
    const name = event.ticketTypes.find((t) => t.id === e.ticketTypeId)?.name ?? 'A ticket';
    return fail(409, `${name} just sold out or isn't on sale. Please change your selection.`, e.ticketTypeId);
  }

  if (q.totalPaise === 0) {
    await deps.finalizeFree(order.id);
    return { ok: true, free: true, orderId: order.id, accessKey: order.accessKey };
  }

  let razorpayOrderId: string;
  try {
    razorpayOrderId = await deps.createRazorpayOrder(order.id, q.totalPaise);
    await deps.attachRazorpayOrder(order.id, razorpayOrderId);
  } catch {
    await deps.failOrder(order.id);
    return fail(502, 'Payments are having trouble right now. Please try again in a minute.');
  }
  return { ok: true, free: false, orderId: order.id, accessKey: order.accessKey, razorpayOrderId, amountPaise: q.totalPaise };
}
