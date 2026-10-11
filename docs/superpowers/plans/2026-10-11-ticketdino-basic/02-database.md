# Part 2 — Database

All migrations live in `supabase/migrations/`. Apply with `supabase db reset` (re-runs migrations + seed locally). pgTAP tests live in `supabase/tests/` and run with `pnpm test:db`.

### Task 3: Schema and RLS

**Files:**
- Create: `supabase/migrations/20261011000001_schema.sql`, `supabase/migrations/20261011000002_rls.sql`
- Test: `supabase/tests/rls.test.sql`

**Interfaces:**
- Produces: tables listed in the spec §4 (+ `orders.number` identity, `notifications.claimed_at`), SQL helpers `gen_token() → text`, `is_super_admin() → bool`, `is_member(org uuid, roles text[] default '{owner,manager,staff}') → bool`, storage bucket `posters` (public).

- [ ] **Step 1: Write the failing RLS test**

`supabase/tests/rls.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'owner@t.in'),
  ('00000000-0000-0000-0000-0000000000b2', 'staff@t.in'),
  ('00000000-0000-0000-0000-0000000000b3', 'outsider@t.in');
insert into organizers (id, name, slug) values ('00000000-0000-0000-0000-0000000000a1', 'Org', 'org');
insert into organizer_members (organizer_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'owner'),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', 'staff');
insert into events (id, organizer_id, slug, title, starts_at, ends_at, status) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1', 'pub', 'Pub', now() + interval '9 days', now() + interval '10 days', 'published'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000a1', 'drf', 'Drf', now() + interval '9 days', now() + interval '10 days', 'draft');
insert into ticket_types (id, organizer_id, event_id, name, price_paise, capacity, sale_ends_at) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e1', 'GA', 1000, 10, now() + interval '5 days');
insert into orders (organizer_id, event_id, buyer_name, buyer_email, buyer_phone, subtotal_paise, fee_paise, gst_paise, total_paise)
  values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e1', 'A', 'a@t.in', '+919876543210', 1000, 0, 0, 1000);

select is((select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity), 0, 'every public table has RLS');

set local role anon;
select is((select count(*)::int from events), 1, 'anon sees only the published event');
select is((select count(*)::int from orders), 0, 'anon sees no orders');
select is((select count(*)::int from webhook_events), 0, 'anon sees no webhook events');

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}';
select is((select count(*)::int from events), 2, 'staff member sees draft events of their organizer');
select is((select count(*)::int from orders), 0, 'staff cannot read orders');
select throws_ok(
  $$insert into ticket_types (organizer_id, event_id, name, price_paise, capacity, sale_ends_at)
    values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e1', 'X', 1, 1, now() + interval '1 day')$$,
  '42501', null, 'staff cannot create ticket types');

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
select is((select count(*)::int from orders), 1, 'owner reads orders');
select throws_ok(
  $$update ticket_types set sold_count = 0 where id = '00000000-0000-0000-0000-0000000000c1'$$,
  '42501', null, 'owner cannot write sold_count directly');

reset role;
select * from finish();
rollback;
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test:db`
Expected: FAIL — relation "organizers" does not exist.

- [ ] **Step 3: Schema migration**

`supabase/migrations/20261011000001_schema.sql`:
```sql
-- Money: integer paise. Time: timestamptz (UTC). Every tenant table: organizer_id.

create or replace function public.gen_token() returns text
language sql volatile set search_path = '' as $$
  select translate(encode(extensions.gen_random_bytes(16), 'base64'), '+/=', '-_');  -- 128-bit, 22 chars
$$;

create table public.organizers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  legal_name text,
  gstin text,
  logo_url text,
  settings jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.organizer_members (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.organizers on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null check (role in ('owner', 'manager', 'staff')),
  created_at timestamptz not null default now(),
  unique (organizer_id, user_id)
);

create table public.super_admins (
  user_id uuid primary key references auth.users on delete cascade,
  created_at timestamptz not null default now()
);

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.organizers on delete cascade,
  name text not null,
  address text,
  city text,
  lat double precision,
  lng double precision,
  maps_url text,
  created_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.organizers on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,60}$'),
  title text not null,
  category text,
  description text,
  faqs jsonb not null default '[]',
  poster_url text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  venue_id uuid references public.venues,
  status text not null default 'draft' check (status in ('draft', 'published', 'cancelled', 'completed')),
  fee_bps int not null default 0 check (fee_bps between 0 and 10000),
  fee_flat_paise int not null default 0 check (fee_flat_paise >= 0),
  fee_gst_rate numeric(5,2) not null default 18 check (fee_gst_rate between 0 and 40),
  refund_policy text,
  transfer_cutoff_hours int not null default 24,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table public.event_staff (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.organizers on delete cascade,
  event_id uuid not null references public.events on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  unique (event_id, user_id)
);

create table public.ticket_types (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.organizers on delete cascade,
  event_id uuid not null references public.events on delete cascade,
  name text not null,
  price_paise int not null check (price_paise >= 0),
  gst_rate numeric(5,2) not null default 18 check (gst_rate between 0 and 40),
  capacity int not null check (capacity >= 0),
  sold_count int not null default 0 check (sold_count >= 0),
  held_count int not null default 0 check (held_count >= 0),
  max_per_order int not null default 10 check (max_per_order > 0),
  sale_starts_at timestamptz not null default now(),
  sale_ends_at timestamptz not null,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  constraint ticket_types_capacity check (sold_count + held_count <= capacity)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity unique,  -- shown as TD-<number>
  organizer_id uuid not null references public.organizers,
  event_id uuid not null references public.events,
  access_key text not null default public.gen_token(),
  buyer_name text not null,
  buyer_email text not null,
  buyer_phone text not null,
  subtotal_paise int not null check (subtotal_paise >= 0),
  fee_paise int not null check (fee_paise >= 0),
  gst_paise int not null check (gst_paise >= 0),
  total_paise int not null check (total_paise >= 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'expired', 'refunded')),
  razorpay_order_id text unique,
  razorpay_payment_id text,
  paid_at timestamptz,
  utm jsonb,
  created_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.organizers,
  order_id uuid not null references public.orders on delete cascade,
  ticket_type_id uuid not null references public.ticket_types,
  qty int not null check (qty > 0),
  unit_price_paise int not null check (unit_price_paise >= 0),
  gst_rate numeric(5,2) not null
);

create table public.holds (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.organizers,
  order_id uuid not null references public.orders on delete cascade,
  ticket_type_id uuid not null references public.ticket_types,
  qty int not null check (qty > 0),
  expires_at timestamptz not null,
  released_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.organizers,
  order_id uuid not null references public.orders,
  ticket_type_id uuid not null references public.ticket_types,
  event_id uuid not null references public.events,
  attendee_name text not null,
  attendee_email text not null,
  attendee_phone text not null,
  qr_token text not null unique default public.gen_token(),
  status text not null default 'valid' check (status in ('valid', 'void', 'checked_in')),
  checked_in_at timestamptz,
  checked_in_by uuid references auth.users,
  created_at timestamptz not null default now()
);

create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.organizers,
  event_id uuid not null references public.events,
  ticket_id uuid references public.tickets,
  token_scanned text not null,
  staff_id uuid references auth.users,
  result text not null check (result in ('ok', 'already_used', 'wrong_event', 'void', 'not_found')),
  scanned_at timestamptz not null default now()
);

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.organizers,
  order_id uuid not null references public.orders,
  amount_paise int not null check (amount_paise >= 0),
  reason text,
  initiated_by uuid references auth.users,
  razorpay_refund_id text,
  status text not null check (status in ('manual', 'processed')),
  created_at timestamptz not null default now()
);

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  type text,
  payload jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, event_id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.organizers,
  order_id uuid not null references public.orders,
  channel text not null default 'email' check (channel in ('email')),
  template text not null check (template in ('tickets', 'refund', 'late_refund')),
  recipient text not null,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts int not null default 0,
  claimed_at timestamptz,
  provider_id text,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create table public.export_logs (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.organizers,
  event_id uuid references public.events,
  user_id uuid not null references auth.users,
  kind text not null,
  row_count int not null,
  created_at timestamptz not null default now()
);

create index on public.orders (event_id, created_at desc);
create index on public.orders (status, created_at);
create index on public.order_items (order_id);
create index on public.holds (order_id);
create index on public.holds (expires_at) where released_at is null;
create index on public.tickets (order_id);
create index on public.tickets (event_id);
create index on public.checkins (event_id, scanned_at desc);
create index on public.notifications (status, created_at);
create index on public.ticket_types (event_id);

insert into storage.buckets (id, name, public) values ('posters', 'posters', true) on conflict (id) do nothing;
```

- [ ] **Step 4: RLS migration**

`supabase/migrations/20261011000002_rls.sql`:
```sql
create or replace function public.is_super_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.super_admins where user_id = auth.uid());
$$;

create or replace function public.is_member(org uuid, roles text[] default '{owner,manager,staff}')
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organizer_members m
    where m.organizer_id = org and m.user_id = auth.uid() and m.role = any (roles)
  ) or public.is_super_admin();
$$;

do $$
declare t text;
begin
  foreach t in array array['organizers','organizer_members','super_admins','venues','events','event_staff',
    'ticket_types','orders','order_items','holds','tickets','checkins','refunds','webhook_events',
    'notifications','export_logs']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Public catalogue
create policy organizers_read on organizers for select using (true);
create policy organizers_update on organizers for update to authenticated
  using (is_member(id, '{owner}')) with check (is_member(id, '{owner}'));

create policy venues_read on venues for select using (true);
create policy venues_write on venues for all to authenticated
  using (is_member(organizer_id, '{owner,manager}')) with check (is_member(organizer_id, '{owner,manager}'));

create policy events_read on events for select using (status <> 'draft' or is_member(organizer_id));
create policy events_write on events for all to authenticated
  using (is_member(organizer_id, '{owner,manager}')) with check (is_member(organizer_id, '{owner,manager}'));

create policy ticket_types_read on ticket_types for select using (
  is_member(organizer_id) or exists (select 1 from events e where e.id = event_id and e.status <> 'draft'));
create policy ticket_types_write on ticket_types for all to authenticated
  using (is_member(organizer_id, '{owner,manager}'))
  with check (is_member(organizer_id, '{owner,manager}')
    and exists (select 1 from events e where e.id = event_id and e.organizer_id = ticket_types.organizer_id));

-- Team
create policy members_read on organizer_members for select to authenticated
  using (user_id = (select auth.uid()) or is_member(organizer_id, '{owner,manager}'));
create policy super_admins_read on super_admins for select to authenticated
  using (user_id = (select auth.uid()));
create policy event_staff_read on event_staff for select to authenticated
  using (user_id = (select auth.uid()) or is_member(organizer_id, '{owner,manager}'));
create policy event_staff_write on event_staff for all to authenticated
  using (is_member(organizer_id, '{owner,manager}'))
  with check (is_member(organizer_id, '{owner,manager}')
    and exists (select 1 from events e where e.id = event_id and e.organizer_id = event_staff.organizer_id));

-- Server-written tables: owners/managers read, nobody writes through the API
create policy orders_read on orders for select to authenticated using (is_member(organizer_id, '{owner,manager}'));
create policy order_items_read on order_items for select to authenticated using (is_member(organizer_id, '{owner,manager}'));
create policy holds_read on holds for select to authenticated using (is_member(organizer_id, '{owner,manager}'));
create policy tickets_read on tickets for select to authenticated using (is_member(organizer_id, '{owner,manager}'));
create policy checkins_read on checkins for select to authenticated using (is_member(organizer_id, '{owner,manager}'));
create policy refunds_read on refunds for select to authenticated using (is_member(organizer_id, '{owner,manager}'));
create policy notifications_read on notifications for select to authenticated using (is_member(organizer_id, '{owner,manager}'));
create policy export_logs_read on export_logs for select to authenticated using (is_member(organizer_id, '{owner}'));
-- webhook_events: no policies (service role only)

revoke insert, update, delete on organizers, organizer_members, super_admins, orders, order_items, holds,
  tickets, checkins, refunds, webhook_events, notifications, export_logs from anon, authenticated;

-- Inventory counters are written only by SQL functions (brief rule 1)
revoke insert, update on ticket_types from anon, authenticated;
grant insert (organizer_id, event_id, name, price_paise, gst_rate, capacity, max_per_order, sale_starts_at, sale_ends_at, sort),
      update (name, price_paise, gst_rate, capacity, max_per_order, sale_starts_at, sale_ends_at, sort)
  on ticket_types to authenticated;
```

- [ ] **Step 5: Run to verify it passes**

Run: `supabase db reset && pnpm test:db`
Expected: `rls.test.sql .. ok`, 9/9. If `insert into auth.users (id, email)` fails on a NOT NULL column in this Supabase version, add `instance_id, aud, role` = `('00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')`.

- [ ] **Step 6: Commit**

```bash
git add supabase
git commit -m "feat(db): multi-tenant schema with RLS and inventory column grants"
```

---

### Task 4: Order and inventory functions

**Files:**
- Create: `supabase/migrations/20261011000003_orders.sql`
- Test: `supabase/tests/orders.test.sql`

**Interfaces:**
- Consumes: tables from Task 3.
- Produces (service-role only — execute revoked from `anon`, `authenticated`):
  - `create_order(p_order jsonb, p_items jsonb, p_ttl interval default '10 minutes') returns table(id uuid, access_key text)`. `p_order` keys: `event_id, buyer_name, buyer_email, buyer_phone, subtotal_paise, fee_paise, gst_paise, total_paise, utm`. `p_items[]` keys: `ticket_type_id, qty, unit_price_paise, gst_rate`. Raises `EVENT_NOT_FOUND` or `UNAVAILABLE:<ticket_type_id>` (whole call rolls back).
  - `release_holds(p_order_id uuid) returns int`
  - `expire_holds() returns int`
  - `fail_order(p_order_id uuid) returns void`
  - `finalize_paid_order(p_order_id uuid, p_payment_id text) returns text` → `'issued' | 'already_done' | 'late_no_inventory'`
  - `record_late_refund(p_order_id uuid, p_amount_paise int, p_refund_id text) returns void`
  - `claim_notifications(p_order_id uuid default null, p_limit int default 20) returns setof notifications`

- [ ] **Step 1: Write the failing test**

`supabase/tests/orders.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

insert into organizers (id, name, slug) values ('00000000-0000-0000-0000-0000000000a1', 'Org', 'org');
insert into events (id, organizer_id, slug, title, starts_at, ends_at, status) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1', 'ev', 'Ev', now() + interval '10 days', now() + interval '11 days', 'published'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000a1', 'draft', 'Draft', now() + interval '10 days', now() + interval '11 days', 'draft');
insert into ticket_types (id, organizer_id, event_id, name, price_paise, capacity, max_per_order, sale_ends_at) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e1', 'GA', 50000, 4, 3, now() + interval '5 days'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e2', 'D', 100, 5, 5, now() + interval '5 days');

create function pg_temp.mk(qty int, ev uuid default '00000000-0000-0000-0000-0000000000e1',
                           tt uuid default '00000000-0000-0000-0000-0000000000c1') returns uuid
language sql as $$
  select id from create_order(
    jsonb_build_object('event_id', ev, 'buyer_name', 'A', 'buyer_email', 'a@t.in', 'buyer_phone', '+919876543210',
      'subtotal_paise', 50000 * qty, 'fee_paise', 0, 'gst_paise', 0, 'total_paise', 50000 * qty),
    jsonb_build_array(jsonb_build_object('ticket_type_id', tt, 'qty', qty, 'unit_price_paise', 50000, 'gst_rate', 18)));
$$;
create function pg_temp.tt() returns ticket_types language sql as $$
  select * from ticket_types where id = '00000000-0000-0000-0000-0000000000c1';
$$;
create temp table ids (k text primary key, v uuid);

-- hold
insert into ids select 'o1', pg_temp.mk(2);
select is((pg_temp.tt()).held_count, 2, 'create_order holds seats');
select is((select count(*)::int from holds where order_id = (select v from ids where k = 'o1')), 1, 'one hold row');
select throws_like($$select pg_temp.mk(3)$$, 'UNAVAILABLE:%', 'cannot hold beyond capacity');
select is((select count(*)::int from orders), 1, 'failed attempt leaves no orphan order');
select throws_like($$select pg_temp.mk(4)$$, 'UNAVAILABLE:%', 'max_per_order enforced');
select throws_like($$select pg_temp.mk(1, '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000c2')$$,
  'EVENT_NOT_FOUND', 'draft events cannot sell');

-- finalize
select is(finalize_paid_order((select v from ids where k = 'o1'), 'pay_1'), 'issued', 'finalize issues');
select is(((pg_temp.tt()).sold_count, (pg_temp.tt()).held_count), (2, 0), 'held moved to sold');
select is((select count(distinct qr_token)::int from tickets where order_id = (select v from ids where k = 'o1')), 2, 'two unique tickets');
select ok((select bool_and(length(qr_token) = 22) from tickets), 'tokens are 128-bit base64url');
select is(finalize_paid_order((select v from ids where k = 'o1'), 'pay_1'), 'already_done', 'finalize is idempotent');
select is((select count(*)::int from tickets where order_id = (select v from ids where k = 'o1')), 2, 'no duplicate tickets');
select is((select count(*)::int from notifications where order_id = (select v from ids where k = 'o1')), 1, 'one ticket email queued');

-- expiry + late payment with inventory left
insert into ids select 'o2', pg_temp.mk(1);
update holds set expires_at = now() - interval '1 minute' where order_id = (select v from ids where k = 'o2');
select is(expire_holds(), 1, 'expire_holds releases one order');
select is((select status from orders where id = (select v from ids where k = 'o2')), 'expired', 'order expired');
select is(finalize_paid_order((select v from ids where k = 'o2'), 'pay_2'), 'issued', 'late payment still issues when seats remain');

-- late payment with no inventory left: o3 expires, o4 takes the last seat
insert into ids select 'o3', pg_temp.mk(1);
update holds set expires_at = now() - interval '1 minute' where order_id = (select v from ids where k = 'o3');
select expire_holds();
insert into ids select 'o4', pg_temp.mk(1);
select is(finalize_paid_order((select v from ids where k = 'o3'), 'pay_3'), 'late_no_inventory', 'late payment without seats');
select is((pg_temp.tt()).sold_count + (pg_temp.tt()).held_count, 4, 'never oversold');
select record_late_refund((select v from ids where k = 'o3'), 50000, 'rfnd_1');
select record_late_refund((select v from ids where k = 'o3'), 50000, 'rfnd_1');
select is((select count(*)::int from refunds where order_id = (select v from ids where k = 'o3')), 1, 'late refund recorded once');

-- fail + release idempotency
select fail_order((select v from ids where k = 'o4'));
select is(((select status from orders where id = (select v from ids where k = 'o4')), (pg_temp.tt()).held_count), ('failed'::text, 0), 'fail_order releases holds');
select is(release_holds((select v from ids where k = 'o4')), 0, 'release_holds is idempotent');

-- capacity cannot drop below sold
select throws_ok($$update ticket_types set capacity = 1 where id = '00000000-0000-0000-0000-0000000000c1'$$,
  '23514', null, 'capacity below sold is rejected');

select * from finish();
rollback;
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test:db`
Expected: FAIL — function create_order does not exist.

- [ ] **Step 3: Implement**

`supabase/migrations/20261011000003_orders.sql`:
```sql
-- Brief rule 1: inventory changes only here, via guarded updates. Never read-then-write in app code.

create or replace function public.create_order(p_order jsonb, p_items jsonb, p_ttl interval default interval '10 minutes')
returns table (id uuid, access_key text)
language plpgsql set search_path = public, extensions as $$
declare
  o orders;
  it record;
  n int;
begin
  insert into orders (organizer_id, event_id, buyer_name, buyer_email, buyer_phone,
                      subtotal_paise, fee_paise, gst_paise, total_paise, utm)
  select e.organizer_id, e.id, p_order->>'buyer_name', p_order->>'buyer_email', p_order->>'buyer_phone',
         (p_order->>'subtotal_paise')::int, (p_order->>'fee_paise')::int, (p_order->>'gst_paise')::int,
         (p_order->>'total_paise')::int, p_order->'utm'
  from events e
  where e.id = (p_order->>'event_id')::uuid and e.status = 'published'
  returning * into o;
  if o.id is null then raise exception 'EVENT_NOT_FOUND'; end if;

  insert into order_items (organizer_id, order_id, ticket_type_id, qty, unit_price_paise, gst_rate)
  select o.organizer_id, o.id, (i->>'ticket_type_id')::uuid, (i->>'qty')::int,
         (i->>'unit_price_paise')::int, (i->>'gst_rate')::numeric
  from jsonb_array_elements(p_items) i;

  -- fixed order avoids deadlocks between concurrent multi-type orders
  for it in select ticket_type_id, sum(qty)::int as qty from order_items
            where order_id = o.id group by ticket_type_id order by ticket_type_id loop
    update ticket_types t set held_count = t.held_count + it.qty
    where t.id = it.ticket_type_id
      and t.event_id = o.event_id
      and it.qty <= t.max_per_order
      and now() >= t.sale_starts_at and now() < t.sale_ends_at
      and t.sold_count + t.held_count + it.qty <= t.capacity;
    get diagnostics n = row_count;
    if n = 0 then raise exception 'UNAVAILABLE:%', it.ticket_type_id; end if;
    insert into holds (organizer_id, order_id, ticket_type_id, qty, expires_at)
    values (o.organizer_id, o.id, it.ticket_type_id, it.qty, now() + p_ttl);
  end loop;

  return query select o.id, o.access_key;
end $$;

create or replace function public.release_holds(p_order_id uuid) returns int
language plpgsql set search_path = public as $$
declare h record; n int := 0;
begin
  perform 1 from orders where id = p_order_id for update;  -- serialize with finalize_paid_order
  for h in update holds set released_at = now()
           where order_id = p_order_id and released_at is null
           returning ticket_type_id, qty loop
    update ticket_types set held_count = held_count - h.qty where id = h.ticket_type_id;
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.expire_holds() returns int
language plpgsql set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select distinct order_id from holds where released_at is null and expires_at < now() loop
    perform release_holds(r.order_id);
    update orders set status = 'expired' where id = r.order_id and status = 'pending';
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.fail_order(p_order_id uuid) returns void
language plpgsql set search_path = public as $$
begin
  perform release_holds(p_order_id);
  update orders set status = 'failed' where id = p_order_id and status = 'pending';
end $$;

-- Brief rules 4 + 5: one transaction marks paid, moves held→sold and issues tickets; late payments claim
-- remaining stock or report late_no_inventory so the caller refunds.
create or replace function public.finalize_paid_order(p_order_id uuid, p_payment_id text) returns text
language plpgsql set search_path = public, extensions as $$
declare o orders; it record; n int;
begin
  select * into o from orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if o.status in ('paid', 'refunded') then return 'already_done'; end if;

  if exists (select 1 from holds where order_id = o.id and released_at is null) then
    for it in update holds set released_at = now()
              where order_id = o.id and released_at is null
              returning ticket_type_id, qty loop
      update ticket_types set held_count = held_count - it.qty, sold_count = sold_count + it.qty
      where id = it.ticket_type_id;
    end loop;
  else
    begin
      for it in select ticket_type_id, sum(qty)::int as qty from order_items
                where order_id = o.id group by ticket_type_id order by ticket_type_id loop
        update ticket_types set sold_count = sold_count + it.qty
        where id = it.ticket_type_id and sold_count + held_count + it.qty <= capacity;
        get diagnostics n = row_count;
        if n = 0 then raise exception 'LATE_NO_INVENTORY'; end if;
      end loop;
    exception when raise_exception then
      update orders set razorpay_payment_id = p_payment_id where id = o.id;
      return 'late_no_inventory';
    end;
  end if;

  update orders set status = 'paid', razorpay_payment_id = p_payment_id, paid_at = now() where id = o.id;

  insert into tickets (organizer_id, order_id, ticket_type_id, event_id, attendee_name, attendee_email, attendee_phone)
  select o.organizer_id, o.id, oi.ticket_type_id, o.event_id, o.buyer_name, o.buyer_email, o.buyer_phone
  from order_items oi cross join generate_series(1, oi.qty)
  where oi.order_id = o.id;

  insert into notifications (organizer_id, order_id, template, recipient)
  values (o.organizer_id, o.id, 'tickets', o.buyer_email);
  return 'issued';
end $$;

create or replace function public.record_late_refund(p_order_id uuid, p_amount_paise int, p_refund_id text) returns void
language plpgsql set search_path = public as $$
declare o orders;
begin
  select * into o from orders where id = p_order_id for update;
  if o.status = 'refunded' then return; end if;
  insert into refunds (organizer_id, order_id, amount_paise, reason, razorpay_refund_id, status)
  values (o.organizer_id, o.id, p_amount_paise, 'Payment received after tickets sold out', p_refund_id, 'processed');
  update orders set status = 'refunded' where id = o.id;
  insert into notifications (organizer_id, order_id, template, recipient)
  values (o.organizer_id, o.id, 'late_refund', o.buyer_email);
end $$;

-- Claim rows for sending. 'sending' rows older than 5 min are assumed crashed and re-claimed.
create or replace function public.claim_notifications(p_order_id uuid default null, p_limit int default 20)
returns setof notifications language sql set search_path = public as $$
  update notifications set status = 'sending', attempts = attempts + 1, claimed_at = now()
  where id in (
    select id from notifications
    where (p_order_id is null or order_id = p_order_id)
      and attempts < 5
      and (status in ('pending', 'failed') or (status = 'sending' and claimed_at < now() - interval '5 minutes'))
    order by created_at
    limit p_limit
    for update skip locked)
  returning *;
$$;

revoke execute on function public.create_order(jsonb, jsonb, interval), public.release_holds(uuid),
  public.expire_holds(), public.fail_order(uuid), public.finalize_paid_order(uuid, text),
  public.record_late_refund(uuid, int, text), public.claim_notifications(uuid, int), public.gen_token()
  from public, anon, authenticated;
```

- [ ] **Step 4: Run to verify it passes**

Run: `supabase db reset && pnpm test:db`
Expected: `orders.test.sql .. ok` (22/22), `rls.test.sql .. ok`.

- [ ] **Step 5: Commit**

```bash
git add supabase
git commit -m "feat(db): atomic order holds, expiry, finalize and late-refund functions"
```
