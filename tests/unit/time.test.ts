import { describe, expect, it } from 'vitest';
import { formatIST, istInputToUtcIso, utcToIstInput } from '@/lib/time';

describe('time', () => {
  it('treats admin datetime-local input as IST', () => {
    expect(istInputToUtcIso('2026-12-31T20:00')).toBe('2026-12-31T14:30:00.000Z');
  });
  it('round-trips', () => {
    expect(utcToIstInput('2026-12-31T14:30:00.000Z')).toBe('2026-12-31T20:00');
  });
  it('rejects junk', () => {
    expect(() => istInputToUtcIso('31/12/2026 8pm')).toThrow();
  });
  it('displays in IST', () => {
    expect(formatIST('2026-12-31T14:30:00.000Z', { dateStyle: undefined, timeStyle: 'short' })).toMatch(/8:00\s?pm/i);
  });
});
