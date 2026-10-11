import { describe, expect, it } from 'vitest';
import { safeNext } from '@/lib/redirect';

describe('safeNext (post-login redirect)', () => {
  it.each(['/admin', '/scan/abc?x=1'])('keeps same-site path %s', (p) => expect(safeNext(p)).toBe(p));
  it.each(['//evil.com', '/\\evil.com', '/\t/evil.com', 'https://evil.com', 'javascript:alert(1)', ''])(
    'falls back to /admin for %j',
    (p) => expect(safeNext(p)).toBe('/admin'),
  );
});
