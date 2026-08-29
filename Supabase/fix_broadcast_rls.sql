-- Run this in Supabase SQL Editor to completely allow broadcast messages

-- Disable RLS on broadcast_messages table
alter table public.broadcast_messages disable row level security;

-- Grant permissions to all roles
grant all on public.broadcast_messages to anon, authenticated, service_role;

notify pgrst, 'reload schema';
