# Part 5 — Background jobs

### Task 13: Reconciliation, email retry and pg_cron schedules

**Files:**
- Create: `src/lib/cron.ts`, `src/app/api/jobs/reconcile/route.ts`, `src/app/api/jobs/notify/route.ts`, `supabase/migrations/20261011000005_cron.sql`

**Interfaces:**
- Consumes: `capturedPayment`, `refundApi`, `settlePayment`, `sendPendingNotifications`, `safeEqual`, `report`, `adminDb`; SQL `expire_holds`; Vault secrets `app_url` and `cron_secret` (seeded locally in Task 7, set by hand in production).
- Produces:
  - `isCron(req: Request): boolean`
  - `POST /api/jobs/reconcile` → `{ checked, settled }`
  - `POST /api/jobs/notify` → `{ sent }`
  - SQL `call_job(p_path text)`
  - cron jobs `ticketdino-expire-holds` (every minute), `ticketdino-notify` (every minute), `ticketdino-reconcile` (every 5 min)

- [ ] **Step 1: Cron auth helper**

`src/lib/cron.ts`:
```ts
import { safeEqual } from './webhook';

export function isCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && safeEqual(req.headers.get('authorization') ?? '', `Bearer ${secret}`);
}
```

- [ ] **Step 2: Job routes**

`src/app/api/jobs/reconcile/route.ts`:
```ts
import { isCron } from '@/lib/cron';
import { sendPendingNotifications } from '@/lib/email/send';
import { settlePayment } from '@/lib/payments';
import { capturedPayment, refundApi } from '@/lib/razorpay';
import { report } from '@/lib/report';
import { adminDb } from '@/lib/supabase/admin';

export const maxDuration = 60;

/**
 * Brief rule 3: settle orders whose webhook never arrived. Unpaid orders are marked expired by
 * expire_holds after 10 minutes, so we look at expired/failed/pending orders 15 min – 3 h old.
 * ponytail: re-checks the whole window every run (≤100 Razorpay calls); add a reconciled_at cursor if volume grows.
 */
export async function POST(req: Request) {
  if (!isCron(req)) return new Response('unauthorized', { status: 401 });
  const db = adminDb();
  const now = Date.now();
  const { data: orders, error } = await db
    .from('orders')
    .select('id, razorpay_order_id')
    .in('status', ['pending', 'expired', 'failed'])
    .not('razorpay_order_id', 'is', null)
    .lt('created_at', new Date(now - 15 * 60_000).toISOString())
    .gt('created_at', new Date(now - 3 * 3_600_000).toISOString())
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) {
    report(error, { job: 'reconcile' });
    return new Response('query failed', { status: 500 });
  }

  let settled = 0;
  for (const o of orders ?? []) {
    try {
      const payment = await capturedPayment(o.razorpay_order_id);
      if (!payment) continue;
      await settlePayment(db, refundApi(), o.id, payment.id, payment.amount);
      settled++;
      await sendPendingNotifications(o.id);
    } catch (e) {
      report(e, { job: 'reconcile', orderId: o.id });
    }
  }
  return Response.json({ checked: orders?.length ?? 0, settled });
}
```

`src/app/api/jobs/notify/route.ts`:
```ts
import { isCron } from '@/lib/cron';
import { sendPendingNotifications } from '@/lib/email/send';

export const maxDuration = 60;

export async function POST(req: Request) {
  if (!isCron(req)) return new Response('unauthorized', { status: 401 });
  return Response.json({ sent: await sendPendingNotifications() });
}
```

- [ ] **Step 3: Cron migration**

`supabase/migrations/20261011000005_cron.sql`:
```sql
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Calls a Next.js job route. URL and bearer secret come from Vault (set per environment).
create or replace function public.call_job(p_path text) returns bigint
language sql security definer set search_path = '' as $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url') || p_path,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
      'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000);
$$;
revoke execute on function public.call_job(text) from public, anon, authenticated;

select cron.schedule('ticketdino-expire-holds', '* * * * *', 'select public.expire_holds()');
select cron.schedule('ticketdino-notify', '* * * * *', $$select public.call_job('/api/jobs/notify')$$);
select cron.schedule('ticketdino-reconcile', '*/5 * * * *', $$select public.call_job('/api/jobs/reconcile')$$);
```

- [ ] **Step 4: Verify**

Run: `supabase db reset && pnpm test:db && pnpm typecheck`, then `pnpm dev`. Wait 2 minutes, then in psql:
```sql
select jobname, status, return_message from cron.job_run_details d join cron.job j using (jobid)
order by start_time desc limit 6;
select status_code, content from net._http_response order by created desc limit 3;
```
Expected: the `expire-holds` and `notify` runs `succeeded`, and HTTP responses are `200` with `{"sent":0}`. (Docker Desktop resolves `host.docker.internal` to your PC.)

Check auth with:
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/jobs/notify
curl -s -X POST -H "Authorization: Bearer local-cron-secret" http://localhost:3000/api/jobs/reconcile
```
Expected: `401`, then `{"checked":0,"settled":0}` (or a count of old test orders).

Hold expiry end to end: start a paid checkout (Task 11), close the Razorpay modal, wait 11 minutes. That order becomes `expired` and `held_count` returns to 0.

- [ ] **Step 5: Commit**

```bash
git add src supabase/migrations
git commit -m "feat: pg_cron hold expiry, email retry and payment reconciliation jobs"
```
