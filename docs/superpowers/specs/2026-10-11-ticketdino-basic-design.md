# TicketDino — Basic Tier Design

Date: 2026-10-11
Source: *TicketDino — Product Brief* (Oct 10, 2026)
Scope: **Basic tier only.** Pro features get their own specs later and build on this schema.

## 1. Goal and success criteria

Timewheel can run a real paid event (first pilot: <500 tickets) end to end on TicketDino:
publish an event, sell tickets via Razorpay, deliver QR tickets, and scan at the gate.

Done when:

| Metric | Target |
|---|---|
| Oversold or duplicate tickets | 0 (proved by a concurrency test) |
| Ticket email after payment | within 60 s for 99% of orders |
| Paid orders stuck `pending` | 0 after the reconciliation job runs |
| Gate scan → green/red | under 1 s (online) |
| Event page LCP, 4G mobile | under 2.5 s |

## 2. Decisions (from brief + Q&A)

| Topic | Decision |
|---|---|
| Merchant of record | Timewheel Internet Pvt Ltd's Razorpay account. Test keys exist. |
| Tenancy | Every tenant-owned table has `organizer_id` + RLS from day one. Only one organizer (Timewheel) in Basic. |
| Market | INR, English, IST display, UTC `timestamptz` storage, money in integer paise. |
| Stack | Next.js App Router (TypeScript) on Vercel, Supabase (Postgres, Auth, Storage, pg_cron), Resend, Razorpay. pnpm. |
| Repo | Fresh repo, **public on GitHub**. No secrets are ever committed. |
| Local dev | Supabase CLI local stack (Docker) + SQL migrations in `supabase/migrations`, pushed to the existing remote project. |
| Accounts ready | Razorpay (test), Supabase project, Vercel + domain, Resend with a verified domain. |
| Accounts still needed | Upstash Redis (rate limiting), Sentry (errors). Both have free tiers. |
| Staff auth | Supabase **email + password** for admins and gate staff. Buyers never log in during Basic. |
| Booking fee | Per-event config, paid by the buyer, added on top: `fee_bps` (percent ×100) + `fee_flat_paise` per ticket, with its own GST rate (`fee_gst_rate`, default 18%, CA to confirm). |
| GST on tickets | `gst_rate` per ticket type. Ticket price is **exclusive** of GST; checkout shows subtotal, fee and GST lines (as in the brief). |
| UI | Tailwind + shadcn/ui, mobile-first. Placeholder brand tokens in one file (`app/globals.css`) and a text logo; the real logo and colors get swapped in later. |
| Tests | Money-critical paths: SQL tests for inventory and concurrency, Vitest for pricing and webhook logic, one Playwright checkout in Razorpay test mode. |

### Deviation from brief (flagged)

The brief puts background jobs in **pg_cron + Supabase Edge Functions**. This design keeps
**pg_cron as the scheduler**, but:

- Pure-SQL jobs (hold expiry) run directly in pg_cron.
- Jobs that call Razorpay or Resend (reconciliation, email retry) are **Next.js route handlers** under `/api/jobs/*`. pg_cron calls them through `pg_net` with a `CRON_SECRET` bearer token.

Why: the webhook, reconciliation and email code share one TypeScript codebase. With Edge Functions, the Razorpay, Resend and PDF code would be duplicated in a second runtime (Deno). Moving these jobs to Edge Functions later is still possible.

## 3. Architecture

```
Buyer phone ─┐
Admin web ───┼─> Next.js on Vercel ──> Supabase Postgres (RLS, SQL functions, pg_cron)
Scanner PWA ─┘     │  route handlers        │  pg_cron + pg_net ──> /api/jobs/*
                   ├──> Razorpay (Orders, Checkout.js)  <── webhooks: /api/webhooks/razorpay
                   ├──> Resend (emails + ticket PDF attachment)
                   └──> Upstash (rate limits), Sentry (errors)
```

Server code uses the Supabase **service-role** client only inside route handlers and server
actions (`lib/supabase/admin.ts`, marked `server-only`). Browser code only ever gets the anon key.

### Routes

| Route | Who | Purpose |
|---|---|---|
| `/e/[slug]` | public | Event page (SSR, OG tags, `generateMetadata`) |
| `/e/[slug]/checkout` | public | Ticket picker → buyer details → Razorpay Checkout |
| `/orders/[id]` | public, needs the order's secret | "Confirming your payment…" → polls until paid, then links to tickets |
| `/t/[token]` | public, `noindex` | Ticket view with QR; `/t/[token]/pdf` downloads the PDF |
| `/terms` `/privacy` `/refund-policy` `/contact` | public | Legal pages (placeholder text for legal/CA review) |
| `/login` | staff | Email + password |
| `/admin/...` | owner/manager | Events, ticket types, orders, refunds, CSV export |
| `/scan` | staff | Pick an assigned event → camera scanner |
| `POST /api/checkout` | public | Create order + holds + Razorpay order |
| `POST /api/webhooks/razorpay` | Razorpay | HMAC-verified events |
| `POST /api/scan` | staff | Check in a token |
| `POST /api/jobs/reconcile` `/api/jobs/notify` | pg_cron | Background jobs |

## 4. Data model (Basic)

Basic creates the tables it uses. Pro tables (price_tiers, addons, coupons, waitlist_entries,
affiliates, transfers, custom_fields, field_responses, invoices) are added later by their own
migrations. All of them hang off tables defined here, so nothing here gets rewritten.

| Table | Key columns (beyond `id uuid pk`, `created_at`) |
|---|---|
| organizers | name, slug unique, legal_name, gstin, logo_url, settings jsonb |
| organizer_members | organizer_id, user_id → auth.users, role (`owner`,`manager`,`staff`), unique(organizer_id,user_id) |
| super_admins | user_id pk |
| venues | organizer_id, name, address, city, lat, lng, maps_url |
| events | organizer_id, slug unique, title, category, description, faqs jsonb, poster_url, starts_at, ends_at, venue_id, status (`draft`,`published`,`cancelled`,`completed`), fee_bps, fee_flat_paise, fee_gst_rate, refund_policy text, transfer_cutoff_hours |
| event_staff | organizer_id, event_id, user_id, unique(event_id,user_id) |
| ticket_types | organizer_id, event_id, name, price_paise, gst_rate (numeric, e.g. 18.00), capacity, sold_count, held_count, max_per_order, sale_starts_at, sale_ends_at, sort; check `sold_count + held_count <= capacity` |
| orders | organizer_id, event_id, access_key (random, for `/orders/[id]`), buyer_name, buyer_email, buyer_phone, subtotal_paise, fee_paise, gst_paise, total_paise, status (`pending`,`paid`,`failed`,`expired`,`refunded`), razorpay_order_id unique, razorpay_payment_id, paid_at, utm jsonb |
| order_items | organizer_id, order_id, ticket_type_id, qty, unit_price_paise, gst_rate |
| holds | organizer_id, order_id, ticket_type_id, qty, expires_at, released_at |
| tickets | organizer_id, order_id, ticket_type_id, event_id, attendee_name, attendee_email, attendee_phone, qr_token unique (128-bit, base64url), status (`valid`,`void`,`checked_in`), checked_in_at, checked_in_by |
| checkins | organizer_id, ticket_id null, event_id, token_scanned, scanned_at, staff_id, result (`ok`,`already_used`,`wrong_event`,`void`,`not_found`) |
| refunds | organizer_id, order_id, amount_paise, reason, initiated_by, status (`manual`) |
| webhook_events | provider, event_id unique, type, payload jsonb, processed_at |
| notifications | organizer_id, order_id, channel (`email`), template, recipient, status (`pending`,`sent`,`failed`), attempts, provider_id, sent_at, last_error |
| export_logs | organizer_id, event_id, user_id, kind, row_count, created_at (rule 10) |

Indexes: `orders(razorpay_order_id)`, `orders(status, created_at)`, `tickets(qr_token)`,
`tickets(event_id)`, `holds(expires_at) where released_at is null`, trigram or plain
indexes on orders buyer_email, buyer_phone, buyer_name for admin search.

### RLS

- Helpers (`security definer`, stable): `is_member(org uuid, roles text[])`, `is_event_staff(event uuid)`, `is_super_admin()`.
- `anon`: SELECT only on published `events`, their `ticket_types`, `venues` and `organizers` (public columns through views where needed). Nothing else.
- `authenticated` members: SELECT on their organizer's rows. Owners and managers can write events, venues and ticket_types. Staff can only read event-scoped data for events they are assigned to.
- Orders, holds, tickets, checkins, refunds, webhook_events and notifications are **written only by the service role** (server code). Members get read access by role.
- Every table has RLS enabled. A SQL test asserts no table in `public` lacks RLS.

## 5. Core SQL functions (the money engine)

All of these run as single transactions. App code never reads a count and then writes one.

1. **`create_order_holds(order_id, items jsonb, ttl interval = '10 min')`**
   For each item, in `ticket_type_id` order (to avoid deadlocks):
   `UPDATE ticket_types SET held_count = held_count + qty WHERE id = $1 AND sold_count + held_count + qty <= capacity AND now() between sale_starts_at and sale_ends_at`.
   If 0 rows are updated, the function raises `SOLD_OUT:<ticket_type_id>` and the whole transaction rolls back. Otherwise it inserts `holds` rows.
2. **`release_holds(order_id)`**: decrements `held_count` for unreleased holds and sets `released_at`. Idempotent.
3. **`expire_holds()`**: pg_cron, every minute. Releases holds past `expires_at` and marks their `pending` orders `expired`.
4. **`finalize_paid_order(order_id, payment_id)`**: locks the order row. If it's already `paid`, returns a no-op.
   - Holds still active → moves `held_count → sold_count` and releases the holds.
   - Holds already released (late payment) → tries a guarded `sold_count + qty <= capacity` increment per item.
   - Success → order `paid`, one `tickets` row per seat (`qr_token = encode(gen_random_bytes(16), 'base64url'-equivalent)`), a pending `notifications` row for the ticket email. Returns `issued`.
   - Capacity gone → returns `late_no_inventory` and the order stays `pending`. The caller then:
     - refunds via the Razorpay Refunds API (idempotency key = order id), which is Basic's only automated refund (brief rule 5);
     - records a `refunds` row, sets the order to `refunded` and sends the apology email;
     - if the refund call fails, reports to Sentry, and the reconcile job retries.
5. **`check_in(token, event_id, staff_id)`**: `UPDATE tickets SET status='checked_in', checked_in_at=now(), checked_in_by=staff_id WHERE qr_token=$1 AND event_id=$2 AND status='valid' RETURNING ...`. If 0 rows, it looks the ticket up and reports the reason (already used, with first scan time and staff; wrong event; void; not found). Every call inserts a `checkins` row.
6. **`mark_order_refunded(order_id, amount, reason, user_id)`**: inserts a `refunds` row, sets order `refunded`, voids tickets. Returns inventory (`sold_count -= qty`) only if the event hasn't started.

## 6. Flows

### Purchase
1. Buyer picks quantities on `/e/[slug]/checkout` and enters name, email and a `+91` phone (validated with zod: 10 digits starting 6–9).
2. `POST /api/checkout`
   - Rate limit per IP and per phone (Upstash).
   - Load ticket types and compute the price **on the server** (`lib/pricing.ts`, a pure function in paise).
   - Insert a `pending` order and items, call `create_order_holds`.
   - Create the Razorpay order (`amount = total_paise`, `receipt = order.id`) and store `razorpay_order_id`.
   - Sold out → release, mark the order `failed`, return a clear message.
3. The client opens Razorpay Checkout.js (UPI first), with a 10-minute hold.
4. Success handler → redirect to `/orders/[id]?k=access_key`. That page only shows "Confirming your payment…" and polls.
5. The webhook (`payment.captured` / `order.paid`) does the rest:
   - Verify HMAC over the raw body.
   - Insert into `webhook_events` (a duplicate is a no-op).
   - Call `finalize_paid_order`.
   - Ticket emails are sent via `after()` (right after the response), so they arrive within seconds.
6. `payment.failed` → `release_holds` and mark the order `failed`, but only if it is still `pending`. A later success still finalizes through step 5's late-payment path.

### Reconciliation (`/api/jobs/reconcile`, pg_cron every 5 min)
Pending orders older than 15 minutes: fetch the Razorpay order's payments.
- Captured → `finalize_paid_order`.
- Otherwise → `expired` (holds released).

### Ticket delivery (`/api/jobs/notify`, pg_cron every minute)
Sends `notifications` rows still `pending`, or `failed` with fewer than 5 attempts. Each email:
- Is sent via Resend, from "*Organizer* via TicketDino".
- Attaches one PDF per order (one page per ticket, with QR).
- Links to each `/t/[token]`.

The `after()` hook usually sends first. This job is the retry path. The Resend idempotency key is the notification id.

### Check-in
`/scan`: staff sign in, pick an assigned event, and the camera reads QR codes:
- `BarcodeDetector` where available, `html5-qrcode` as fallback.
- Each read calls `POST /api/scan` → `check_in`.
- Full-screen green or red with the reason. A repeat scan shows the first scan time and the staff name.
- A 2-second cooldown per token on the client avoids double posts.

Online only (offline is Pro).

### Manual refund
1. Admin refunds in the Razorpay dashboard.
2. In TicketDino, the admin clicks "Mark refunded" (full order) with a reason → `mark_order_refunded`.
3. A refund notice email goes out.

### Admin
- Events: create, edit, publish, unpublish. Poster upload to Supabase Storage (public bucket `posters`).
- Venue picker/creator, ticket types editor, fee settings.
- Orders list: search by name, phone, email or order/Razorpay id; status filter; order detail.
- Attendee CSV export (streamed, writes `export_logs`).

## 7. Pricing (`lib/pricing.ts`)

Pure function, unit-tested. Per line:

- `line = unit_price_paise × qty`
- `ticket_gst = round_half_up(line × gst_rate / 100)`
- `fee = round_half_up(line × fee_bps / 10000) + fee_flat_paise × qty`
- `fee_gst = round_half_up(fee × fee_gst_rate / 100)`

Order total = Σ line + Σ fee + Σ (ticket_gst + fee_gst). The client display calls the same
function for preview only. The server recomputes, and amounts from the client are ignored.

## 8. Security and compliance (Basic)

- Webhook HMAC is checked with `crypto.timingSafeEqual` on the raw body.
- QR tokens are 128-bit random values; `/t/*` and `/orders/*` are `noindex`.
- Rate limits cover checkout and the login page.
- Personal data is only visible to the event's organizer team. Every CSV export is logged.
- Checkout shows a DPDP consent notice and links the legal pages in the footer.
- No card data ever touches our servers (Razorpay Checkout).
- **Public repo:** `.env*` is gitignored and `.env.example` holds names only. Secrets live in Vercel env, Supabase secrets and a local `.env.local`. The service-role key is imported only from `server-only` modules.
- GST rates and fee GST are configuration, and must be confirmed with a CA before the first paid event.

## 9. Error handling

- A sold-out ticket type returns a typed error, and the UI shows which type sold out.
- Razorpay API failures in checkout release the holds and the buyer is asked to retry.
- Webhook handler: an unverified signature returns 400. A duplicate event returns 200. Processing errors return 500 so Razorpay retries, and they are reported to Sentry.
- Jobs are idempotent and safe to re-run. Failures go to Sentry and stay in `notifications.last_error`.

## 10. Testing

- **SQL (`supabase test db`, pgTAP):**
  - Hold, release, expire and finalize happy paths, plus the late-payment paths.
  - `check_in` result codes.
  - RLS: anon cannot read orders; staff cannot read other events; every table has RLS.
- **Concurrency script:** 200 parallel `create_order_holds` calls against capacity 50. Asserts exactly 50 seats held and `sold+held <= capacity`.
- **Vitest:**
  - `pricing.ts` (rounding, fee, GST).
  - Webhook signature verification and idempotency, with a mocked Supabase rpc.
  - Phone validation.
- **Playwright (1 test):** event page → checkout → Razorpay test-mode UPI success → webhook → ticket visible. Runs locally against test keys, using a tunnel to deliver the webhook.

## 11. Out of scope for this spec

Everything in the brief's **Pro** tier is out of scope:
- Buyer accounts and My tickets
- Coupons, price tiers, group discounts, add-ons, waitlist, custom questions
- Automated refunds and cancel-event, GST invoices
- Team invite UI, offline scanner, reminders, broadcast, WhatsApp
- Analytics, affiliates, sitemap and JSON-LD, ad pixels

Also out of scope: the Expert roadmap.

Basic team members are created by a super admin via the Supabase dashboard plus a seed script.

## 12. Open items (non-blocking)

- Real logo and brand colors: swap into the tokens file.
- CA confirmation of ticket GST rates and fee GST treatment.
- Legal page text: placeholders until reviewed.
- Upstash and Sentry accounts to create.
