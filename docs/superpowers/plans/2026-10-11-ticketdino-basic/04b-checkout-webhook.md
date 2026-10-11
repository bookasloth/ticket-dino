# Part 4b — Checkout and webhook

### Task 11: Checkout (API, buyer UI, order status)

**Files:**
- Create: `src/lib/checkout.ts`, `src/lib/checkout-deps.ts`, `src/app/api/checkout/route.ts`, `src/app/api/orders/[id]/route.ts`, `src/app/e/[slug]/checkout/page.tsx`, `src/app/e/[slug]/checkout/CheckoutForm.tsx`, `src/app/orders/[id]/page.tsx`, `src/app/orders/[id]/OrderStatus.tsx`
- Test: `tests/unit/checkout.test.ts`

**Interfaces:**
- Consumes: `quote`, `normalizeIndianPhone`, `saleState`/`available`, `getPublicEvent`, `adminDb`, `razorpay()`, `allow`/`clientIp`, `safeEqual`, `sendPendingNotifications`, `report`; SQL `create_order`, `fail_order`, `finalize_paid_order`.
- Produces:
  - `checkoutInput` (zod) and `CheckoutInput`
  - `placeOrder(deps: CheckoutDeps, input: CheckoutInput): Promise<CheckoutResult>`
  - `POST /api/checkout` → 200 `{ ok, free, orderId, accessKey, razorpayOrderId?, amountPaise?, keyId? }`, or 400/404/409/429/502 `{ error, ticketTypeId? }`
  - `GET /api/orders/:id?k=` → `{ status, number, tickets: string[] }` (tokens only when paid)
  - Status page URL: `/orders/:id?k=<accessKey>`

- [ ] **Step 1: Write the failing test**

`tests/unit/checkout.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { placeOrder, UnavailableError, type CheckoutDeps, type CheckoutInput } from '@/lib/checkout';

const EV = '00000000-0000-4000-8000-000000000001';
const GA = '00000000-0000-4000-8000-0000000000a1';
const KIDS = '00000000-0000-4000-8000-0000000000a2';

function deps(over: Partial<CheckoutDeps> = {}) {
  const d = {
    loadEvent: vi.fn(async () => ({
      id: EV, feeBps: 200, feeFlatPaise: 1000, feeGstRate: 18,
      ticketTypes: [
        { id: GA, name: 'General', pricePaise: 50_000, gstRate: 18, maxPerOrder: 4 },
        { id: KIDS, name: 'Kids', pricePaise: 0, gstRate: 0, maxPerOrder: 2 },
      ],
    })),
    createOrder: vi.fn(async () => ({ id: 'order-1', accessKey: 'key-1' })),
    createRazorpayOrder: vi.fn(async () => 'order_rzp_1'),
    attachRazorpayOrder: vi.fn(async () => {}),
    failOrder: vi.fn(async () => {}),
    finalizeFree: vi.fn(async () => {}),
    ...over,
  };
  return d as typeof d & CheckoutDeps;
}

const input = (items: CheckoutInput['items'], phone = '98765 43210'): CheckoutInput => ({
  eventId: EV, items, consent: true, buyer: { name: 'Asha', email: 'Asha@Example.com', phone },
});

describe('placeOrder', () => {
  it('prices on the server and opens a Razorpay order for the exact total', async () => {
    const d = deps();
    const r = await placeOrder(d, input([{ ticketTypeId: GA, qty: 2 }]));
    expect(r).toEqual({ ok: true, free: false, orderId: 'order-1', accessKey: 'key-1', razorpayOrderId: 'order_rzp_1', amountPaise: 122_720 });
    expect(d.createRazorpayOrder).toHaveBeenCalledWith('order-1', 122_720);
    const [order, items] = d.createOrder.mock.calls[0] as unknown as [Record<string, unknown>, Record<string, unknown>[]];
    expect(order).toMatchObject({ buyer_phone: '+919876543210', buyer_email: 'asha@example.com', total_paise: 122_720 });
    expect(items).toEqual([{ ticket_type_id: GA, qty: 2, unit_price_paise: 50_000, gst_rate: 18 }]);
  });

  it('issues free tickets without Razorpay', async () => {
    const d = deps();
    const r = await placeOrder(d, input([{ ticketTypeId: KIDS, qty: 2 }]));
    expect(r).toEqual({ ok: true, free: true, orderId: 'order-1', accessKey: 'key-1' });
    expect(d.finalizeFree).toHaveBeenCalledWith('order-1');
    expect(d.createRazorpayOrder).not.toHaveBeenCalled();
  });

  it('merges duplicate lines and enforces max per order', async () => {
    const d = deps();
    const r = await placeOrder(d, input([{ ticketTypeId: GA, qty: 3 }, { ticketTypeId: GA, qty: 2 }]));
    expect(r).toMatchObject({ ok: false, status: 400, ticketTypeId: GA });
    expect(d.createOrder).not.toHaveBeenCalled();
  });

  it('rejects ticket types from another event', async () => {
    const r = await placeOrder(deps(), input([{ ticketTypeId: '00000000-0000-4000-8000-0000000000ff', qty: 1 }]));
    expect(r).toMatchObject({ ok: false, status: 400 });
  });

  it('rejects a bad phone number before touching the database', async () => {
    const d = deps();
    expect(await placeOrder(d, input([{ ticketTypeId: GA, qty: 1 }], '12345'))).toMatchObject({ ok: false, status: 400 });
    expect(d.loadEvent).not.toHaveBeenCalled();
  });

  it('rejects an empty selection', async () => {
    expect(await placeOrder(deps(), input([{ ticketTypeId: GA, qty: 0 }]))).toMatchObject({ ok: false, status: 400 });
  });

  it('reports sold out as 409 naming the ticket type', async () => {
    const d = deps({ createOrder: vi.fn(async () => { throw new UnavailableError(GA); }) });
    const r = await placeOrder(d, input([{ ticketTypeId: GA, qty: 1 }]));
    expect(r).toMatchObject({ ok: false, status: 409, ticketTypeId: GA });
    expect(r.ok === false && r.error).toContain('General');
  });

  it('releases the hold when Razorpay is down', async () => {
    const d = deps({ createRazorpayOrder: vi.fn(async () => { throw new Error('503'); }) });
    const r = await placeOrder(d, input([{ ticketTypeId: GA, qty: 1 }]));
    expect(r).toMatchObject({ ok: false, status: 502 });
    expect(d.failOrder).toHaveBeenCalledWith('order-1');
  });

  it('404s an event that is not on sale', async () => {
    const r = await placeOrder(deps({ loadEvent: vi.fn(async () => null) }), input([{ ticketTypeId: GA, qty: 1 }]));
    expect(r).toMatchObject({ ok: false, status: 404 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test`
Expected: FAIL — cannot resolve `@/lib/checkout`.

- [ ] **Step 3: Implement the core**

`src/lib/checkout.ts`:
```ts
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 5: Real dependencies and API routes**

`src/lib/checkout-deps.ts`:
```ts
import 'server-only';
import { after } from 'next/server';
import { UnavailableError, type CheckoutDeps } from './checkout';
import { sendPendingNotifications } from './email/send';
import { razorpay } from './razorpay';
import { report } from './report';
import { adminDb } from './supabase/admin';

type TicketTypeRow = { id: string; name: string; price_paise: number; gst_rate: number; max_per_order: number };

export function checkoutDeps(): CheckoutDeps {
  const db = adminDb();
  return {
    async loadEvent(id) {
      const { data } = await db
        .from('events')
        .select('id, fee_bps, fee_flat_paise, fee_gst_rate, ticket_types(id, name, price_paise, gst_rate, max_per_order)')
        .eq('id', id)
        .eq('status', 'published')
        .maybeSingle();
      if (!data) return null;
      return {
        id: data.id,
        feeBps: data.fee_bps,
        feeFlatPaise: data.fee_flat_paise,
        feeGstRate: Number(data.fee_gst_rate),
        ticketTypes: (data.ticket_types as TicketTypeRow[]).map((t) => ({
          id: t.id, name: t.name, pricePaise: t.price_paise, gstRate: Number(t.gst_rate), maxPerOrder: t.max_per_order,
        })),
      };
    },
    async createOrder(order, items) {
      const { data, error } = await db.rpc('create_order', { p_order: order, p_items: items });
      if (error) {
        const m = error.message.match(/UNAVAILABLE:([0-9a-f-]{36})/);
        if (m) throw new UnavailableError(m[1]);
        throw new Error(`create_order: ${error.message}`);
      }
      const row = (data as { id: string; access_key: string }[])[0];
      return { id: row.id, accessKey: row.access_key };
    },
    async createRazorpayOrder(orderId, amountPaise) {
      try {
        const o = await razorpay().orders.create({
          amount: amountPaise,
          currency: 'INR',
          receipt: orderId,
          notes: { app: 'ticketdino', order_id: orderId },
        });
        return o.id;
      } catch (e) {
        report(e, { orderId, step: 'razorpay.orders.create' });
        throw e;
      }
    },
    async attachRazorpayOrder(orderId, rzpOrderId) {
      const { error } = await db.from('orders').update({ razorpay_order_id: rzpOrderId }).eq('id', orderId);
      if (error) throw new Error(`attach razorpay order: ${error.message}`);
    },
    async failOrder(orderId) {
      const { error } = await db.rpc('fail_order', { p_order_id: orderId });
      if (error) report(error, { orderId, step: 'fail_order' });
    },
    async finalizeFree(orderId) {
      const { error } = await db.rpc('finalize_paid_order', { p_order_id: orderId, p_payment_id: 'free' });
      if (error) throw new Error(`finalize free order: ${error.message}`);
      after(() => sendPendingNotifications(orderId).catch((e) => report(e, { orderId })));
    },
  };
}
```

`src/app/api/checkout/route.ts`:
```ts
import { checkoutInput, placeOrder } from '@/lib/checkout';
import { checkoutDeps } from '@/lib/checkout-deps';
import { normalizeIndianPhone } from '@/lib/phone';
import { allow, clientIp } from '@/lib/ratelimit';

const tooMany = () => Response.json({ error: 'Too many attempts. Please wait a minute and try again.' }, { status: 429 });

export async function POST(req: Request) {
  if (!(await allow('checkoutIp', await clientIp()))) return tooMany();
  const parsed = checkoutInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Please check your details and try again.' }, { status: 400 });

  const phone = normalizeIndianPhone(parsed.data.buyer.phone);
  if (phone && !(await allow('checkoutPhone', phone))) return tooMany();

  const result = await placeOrder(checkoutDeps(), parsed.data);
  if (!result.ok) return Response.json({ error: result.error, ticketTypeId: result.ticketTypeId }, { status: result.status });
  return Response.json(result.free ? result : { ...result, keyId: process.env.RAZORPAY_KEY_ID });
}
```

`src/app/api/orders/[id]/route.ts`:
```ts
import { z } from 'zod';
import { adminDb } from '@/lib/supabase/admin';
import { safeEqual } from '@/lib/webhook';

const notFound = () => Response.json({ error: 'Not found' }, { status: 404 });

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const key = new URL(req.url).searchParams.get('k') ?? '';
  if (!z.guid().safeParse(id).success) return notFound();

  const { data } = await adminDb()
    .from('orders')
    .select('status, number, access_key, tickets(qr_token, created_at)')
    .eq('id', id)
    .maybeSingle();
  if (!data || !safeEqual(data.access_key, key)) return notFound();

  const tickets = data.status === 'paid'
    ? (data.tickets as { qr_token: string; created_at: string }[])
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((t) => t.qr_token)
    : [];
  return Response.json({ status: data.status, number: data.number, tickets }, { headers: { 'cache-control': 'no-store' } });
}
```

- [ ] **Step 6: Checkout page and form**

`src/app/e/[slug]/checkout/page.tsx`:
```tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { available, saleState } from '@/lib/availability';
import { formatIST } from '@/lib/time';
import { getPublicEvent } from '../data';
import { CheckoutForm } from './CheckoutForm';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function CheckoutPage({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const event = await getPublicEvent(slug);
  if (!event || event.status !== 'published') notFound();

  const utm = Object.fromEntries(
    Object.entries(sp).filter((e): e is [string, string] => e[0].startsWith('utm_') && typeof e[1] === 'string'),
  );
  const ticketTypes = event.ticket_types.map((t) => ({
    id: t.id, name: t.name, pricePaise: t.price_paise, gstRate: Number(t.gst_rate),
    maxPerOrder: t.max_per_order, state: saleState(t), available: available(t),
  }));

  return (
    <main className="mx-auto max-w-lg px-4 py-6">
      <h1 className="text-xl font-bold">{event.title}</h1>
      <p className="text-muted-foreground">{formatIST(event.starts_at, { dateStyle: 'full' })}</p>
      <CheckoutForm
        event={{ id: event.id, title: event.title, feeBps: event.fee_bps, feeFlatPaise: event.fee_flat_paise, feeGstRate: Number(event.fee_gst_rate) }}
        ticketTypes={ticketTypes}
        utm={utm}
      />
    </main>
  );
}
```

`src/app/e/[slug]/checkout/CheckoutForm.tsx`:
```tsx
'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { SaleState } from '@/lib/availability';
import { formatINR } from '@/lib/money';
import { normalizeIndianPhone } from '@/lib/phone';
import { quote } from '@/lib/pricing';

type TicketType = { id: string; name: string; pricePaise: number; gstRate: number; maxPerOrder: number; state: SaleState; available: number };
type EventInfo = { id: string; title: string; feeBps: number; feeFlatPaise: number; feeGstRate: number };
type Pending = { orderId: string; razorpayOrderId: string; amountPaise: number; keyId: string; statusUrl: string };
type RazorpayCtor = new (opts: Record<string, unknown>) => { open(): void };

const STATE_LABEL: Record<SaleState, string> = { on_sale: '', sold_out: 'Sold out', not_started: 'Not on sale yet', ended: 'Sales closed' };

function loadRazorpay(): Promise<RazorpayCtor> {
  const w = window as unknown as { Razorpay?: RazorpayCtor };
  if (w.Razorpay) return Promise.resolve(w.Razorpay);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve(w.Razorpay!);
    s.onerror = () => reject(new Error('Could not load the payment window.'));
    document.body.appendChild(s);
  });
}

export function CheckoutForm({ event, ticketTypes, utm }: { event: EventInfo; ticketTypes: TicketType[]; utm: Record<string, string> }) {
  const router = useRouter();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [buyer, setBuyer] = useState({ name: '', email: '', phone: '' });
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  const items = ticketTypes
    .filter((t) => (qty[t.id] ?? 0) > 0)
    .map((t) => ({ ticketTypeId: t.id, qty: qty[t.id], unitPricePaise: t.pricePaise, gstRate: t.gstRate }));
  const q = items.length ? quote(items, event) : null;

  function setTypeQty(id: string, n: number) {
    setQty((prev) => ({ ...prev, [id]: n }));
    setPending(null); // changing the basket needs a fresh order
  }

  async function openRazorpay(p: Pending) {
    const Razorpay = await loadRazorpay();
    new Razorpay({
      key: p.keyId,
      order_id: p.razorpayOrderId,
      amount: p.amountPaise,
      currency: 'INR',
      name: 'TicketDino',
      description: event.title,
      prefill: { name: buyer.name, email: buyer.email, contact: buyer.phone },
      theme: { color: '#2e7d4f' },
      handler: () => router.push(p.statusUrl),
      modal: {
        ondismiss: () => setError('Payment not completed. Your tickets are held for 10 minutes. Tap Pay to try again.'),
      },
    }).open();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!normalizeIndianPhone(buyer.phone)) return setError('Enter a valid 10-digit Indian mobile number.');
    setBusy(true);
    try {
      if (pending) return await openRazorpay(pending);
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          eventId: event.id,
          items: items.map(({ ticketTypeId, qty }) => ({ ticketTypeId, qty })),
          buyer,
          consent,
          utm,
        }),
      });
      const j = await res.json();
      if (!res.ok) return setError(j.error ?? 'Something went wrong. Please try again.');
      const statusUrl = `/orders/${j.orderId}?k=${encodeURIComponent(j.accessKey)}`;
      if (j.free) return router.push(statusUrl);
      const p: Pending = { orderId: j.orderId, razorpayOrderId: j.razorpayOrderId, amountPaise: j.amountPaise, keyId: j.keyId, statusUrl };
      setPending(p);
      await openRazorpay(p);
    } catch (err) {
      setError(err instanceof Error && err.message.includes('payment window') ? err.message : 'Network problem. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-6">
      <fieldset className="space-y-2">
        <legend className="mb-2 font-semibold">Tickets</legend>
        {ticketTypes.map((t) => {
          const max = Math.min(t.maxPerOrder, t.available);
          return (
            <div key={t.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div>
                <div className="font-medium">{t.name}</div>
                <div className="text-sm text-muted-foreground">
                  {t.pricePaise === 0 ? 'Free' : formatINR(t.pricePaise)}
                  {t.state !== 'on_sale' && ` · ${STATE_LABEL[t.state]}`}
                </div>
              </div>
              <select
                aria-label={`Quantity for ${t.name}`}
                className="h-10 rounded-md border bg-background px-2"
                disabled={t.state !== 'on_sale'}
                value={qty[t.id] ?? 0}
                onChange={(e) => setTypeQty(t.id, Number(e.target.value))}
              >
                {Array.from({ length: (t.state === 'on_sale' ? max : 0) + 1 }, (_, n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          );
        })}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-2 font-semibold">Your details</legend>
        <div className="space-y-1">
          <Label htmlFor="name">Full name</Label>
          <Input id="name" autoComplete="name" required maxLength={100} value={buyer.name}
                 onChange={(e) => setBuyer({ ...buyer, name: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" required value={buyer.email}
                 onChange={(e) => setBuyer({ ...buyer, email: e.target.value })} />
          <p className="text-xs text-muted-foreground">We'll email your tickets here.</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="phone">Mobile number</Label>
          <Input id="phone" type="tel" inputMode="tel" autoComplete="tel" required placeholder="98765 43210" value={buyer.phone}
                 onChange={(e) => setBuyer({ ...buyer, phone: e.target.value })} />
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" required checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>
            I agree to the <Link className="underline" href="/terms">terms</Link> and to TicketDino and the organizer using my
            details to issue tickets and contact me about this event (<Link className="underline" href="/privacy">privacy policy</Link>).
          </span>
        </label>
      </fieldset>

      {q && (
        <dl className="space-y-1 rounded-lg bg-muted p-4 text-sm">
          <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatINR(q.subtotalPaise)}</dd></div>
          <div className="flex justify-between"><dt>Booking fee</dt><dd>{formatINR(q.feePaise)}</dd></div>
          <div className="flex justify-between"><dt>GST</dt><dd>{formatINR(q.gstPaise)}</dd></div>
          <div className="flex justify-between border-t pt-1 font-semibold"><dt>Total</dt><dd>{formatINR(q.totalPaise)}</dd></div>
        </dl>
      )}

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <Button type="submit" size="lg" className="w-full" disabled={!q || busy}>
        {busy ? 'Please wait…' : !q ? 'Choose tickets' : q.totalPaise === 0 ? 'Get free tickets' : `Pay ${formatINR(q.totalPaise)}`}
      </Button>
      {pending && (
        <p className="text-center text-sm">
          Already paid? <Link className="underline" href={pending.statusUrl}>Check your order status</Link>
        </p>
      )}
    </form>
  );
}
```

- [ ] **Step 7: Order status page**

`src/app/orders/[id]/OrderStatus.tsx`:
```tsx
'use client';
import { useEffect, useState } from 'react';

type State = { status: string; number: number; tickets: string[] };

export function OrderStatus({ id, k, supportEmail }: { id: string; k: string; supportEmail: string }) {
  const [s, setS] = useState<State | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    let tries = 0;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      tries++;
      try {
        const r = await fetch(`/api/orders/${id}?k=${encodeURIComponent(k)}`, { cache: 'no-store' });
        if (r.status === 404) return alive && setNotFound(true);
        if (r.ok) {
          const j: State = await r.json();
          if (!alive) return;
          setS(j);
          if (j.status === 'paid' || j.status === 'refunded') return;
        }
      } catch {
        // offline blip: keep polling
      }
      if (tries >= 90) return alive && setTimedOut(true); // ~3 minutes
      timer = setTimeout(poll, 2000);
    }
    poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [id, k]);

  if (notFound) return <p>We couldn't find this order. Check the link in your email.</p>;

  if (s?.status === 'paid')
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">You're in!</h1>
        <p>Order TD-{s.number}. We've emailed your tickets too.</p>
        <ul className="space-y-2">
          {s.tickets.map((t, i) => (
            <li key={t}>
              <a className="block rounded-lg border p-3 font-medium text-primary" href={`/t/${t}`}>View ticket {i + 1}</a>
            </li>
          ))}
        </ul>
      </div>
    );

  if (s?.status === 'refunded')
    return <p>Order TD-{s.number} has been refunded. Check your email for details.</p>;

  if (timedOut)
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-semibold">Still confirming your payment</h1>
        <p>If money was debited, your tickets will be emailed as soon as the bank confirms it, usually within 15 minutes. If it can't be confirmed, the money is refunded automatically.</p>
        {supportEmail && <p className="text-sm text-muted-foreground">Questions? {supportEmail}{s ? ` · order TD-${s.number}` : ''}</p>}
      </div>
    );

  return (
    <div className="space-y-3" aria-live="polite">
      <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-muted border-t-primary" />
      <h1 className="text-xl font-semibold">Confirming your payment…</h1>
      <p className="text-muted-foreground">This usually takes a few seconds. Please keep this page open.</p>
    </div>
  );
}
```

`src/app/orders/[id]/page.tsx`:
```tsx
import type { Metadata } from 'next';
import { OrderStatus } from './OrderStatus';

export const metadata: Metadata = { title: 'Your order · TicketDino', robots: { index: false } };

export default async function OrderPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ k?: string }>;
}) {
  const [{ id }, { k = '' }] = await Promise.all([params, searchParams]);
  return (
    <main className="mx-auto max-w-md px-4 py-12 text-center">
      <OrderStatus id={id} k={k} supportEmail={process.env.SUPPORT_EMAIL ?? ''} />
    </main>
  );
}
```

- [ ] **Step 8: Verify by hand**

Run: `pnpm test && pnpm typecheck && pnpm dev`. Set Razorpay test keys in `.env.local`.
1. Open `/e/dino-fest-2026/checkout`, pick 1 Kids Pass, fill in your details, tick consent, click "Get free tickets". You should land on "You're in!" with one ticket link.
2. Pick 1 General Admission and click "Pay ₹…". The Razorpay test modal opens. Close it and the "held for 10 minutes" message shows.
3. In psql: `select status, total_paise from orders order by created_at desc limit 2;` → the free order is `paid`, the Razorpay order is `pending` with total `61240` paise (49900 + fee 1998 + GST 8982 + fee GST 360).

- [ ] **Step 9: Commit**

```bash
git add src tests/unit
git commit -m "feat: server-priced checkout with Razorpay, free tickets and order status page"
```

---

### Task 12: Razorpay webhook

**Files:**
- Create: `src/app/api/webhooks/razorpay/route.ts`, `scripts/send-webhook.mjs`

**Interfaces:**
- Consumes: `verifyRazorpaySignature`, `parseRazorpayEvent`, `settlePayment`, `refundApi`, `sendPendingNotifications`, `report`, `adminDb`; SQL `fail_order`.
- Produces: `POST /api/webhooks/razorpay`. Bad signature → 400. Duplicate → 200 `{ duplicate: true }`. Unknown order (another product) → 200. Processing error → 500 (Razorpay retries). Also `node scripts/send-webhook.mjs <razorpay_order_id> <amount_paise>` to simulate `order.paid` locally.

- [ ] **Step 1: Route**

`src/app/api/webhooks/razorpay/route.ts`:
```ts
import { after } from 'next/server';
import { sendPendingNotifications } from '@/lib/email/send';
import { settlePayment } from '@/lib/payments';
import { refundApi } from '@/lib/razorpay';
import { report } from '@/lib/report';
import { adminDb } from '@/lib/supabase/admin';
import { parseRazorpayEvent, verifyRazorpaySignature } from '@/lib/webhook';

// Brief rule 2: the webhook is the only source of truth for "paid".
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyRazorpaySignature(raw, req.headers.get('x-razorpay-signature'), process.env.RAZORPAY_WEBHOOK_SECRET!)) {
    return new Response('invalid signature', { status: 400 });
  }
  let body: { event?: string };
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response('invalid json', { status: 400 });
  }

  const action = parseRazorpayEvent(body);
  const eventId =
    req.headers.get('x-razorpay-event-id') ??
    `${body.event}:${action.kind === 'ignore' ? 'na' : action.rzpOrderId}:${action.kind === 'paid' ? action.paymentId : ''}`;
  const db = adminDb();

  try {
    const logged = await db
      .from('webhook_events')
      .upsert(
        { provider: 'razorpay', event_id: eventId, type: body.event ?? null, payload: body },
        { onConflict: 'provider,event_id', ignoreDuplicates: true },
      );
    if (logged.error) throw logged.error;
    const { data: row, error } = await db
      .from('webhook_events')
      .select('id, processed_at')
      .eq('provider', 'razorpay')
      .eq('event_id', eventId)
      .single();
    if (error) throw error;
    if (row.processed_at) return Response.json({ ok: true, duplicate: true });

    if (action.kind !== 'ignore') {
      const { data: order, error: orderError } = await db
        .from('orders')
        .select('id, total_paise')
        .eq('razorpay_order_id', action.rzpOrderId)
        .maybeSingle();
      if (orderError) throw orderError;

      // No match = an order from another Timewheel product on the same Razorpay account. Ignore it.
      if (order && action.kind === 'paid') {
        if (action.amountPaise !== order.total_paise) {
          throw new Error(`amount mismatch on order ${order.id}: paid ${action.amountPaise}, expected ${order.total_paise}`);
        }
        await settlePayment(db, refundApi(), order.id, action.paymentId, action.amountPaise);
        after(() => sendPendingNotifications(order.id).catch((e) => report(e, { orderId: order.id })));
      } else if (order && action.kind === 'failed') {
        const { error: failError } = await db.rpc('fail_order', { p_order_id: order.id });
        if (failError) throw failError;
      }
    }

    await db.from('webhook_events').update({ processed_at: new Date().toISOString() }).eq('id', row.id);
    return Response.json({ ok: true });
  } catch (e) {
    report(e, { eventId, event: body.event });
    return new Response('processing failed', { status: 500 });
  }
}
```

- [ ] **Step 2: Local webhook simulator** (no tunnel needed for development)

`scripts/send-webhook.mjs`:
```js
// Usage: node --env-file=.env.local scripts/send-webhook.mjs <razorpay_order_id> <amount_paise> [event_id]
import { createHmac } from 'node:crypto';

const [rzpOrderId, amount, eventId = `evt_local_${Date.now()}`] = process.argv.slice(2);
if (!rzpOrderId || !amount) {
  console.error('usage: send-webhook.mjs <razorpay_order_id> <amount_paise> [event_id]');
  process.exit(1);
}
const body = JSON.stringify({
  event: 'order.paid',
  payload: {
    order: { entity: { id: rzpOrderId, amount: Number(amount) } },
    payment: { entity: { id: `pay_local_${Date.now()}`, order_id: rzpOrderId, amount: Number(amount), status: 'captured' } },
  },
});
const signature = createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(body).digest('hex');
const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/razorpay`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-razorpay-signature': signature, 'x-razorpay-event-id': eventId },
  body,
});
console.log(res.status, await res.text());
```

- [ ] **Step 3: Verify by hand**

With `pnpm dev` running and a pending Razorpay order from Task 11:
```bash
psql "<local DB_URL>" -c "select razorpay_order_id, total_paise from orders where status = 'pending' order by created_at desc limit 1"
node --env-file=.env.local scripts/send-webhook.mjs <razorpay_order_id> <total_paise> evt_test_1
node --env-file=.env.local scripts/send-webhook.mjs <razorpay_order_id> <total_paise> evt_test_1
node --env-file=.env.local scripts/send-webhook.mjs order_not_ours 100
```
Expected:
- First call → `200 {"ok":true}`, and the order becomes `paid` with tickets.
- Second call → `200 {"ok":true,"duplicate":true}`.
- Third call → `200 {"ok":true}`, and nothing changes.
- A tampered signature (edit the secret) → `400`.
- The status page for that order flips to "You're in!".
- The ticket email arrives if `RESEND_API_KEY` is set; otherwise the `notifications` row shows `failed` with the error.

- [ ] **Step 4: Commit**

```bash
git add src scripts
git commit -m "feat: idempotent Razorpay webhook with late-payment refunds"
```
