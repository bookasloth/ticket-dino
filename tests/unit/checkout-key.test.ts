import { describe, expect, it } from 'vitest';
import { checkoutKey } from '@/lib/checkout-key';

const items = [{ ticketTypeId: 'a', qty: 2 }];
const buyer = { name: 'Rahul', email: 'rahul@gmial.com', phone: '9876543210' };

describe('checkoutKey (reuse a pending Razorpay order only for the same checkout)', () => {
  it('is stable for identical input', () => expect(checkoutKey(items, { ...buyer })).toBe(checkoutKey(items, buyer)));
  it('changes when the buyer fixes their email', () =>
    expect(checkoutKey(items, { ...buyer, email: 'rahul@gmail.com' })).not.toBe(checkoutKey(items, buyer)));
  it('changes when the phone or name changes', () => {
    expect(checkoutKey(items, { ...buyer, phone: '9876543211' })).not.toBe(checkoutKey(items, buyer));
    expect(checkoutKey(items, { ...buyer, name: 'Rahul K' })).not.toBe(checkoutKey(items, buyer));
  });
  it('changes when quantities change', () =>
    expect(checkoutKey([{ ticketTypeId: 'a', qty: 3 }], buyer)).not.toBe(checkoutKey(items, buyer)));
});
