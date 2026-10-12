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

-- This Supabase version grants the API roles nothing on new tables/functions, so grant exactly what's needed.
revoke all on all tables in schema public from anon, authenticated;
grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant execute on functions to service_role;
grant execute on all functions in schema public to service_role;

grant select on organizers, venues, events, ticket_types to anon;
grant select on all tables in schema public to authenticated;  -- rows still filtered by RLS
grant update on organizers to authenticated;
grant insert, update, delete on venues, events, event_staff to authenticated;

-- Inventory counters are written only by SQL functions (brief rule 1)
grant delete on ticket_types to authenticated;
grant insert (organizer_id, event_id, name, price_paise, gst_rate, capacity, max_per_order, sale_starts_at, sale_ends_at, sort),
      update (name, price_paise, gst_rate, capacity, max_per_order, sale_starts_at, sale_ends_at, sort)
  on ticket_types to authenticated;

-- RLS policies call these as the requesting role
grant execute on function public.is_member(uuid, text[]), public.is_super_admin() to anon, authenticated;
