# Part 1 — Foundation

### Task 1: Scaffold the app and tooling

**Files:**
- Create: Next.js scaffold (`package.json`, `src/app/*`, `tsconfig.json`, `next.config.ts`, …), `vitest.config.ts`, `tests/empty.ts`, `.env.example`, `supabase/config.toml` (via CLI), `components.json` + `src/components/ui/*` (via shadcn)
- Modify: `.gitignore`

**Interfaces:**
- Produces: `@/*` → `src/*` alias (TS and Vitest); scripts `dev build test test:int test:db test:e2e typecheck`; shadcn components `button input label textarea card badge table checkbox` in `@/components/ui/*`.

- [ ] **Step 1: Scaffold Next.js into a temp dir and move it up** (create-next-app refuses a non-empty dir)

```bash
pnpm create next-app@16.4.0 web-tmp --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm --yes
cp -rn web-tmp/. . && rm -rf web-tmp
```
Then make sure `.gitignore` also contains these lines (append any missing):
```
.env*
!.env.example
supabase/.temp/
supabase/.branches/
/test-results/
/playwright-report/
```

- [ ] **Step 2: Install dependencies**

```bash
pnpm add @supabase/supabase-js@2.117.3 @supabase/ssr@0.12.7 razorpay@2.9.8 resend@6.32.1 @react-pdf/renderer@4.9.0 qrcode@1.5.4 @upstash/ratelimit@2.2.0 @upstash/redis@1.39.0 zod@4.6.5 html5-qrcode@2.3.8 @sentry/nextjs@11.6.0 server-only
pnpm add -D vitest@5.0.3 @playwright/test@1.64.0 @types/qrcode
```

- [ ] **Step 3: shadcn/ui**

```bash
pnpm dlx shadcn@4.21.4 init --defaults
pnpm dlx shadcn@4.21.4 add button input label textarea card badge table checkbox
```
Then in `src/app/globals.css`, set the placeholder brand (dino green) by replacing the `--primary` / `--primary-foreground` values in `:root` and `.dark`:
```css
/* ponytail: placeholder brand — swap for real TicketDino colors */
--primary: oklch(0.55 0.15 150);
--primary-foreground: oklch(0.98 0 0);
```

- [ ] **Step 4: Vitest config**

`vitest.config.ts`:
```ts
import path from 'node:path';
import { defineConfig, loadEnv } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      'server-only': path.resolve(__dirname, 'tests/empty.ts'),
    },
  },
  test: {
    environment: 'node',
    env: loadEnv('test', process.cwd(), ''),
    passWithNoTests: true,
  },
});
```
`tests/empty.ts`:
```ts
export {};
```

- [ ] **Step 5: Scripts** — in `package.json` `"scripts"` set:

```json
"dev": "next dev",
"build": "next build",
"start": "next start",
"lint": "eslint",
"typecheck": "tsc --noEmit",
"test": "vitest run tests/unit",
"test:int": "vitest run tests/integration",
"test:db": "supabase test db",
"test:e2e": "playwright test"
```

- [ ] **Step 6: Supabase CLI**

```bash
supabase init
supabase start
```
Expected: prints the local API URL `http://127.0.0.1:54321` and the anon + service_role keys.

- [ ] **Step 7: `.env.example`** (copy it to `.env.local` and fill in the values from `supabase status`)

```bash
# Supabase (local values come from `supabase status`)
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Razorpay (test keys locally)
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=

# Email
RESEND_API_KEY=
EMAIL_FROM=tickets@example.com
SUPPORT_EMAIL=support@example.com

# Jobs: must match the vault secret `cron_secret` (seed.sql sets local-cron-secret locally)
CRON_SECRET=local-cron-secret

# Rate limiting (optional locally, required in production)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Errors (optional)
NEXT_PUBLIC_SENTRY_DSN=
```

- [ ] **Step 8: Verify**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: all exit 0 ("No test files found" is fine).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js 16 app with Supabase, shadcn, Vitest"
```

---

### Task 2: Money, phone, time and availability utilities

**Files:**
- Create: `src/lib/pricing.ts`, `src/lib/money.ts`, `src/lib/phone.ts`, `src/lib/time.ts`, `src/lib/availability.ts`, `src/lib/csv.ts`
- Test: `tests/unit/pricing.test.ts`, `tests/unit/money.test.ts`, `tests/unit/phone.test.ts`, `tests/unit/time.test.ts`, `tests/unit/availability.test.ts`, `tests/unit/csv.test.ts`

**Interfaces:**
- Produces:
  - `quote(items: PricedItem[], fee: FeeConfig): Quote`; `PricedItem = { ticketTypeId: string; qty: number; unitPricePaise: number; gstRate: number }`; `FeeConfig = { feeBps: number; feeFlatPaise: number; feeGstRate: number }`; `Quote = { subtotalPaise; feePaise; gstPaise; totalPaise }` (all numbers)
  - `formatINR(paise: number): string`, `rupeesToPaise(input: string): number | null`, `paiseToRupeesInput(paise: number): string`
  - `normalizeIndianPhone(input: string): string | null` → `+91XXXXXXXXXX`
  - `formatIST(iso: string | Date, opts?): string`, `istInputToUtcIso(local: string): string`, `utcToIstInput(iso: string): string`
  - `saleState(t: SaleWindow, now?: Date): 'on_sale' | 'sold_out' | 'not_started' | 'ended'`, `available(t): number`
  - `toCsv(rows: (string | number | null)[][]): string`

- [ ] **Step 1: Write failing tests**

`tests/unit/pricing.test.ts`:
```ts
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
```

`tests/unit/money.test.ts`:
```ts
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
```

`tests/unit/phone.test.ts`:
```ts
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
```

`tests/unit/time.test.ts`:
```ts
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
```

`tests/unit/availability.test.ts`:
```ts
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
```

`tests/unit/csv.test.ts`:
```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test`
Expected: FAIL — cannot resolve `@/lib/pricing` etc.

- [ ] **Step 3: Implement**

`src/lib/pricing.ts`:
```ts
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
```

`src/lib/money.ts`:
```ts
const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

export const formatINR = (paise: number) => inr.format(paise / 100);

/** "499.5" → 49950. Exact (no float math). null if invalid. */
export function rupeesToPaise(input: string): number | null {
  const m = input.trim().match(/^(\d{1,9})(?:\.(\d{1,2}))?$/);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
}

export const paiseToRupeesInput = (paise: number) => (paise / 100).toFixed(2);
```

`src/lib/phone.ts`:
```ts
/** Accepts common Indian mobile formats; returns +91XXXXXXXXXX or null. */
export function normalizeIndianPhone(input: string): string | null {
  const compact = input.replace(/[\s\-()]/g, '');
  const m = compact.match(/^(?:\+91|91|0)?([6-9]\d{9})$/);
  return m ? `+91${m[1]}` : null;
}
```

`src/lib/time.ts`:
```ts
const IST = 'Asia/Kolkata';
const IST_OFFSET_MS = 330 * 60_000;

export function formatIST(iso: string | Date, opts: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat('en-IN', { timeZone: IST, dateStyle: 'medium', timeStyle: 'short', ...opts }).format(
    new Date(iso),
  );
}

/** `<input type="datetime-local">` value, read as IST → UTC ISO string. */
export function istInputToUtcIso(local: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) throw new Error('Invalid date and time');
  return new Date(`${local}:00+05:30`).toISOString();
}

export function utcToIstInput(iso: string): string {
  return new Date(new Date(iso).getTime() + IST_OFFSET_MS).toISOString().slice(0, 16);
}
```

`src/lib/availability.ts`:
```ts
export type SaleWindow = {
  capacity: number;
  sold_count: number;
  held_count: number;
  sale_starts_at: string;
  sale_ends_at: string;
};
export type SaleState = 'on_sale' | 'sold_out' | 'not_started' | 'ended';

export const available = (t: SaleWindow) => Math.max(0, t.capacity - t.sold_count - t.held_count);

export function saleState(t: SaleWindow, now = new Date()): SaleState {
  if (now < new Date(t.sale_starts_at)) return 'not_started';
  if (now >= new Date(t.sale_ends_at)) return 'ended';
  return available(t) > 0 ? 'on_sale' : 'sold_out';
}
```

`src/lib/csv.ts`:
```ts
type Cell = string | number | null | undefined;

function cell(v: Cell): string {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@]/.test(s)) s = `'${s}`; // CSV formula injection guard
  return `"${s.replace(/"/g, '""')}"`;
}

export const toCsv = (rows: Cell[][]) => rows.map((r) => r.map(cell).join(',') + '\r\n').join('');
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test`
Expected: PASS (all six files). If the `formatIST` regex fails because of a narrow no-break space, it already allows `\s?`. Keep the assertion; fix only the regex if the ICU output differs.

- [ ] **Step 5: Commit**

```bash
git add src/lib tests/unit
git commit -m "feat: pricing, money, phone, IST time and CSV utilities"
```
