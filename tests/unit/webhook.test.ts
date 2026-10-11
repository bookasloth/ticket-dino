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
