import { describe, expect, it } from 'vitest';
import { mulDivRound, quote } from '@/lib/pricing';

const fee = { feeBps: 200, feeFlatPaise: 1000, feeGstRate: 18 };

describe('quote', () => {
  it('prices 2 × ₹500 with 18% GST and a 2% + ₹10 fee', () => {
    const q = quote([{ ticketTypeId: 'a', qty: 2, unitPricePaise: 50_000, gstRate: 18 }], fee);
    // line 100000; fee 2000 + 2000 = 4000; gst 18000 + 720
    expect(q).toEqual({ subtotalPaise: 100_000, feePaise: 4_000, gstPaise: 18_720, totalPaise: 122_720 });
  });

  it('charges no fee on free tickets', () => {
    const q = quote([{ ticketTypeId: 'kids', qty: 2, unitPricePaise: 0, gstRate: 18 }], fee);
    expect(q.totalPaise).toBe(0);
  });

  it('sums several lines', () => {
    const q = quote(
      [
        { ticketTypeId: 'a', qty: 1, unitPricePaise: 49_900, gstRate: 18 },
        { ticketTypeId: 'b', qty: 1, unitPricePaise: 149_900, gstRate: 18 },
      ],
      { feeBps: 0, feeFlatPaise: 0, feeGstRate: 18 },
    );
    expect(q.subtotalPaise).toBe(199_800);
    expect(q.gstPaise).toBe(8_982 + 26_982);
  });

  it('rejects non-positive or fractional qty', () => {
    expect(() => quote([{ ticketTypeId: 'a', qty: 0, unitPricePaise: 1, gstRate: 0 }], fee)).toThrow();
    expect(() => quote([{ ticketTypeId: 'a', qty: 1.5, unitPricePaise: 1, gstRate: 0 }], fee)).toThrow();
  });
});

describe('mulDivRound (half-up)', () => {
  it('rounds .65 up, .5 up, .4 down', () => {
    expect(mulDivRound(333, 500, 10_000)).toBe(17); // 16.65
    expect(mulDivRound(330, 500, 10_000)).toBe(17); // 16.5
    expect(mulDivRound(328, 500, 10_000)).toBe(16); // 16.4
  });
});
