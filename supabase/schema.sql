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
