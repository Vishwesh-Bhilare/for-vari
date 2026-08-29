-- Run this in Supabase SQL Editor to fix the RLS policy for broadcast_messages

alter table public.broadcast_messages enable row level security;

drop policy if exists "anyone can read active broadcasts" on public.broadcast_messages;
drop policy if exists "admins create broadcasts" on public.broadcast_messages;
drop policy if exists "admins manage broadcasts" on public.broadcast_messages;
drop policy if exists "authenticated create broadcasts" on public.broadcast_messages;
drop policy if exists "authenticated manage broadcasts" on public.broadcast_messages;

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

notify pgrst, 'reload schema';
