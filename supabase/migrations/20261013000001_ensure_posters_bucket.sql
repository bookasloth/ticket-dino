-- The original schema migration creates this bucket only when it does not
-- already exist. Reconcile pre-existing dashboard-created buckets too, so a
-- private `posters` bucket cannot leave public poster URLs inaccessible.
insert into storage.buckets (id, name, public)
values ('posters', 'posters', true)
on conflict (id) do update
  set name = excluded.name,
      public = excluded.public;
