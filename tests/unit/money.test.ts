import { describe, expect, it } from 'vitest';
import { formatINR, paiseToRupeesInput, rupeesToPaise } from '@/lib/money';

describe('money', () => {
  it('formats paise as rupees', () => {
    expect(formatINR(122_720)).toBe('₹1,227.20');
    expect(formatINR(10_000_000)).toBe('₹1,00,000.00');
  });
  it('parses rupee input exactly', () => {
    expect(rupeesToPaise('499')).toBe(49_900);
    expect(rupeesToPaise('499.5')).toBe(49_950);
    expect(rupeesToPaise(' 0.05 ')).toBe(5);
    expect(rupeesToPaise('1.005')).toBeNull();
    expect(rupeesToPaise('-1')).toBeNull();
    expect(rupeesToPaise('abc')).toBeNull();
  });
  it('round-trips for edit forms', () => {
    expect(paiseToRupeesInput(49_950)).toBe('499.50');
  });
});
