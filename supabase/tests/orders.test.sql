begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

insert into organizers (id, name, slug) values ('00000000-0000-0000-0000-0000000000a1', 'Org', 'org');
insert into events (id, organizer_id, slug, title, starts_at, ends_at, status) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1', 'ev1', 'Ev', now() + interval '10 days', now() + interval '11 days', 'published'),
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
