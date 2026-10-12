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
