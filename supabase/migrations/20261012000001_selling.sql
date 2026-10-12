-- Pro "selling more": price steps, group discounts, coupons, add-ons.

alter table ticket_types
  add column unlocks_after_ticket_type_id uuid references ticket_types on delete set null,
  add column group_min_qty int check (group_min_qty >= 2),
  add column group_pct numeric(5,2) check (group_pct > 0 and group_pct <= 50);

create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references organizers on delete cascade,
  event_id uuid not null references events on delete cascade,
  code text not null check (code ~ '^[A-Z0-9_-]{3,30}$'),
  kind text not null check (kind in ('percent', 'flat')),
  value int not null check (value > 0),
  max_discount_paise int check (max_discount_paise > 0),
  ticket_type_ids uuid[],
  max_uses int check (max_uses > 0),
  used_count int not null default 0 check (used_count >= 0),
  held_count int not null default 0 check (held_count >= 0),
  valid_until timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (event_id, code),
  check (kind = 'flat' or value <= 100),
  check (max_uses is null or used_count + held_count <= max_uses)
);

create table public.addons (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references organizers on delete cascade,
  event_id uuid not null references events on delete cascade,
  name text not null,
  price_paise int not null check (price_paise >= 0),
  gst_rate numeric(5,2) not null default 18 check (gst_rate between 0 and 40),
  capacity int not null check (capacity >= 0),
  sold_count int not null default 0 check (sold_count >= 0),
  held_count int not null default 0 check (held_count >= 0),
  max_per_order int not null default 10 check (max_per_order > 0),
  sort int not null default 0,
  created_at timestamptz not null default now(),
  check (sold_count + held_count <= capacity)
);

alter table orders
  add column coupon_id uuid references coupons,
  add column discount_paise int not null default 0 check (discount_paise >= 0);
alter table order_items add column discount_paise int not null default 0 check (discount_paise >= 0);

create table public.order_addons (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references organizers,
  order_id uuid not null references orders on delete cascade,
  addon_id uuid not null references addons,
  qty int not null check (qty > 0),
  unit_price_paise int not null check (unit_price_paise >= 0),
  discount_paise int not null default 0 check (discount_paise >= 0),
  gst_rate numeric(5,2) not null
);

-- A hold now reserves a ticket type, an add-on, or one coupon use.
alter table holds
  alter column ticket_type_id drop not null,
  add column addon_id uuid references addons,
  add column coupon_id uuid references coupons,
  add constraint holds_one_target check (num_nonnulls(ticket_type_id, addon_id, coupon_id) = 1);

alter table coupons enable row level security;
alter table addons enable row level security;
alter table order_addons enable row level security;

create policy coupons_member on coupons for select to authenticated using (is_member(organizer_id));
create policy addons_read on addons for select using (
  is_member(organizer_id) or exists (select 1 from events e where e.id = event_id and e.status <> 'draft'));
create policy order_addons_member on order_addons for select to authenticated using (is_member(organizer_id));
grant select on addons to anon;
create policy coupons_write on coupons for all to authenticated
  using (is_member(organizer_id, '{owner,manager}')) with check (is_member(organizer_id, '{owner,manager}'));
create policy addons_write on addons for all to authenticated
  using (is_member(organizer_id, '{owner,manager}')) with check (is_member(organizer_id, '{owner,manager}'));
-- counters stay SQL-only (brief rule 1)
grant delete on coupons, addons to authenticated;
grant insert (organizer_id, event_id, code, kind, value, max_discount_paise, ticket_type_ids, max_uses, valid_until, active),
      update (code, kind, value, max_discount_paise, ticket_type_ids, max_uses, valid_until, active) on coupons to authenticated;
grant insert (organizer_id, event_id, name, price_paise, gst_rate, capacity, max_per_order, sort),
      update (name, price_paise, gst_rate, capacity, max_per_order, sort) on addons to authenticated;
grant insert (unlocks_after_ticket_type_id, group_min_qty, group_pct),
      update (unlocks_after_ticket_type_id, group_min_qty, group_pct) on ticket_types to authenticated;

-- Brief rule 1 still holds: every counter moves only here, through guarded updates.
create or replace function public.create_order(p_order jsonb, p_items jsonb, p_addons jsonb default '[]',
                                               p_ttl interval default interval '10 minutes')
returns table (id uuid, access_key text)
language plpgsql set search_path = public, extensions as $$
declare
  o orders;
  it record;
  n int;
begin
  insert into orders (organizer_id, event_id, buyer_name, buyer_email, buyer_phone,
                      subtotal_paise, fee_paise, gst_paise, total_paise, utm, coupon_id, discount_paise)
  select e.organizer_id, e.id, p_order->>'buyer_name', p_order->>'buyer_email', p_order->>'buyer_phone',
         (p_order->>'subtotal_paise')::int, (p_order->>'fee_paise')::int, (p_order->>'gst_paise')::int,
         (p_order->>'total_paise')::int, p_order->'utm', (p_order->>'coupon_id')::uuid,
         coalesce((p_order->>'discount_paise')::int, 0)
  from events e
  where e.id = (p_order->>'event_id')::uuid and e.status = 'published'
  returning * into o;
  if o.id is null then raise exception 'EVENT_NOT_FOUND'; end if;

  insert into order_items (organizer_id, order_id, ticket_type_id, qty, unit_price_paise, gst_rate, discount_paise)
  select o.organizer_id, o.id, (i->>'ticket_type_id')::uuid, (i->>'qty')::int,
         (i->>'unit_price_paise')::int, (i->>'gst_rate')::numeric, coalesce((i->>'discount_paise')::int, 0)
  from jsonb_array_elements(p_items) i;

  insert into order_addons (organizer_id, order_id, addon_id, qty, unit_price_paise, gst_rate, discount_paise)
  select o.organizer_id, o.id, (a->>'addon_id')::uuid, (a->>'qty')::int,
         (a->>'unit_price_paise')::int, (a->>'gst_rate')::numeric, coalesce((a->>'discount_paise')::int, 0)
  from jsonb_array_elements(p_addons) a;

  -- fixed order avoids deadlocks between concurrent multi-type orders
  for it in select ticket_type_id, sum(qty)::int as qty from order_items
            where order_id = o.id group by ticket_type_id order by ticket_type_id loop
    update ticket_types t set held_count = t.held_count + it.qty
    where t.id = it.ticket_type_id
      and t.event_id = o.event_id
      and it.qty <= t.max_per_order
      and now() >= t.sale_starts_at and now() < t.sale_ends_at
      and t.sold_count + t.held_count + it.qty <= t.capacity
      -- price step: on sale only once the previous step has no seats left
      and (t.unlocks_after_ticket_type_id is null or exists (
            select 1 from ticket_types p where p.id = t.unlocks_after_ticket_type_id
              and p.sold_count + p.held_count >= p.capacity));
    get diagnostics n = row_count;
    if n = 0 then raise exception 'UNAVAILABLE:%', it.ticket_type_id; end if;
    insert into holds (organizer_id, order_id, ticket_type_id, qty, expires_at)
    values (o.organizer_id, o.id, it.ticket_type_id, it.qty, now() + p_ttl);
  end loop;

  for it in select addon_id, sum(qty)::int as qty from order_addons
            where order_id = o.id group by addon_id order by addon_id loop
    update addons a set held_count = a.held_count + it.qty
    where a.id = it.addon_id and a.event_id = o.event_id and it.qty <= a.max_per_order
      and a.sold_count + a.held_count + it.qty <= a.capacity;
    get diagnostics n = row_count;
    if n = 0 then raise exception 'UNAVAILABLE:%', it.addon_id; end if;
    insert into holds (organizer_id, order_id, addon_id, qty, expires_at)
    values (o.organizer_id, o.id, it.addon_id, it.qty, now() + p_ttl);
  end loop;

  if o.coupon_id is not null then
    update coupons c set held_count = c.held_count + 1
    where c.id = o.coupon_id and c.event_id = o.event_id and c.active
      and (c.valid_until is null or now() < c.valid_until)
      and (c.max_uses is null or c.used_count + c.held_count < c.max_uses);
    get diagnostics n = row_count;
    if n = 0 then raise exception 'COUPON_EXHAUSTED'; end if;
    insert into holds (organizer_id, order_id, coupon_id, qty, expires_at)
    values (o.organizer_id, o.id, o.coupon_id, 1, now() + p_ttl);
  end if;

  return query select o.id, o.access_key;
end $$;
drop function if exists public.create_order(jsonb, jsonb, interval);

create or replace function public.release_holds(p_order_id uuid) returns int
language plpgsql set search_path = public as $$
declare h record; n int := 0;
begin
  perform 1 from orders where id = p_order_id for update;  -- serialize with finalize_paid_order
  for h in update holds set released_at = now()
           where order_id = p_order_id and released_at is null
           returning ticket_type_id, addon_id, coupon_id, qty loop
    update ticket_types set held_count = held_count - h.qty where id = h.ticket_type_id;
    update addons set held_count = held_count - h.qty where id = h.addon_id;
    update coupons set held_count = held_count - h.qty where id = h.coupon_id;
    n := n + 1;
  end loop;
  return n;
end $$;

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
              returning ticket_type_id, addon_id, coupon_id, qty loop
      update ticket_types set held_count = held_count - it.qty, sold_count = sold_count + it.qty where id = it.ticket_type_id;
      update addons set held_count = held_count - it.qty, sold_count = sold_count + it.qty where id = it.addon_id;
      update coupons set held_count = held_count - it.qty, used_count = used_count + it.qty where id = it.coupon_id;
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
      for it in select addon_id, sum(qty)::int as qty from order_addons
                where order_id = o.id group by addon_id order by addon_id loop
        update addons set sold_count = sold_count + it.qty
        where id = it.addon_id and sold_count + held_count + it.qty <= capacity;
        get diagnostics n = row_count;
        if n = 0 then raise exception 'LATE_NO_INVENTORY'; end if;
      end loop;
      -- ponytail: a late payment keeps its coupon even if the limit filled meanwhile; it was valid when quoted
      update coupons set used_count = used_count + 1 where id = o.coupon_id;
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

revoke execute on function public.create_order(jsonb, jsonb, jsonb, interval) from public, anon, authenticated;
