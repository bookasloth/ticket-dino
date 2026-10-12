import { describe, expect, it } from 'vitest';
import { toCsv } from '@/lib/csv';

describe('toCsv', () => {
  it('quotes and escapes', () => {
    expect(toCsv([['a', 'b"c', null, 5]])).toBe('"a","b""c","","5"\r\n');
  });
  it('neutralises spreadsheet formulas', () => {
    expect(toCsv([['=HYPERLINK("x")', '+1', '-2', '@x']])).toBe(`"'=HYPERLINK(""x"")","'+1","'-2","'@x"\r\n`);
  });
});
