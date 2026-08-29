-- Voice notes for first-class mesh chat messages.
alter table mesh_chat_relays
  add column if not exists message_type text not null default 'text',
  add column if not exists audio_base64 text,
  add column if not exists duration_seconds numeric,
  add column if not exists mime_type text;

alter table mesh_chat_relays
  alter column text drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'mesh_chat_relays_message_type_check'
  ) then
    alter table mesh_chat_relays
      add constraint mesh_chat_relays_message_type_check
      check (message_type = any (array['text', 'voice']));
  end if;
end $$;


-- Admin broadcast messages shown to signed-in and guest pilgrims.
create table if not exists broadcast_messages (
  id uuid primary key default gen_random_uuid(),
  message text not null check (char_length(message) between 1 and 220),
  created_by uuid references profiles(id),
  expires_at timestamptz,
  active boolean not null default true,
  created_at timestamptz default now()
);

alter table broadcast_messages enable row level security;

drop policy if exists "anyone can read active broadcasts" on broadcast_messages;
drop policy if exists "admins create broadcasts" on broadcast_messages;
drop policy if exists "admins manage broadcasts" on broadcast_messages;

create policy "anyone can read active broadcasts" on broadcast_messages for select using (active = true and (expires_at is null or expires_at > now()));
create policy "admins create broadcasts" on broadcast_messages for insert with check (public.is_admin() and created_by = auth.uid());
create policy "admins manage broadcasts" on broadcast_messages for update using (public.is_admin()) with check (public.is_admin());

do $$
begin
  alter publication supabase_realtime add table broadcast_messages;
exception
  when duplicate_object then null;
end $$;
