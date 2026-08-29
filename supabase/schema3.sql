create table if not exists mesh_chat_relays (
  id uuid primary key default gen_random_uuid(),
  sender_id text,
  sender_name text,
  text text not null,
  lat double precision,
  lng double precision,
  created_at timestamptz default now()
);
alter table mesh_chat_relays enable row level security;
create policy "anyone can read mesh_chat_relays" on mesh_chat_relays for select using (true);
create policy "authenticated users can insert mesh_chat_relays" on mesh_chat_relays for insert with check (auth.uid() is not null);
alter publication supabase_realtime add table mesh_chat_relays;

create table if not exists news_broadcasts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  category text default 'disaster_update',
  publisher text default 'Central Disaster Response',
  created_at timestamptz default now()
);
alter table news_broadcasts enable row level security;
create policy "anyone can read news_broadcasts" on news_broadcasts for select using (true);
