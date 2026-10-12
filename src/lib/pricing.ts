export type PricedItem = {
  ticketTypeId: string; qty: number; unitPricePaise: number; gstRate: number;
  groupMinQty?: number | null; groupPct?: number | null;
  addon?: boolean; // add-on lines carry the add-on id in ticketTypeId
};
export type FeeConfig = { feeBps: number; feeFlatPaise: number; feeGstRate: number };
export type CouponRule = {
  kind: 'percent' | 'flat'; value: number; maxDiscountPaise: number | null; ticketTypeIds: string[] | null;
};
export type Quote = {
  subtotalPaise: number; discountPaise: number; feePaise: number; gstPaise: number; totalPaise: number;
  lineDiscounts: number[]; // per input item, same order
  couponDiscountPaise: number;
};

/** a*b/d rounded half-up. Non-negative integers only. */
export function mulDivRound(a: number, b: number, d: number): number {
  return Math.floor((2 * a * b + d) / (2 * d));
}

const rateBps = (percent: number) => Math.round(percent * 100); // 18 → 1800, 2.5 → 250

/** Split `total` across `weights` proportionally; parts sum exactly to total (largest remainder). */
export function splitProportional(total: number, weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (sum === 0 || total === 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const parts = raw.map(Math.floor);
  let left = total - parts.reduce((s, p) => s + p, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) {
    if (left-- <= 0) break;
    parts[i]++;
  }
  return parts;
}

const couponApplies = (c: CouponRule, it: PricedItem) =>
  it.addon ? c.ticketTypeIds === null : c.ticketTypeIds === null || c.ticketTypeIds.includes(it.ticketTypeId);

/**
 * Server-owned price. The client calls this only for preview.
 * Order: group discount per line → coupon across eligible lines → fee and GST on the discounted amount.
 */
export function quote(items: PricedItem[], fee: FeeConfig, coupon?: CouponRule | null): Quote {
  for (const it of items) if (!Number.isInteger(it.qty) || it.qty < 1) throw new Error('qty must be a positive integer');

  const gross = items.map((it) => it.unitPricePaise * it.qty);
  const disc = items.map((it, i) =>
    it.groupMinQty && it.groupPct && it.qty >= it.groupMinQty ? mulDivRound(gross[i], rateBps(it.groupPct), 10_000) : 0,
  );

  let couponTotal = 0;
  if (coupon) {
    const eligible = items.map((it, i) => (couponApplies(coupon, it) ? gross[i] - disc[i] : 0));
    const base = eligible.reduce((s, x) => s + x, 0);
    couponTotal =
      coupon.kind === 'percent'
        ? Math.min(mulDivRound(base, coupon.value * 100, 10_000), coupon.maxDiscountPaise ?? Infinity)
        : coupon.value;
    couponTotal = Math.min(couponTotal, base);
    splitProportional(couponTotal, eligible).forEach((p, i) => (disc[i] += p));
  }

  let subtotal = 0;
  let discount = 0;
  let feeTotal = 0;
  let gst = 0;
  items.forEach((it, i) => {
    const net = gross[i] - disc[i];
    const lineFee = it.unitPricePaise === 0 || net === 0 ? 0 : mulDivRound(net, fee.feeBps, 10_000) + fee.feeFlatPaise * it.qty;
    subtotal += gross[i];
    discount += disc[i];
    feeTotal += lineFee;
    gst += mulDivRound(net, rateBps(it.gstRate), 10_000) + mulDivRound(lineFee, rateBps(fee.feeGstRate), 10_000);
  });
  return {
    subtotalPaise: subtotal, discountPaise: discount, feePaise: feeTotal, gstPaise: gst,
    totalPaise: subtotal - discount + feeTotal + gst, lineDiscounts: disc, couponDiscountPaise: couponTotal,
  };
}
