import { describe, expect, it } from 'vitest';
import { normalizeIndianPhone } from '@/lib/phone';

describe('normalizeIndianPhone', () => {
  it.each([
    '9876543210',
    '+91 98765 43210',
    '+919876543210',
    '919876543210',
    '098765-43210',
    '(98765) 43210',
  ])('accepts %s', (input) => {
    expect(normalizeIndianPhone(input)).toBe('+919876543210');
  });
  it.each(['12345', '5876543210', '+1 9876543210', '98765432100', ''])('rejects %s', (input) => {
    expect(normalizeIndianPhone(input)).toBeNull();
  });
  it('keeps a 10-digit number starting with 91', () => {
    expect(normalizeIndianPhone('9198765432')).toBe('+919198765432');
  });
});
