import { z } from 'zod';
import { normalizeIndianPhone } from './phone';
import { quote, type CouponRule, type FeeConfig, type PricedItem } from './pricing';

export const checkoutInput = z.object({
  eventId: z.guid(),
  items: z.array(z.object({ ticketTypeId: z.guid(), qty: z.number().int().min(0).max(50) })).min(1).max(20),
  addons: z.array(z.object({ addonId: z.guid(), qty: z.number().int().min(0).max(50) })).max(20).optional(),
  couponCode: z.string().trim().max(30).optional(),
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
  ticketTypes: {
    id: string; name: string; pricePaise: number; gstRate: number; maxPerOrder: number;
    groupMinQty?: number | null; groupPct?: number | null;
  }[];
  addons?: { id: string; name: string; pricePaise: number; gstRate: number; maxPerOrder: number }[];
};

export type CheckoutCoupon = CouponRule & { id: string; active: boolean; validUntil: string | null; exhausted: boolean };

export class CouponExhaustedError extends Error {}

/** Why a coupon can't be used for this basket, or null if it can. */
export function couponProblem(c: CheckoutCoupon | null, items: PricedItem[], now = new Date()): string | null {
  if (!c || !c.active) return 'That coupon code is not valid for this event.';
  if (c.validUntil && now >= new Date(c.validUntil)) return 'That coupon has expired.';
  if (c.exhausted) return 'That coupon has been fully used.';
  if (c.ticketTypeIds && !items.some((it) => !it.addon && c.ticketTypeIds!.includes(it.ticketTypeId)))
    return 'That coupon does not apply to the tickets you picked.';
  return null;
}

export class UnavailableError extends Error {
  constructor(public ticketTypeId: string) {
    super(`UNAVAILABLE:${ticketTypeId}`);
  }
}

export type CheckoutDeps = {
  loadEvent(eventId: string): Promise<CheckoutEvent | null>;
  loadCoupon?(eventId: string, code: string): Promise<CheckoutCoupon | null>;
  createOrder(
    order: Record<string, unknown>, items: Record<string, unknown>[], addons?: Record<string, unknown>[],
  ): Promise<{ id: string; accessKey: string }>;
  createPaymentSession(orderId: string, amountPaise: number): Promise<string>;
  attachPaymentSession(orderId: string, rzpOrderId: string): Promise<void>;
  failOrder(orderId: string): Promise<void>;
  finalizeFree(orderId: string): Promise<void>;
};

export type CheckoutResult =
  | { ok: true; free: true; orderId: string; accessKey: string }
  | { ok: true; free: false; orderId: string; accessKey: string; paymentSessionId: string; amountPaise: number }
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
    priced.push({ ticketTypeId: id, qty, unitPricePaise: tt.pricePaise, gstRate: tt.gstRate, groupMinQty: tt.groupMinQty, groupPct: tt.groupPct });
  }
  if (priced.length === 0) return fail(400, 'Choose at least one ticket.');
  const ticketLines = priced.length;

  const addonQty = new Map<string, number>();
  for (const a of input.addons ?? []) addonQty.set(a.addonId, (addonQty.get(a.addonId) ?? 0) + a.qty);
  for (const [id, qty] of addonQty) {
    if (qty === 0) continue;
    const ad = event.addons?.find((a) => a.id === id);
    if (!ad) return fail(400, 'One of the selected extras is not part of this event.');
    if (qty > ad.maxPerOrder) return fail(400, `You can add up to ${ad.maxPerOrder} × ${ad.name} per order.`, id);
    priced.push({ ticketTypeId: id, qty, unitPricePaise: ad.pricePaise, gstRate: ad.gstRate, addon: true });
  }

  let coupon: CheckoutCoupon | null = null;
  const code = input.couponCode?.toUpperCase();
  if (code) {
    coupon = (await deps.loadCoupon?.(event.id, code)) ?? null;
    const problem = couponProblem(coupon, priced);
    if (problem) return fail(400, problem);
  }

  const q = quote(priced, event, coupon);
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
        discount_paise: q.discountPaise,
        coupon_id: coupon?.id ?? null,
        utm: input.utm ?? null,
      },
      priced.slice(0, ticketLines).map((p, i) => ({
        ticket_type_id: p.ticketTypeId, qty: p.qty, unit_price_paise: p.unitPricePaise, gst_rate: p.gstRate,
        discount_paise: q.lineDiscounts[i],
      })),
      priced.slice(ticketLines).map((p, i) => ({
        addon_id: p.ticketTypeId, qty: p.qty, unit_price_paise: p.unitPricePaise, gst_rate: p.gstRate,
        discount_paise: q.lineDiscounts[ticketLines + i],
      })),
    );
  } catch (e) {
    if (e instanceof CouponExhaustedError) return fail(409, 'That coupon was just used up. Remove it to continue.');
    if (!(e instanceof UnavailableError)) throw e;
    const name = [...event.ticketTypes, ...(event.addons ?? [])].find((t) => t.id === e.ticketTypeId)?.name ?? 'A ticket';
    return fail(409, `${name} just sold out or isn't on sale. Please change your selection.`, e.ticketTypeId);
  }

  if (q.totalPaise === 0) {
    await deps.finalizeFree(order.id);
    return { ok: true, free: true, orderId: order.id, accessKey: order.accessKey };
  }

  let paymentSessionId: string;
  try {
    paymentSessionId = await deps.createPaymentSession(order.id, q.totalPaise);
    await deps.attachPaymentSession(order.id, paymentSessionId);
  } catch {
    await deps.failOrder(order.id);
    return fail(502, 'Payments are having trouble right now. Please try again in a minute.');
  }
  return { ok: true, free: false, orderId: order.id, accessKey: order.accessKey, paymentSessionId, amountPaise: q.totalPaise };
}
