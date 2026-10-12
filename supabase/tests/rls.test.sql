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
select is((select count(*)::int from events where organizer_id = '00000000-0000-0000-0000-0000000000a1'), 1, 'anon sees only the published event');
select throws_ok('select count(*) from orders', '42501', null, 'anon cannot read orders at all');
select throws_ok('select count(*) from webhook_events', '42501', null, 'anon cannot read webhook events');

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}';
select is((select count(*)::int from events where organizer_id = '00000000-0000-0000-0000-0000000000a1'), 2, 'staff member sees draft events of their organizer');
select is((select count(*)::int from orders where organizer_id = '00000000-0000-0000-0000-0000000000a1'), 0, 'staff cannot read orders');
select throws_ok(
  $$insert into ticket_types (organizer_id, event_id, name, price_paise, capacity, sale_ends_at)
    values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e1', 'X', 1, 1, now() + interval '1 day')$$,
  '42501', null, 'staff cannot create ticket types');

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
select is((select count(*)::int from orders where organizer_id = '00000000-0000-0000-0000-0000000000a1'), 1, 'owner reads orders');
select throws_ok(
  $$update ticket_types set sold_count = 0 where id = '00000000-0000-0000-0000-0000000000c1'$$,
  '42501', null, 'owner cannot write sold_count directly');

reset role;
select * from finish();
rollback;
