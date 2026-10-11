create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Calls a Next.js job route. URL and bearer secret come from Vault (set per environment).
create or replace function public.call_job(p_path text) returns bigint
language sql security definer set search_path = '' as $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url') || p_path,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
      'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000);
$$;
revoke execute on function public.call_job(text) from public, anon, authenticated;

select cron.schedule('ticketdino-expire-holds', '* * * * *', 'select public.expire_holds()');
select cron.schedule('ticketdino-notify', '* * * * *', $$select public.call_job('/api/jobs/notify')$$);
select cron.schedule('ticketdino-reconcile', '*/5 * * * *', $$select public.call_job('/api/jobs/reconcile')$$);
