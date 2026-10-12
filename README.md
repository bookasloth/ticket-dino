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
