export type PricedItem = { ticketTypeId: string; qty: number; unitPricePaise: number; gstRate: number };
export type FeeConfig = { feeBps: number; feeFlatPaise: number; feeGstRate: number };
export type Quote = { subtotalPaise: number; feePaise: number; gstPaise: number; totalPaise: number };

/** a*b/d rounded half-up. Non-negative integers only. */
export function mulDivRound(a: number, b: number, d: number): number {
  return Math.floor((2 * a * b + d) / (2 * d));
}

const rateBps = (percent: number) => Math.round(percent * 100); // 18 → 1800, 2.5 → 250

/** Server-owned price. The client calls this only for preview. */
export function quote(items: PricedItem[], fee: FeeConfig): Quote {
  let subtotal = 0;
  let feeTotal = 0;
  let gst = 0;
  for (const it of items) {
    if (!Number.isInteger(it.qty) || it.qty < 1) throw new Error('qty must be a positive integer');
    const line = it.unitPricePaise * it.qty;
    const lineFee =
      it.unitPricePaise === 0 ? 0 : mulDivRound(line, fee.feeBps, 10_000) + fee.feeFlatPaise * it.qty;
    subtotal += line;
    feeTotal += lineFee;
    gst += mulDivRound(line, rateBps(it.gstRate), 10_000) + mulDivRound(lineFee, rateBps(fee.feeGstRate), 10_000);
  }
  return { subtotalPaise: subtotal, feePaise: feeTotal, gstPaise: gst, totalPaise: subtotal + feeTotal + gst };
}
