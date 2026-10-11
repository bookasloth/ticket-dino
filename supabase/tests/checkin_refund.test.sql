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
insert into ids select 'tok' || row_number() over (order by id), qr_token from tickets where organizer_id = '00000000-0000-0000-0000-0000000000a1';

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
select is((select count(*)::int from notifications where template = 'refund' and organizer_id = '00000000-0000-0000-0000-0000000000a1'), 1, 'refund email queued');

select * from finish();
rollback;
