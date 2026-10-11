import { describe, expect, it } from 'vitest';
import { available, saleState } from '@/lib/availability';

const now = new Date('2026-11-01T00:00:00Z');
const base = {
  capacity: 10, sold_count: 3, held_count: 2,
  sale_starts_at: '2026-10-01T00:00:00Z', sale_ends_at: '2026-12-01T00:00:00Z',
};

describe('availability', () => {
  it('counts holds as unavailable', () => expect(available(base)).toBe(5));
  it('on sale', () => expect(saleState(base, now)).toBe('on_sale'));
  it('sold out', () => expect(saleState({ ...base, sold_count: 8 }, now)).toBe('sold_out'));
  it('not started', () => expect(saleState({ ...base, sale_starts_at: '2026-11-02T00:00:00Z' }, now)).toBe('not_started'));
  it('ended', () => expect(saleState({ ...base, sale_ends_at: '2026-10-31T00:00:00Z' }, now)).toBe('ended'));
});
