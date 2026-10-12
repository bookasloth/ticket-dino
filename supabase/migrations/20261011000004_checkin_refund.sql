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
