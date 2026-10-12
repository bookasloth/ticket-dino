import { describe, expect, it } from 'vitest';
import { couponProblem, type CheckoutCoupon } from '@/lib/checkout';
import { quote, splitProportional } from '@/lib/pricing';

const noFee = { feeBps: 0, feeFlatPaise: 0, feeGstRate: 18 };
const ga = { ticketTypeId: 'ga', qty: 5, unitPricePaise: 10_000, gstRate: 18, groupMinQty: 5, groupPct: 10 };

describe('discounts', () => {
  it('applies the group discount at the threshold and charges GST on the net', () => {
    const q = quote([ga], noFee);
    expect(q.discountPaise).toBe(5_000);
    expect(q.gstPaise).toBe(8_100); // 18% of 45,000
    expect(q.totalPaise).toBe(53_100);
    expect(quote([{ ...ga, qty: 4 }], noFee).discountPaise).toBe(0);
  });

  it('stacks a capped percent coupon after the group discount', () => {
    const q = quote([ga], noFee, { kind: 'percent', value: 20, maxDiscountPaise: 5_000, ticketTypeIds: null });
    expect(q.couponDiscountPaise).toBe(5_000); // 20% of 45,000 = 9,000, capped
    expect(q.discountPaise).toBe(10_000);
  });

  it('limits a flat coupon to eligible lines and never goes below zero', () => {
    const items = [
      { ticketTypeId: 'ga', qty: 1, unitPricePaise: 10_000, gstRate: 18 },
      { ticketTypeId: 'vip', qty: 1, unitPricePaise: 30_000, gstRate: 18 },
      { ticketTypeId: 'parking', qty: 1, unitPricePaise: 5_000, gstRate: 18, addon: true },
    ];
    const q = quote(items, noFee, { kind: 'flat', value: 50_000, maxDiscountPaise: null, ticketTypeIds: ['ga'] });
    expect(q.lineDiscounts).toEqual([10_000, 0, 0]);
  });

  it('splits exactly with largest remainder', () => {
    expect(splitProportional(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(splitProportional(7, [0, 0])).toEqual([0, 0]);
  });

  it('explains why a coupon is unusable', () => {
    const c: CheckoutCoupon = {
      id: 'c', kind: 'percent', value: 10, maxDiscountPaise: null, ticketTypeIds: ['vip'], active: true, validUntil: null, exhausted: false,
    };
    const items = [{ ticketTypeId: 'ga', qty: 1, unitPricePaise: 1, gstRate: 0 }];
    expect(couponProblem(c, items)).toMatch(/does not apply/);
    expect(couponProblem({ ...c, ticketTypeIds: null, exhausted: true }, items)).toMatch(/fully used/);
    expect(couponProblem({ ...c, ticketTypeIds: null, validUntil: '2000-01-01' }, items)).toMatch(/expired/);
    expect(couponProblem({ ...c, ticketTypeIds: null }, items)).toBeNull();
  });
});
