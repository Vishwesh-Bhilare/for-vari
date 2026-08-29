-- Admin broadcast messages shown to signed-in and guest pilgrims.
-- Run this in Supabase SQL editor (or via psql) to add broadcasts and keep
-- only the three newest active broadcasts visible at any time.

create extension if not exists pgcrypto;

create table if not exists public.broadcast_messages (
  id uuid primary key default gen_random_uuid(),
  message text not null check (char_length(message) between 1 and 220),
  created_by uuid references public.profiles(id),
  expires_at timestamptz,
  active boolean not null default true,
  created_at timestamptz default now()
);

alter table public.broadcast_messages enable row level security;

drop policy if exists "anyone can read active broadcasts" on public.broadcast_messages;
drop policy if exists "admins create broadcasts" on public.broadcast_messages;
drop policy if exists "admins manage broadcasts" on public.broadcast_messages;

create policy "anyone can read active broadcasts"
  on public.broadcast_messages
  for select
  using (active = true and (expires_at is null or expires_at > now()));

create policy "authenticated create broadcasts"
  on public.broadcast_messages
  for insert
  with check (auth.uid() is not null);

create policy "authenticated manage broadcasts"
  on public.broadcast_messages
  for update
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

create or replace function public.keep_three_active_broadcasts()
returns trigger as $$
begin
  if new.active then
    update public.broadcast_messages
    set active = false
    where id in (
      select id
      from public.broadcast_messages
      where active = true
      order by created_at desc, id desc
      offset 3
    );
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists keep_three_active_broadcasts on public.broadcast_messages;
create trigger keep_three_active_broadcasts
  after insert or update of active, created_at on public.broadcast_messages
  for each row execute function public.keep_three_active_broadcasts();

-- Supabase Realtime only emits postgres_changes for tables in this publication.
do $$
begin
  alter publication supabase_realtime add table public.broadcast_messages;
exception
  when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
