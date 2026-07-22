create extension if not exists pgcrypto;

create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  group_code text unique not null,
  created_at timestamptz default now()
);

create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references groups(id),
  name text not null,
  phone text,
  photo_url text,
  emergency_contact text,
  created_at timestamptz default now()
);

create table if not exists nodes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  lat float8 not null,
  lng float8 not null,
  sequence_order int
);

create table if not exists crowd_reports (
  id uuid primary key default gen_random_uuid(),
  node_id uuid references nodes(id),
  density text check (density in ('low','medium','high')),
  reported_by uuid references members(id),
  created_at timestamptz default now()
);

create table if not exists item_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid references members(id),
  item_name text not null,
  lat float8,
  lng float8,
  status text default 'open' check (status in ('open','accepted','completed','cancelled')),
  accepted_by uuid references members(id),
  accepted_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists sightings (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references members(id),
  node_id uuid references nodes(id),
  reported_by uuid references members(id),
  note text,
  created_at timestamptz default now()
);

create table if not exists sos_alerts (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references members(id),
  node_id uuid references nodes(id),
  lat float8,
  lng float8,
  status text default 'active' check (status in ('active','resolved')),
  created_at timestamptz default now()
);

create table if not exists presence_pings (
  id uuid primary key default gen_random_uuid(),
  node_id uuid references nodes(id),
  device_count int,
  created_at timestamptz default now()
);

alter table groups enable row level security;
alter table members enable row level security;
alter table nodes enable row level security;
alter table crowd_reports enable row level security;
alter table item_requests enable row level security;
alter table sightings enable row level security;
alter table sos_alerts enable row level security;
alter table presence_pings enable row level security;

do $$
declare t text;
begin
  foreach t in array array['groups','members','nodes','crowd_reports','item_requests','sightings','sos_alerts','presence_pings'] loop
    execute format('drop policy if exists hackathon_all on %I', t);
    execute format('create policy hackathon_all on %I for all using (true) with check (true)', t);
  end loop;
end $$;

-- Hackathon note: policies are intentionally permissive. Production should scope
-- writes to authenticated group members and limit reads for personal contact info,
-- while allowing public access only to appropriate crowd map and item board data.

-- Demo seed data keeps the offline IndexedDB defaults in sync with Supabase FK targets.
insert into groups (id, group_code)
values ('77777777-7777-4777-8777-777777777777', 'WARI-7F2K')
on conflict (group_code) do update set group_code = excluded.group_code;

insert into members (id, group_id, name, phone, emergency_contact)
values (
  '00000000-0000-4000-8000-000000000001',
  '77777777-7777-4777-8777-777777777777',
  'Demo Warkari',
  '+91-00000-00000',
  '+91-11111-11111'
)
on conflict (id) do update set
  group_id = excluded.group_id,
  name = excluded.name,
  phone = excluded.phone,
  emergency_contact = excluded.emergency_contact;

insert into nodes (id, name, lat, lng, sequence_order)
values
  ('11111111-1111-4111-8111-111111111111', 'Dehu', 18.7187, 73.7661, 1),
  ('22222222-2222-4222-8222-222222222222', 'Pune Halt', 18.5204, 73.8567, 2),
  ('33333333-3333-4333-8333-333333333333', 'Saswad', 18.3435, 74.0315, 3),
  ('44444444-4444-4444-8444-444444444444', 'Lonand', 18.0402, 74.1883, 4),
  ('55555555-5555-4555-8555-555555555555', 'Mukkam - Wakhri', 17.7242, 75.3309, 5),
  ('66666666-6666-4666-8666-666666666666', 'Pandharpur', 17.6746, 75.3237, 6)
on conflict (id) do update set
  name = excluded.name,
  lat = excluded.lat,
  lng = excluded.lng,
  sequence_order = excluded.sequence_order;

-- Supabase Realtime only emits postgres_changes for tables in this publication.
do $$
begin
  alter publication supabase_realtime add table crowd_reports, item_requests, sightings, sos_alerts;
exception
  when duplicate_object then null;
end $$;
