# TicketDino Basic Tier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the TicketDino Basic tier: event page, inventory-safe checkout via Razorpay, QR tickets by email, admin dashboard, manual refunds, CSV export and a gate scanner.

**Architecture:** One Next.js 16 App Router app on Vercel. Supabase Postgres holds all state; every inventory and payment state change happens inside a Postgres function (guarded updates, row locks), and the app only calls those functions. Razorpay webhooks are the only path to `paid`. pg_cron runs hold expiry in SQL and calls Next.js job routes for reconciliation and email retries.

**Tech Stack:** Next.js 16.4, React 19, TypeScript, Tailwind 4 + shadcn/ui, Supabase (Postgres, Auth, Storage, pg_cron, pg_net, Vault), Razorpay 2.9, Resend 6, @react-pdf/renderer 4.9, qrcode, Upstash Ratelimit, zod 4, Vitest 5, pgTAP, Playwright 1.64, Sentry 11.

**Spec:** `docs/superpowers/specs/2026-10-11-ticketdino-basic-design.md`

The plan is split into files so each one stays readable:

| File | Tasks |
|---|---|
| `01-foundation.md` | 1 Scaffold · 2 Money, phone, time, availability, CSV utils |
| `02-database.md` | 3 Schema + RLS · 4 Order/inventory functions |
| `02b-database.md` | 5 Check-in + refund functions · 6 Concurrency test |
| `03-auth-public.md` | 7 Supabase clients, login, rate limit, seed · 8 Public layout, event page, legal pages |
| `04-payments.md` | 9 Razorpay helpers + settlePayment · 10 Ticket page, PDF, email delivery |
| `04b-checkout-webhook.md` | 11 Checkout · 12 Razorpay webhook |
| `05-jobs.md` | 13 Reconcile + email retry + pg_cron |
| `06-admin.md` | 14 Admin events, ticket types, poster, gate staff |
| `06b-orders-scan.md` | 15 Orders, refunds, CSV · 16 Scanner |
| `07-ship.md` | 17 Sentry, e2e, README/deploy + spec coverage table |

Tasks run in order. Each one ends green (`pnpm test`, `pnpm test:db`, `pnpm typecheck`) with a commit.

## Global Constraints

- Node 24, pnpm 11. Next.js **16.4** App Router: `src/proxy.ts` (not `middleware.ts`); page `params`/`searchParams` are Promises; `cookies()` is async; `after` comes from `next/server`.
- Money is integer **paise** everywhere (DB, API, pricing). Rupees only at the form/display edge via `src/lib/money.ts`.
- Times stored as UTC `timestamptz`; displayed in `Asia/Kolkata` via `src/lib/time.ts`.
- `ticket_types.sold_count` / `held_count` change **only** inside SQL functions. App code never writes them (enforced by column grants).
- An order becomes `paid` **only** via `finalize_paid_order`, called from the webhook, the reconcile job, or the free-order path.
- The service-role key is used only from `src/lib/supabase/admin.ts` (`import 'server-only'`).
- Public repo: nothing secret is committed. `.env.local` is gitignored; `.env.example` holds names plus well-known local-dev values only.
- Every public table has RLS enabled and an `organizer_id` (except `organizers`, `super_admins`, `webhook_events`).
- The Razorpay account is shared with other Timewheel products: webhooks for orders TicketDino doesn't know return **200 and are ignored**.
- UI copy is English; money is formatted `en-IN` with ₹.

## Review Focus

1. **Webhook for another product's Razorpay order** (shared account) → 200, ignored, no retry storm. Pinned in Task 17 e2e.
2. **Same payment reported twice** (`payment.captured` + `order.paid`, or a Razorpay retry) → exactly one set of tickets and one email. Pinned in Task 4 pgTAP (finalize twice) and Task 17 e2e (same event id twice).
3. **Payment lands after the hold expired and seats were resold** → exactly one refund, even when the webhook and reconcile job both retry. Pinned in Task 4 pgTAP and Task 9 Vitest.
4. **Free (₹0) ticket types** → no Razorpay order, no flat fee, tickets issued immediately. Pinned in Task 2 and Task 10 Vitest.
5. **Phone typed as `+91 98765 43210`, `098765-43210`, `919876543210`** → accepted; `12345` → clear error. Pinned in Task 2 Vitest.

Also pinned: lowering capacity below sold → friendly error, not a 500 (Task 4 pgTAP + Task 14 action), and the same QR scanned twice → `ok` then `already_used` (Task 5).

## File map

```
src/
  proxy.ts                         session refresh + /admin,/scan guard
  instrumentation.ts               Sentry server init
  instrumentation-client.ts        Sentry client init
  app/
    layout.tsx, globals.css, page.tsx
    (legal)/terms|privacy|refund-policy|contact/page.tsx, LegalPage.tsx
    e/[slug]/page.tsx              event page
    e/[slug]/checkout/page.tsx, CheckoutForm.tsx
    orders/[id]/page.tsx, OrderStatus.tsx
    t/[token]/page.tsx, t/[token]/pdf/route.ts
    login/page.tsx, LoginForm.tsx, actions.ts
    admin/layout.tsx, page.tsx, actions.ts (logout)
    admin/events/new/page.tsx
    admin/events/[id]/page.tsx, EventForm.tsx, TicketTypeForm.tsx, PosterForm.tsx, StaffForm.tsx, StatusButtons.tsx, actions.ts
    admin/events/[id]/orders/page.tsx
    admin/events/[id]/export/route.ts
    admin/orders/[id]/page.tsx, RefundForm.tsx, actions.ts
    scan/page.tsx, scan/[eventId]/page.tsx, Scanner.tsx
    api/checkout/route.ts
    api/orders/[id]/route.ts
    api/webhooks/razorpay/route.ts
    api/scan/route.ts
    api/jobs/reconcile/route.ts, api/jobs/notify/route.ts
  lib/
    money.ts, phone.ts, time.ts, availability.ts, csv.ts
    pricing.ts                     pure quote()
    checkout.ts                    placeOrder(deps, input) + zod schema
    checkout-deps.ts               real deps (server-only)
    payments.ts                    settlePayment(db, refunds, ...)
    razorpay.ts                    client + RefundApi (server-only)
    webhook.ts                     verifyRazorpaySignature, parseRazorpayEvent
    ratelimit.ts, cron.ts, report.ts, auth.ts
    supabase/admin.ts, server.ts, public.ts
    tickets/url.ts, tickets/pdf.tsx, tickets/load.ts
    email/templates.ts, email/send.ts (sendPendingNotifications)
supabase/
  migrations/20261011000001_schema.sql … 000005_cron.sql
  tests/rls.test.sql, orders.test.sql, checkin_refund.test.sql
  seed.sql
tests/
  unit/*.test.ts, integration/concurrency.test.ts, e2e/checkout.spec.ts, empty.ts
```
