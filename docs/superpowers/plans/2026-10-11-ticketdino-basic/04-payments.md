# Part 4 — Razorpay helpers, tickets and email

### Task 9: Razorpay helpers, webhook parsing and settlePayment

**Files:**
- Create: `src/lib/webhook.ts`, `src/lib/payments.ts`, `src/lib/razorpay.ts`, `src/lib/report.ts`
- Test: `tests/unit/webhook.test.ts`, `tests/unit/payments.test.ts`

**Interfaces:**
- Consumes: SQL `finalize_paid_order`, `record_late_refund` (Task 4).
- Produces:
  - `verifyRazorpaySignature(rawBody: string, signature: string | null, secret: string): boolean`
  - `safeEqual(a: string, b: string): boolean`
  - `parseRazorpayEvent(body: unknown): WebhookAction`, where `WebhookAction = { kind: 'paid'; rzpOrderId; paymentId; amountPaise } | { kind: 'failed'; rzpOrderId } | { kind: 'ignore' }`
  - `settlePayment(db: RpcDb, refunds: RefundApi, orderId, paymentId, amountPaise): Promise<'issued' | 'already_done' | 'late_refunded'>`
  - `RefundApi = { listRefunds(paymentId): Promise<{ id: string }[]>; refund(paymentId, amountPaise, orderId): Promise<{ id: string }> }`
  - `razorpay(): Razorpay`, `refundApi(): RefundApi`, `capturedPayment(rzpOrderId): Promise<{ id: string; amount: number } | null>`
  - `report(error: unknown, context?: Record<string, unknown>): void`

- [ ] **Step 1: Write failing tests**

`tests/unit/webhook.test.ts`:
```ts
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parseRazorpayEvent, safeEqual, verifyRazorpaySignature } from '@/lib/webhook';

const secret = 'whsec_test';
const body = '{"event":"payment.captured"}';
const sig = createHmac('sha256', secret).update(body).digest('hex');

describe('verifyRazorpaySignature', () => {
  it('accepts a valid signature', () => expect(verifyRazorpaySignature(body, sig, secret)).toBe(true));
  it('rejects a tampered body', () => expect(verifyRazorpaySignature(body + ' ', sig, secret)).toBe(false));
  it('rejects missing or short signatures', () => {
    expect(verifyRazorpaySignature(body, null, secret)).toBe(false);
    expect(verifyRazorpaySignature(body, 'abc', secret)).toBe(false);
  });
});

describe('safeEqual', () => {
  it('compares strings of any length safely', () => {
    expect(safeEqual('a', 'a')).toBe(true);
    expect(safeEqual('a', 'ab')).toBe(false);
  });
});

const payment = { id: 'pay_1', order_id: 'order_1', amount: 122720 };

describe('parseRazorpayEvent', () => {
  it('payment.captured → paid', () =>
    expect(parseRazorpayEvent({ event: 'payment.captured', payload: { payment: { entity: payment } } })).toEqual({
      kind: 'paid', rzpOrderId: 'order_1', paymentId: 'pay_1', amountPaise: 122720,
    }));
  it('order.paid → paid', () =>
    expect(parseRazorpayEvent({ event: 'order.paid', payload: { payment: { entity: payment }, order: { entity: { id: 'order_1' } } } }).kind).toBe('paid'));
  it('payment.failed → failed', () =>
    expect(parseRazorpayEvent({ event: 'payment.failed', payload: { payment: { entity: payment } } })).toEqual({ kind: 'failed', rzpOrderId: 'order_1' }));
  it('payments without an order (e.g. payment links) are ignored', () =>
    expect(parseRazorpayEvent({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_2', amount: 1 } } } }).kind).toBe('ignore'));
  it('other events are ignored', () => {
    expect(parseRazorpayEvent({ event: 'refund.processed', payload: {} }).kind).toBe('ignore');
    expect(parseRazorpayEvent(null).kind).toBe('ignore');
  });
});
```

`tests/unit/payments.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { settlePayment, type RefundApi, type RpcDb } from '@/lib/payments';

function fakeDb(finalizeResult: string) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const db: RpcDb = {
    rpc: async (fn, args) => {
      calls.push({ fn, args });
      return fn === 'finalize_paid_order' ? { data: finalizeResult, error: null } : { data: null, error: null };
    },
  };
  return { db, calls };
}
function fakeRefunds(existing: { id: string }[] = []): RefundApi & { refund: ReturnType<typeof vi.fn> } {
  return { listRefunds: vi.fn(async () => existing), refund: vi.fn(async () => ({ id: 'rfnd_new' })) };
}

describe('settlePayment', () => {
  it('issues tickets without touching refunds', async () => {
    const { db } = fakeDb('issued');
    const refunds = fakeRefunds();
    expect(await settlePayment(db, refunds, 'o1', 'pay_1', 1000)).toBe('issued');
    expect(refunds.refund).not.toHaveBeenCalled();
  });

  it('refunds a late payment once and records it', async () => {
    const { db, calls } = fakeDb('late_no_inventory');
    const refunds = fakeRefunds();
    expect(await settlePayment(db, refunds, 'o1', 'pay_1', 1000)).toBe('late_refunded');
    expect(refunds.refund).toHaveBeenCalledWith('pay_1', 1000, 'o1');
    expect(calls.at(-1)).toEqual({ fn: 'record_late_refund', args: { p_order_id: 'o1', p_amount_paise: 1000, p_refund_id: 'rfnd_new' } });
  });

  it('does not refund twice when a refund already exists (webhook retry / reconcile)', async () => {
    const { db, calls } = fakeDb('late_no_inventory');
    const refunds = fakeRefunds([{ id: 'rfnd_old' }]);
    await settlePayment(db, refunds, 'o1', 'pay_1', 1000);
    expect(refunds.refund).not.toHaveBeenCalled();
    expect(calls.at(-1)?.args.p_refund_id).toBe('rfnd_old');
  });

  it('throws on database errors so the webhook returns 500 and Razorpay retries', async () => {
    const db: RpcDb = { rpc: async () => ({ data: null, error: { message: 'boom' } }) };
    await expect(settlePayment(db, fakeRefunds(), 'o1', 'pay_1', 1000)).rejects.toThrow('boom');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test`
Expected: FAIL — cannot resolve `@/lib/webhook`, `@/lib/payments`.

- [ ] **Step 3: Implement**

`src/lib/webhook.ts`:
```ts
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/** Constant-time compare for secrets of any length. */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb) && a.length === b.length;
}

export function verifyRazorpaySignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  return safeEqual(expected, signature);
}

export type WebhookAction =
  | { kind: 'paid'; rzpOrderId: string; paymentId: string; amountPaise: number }
  | { kind: 'failed'; rzpOrderId: string }
  | { kind: 'ignore' };

type Payload = {
  event?: string;
  payload?: { payment?: { entity?: { id: string; order_id?: string | null; amount: number } } };
};

export function parseRazorpayEvent(body: unknown): WebhookAction {
  const b = (body ?? {}) as Payload;
  const p = b.payload?.payment?.entity;
  if (!p?.order_id) return { kind: 'ignore' };
  switch (b.event) {
    case 'payment.captured':
    case 'order.paid':
      return { kind: 'paid', rzpOrderId: p.order_id, paymentId: p.id, amountPaise: Number(p.amount) };
    case 'payment.failed':
      return { kind: 'failed', rzpOrderId: p.order_id };
    default:
      return { kind: 'ignore' };
  }
}
```

`src/lib/payments.ts`:
```ts
export type RpcDb = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

export type RefundApi = {
  listRefunds(paymentId: string): Promise<{ id: string }[]>;
  refund(paymentId: string, amountPaise: number, orderId: string): Promise<{ id: string }>;
};

/**
 * Marks an order paid (idempotent). If the payment arrived after the seats were resold, refunds it
 * exactly once — an existing Razorpay refund on the payment is reused (brief rules 4 + 5).
 */
export async function settlePayment(
  db: RpcDb,
  refunds: RefundApi,
  orderId: string,
  paymentId: string,
  amountPaise: number,
): Promise<'issued' | 'already_done' | 'late_refunded'> {
  const { data, error } = await db.rpc('finalize_paid_order', { p_order_id: orderId, p_payment_id: paymentId });
  if (error) throw new Error(`finalize_paid_order: ${error.message}`);
  if (data !== 'late_no_inventory') return data as 'issued' | 'already_done';

  const existing = await refunds.listRefunds(paymentId);
  const refund = existing[0] ?? (await refunds.refund(paymentId, amountPaise, orderId));
  const recorded = await db.rpc('record_late_refund', {
    p_order_id: orderId,
    p_amount_paise: amountPaise,
    p_refund_id: refund.id,
  });
  if (recorded.error) throw new Error(`record_late_refund: ${recorded.error.message}`);
  return 'late_refunded';
}
```

`src/lib/razorpay.ts`:
```ts
import 'server-only';
import Razorpay from 'razorpay';
import type { RefundApi } from './payments';

let client: Razorpay | null = null;

export function razorpay(): Razorpay {
  client ??= new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID!, key_secret: process.env.RAZORPAY_KEY_SECRET! });
  return client;
}

export function refundApi(): RefundApi {
  return {
    async listRefunds(paymentId) {
      const res = await razorpay().payments.fetchMultipleRefund(paymentId);
      return res.items.map((r) => ({ id: r.id }));
    },
    async refund(paymentId, amountPaise, orderId) {
      const r = await razorpay().payments.refund(paymentId, {
        amount: amountPaise,
        notes: { order_id: orderId, reason: 'late_payment_sold_out' },
      });
      return { id: r.id };
    },
  };
}

export async function capturedPayment(rzpOrderId: string): Promise<{ id: string; amount: number } | null> {
  const res = await razorpay().orders.fetchPayments(rzpOrderId);
  const p = res.items.find((i) => i.status === 'captured');
  return p ? { id: p.id, amount: Number(p.amount) } : null;
}
```
If `fetchMultipleRefund`'s TypeScript signature differs in razorpay@2.9.8, check `node_modules/razorpay/dist/types/payments.d.ts` and adapt the call. The behavior stays the same: list the refunds for a payment.

`src/lib/report.ts`:
```ts
import * as Sentry from '@sentry/nextjs';

export function report(error: unknown, context?: Record<string, unknown>) {
  console.error(error, context);
  Sentry.captureException(error, { extra: context });
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib tests/unit
git commit -m "feat: Razorpay signature check, event parsing and idempotent settlePayment"
```

---

### Task 10: Ticket page, PDF and email delivery

**Files:**
- Create: `src/lib/tickets/url.ts`, `src/lib/tickets/load.ts`, `src/lib/tickets/pdf.tsx`, `src/lib/email/templates.ts`, `src/lib/email/send.ts`, `src/app/t/[token]/page.tsx`, `src/app/t/[token]/pdf/route.ts`
- Test: `tests/unit/ticket-url.test.ts`, `tests/unit/email-templates.test.ts`

**Interfaces:**
- Consumes: `adminDb`, `claim_notifications` (Task 4), `formatIST`, `formatINR`, `report`.
- Produces:
  - `appUrl(): string`, `ticketUrl(token): string`, `tokenFromScan(text: string): string | null`
  - `OrderEmailData = { orderNo: number; buyerName: string; totalPaise: number; organizerName: string; event: { title: string; slug: string; startsAt: string; venue: string | null }; tickets: { token: string; ticketType: string; attendeeName: string }[] }`
  - `loadOrderEmailData(db, orderId): Promise<OrderEmailData>`, `loadTicket(db, token): Promise<TicketView | null>`
  - `renderTicketsPdf(d: Pick<OrderEmailData, 'orderNo' | 'event' | 'tickets'>): Promise<Buffer>`
  - `ticketsEmail / refundEmail / lateRefundEmail(d: OrderEmailData): { subject: string; html: string }`
  - `sendPendingNotifications(orderId?: string): Promise<number>`, which sends claimed rows and returns the count

- [ ] **Step 1: Write failing tests**

`tests/unit/ticket-url.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { ticketUrl, tokenFromScan } from '@/lib/tickets/url';

const token = 'AbCdEfGhIjKlMnOpQrSt_-';

describe('ticket urls', () => {
  it('builds the public ticket url', () => expect(ticketUrl(token)).toMatch(new RegExp(`/t/${token}$`)));
  it('reads a token from a scanned url', () => expect(tokenFromScan(`https://ticketdino.in/t/${token}`)).toBe(token));
  it('reads a bare token', () => expect(tokenFromScan(token)).toBe(token));
  it('rejects anything else', () => {
    expect(tokenFromScan('https://evil.example/hello')).toBeNull();
    expect(tokenFromScan('short')).toBeNull();
  });
});
```

`tests/unit/email-templates.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { lateRefundEmail, refundEmail, ticketsEmail } from '@/lib/email/templates';
import type { OrderEmailData } from '@/lib/tickets/load';

const d: OrderEmailData = {
  orderNo: 42,
  buyerName: '<script>alert(1)</script>',
  totalPaise: 122_720,
  organizerName: 'Timewheel Events',
  event: { title: 'Dino Fest', slug: 'dino-fest', startsAt: '2026-11-10T05:30:00Z', venue: 'Jio World Garden, Mumbai' },
  tickets: [
    { token: 'AAAAAAAAAAAAAAAAAAAAAA', ticketType: 'VIP', attendeeName: 'A' },
    { token: 'BBBBBBBBBBBBBBBBBBBBBB', ticketType: 'VIP', attendeeName: 'A' },
  ],
};

describe('email templates', () => {
  it('escapes buyer input', () => {
    expect(ticketsEmail(d).html).not.toContain('<script>');
    expect(ticketsEmail(d).html).toContain('&lt;script&gt;');
  });
  it('links every ticket', () => {
    const html = ticketsEmail(d).html;
    expect(html).toContain('/t/AAAAAAAAAAAAAAAAAAAAAA');
    expect(html).toContain('/t/BBBBBBBBBBBBBBBBBBBBBB');
    expect(ticketsEmail(d).subject).toBe('Your tickets for Dino Fest');
  });
  it('states refund amounts in rupees', () => {
    expect(refundEmail(d).html).toContain('₹1,227.20');
    expect(lateRefundEmail(d).html).toContain('₹1,227.20');
    expect(refundEmail(d).subject).toContain('TD-42');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement URL helpers and loaders**

`src/lib/tickets/url.ts`:
```ts
export const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
export const ticketUrl = (token: string) => `${appUrl()}/t/${token}`;

const TOKEN = /^[A-Za-z0-9_-]{22}$/;

/** QR codes hold the ticket URL; also accept a bare token typed by hand. */
export function tokenFromScan(text: string): string | null {
  const t = text.trim();
  if (TOKEN.test(t)) return t;
  const m = t.match(/\/t\/([A-Za-z0-9_-]{22})(?:[/?#]|$)/);
  return m ? m[1] : null;
}

export const isToken = (t: string) => TOKEN.test(t);
```

`src/lib/tickets/load.ts`:
```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { isToken } from './url';

export type OrderEmailData = {
  orderNo: number;
  buyerName: string;
  totalPaise: number;
  organizerName: string;
  event: { title: string; slug: string; startsAt: string; venue: string | null };
  tickets: { token: string; ticketType: string; attendeeName: string }[];
};

type Venue = { name: string; city: string | null } | null;
const venueLabel = (v: Venue) => (v ? [v.name, v.city].filter(Boolean).join(', ') : null);

export async function loadOrderEmailData(db: SupabaseClient, orderId: string): Promise<OrderEmailData> {
  const { data, error } = await db
    .from('orders')
    .select(
      `number, buyer_name, total_paise,
       event:events(title, slug, starts_at, venue:venues(name, city), organizer:organizers(name)),
       tickets(qr_token, attendee_name, created_at, ticket_type:ticket_types(name))`,
    )
    .eq('id', orderId)
    .single();
  if (error || !data) throw new Error(`order ${orderId} not found: ${error?.message}`);
  const row = data as unknown as {
    number: number; buyer_name: string; total_paise: number;
    event: { title: string; slug: string; starts_at: string; venue: Venue; organizer: { name: string } };
    tickets: { qr_token: string; attendee_name: string; created_at: string; ticket_type: { name: string } }[];
  };
  return {
    orderNo: row.number,
    buyerName: row.buyer_name,
    totalPaise: row.total_paise,
    organizerName: row.event.organizer.name,
    event: { title: row.event.title, slug: row.event.slug, startsAt: row.event.starts_at, venue: venueLabel(row.event.venue) },
    tickets: row.tickets
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((t) => ({ token: t.qr_token, ticketType: t.ticket_type.name, attendeeName: t.attendee_name })),
  };
}

export type TicketView = {
  qr_token: string;
  status: 'valid' | 'void' | 'checked_in';
  attendee_name: string;
  checked_in_at: string | null;
  ticket_type: { name: string };
  order: { number: number };
  event: { title: string; slug: string; starts_at: string; venue: Venue };
};

export async function loadTicket(db: SupabaseClient, token: string): Promise<TicketView | null> {
  if (!isToken(token)) return null;
  const { data } = await db
    .from('tickets')
    .select(
      `qr_token, status, attendee_name, checked_in_at, ticket_type:ticket_types(name), order:orders(number),
       event:events(title, slug, starts_at, venue:venues(name, city))`,
    )
    .eq('qr_token', token)
    .maybeSingle();
  return (data as unknown as TicketView) ?? null;
}

export const ticketVenue = (t: TicketView) => venueLabel(t.event.venue);
```

- [ ] **Step 4: PDF**

`src/lib/tickets/pdf.tsx`:
```tsx
import { Document, Image, Page, StyleSheet, Text, renderToBuffer } from '@react-pdf/renderer';
import QRCode from 'qrcode';
import { formatIST } from '@/lib/time';
import type { OrderEmailData } from './load';
import { ticketUrl } from './url';

const s = StyleSheet.create({
  page: { padding: 24, fontSize: 11, fontFamily: 'Helvetica' },
  brand: { fontSize: 10, color: '#2e7d4f', fontFamily: 'Helvetica-Bold' },
  title: { fontSize: 16, marginTop: 6, fontFamily: 'Helvetica-Bold' },
  row: { marginTop: 4 },
  qr: { width: 190, height: 190, marginTop: 12, alignSelf: 'center' },
  small: { fontSize: 8, color: '#666', marginTop: 8, textAlign: 'center' },
});

// Built-in Helvetica lacks U+202F (narrow no-break space) that en-IN dates use.
const pdfDate = (iso: string) => formatIST(iso, { dateStyle: 'full' }).replace(/ /g, ' ');

export async function renderTicketsPdf(d: Pick<OrderEmailData, 'orderNo' | 'event' | 'tickets'>): Promise<Buffer> {
  const qrs = await Promise.all(d.tickets.map((t) => QRCode.toDataURL(ticketUrl(t.token), { margin: 1, width: 600 })));
  return renderToBuffer(
    <Document title={`Tickets TD-${d.orderNo}`}>
      {d.tickets.map((t, i) => (
        <Page key={t.token} size="A6" style={s.page}>
          <Text style={s.brand}>TicketDino</Text>
          <Text style={s.title}>{d.event.title}</Text>
          <Text style={s.row}>{pdfDate(d.event.startsAt)}</Text>
          {d.event.venue ? <Text style={s.row}>{d.event.venue}</Text> : null}
          <Text style={s.row}>
            {t.ticketType} · {t.attendeeName}
          </Text>
          <Image src={qrs[i]} style={s.qr} />
          <Text style={s.small}>
            Order TD-{d.orderNo} · Ticket {i + 1} of {d.tickets.length} · Valid for one entry
          </Text>
        </Page>
      ))}
    </Document>,
  );
}
```

- [ ] **Step 5: Email templates and sender**

`src/lib/email/templates.ts`:
```ts
import { formatINR } from '@/lib/money';
import type { OrderEmailData } from '@/lib/tickets/load';
import { ticketUrl } from '@/lib/tickets/url';
import { formatIST } from '@/lib/time';

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]);

const layout = (body: string) =>
  `<!doctype html><html><body style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:16px;color:#111">` +
  `${body}<p style="color:#666;font-size:12px;margin-top:32px">Sent by TicketDino on behalf of the organizer. ` +
  `Need help? Reply to this email and quote your order number.</p></body></html>`;

const when = (d: OrderEmailData) =>
  `<p><strong>${escapeHtml(formatIST(d.event.startsAt, { dateStyle: 'full' }))}</strong>` +
  (d.event.venue ? `<br>${escapeHtml(d.event.venue)}` : '') + `</p>`;

export function ticketsEmail(d: OrderEmailData) {
  const links = d.tickets
    .map((t, i) => `<li><a href="${ticketUrl(t.token)}">Ticket ${i + 1}: ${escapeHtml(t.ticketType)}</a></li>`)
    .join('');
  return {
    subject: `Your tickets for ${d.event.title}`,
    html: layout(
      `<h1 style="font-size:20px">You're going to ${escapeHtml(d.event.title)}!</h1>` +
        `<p>Hi ${escapeHtml(d.buyerName)}, here are your tickets for order TD-${d.orderNo}.</p>` +
        when(d) +
        `<ul>${links}</ul>` +
        `<p>Show the QR code at the gate. Each code works once. Your tickets are also attached as a PDF.</p>`,
    ),
  };
}

export function refundEmail(d: OrderEmailData) {
  return {
    subject: `Refund for order TD-${d.orderNo}`,
    html: layout(
      `<p>Hi ${escapeHtml(d.buyerName)},</p>` +
        `<p>Your order TD-${d.orderNo} for ${escapeHtml(d.event.title)} has been refunded: ${formatINR(d.totalPaise)}. ` +
        `It usually reaches your account in 5–7 working days. The tickets on this order no longer work.</p>`,
    ),
  };
}

export function lateRefundEmail(d: OrderEmailData) {
  return {
    subject: `Sorry, ${d.event.title} sold out before your payment completed`,
    html: layout(
      `<p>Hi ${escapeHtml(d.buyerName)},</p>` +
        `<p>Your payment for order TD-${d.orderNo} reached us after the last tickets were sold. ` +
        `We've refunded the full ${formatINR(d.totalPaise)}; it usually reaches your account in 5–7 working days. ` +
        `We're sorry for the trouble.</p>`,
    ),
  };
}
```

`src/lib/email/send.ts`:
```ts
import 'server-only';
import { Resend } from 'resend';
import { report } from '@/lib/report';
import { adminDb } from '@/lib/supabase/admin';
import { loadOrderEmailData } from '@/lib/tickets/load';
import { renderTicketsPdf } from '@/lib/tickets/pdf';
import { lateRefundEmail, refundEmail, ticketsEmail } from './templates';

type NotificationRow = { id: string; order_id: string; template: 'tickets' | 'refund' | 'late_refund'; recipient: string };

const from = (organizer: string) => `${organizer.replace(/[<>"\r\n]/g, '')} via TicketDino <${process.env.EMAIL_FROM}>`;
const TEMPLATES = { tickets: ticketsEmail, refund: refundEmail, late_refund: lateRefundEmail };

/** Sends claimed notifications. Safe to run concurrently (rows are claimed with SKIP LOCKED). */
export async function sendPendingNotifications(orderId?: string): Promise<number> {
  const db = adminDb();
  const { data, error } = await db.rpc('claim_notifications', { p_order_id: orderId ?? null, p_limit: 20 });
  if (error) throw new Error(`claim_notifications: ${error.message}`);
  const rows = (data ?? []) as NotificationRow[];
  const resend = new Resend(process.env.RESEND_API_KEY);

  for (const n of rows) {
    try {
      const d = await loadOrderEmailData(db, n.order_id);
      const { subject, html } = TEMPLATES[n.template](d);
      const attachments =
        n.template === 'tickets' ? [{ filename: `tickets-TD-${d.orderNo}.pdf`, content: await renderTicketsPdf(d) }] : undefined;
      const { data: sent, error: sendError } = await resend.emails.send(
        { from: from(d.organizerName), to: n.recipient, replyTo: process.env.SUPPORT_EMAIL, subject, html, attachments },
        { idempotencyKey: `notification-${n.id}` },
      );
      if (sendError) throw new Error(sendError.message);
      await db
        .from('notifications')
        .update({ status: 'sent', sent_at: new Date().toISOString(), provider_id: sent?.id ?? null, last_error: null })
        .eq('id', n.id);
    } catch (e) {
      await db.from('notifications').update({ status: 'failed', last_error: String(e).slice(0, 500) }).eq('id', n.id);
      report(e, { notificationId: n.id });
    }
  }
  return rows.length;
}
```

- [ ] **Step 6: Ticket page and PDF route**

`src/app/t/[token]/page.tsx`:
```tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import { Badge } from '@/components/ui/badge';
import { adminDb } from '@/lib/supabase/admin';
import { loadTicket, ticketVenue } from '@/lib/tickets/load';
import { ticketUrl } from '@/lib/tickets/url';
import { formatIST } from '@/lib/time';

export const metadata: Metadata = { title: 'Your ticket · TicketDino', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function TicketPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await loadTicket(adminDb(), token); // token is a 128-bit secret: possession = access
  if (!t) notFound();
  const svg = await QRCode.toString(ticketUrl(t.qr_token), { type: 'svg', margin: 1 });
  const venue = ticketVenue(t);

  return (
    <main className="mx-auto max-w-sm px-4 py-8 text-center">
      <p className="text-sm text-muted-foreground">Order TD-{t.order.number}</p>
      <h1 className="mt-1 text-2xl font-bold">{t.event.title}</h1>
      <p className="mt-1">{formatIST(t.event.starts_at, { dateStyle: 'full' })}</p>
      {venue && <p className="text-muted-foreground">{venue}</p>}
      <p className="mt-4 font-medium">
        {t.ticket_type.name} · {t.attendee_name}
      </p>

      {t.status === 'void' ? (
        <p className="mt-6 rounded-md bg-destructive/10 p-4 text-destructive">This ticket is void (refunded or cancelled).</p>
      ) : (
        <>
          {/* qrcode output is trusted SVG generated on our server */}
          <div data-testid="ticket-qr" className="mx-auto mt-6 w-64 rounded-lg bg-white p-2" dangerouslySetInnerHTML={{ __html: svg }} />
          {t.status === 'checked_in' && t.checked_in_at && (
            <Badge variant="secondary" className="mt-4">Checked in {formatIST(t.checked_in_at)}</Badge>
          )}
          <a className="mt-6 inline-block text-primary underline" href={`/t/${t.qr_token}/pdf`}>Download PDF</a>
        </>
      )}
    </main>
  );
}
```

`src/app/t/[token]/pdf/route.ts`:
```ts
import { adminDb } from '@/lib/supabase/admin';
import { loadTicket, ticketVenue } from '@/lib/tickets/load';
import { renderTicketsPdf } from '@/lib/tickets/pdf';

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const t = await loadTicket(adminDb(), (await params).token);
  if (!t) return new Response('Not found', { status: 404 });
  if (t.status === 'void') return new Response('This ticket is void', { status: 410 });
  const pdf = await renderTicketsPdf({
    orderNo: t.order.number,
    event: { title: t.event.title, slug: t.event.slug, startsAt: t.event.starts_at, venue: ticketVenue(t) },
    tickets: [{ token: t.qr_token, ticketType: t.ticket_type.name, attendeeName: t.attendee_name }],
  });
  return new Response(new Uint8Array(pdf), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="ticket-TD-${t.order.number}.pdf"`,
      'x-robots-tag': 'noindex',
    },
  });
}
```

- [ ] **Step 7: Run tests, then check by hand**

Run: `pnpm test && pnpm typecheck`
Expected: PASS.

Manual check: issue a paid order directly in SQL with `supabase db reset`, then `psql "$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '"')"`:
```sql
select id from create_order('{"event_id":"cccccccc-cccc-cccc-cccc-cccccccccccc","buyer_name":"Test","buyer_email":"you@example.com","buyer_phone":"+919876543210","subtotal_paise":49900,"fee_paise":0,"gst_paise":0,"total_paise":49900}',
  (select jsonb_build_array(jsonb_build_object('ticket_type_id', id, 'qty', 1, 'unit_price_paise', 49900, 'gst_rate', 18)) from ticket_types where name = 'General Admission'));
select finalize_paid_order('<id from above>', 'pay_manual');
select qr_token from tickets;
```
Open `http://localhost:3000/t/<qr_token>`: the QR shows, and "Download PDF" downloads a one-page A6 PDF.

- [ ] **Step 8: Commit**

```bash
git add src tests/unit
git commit -m "feat: ticket page, QR PDF and Resend email delivery with retries"
```
