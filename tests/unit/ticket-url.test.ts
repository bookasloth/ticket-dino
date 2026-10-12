import { describe, expect, it } from 'vitest';
import { ticketUrl, tokenFromScan } from '@/lib/tickets/url';

const token = 'AbCdEfGhIjKlMnOpQrSt_-';

describe('ticket urls', () => {
  it('builds the public ticket url', () => expect(ticketUrl(token)).toMatch(new RegExp(`/t/${token}$`)));
  it('reads a token from a scanned url', () => expect(tokenFromScan(`https://ticketdino.in/t/${token}`)).toBe(token));
  it('reads a bare token', () => expect(tokenFromScan(token)).toBe(token));
  it('rejects anything else', () => {
    expect(tokenFromScan('https://evil.example/hello')).toBeNull();
    expect(tokenFromScan('short')).toBeNull();
  });
});
