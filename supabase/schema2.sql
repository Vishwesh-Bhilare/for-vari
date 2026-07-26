-- Optional item-request expiry/category additions for Supabase SQL Editor.
-- The frontend already treats open requests older than 2 hours as expired.

alter table item_requests add column if not exists expires_at timestamptz default (now() + interval '2 hours');

alter table item_requests add column if not exists category text;

create extension if not exists pg_cron;

create or replace function public.expire_stale_item_requests()
returns void language sql as $$
  update item_requests
  set status = 'cancelled'
  where status = 'open' and expires_at < now();
$$;

select cron.schedule('expire-stale-item-requests', '*/15 * * * *', $$select public.expire_stale_item_requests()$$);
