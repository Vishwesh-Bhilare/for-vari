create extension if not exists pgcrypto;

create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  group_code text unique not null,
  created_at timestamptz default now()
);

create table if not exists nodes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  lat float8 not null,
  lng float8 not null,
  sequence_order int
);

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'pilgrim' check (role in ('pilgrim','volunteer','admin')),
  display_name text,
  phone text,
  emergency_contact text,
  photo_url text,
  node_id uuid references nodes(id),
  approved boolean default false,
  group_id uuid references groups(id),
  created_at timestamptz default now()
);

alter table profiles drop column if exists requested_role;

create table if not exists volunteer_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  full_name text not null,
  phone text not null,
  emergency_contact text,
  preferred_station uuid references nodes(id),
  age int not null,
  city text not null,
  experience text not null,
  why_volunteer text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz default now()
);

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create table if not exists crowd_reports (
  id uuid primary key default gen_random_uuid(),
  node_id uuid references nodes(id),
  density text check (density in ('low','medium','high')),
  reported_by uuid references profiles(id),
  created_at timestamptz default now()
);

create table if not exists item_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid references profiles(id),
  item_name text not null,
  lat float8,
  lng float8,
  status text default 'open' check (status in ('open','accepted','completed','cancelled')),
  accepted_by uuid references profiles(id),
  accepted_at timestamptz,
  accepter_lat float8,
  accepter_lng float8,
  created_at timestamptz default now()
);

create table if not exists sightings (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references profiles(id),
  node_id uuid references nodes(id),
  reported_by uuid references profiles(id),
  group_code text references groups(group_code),
  note text,
  verified boolean not null default false,
  verified_by uuid references profiles(id),
  verified_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists sos_alerts (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references profiles(id),
  node_id uuid references nodes(id),
  lat float8,
  lng float8,
  status text default 'active' check (status in ('active','resolved')),
  resolved_by uuid references profiles(id),
  resolved_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists presence_pings (
  id uuid primary key default gen_random_uuid(),
  node_id uuid references nodes(id),
  device_count int,
  created_at timestamptz default now()
);

alter table groups enable row level security;
alter table nodes enable row level security;
alter table profiles enable row level security;
alter table volunteer_applications enable row level security;
alter table crowd_reports enable row level security;
alter table item_requests enable row level security;
alter table sightings enable row level security;
alter table sos_alerts enable row level security;
alter table presence_pings enable row level security;

do $$
declare t text;
begin
  foreach t in array array['groups','nodes','profiles','volunteer_applications','crowd_reports','item_requests','sightings','sos_alerts','presence_pings'] loop
    execute format('drop policy if exists hackathon_all on %I', t);
  end loop;
end $$;

create or replace function public.is_approved_volunteer()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('volunteer','admin') and p.approved = true);
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin');
$$;

create policy "anyone can read groups" on groups for select using (true);
create policy "authenticated users can create groups" on groups for insert with check (auth.uid() is not null);
create policy "anyone can read nodes" on nodes for select using (true);
create policy "admins manage nodes" on nodes for all using (public.is_admin()) with check (public.is_admin());

create policy "users read own profile" on profiles for select using (auth.uid() = id or public.is_admin());
create policy "users update own profile" on profiles for update using (auth.uid() = id) with check (auth.uid() = id and role = 'pilgrim' and approved = false);
create policy "admins manage profiles" on profiles for update using (public.is_admin()) with check (public.is_admin());

create policy "users read own volunteer applications" on volunteer_applications for select using (auth.uid() = user_id or public.is_admin());
create policy "users create own volunteer applications" on volunteer_applications for insert with check (auth.uid() = user_id and status = 'pending');
create policy "admins review volunteer applications" on volunteer_applications for update using (public.is_admin()) with check (public.is_admin());

create policy "anyone can read crowd_reports" on crowd_reports for select using (true);
create policy "authenticated users can insert crowd_reports" on crowd_reports for insert with check (auth.uid() is not null and reported_by = auth.uid());

create policy "anyone can read item_requests" on item_requests for select using (true);
create policy "authenticated users can insert item_requests" on item_requests for insert with check (auth.uid() is not null and requester_id = auth.uid());
create policy "authenticated users can accept item_requests" on item_requests for update using (auth.uid() is not null) with check (auth.uid() is not null and (requester_id = auth.uid() or accepted_by = auth.uid()));

create policy "anyone can read sightings" on sightings for select using (true);
create policy "authenticated users can insert sightings" on sightings for insert with check (auth.uid() is not null and reported_by = auth.uid());
create policy "volunteers verify sightings" on sightings for update using (public.is_approved_volunteer()) with check (public.is_approved_volunteer());

create policy "anyone can read sos_alerts" on sos_alerts for select using (true);
create policy "authenticated users can insert sos_alerts" on sos_alerts for insert with check (auth.uid() is not null and member_id = auth.uid());
create policy "volunteers can resolve sos" on sos_alerts for update using (public.is_approved_volunteer()) with check (public.is_approved_volunteer());

create policy "anyone can read presence_pings" on presence_pings for select using (true);
create policy "authenticated users can insert presence_pings" on presence_pings for insert with check (auth.uid() is not null);

-- Supabase Realtime only emits postgres_changes for tables in this publication.
do $$
begin
  alter publication supabase_realtime add table crowd_reports, item_requests, sightings, sos_alerts, profiles, volunteer_applications, nodes;
exception
  when duplicate_object then null;
end $$;

-- Authentication hardening: allow client-side upsert/profile repair while protecting roles.
create policy "users create own profile" on profiles
  for insert with check (auth.uid() = id and role = 'pilgrim' and approved = false);

create or replace function public.prevent_profile_privilege_escalation()
returns trigger as $$
begin
  if auth.uid() = new.id and not public.is_admin() then
    if new.role is distinct from old.role or new.approved is distinct from old.approved then
      raise exception 'Users cannot change their own role or approval status';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists prevent_profile_privilege_escalation on public.profiles;
create trigger prevent_profile_privilege_escalation
  before update on public.profiles
  for each row execute function public.prevent_profile_privilege_escalation();

-- Replace the older restrictive profile update policy with trigger-enforced field safety.
drop policy if exists "users update own profile" on profiles;
create policy "users update own profile" on profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Keep one active pending volunteer application per user to prevent duplicate review races.
create unique index if not exists volunteer_applications_one_pending_per_user
  on public.volunteer_applications(user_id)
  where status = 'pending';

-- Atomic admin approval path. Frontend calls this RPC; RLS still enforces admin access.
create or replace function public.approve_volunteer_application(application_id uuid)
returns void as $$
declare
  target_user_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Only admins can approve volunteer applications';
  end if;

  update public.volunteer_applications
  set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
  where id = application_id and status = 'pending'
  returning user_id into target_user_id;

  if target_user_id is null then
    raise exception 'Pending volunteer application not found';
  end if;

  update public.profiles
  set role = 'volunteer', approved = true
  where id = target_user_id;
end;
$$ language plpgsql security definer set search_path = public;
