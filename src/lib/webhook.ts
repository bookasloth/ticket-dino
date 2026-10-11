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
