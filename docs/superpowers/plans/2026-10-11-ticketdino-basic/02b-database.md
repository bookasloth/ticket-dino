# Part 2b — Database (check-in, refunds, concurrency)

### Task 5: Check-in and manual refund functions

**Files:**
- Create: `supabase/migrations/20261011000004_checkin_refund.sql`
- Test: `supabase/tests/checkin_refund.test.sql`

**Interfaces:**
- Consumes: `create_order`, `finalize_paid_order`, `is_member` (Tasks 3–4).
- Produces (callable by `authenticated`; they check permissions themselves via `auth.uid()`):
  - `can_scan_event(p_event_id uuid) returns boolean`
  - `check_in(p_token text, p_event_id uuid) returns jsonb` → `{ result: 'ok'|'already_used'|'wrong_event'|'void'|'not_found', attendee_name?, ticket_type?, checked_in_at?, checked_in_by? }`. Raises `FORBIDDEN`.
  - `mark_order_refunded(p_order_id uuid, p_reason text) returns void`. Raises `FORBIDDEN`, `NOT_PAID`, `ORDER_NOT_FOUND`.

- [ ] **Step 1: Write the failing test**

`supabase/tests/checkin_refund.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'owner@t.in'),
  ('00000000-0000-0000-0000-0000000000b2', 'staff@t.in'),
  ('00000000-0000-0000-0000-0000000000b3', 'outsider@t.in');
insert into organizers (id, name, slug) values ('00000000-0000-0000-0000-0000000000a1', 'Org', 'org');
insert into organizer_members (organizer_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'owner'),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', 'staff');
insert into events (id, organizer_id, slug, title, starts_at, ends_at, status) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1', 'ev1', 'Ev1', now() + interval '10 days', now() + interval '11 days', 'published'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000a1', 'ev2', 'Ev2', now() + interval '10 days', now() + interval '11 days', 'published');
insert into event_staff (organizer_id, event_id, user_id) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b2');
insert into ticket_types (id, organizer_id, event_id, name, price_paise, capacity, sale_ends_at) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e1', 'GA', 50000, 10, now() + interval '5 days');

create temp table ids (k text primary key, v text);
grant select on ids to authenticated;
insert into ids select 'o1', id::text from create_order(
  jsonb_build_object('event_id', '00000000-0000-0000-0000-0000000000e1', 'buyer_name', 'Asha', 'buyer_email', 'a@t.in',
    'buyer_phone', '+919876543210', 'subtotal_paise', 100000, 'fee_paise', 0, 'gst_paise', 0, 'total_paise', 100000),
  '[{"ticket_type_id":"00000000-0000-0000-0000-0000000000c1","qty":2,"unit_price_paise":50000,"gst_rate":18}]');
select finalize_paid_order((select v::uuid from ids where k = 'o1'), 'pay_1');
insert into ids select 'tok' || row_number() over (order by id), qr_token from tickets;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}';
select is(check_in((select v from ids where k = 'tok1'), '00000000-0000-0000-0000-0000000000e1')->>'result', 'ok', 'first scan ok');
select is(check_in((select v from ids where k = 'tok1'), '00000000-0000-0000-0000-0000000000e1')->>'result', 'already_used', 'second scan already used');
select is(check_in((select v from ids where k = 'tok1'), '00000000-0000-0000-0000-0000000000e1')->>'checked_in_by', 'staff@t.in', 'repeat scan says who scanned first');
select is(check_in('nope', '00000000-0000-0000-0000-0000000000e1')->>'result', 'not_found', 'unknown token');
select throws_like($$select check_in('x', '00000000-0000-0000-0000-0000000000e2')$$, '%FORBIDDEN%', 'staff not assigned to ev2');
select throws_like($$select mark_order_refunded((select v::uuid from ids where k = 'o1'), 'x')$$, '%FORBIDDEN%', 'staff cannot refund');

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
select is(check_in((select v from ids where k = 'tok2'), '00000000-0000-0000-0000-0000000000e2')->>'result', 'wrong_event', 'owner scanning at the wrong event');

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b3","role":"authenticated"}';
select throws_like($$select check_in('x', '00000000-0000-0000-0000-0000000000e1')$$, '%FORBIDDEN%', 'outsider cannot scan');

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
select lives_ok($$select mark_order_refunded((select v::uuid from ids where k = 'o1'), 'Buyer asked')$$, 'owner refunds');
select is(check_in((select v from ids where k = 'tok2'), '00000000-0000-0000-0000-0000000000e1')->>'result', 'void', 'refunded ticket scans void');
select throws_like($$select mark_order_refunded((select v::uuid from ids where k = 'o1'), 'again')$$, '%NOT_PAID%', 'cannot refund twice');

reset role;
-- 2 sold, 1 was checked in → only the 1 unused seat returns to stock
select is((select sold_count from ticket_types where id = '00000000-0000-0000-0000-0000000000c1'), 1, 'unused seat returned');
select is((select count(*)::int from notifications where template = 'refund'), 1, 'refund email queued');

select * from finish();
rollback;
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test:db`
Expected: FAIL — function check_in does not exist.

- [ ] **Step 3: Implement**

`supabase/migrations/20261011000004_checkin_refund.sql`:
```sql
create or replace function public.can_scan_event(p_event_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.event_staff s where s.event_id = p_event_id and s.user_id = auth.uid())
      or exists (select 1 from public.events e where e.id = p_event_id
                 and public.is_member(e.organizer_id, '{owner,manager}'));
$$;

create or replace function public.check_in(p_token text, p_event_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t tickets; uid uuid := auth.uid(); res text;
begin
  if uid is null or not can_scan_event(p_event_id) then raise exception 'FORBIDDEN'; end if;

  update tickets set status = 'checked_in', checked_in_at = now(), checked_in_by = uid
  where qr_token = p_token and event_id = p_event_id and status = 'valid'
  returning * into t;

  if found then
    res := 'ok';
  else
    select * into t from tickets where qr_token = p_token;
    res := case
      when t.id is null then 'not_found'
      when t.event_id <> p_event_id then 'wrong_event'
      when t.status = 'checked_in' then 'already_used'
      else 'void' end;
  end if;

  insert into checkins (organizer_id, event_id, ticket_id, token_scanned, staff_id, result)
  select e.organizer_id, p_event_id, t.id, left(p_token, 64), uid, res from events e where e.id = p_event_id;

  if t.id is null or t.event_id <> p_event_id then
    return jsonb_build_object('result', res);  -- don't leak another event's attendee
  end if;
  return jsonb_build_object(
    'result', res,
    'attendee_name', t.attendee_name,
    'ticket_type', (select name from ticket_types where id = t.ticket_type_id),
    'checked_in_at', t.checked_in_at,
    'checked_in_by', (select email from auth.users where id = t.checked_in_by));
end $$;

-- Basic: the admin has already refunded in the Razorpay dashboard; this records it.
create or replace function public.mark_order_refunded(p_order_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare o orders; it record;
begin
  select * into o from orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if not is_member(o.organizer_id, '{owner,manager}') then raise exception 'FORBIDDEN'; end if;
  if o.status <> 'paid' then raise exception 'NOT_PAID'; end if;

  insert into refunds (organizer_id, order_id, amount_paise, reason, initiated_by, status)
  values (o.organizer_id, o.id, o.total_paise, p_reason, auth.uid(), 'manual');
  update orders set status = 'refunded' where id = o.id;

  if (select starts_at from events where id = o.event_id) > now() then
    for it in select ticket_type_id, count(*)::int as qty from tickets
              where order_id = o.id and status = 'valid' group by ticket_type_id loop
      update ticket_types set sold_count = sold_count - it.qty where id = it.ticket_type_id;
    end loop;
  end if;
  update tickets set status = 'void' where order_id = o.id;

  insert into notifications (organizer_id, order_id, template, recipient)
  values (o.organizer_id, o.id, 'refund', o.buyer_email);
end $$;

revoke execute on function public.check_in(text, uuid), public.mark_order_refunded(uuid, text),
  public.can_scan_event(uuid) from public, anon;
grant execute on function public.check_in(text, uuid), public.mark_order_refunded(uuid, text),
  public.can_scan_event(uuid) to authenticated;
```

- [ ] **Step 4: Run to verify it passes**

Run: `supabase db reset && pnpm test:db`
Expected: all three test files ok.

- [ ] **Step 5: Commit**

```bash
git add supabase
git commit -m "feat(db): atomic check-in and manual refund functions"
```

---

### Task 6: Concurrency test (never oversell)

**Files:**
- Test: `tests/integration/concurrency.test.ts`

**Interfaces:**
- Consumes: `create_order` via PostgREST RPC (Task 4); `.env.local` with `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` pointing at the **local** stack.

- [ ] **Step 1: Write the test**

`tests/integration/concurrency.test.ts`:
```ts
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const isLocal = /127\.0\.0\.1|localhost/.test(url);

describe.skipIf(!key || !isLocal)('inventory under concurrent load', () => {
  it('200 buyers racing for 50 seats → exactly 50 holds', async () => {
    const db = createClient(url, key, { auth: { persistSession: false } });
    const stamp = Date.now();
    const { data: org } = await db.from('organizers').insert({ name: 'Load', slug: `load-${stamp}` }).select().single();
    const { data: ev } = await db
      .from('events')
      .insert({
        organizer_id: org!.id, slug: `load-${stamp}`, title: 'Load', status: 'published',
        starts_at: new Date(Date.now() + 10 * 864e5).toISOString(),
        ends_at: new Date(Date.now() + 11 * 864e5).toISOString(),
      })
      .select().single();
    const { data: tt } = await db
      .from('ticket_types')
      .insert({
        organizer_id: org!.id, event_id: ev!.id, name: 'GA', price_paise: 1000, capacity: 50,
        max_per_order: 1, sale_ends_at: new Date(Date.now() + 5 * 864e5).toISOString(),
      })
      .select().single();

    const attempts = await Promise.all(
      Array.from({ length: 200 }, (_, i) =>
        db.rpc('create_order', {
          p_order: {
            event_id: ev!.id, buyer_name: `B${i}`, buyer_email: `b${i}@t.in`, buyer_phone: '+919876543210',
            subtotal_paise: 1000, fee_paise: 0, gst_paise: 0, total_paise: 1000,
          },
          p_items: [{ ticket_type_id: tt!.id, qty: 1, unit_price_paise: 1000, gst_rate: 18 }],
        }),
      ),
    );

    const failures = attempts.filter((a) => a.error);
    expect(attempts.length - failures.length).toBe(50);
    expect(failures.every((f) => f.error!.message.includes('UNAVAILABLE'))).toBe(true);

    const { data: after } = await db.from('ticket_types').select('sold_count, held_count, capacity').eq('id', tt!.id).single();
    expect(after).toEqual({ sold_count: 0, held_count: 50, capacity: 50 });
    const { count } = await db.from('orders').select('*', { count: 'exact', head: true }).eq('event_id', ev!.id);
    expect(count).toBe(50);
  }, 60_000);
});
```

- [ ] **Step 2: Run it**

Run: `pnpm test:int`
Expected: PASS (1 test). If it reports "skipped", `.env.local` is missing the local service-role key: copy it from `supabase status`.

- [ ] **Step 3: Commit**

```bash
git add tests/integration
git commit -m "test: 200-way concurrency test proves no oversell"
```
