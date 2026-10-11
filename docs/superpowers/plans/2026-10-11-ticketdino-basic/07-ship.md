# Part 7 — Ship

### Task 17: Sentry, end-to-end test, README and deploy checklist

**Files:**
- Create: `src/instrumentation.ts`, `src/instrumentation-client.ts`, `playwright.config.ts`, `tests/e2e/checkout.spec.ts`, `README.md`

**Interfaces:**
- Consumes: everything above. The e2e needs `pnpm dev`, the local Supabase seed, and Razorpay **test** keys plus `RAZORPAY_WEBHOOK_SECRET` in `.env.local`.

- [ ] **Step 1: Sentry (no-op without a DSN)**

`src/instrumentation.ts`:
```ts
import * as Sentry from '@sentry/nextjs';

export function register() {
  if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
    Sentry.init({ dsn: process.env.NEXT_PUBLIC_SENTRY_DSN, tracesSampleRate: 0.1, sendDefaultPii: false });
  }
}

export const onRequestError = Sentry.captureRequestError;
```

`src/instrumentation-client.ts`:
```ts
import * as Sentry from '@sentry/nextjs';

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({ dsn: process.env.NEXT_PUBLIC_SENTRY_DSN, tracesSampleRate: 0.1, sendDefaultPii: false });
}
```

- [ ] **Step 2: Playwright config**

`playwright.config.ts`:
```ts
import { defineConfig, devices } from '@playwright/test';

process.loadEnvFile?.('.env.local');

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:3000', trace: 'retain-on-failure' },
  projects: [{ name: 'mobile', use: { ...devices['Pixel 7'] } }],
  webServer: { command: 'pnpm dev', url: 'http://localhost:3000', reuseExistingServer: true, timeout: 120_000 },
});
```
Then run `pnpm exec playwright install chromium`.

- [ ] **Step 3: End-to-end test** (covers Review Focus 1 and 2)

`tests/e2e/checkout.spec.ts`:
```ts
import { createHmac } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';

const secret = process.env.RAZORPAY_WEBHOOK_SECRET ?? '';

async function webhook(request: APIRequestContext, eventId: string, rzpOrderId: string, amount: number) {
  const body = JSON.stringify({
    event: 'order.paid',
    payload: {
      order: { entity: { id: rzpOrderId, amount } },
      payment: { entity: { id: `pay_e2e_${eventId}`, order_id: rzpOrderId, amount, status: 'captured' } },
    },
  });
  return request.post('/api/webhooks/razorpay', {
    data: body,
    headers: {
      'content-type': 'application/json',
      'x-razorpay-signature': createHmac('sha256', secret).update(body).digest('hex'),
      'x-razorpay-event-id': eventId,
    },
  });
}

test.skip(!secret || !process.env.RAZORPAY_KEY_ID, 'needs Razorpay test keys in .env.local');

test('buyer pays, webhook confirms, tickets appear and scan once', async ({ page, request }) => {
  await page.goto('/e/dino-fest-2026');
  await page.getByRole('link', { name: 'Get tickets' }).click();

  await page.getByLabel('Quantity for General Admission').selectOption('2');
  await page.getByLabel('Full name').fill('E2E Buyer');
  await page.getByLabel('Email').fill('e2e@example.com');
  await page.getByLabel('Mobile number').fill('+91 98765 43210');
  await page.getByRole('checkbox').check();

  const checkoutResponse = page.waitForResponse((r) => r.url().endsWith('/api/checkout'));
  await page.getByRole('button', { name: /^Pay ₹/ }).click();
  const order = await (await checkoutResponse).json();
  expect(order.razorpayOrderId).toMatch(/^order_/);
  await expect(page.locator('iframe.razorpay-checkout-frame')).toBeVisible({ timeout: 15_000 });

  // Razorpay calls our webhook in real life; here we sign one ourselves.
  const eventId = `evt_e2e_${Date.now()}`;
  const first = await webhook(request, eventId, order.razorpayOrderId, order.amountPaise);
  expect(first.status()).toBe(200);
  const again = await webhook(request, eventId, order.razorpayOrderId, order.amountPaise);
  expect(await again.json()).toMatchObject({ duplicate: true });
  // Same payment reported by a second event type must not double-issue.
  expect((await webhook(request, `${eventId}_b`, order.razorpayOrderId, order.amountPaise)).status()).toBe(200);
  // Another Timewheel product's order on the shared Razorpay account: acknowledged and ignored.
  expect((await webhook(request, `${eventId}_c`, 'order_not_ticketdino', 100)).status()).toBe(200);

  await page.goto(`/orders/${order.orderId}?k=${encodeURIComponent(order.accessKey)}`);
  await expect(page.getByText("You're in!")).toBeVisible({ timeout: 15_000 });
  const tickets = page.getByRole('link', { name: /View ticket/ });
  await expect(tickets).toHaveCount(2);

  await tickets.first().click();
  await expect(page.getByTestId('ticket-qr')).toBeVisible();
});

test('bad webhook signature is rejected', async ({ request }) => {
  const res = await request.post('/api/webhooks/razorpay', {
    data: '{"event":"order.paid"}',
    headers: { 'content-type': 'application/json', 'x-razorpay-signature': 'nope' },
  });
  expect(res.status()).toBe(400);
});
```

- [ ] **Step 4: Run everything**

```bash
supabase db reset
pnpm test && pnpm test:db && pnpm test:int && pnpm test:e2e && pnpm typecheck && pnpm build
```
Expected: all green. If the Razorpay iframe class name differs, assert on `page.frameLocator('iframe[src*="razorpay"]')` instead; the rest of the test doesn't depend on the modal.

- [ ] **Step 5: README with setup and deploy checklist**

`README.md`:
````markdown
# TicketDino

Mobile-first ticketing for events in India. Next.js 16 + Supabase + Razorpay.
Design: `docs/superpowers/specs/2026-10-11-ticketdino-basic-design.md`.

## Local development

```bash
pnpm install
supabase start                # needs Docker
cp .env.example .env.local    # fill keys from `supabase status` + Razorpay test keys
supabase db reset             # migrations + seed
pnpm dev
```

Seed logins (local only): `owner@ticketdino.test` / `dino-owner-123`, `gate@ticketdino.test` / `dino-gate-123`.
Demo event: http://localhost:3000/e/dino-fest-2026

Simulate a Razorpay payment without a tunnel:
`node --env-file=.env.local scripts/send-webhook.mjs <razorpay_order_id> <amount_paise>`

## Tests

| Command | What |
|---|---|
| `pnpm test` | Unit: pricing, phone, checkout, webhook, refunds |
| `pnpm test:db` | pgTAP: inventory, RLS, check-in, refunds |
| `pnpm test:int` | 200-way concurrency: no oversell (local Supabase only) |
| `pnpm test:e2e` | Checkout → webhook → ticket (needs Razorpay test keys) |

## Deploy checklist (production)

1. **Supabase**: `supabase link --project-ref <ref>` then `supabase db push`. In SQL editor:
   `select vault.create_secret('https://<your-domain>', 'app_url');`
   `select vault.create_secret('<long random string>', 'cron_secret');`
   Confirm the jobs exist: `select jobname, schedule from cron.job;`
2. **Vercel env vars**: everything in `.env.example`, with production values. `CRON_SECRET` must equal the vault `cron_secret`. `NEXT_PUBLIC_APP_URL` is the public domain.
3. **Razorpay** (Timewheel account): enable **automatic payment capture**. Add webhook `https://<domain>/api/webhooks/razorpay` with events `payment.captured`, `payment.failed`, `order.paid`, and a secret that equals `RAZORPAY_WEBHOOK_SECRET`. Activation needs `/terms`, `/privacy`, `/refund-policy`, `/contact` live.
4. **Resend**: sending domain verified; `EMAIL_FROM` on that domain; `SUPPORT_EMAIL` monitored.
5. **Upstash**: create Redis, set `UPSTASH_REDIS_REST_URL` / `_TOKEN`. Production refuses checkout without it.
6. **Sentry**: set `NEXT_PUBLIC_SENTRY_DSN`.
7. **People**: create users in Supabase Dashboard → Authentication → Add user, then:
   ```sql
   insert into organizers (name, slug, legal_name, gstin) values ('Timewheel Events', 'timewheel', 'Timewheel Internet Pvt Ltd', '<GSTIN>');
   insert into organizer_members (organizer_id, user_id, role)
     select o.id, u.id, 'owner' from organizers o, auth.users u where o.slug = 'timewheel' and u.email = '<owner email>';
   ```
   Use role `manager` or `staff` for others; assign staff to events on the event's admin page.
8. **Before the first paid event**: CA confirms GST rates and booking-fee GST; legal copy reviewed; one ₹1 live purchase + manual refund end to end.
````

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: Sentry, end-to-end checkout test, README and deploy checklist"
```

---

## Spec coverage check

| Spec section | Task |
|---|---|
| §2 decisions (paise, IST, fee config, GST exclusive) | 2, 3, 11 |
| §3 routes | 8, 10, 11, 12, 13, 14, 15, 16 |
| §4 data model + RLS | 3 |
| §5 SQL functions 1–6 | 4, 5 |
| §6 purchase, reconcile, delivery, check-in, refund, admin | 11, 12, 13, 10, 16, 15, 14 |
| §7 pricing | 2 |
| §8 security (HMAC, tokens, rate limits, export logs, DPDP consent, public repo) | 9, 3, 7, 15, 11, 1 |
| §9 error handling | 11, 12, 13 |
| §10 testing | 2, 3–6, 9, 11, 17 |
| Success metric: 0 oversold | 4, 6 |
| Success metric: ticket within 60 s | 10 (`after()` send) + 13 (retry every minute) |
| Success metric: 0 stuck pending | 13 |
| Success metric: scan < 1 s | 16 |
| Success metric: LCP < 2.5 s | 8 (ISR, priority poster, no proxy on public routes) |
