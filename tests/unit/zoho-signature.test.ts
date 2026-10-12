import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyWebhookSignature } from '@/lib/zoho-signature';

const key = 'test-signing-key';
const body = '{"event_type":"payment.succeeded"}';
const sign = (t: string, b: string, k = key) => `t=${t},v=${createHmac('sha256', k).update(`${t}.${b}`).digest('hex')}`;

describe('verifyWebhookSignature', () => {
  it('accepts a correctly signed body', () => {
    expect(verifyWebhookSignature(body, sign('1700000000', body), key)).toBe(true);
  });

  it('rejects a tampered body, wrong key, or malformed header', () => {
    expect(verifyWebhookSignature(`${body} `, sign('1700000000', body), key)).toBe(false);
    expect(verifyWebhookSignature(body, sign('1700000000', body, 'other-key'), key)).toBe(false);
    expect(verifyWebhookSignature(body, 'v=abc', key)).toBe(false);
    expect(verifyWebhookSignature(body, null, key)).toBe(false);
  });
});
