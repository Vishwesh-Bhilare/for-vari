-- Live traffic status along the route, and group-private route nodes.
-- Run after schema.sql / schema2.sql / schema3.sql.

-- Traffic status reports, one per node, same shape/lifecycle as crowd_reports.
create table if not exists traffic_reports (
  id uuid primary key default gen_random_uuid(),
  node_id uuid references nodes(id),
  status text not null check (status in ('clear','moderate','heavy','jam')),
  note text,
  reported_by uuid references profiles(id),
  created_at timestamptz default now()
);
alter table traffic_reports enable row level security;
drop policy if exists "anyone can read traffic_reports" on traffic_reports;
drop policy if exists "authenticated users can insert traffic_reports" on traffic_reports;
drop policy if exists "admins insert traffic_reports" on traffic_reports;
create policy "anyone can read traffic_reports" on traffic_reports for select using (true);
create policy "admins insert traffic_reports" on traffic_reports for insert with check (public.is_admin() and reported_by = auth.uid());

do $$
begin
  alter publication supabase_realtime add table traffic_reports;
exception
  when duplicate_object then null;
end $$;

-- Nodes a group adds for themselves (meeting point, their tent, etc). Only
-- visible to members of that group (and admins); never shown on the public map.
create table if not exists group_nodes (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  name text not null,
  lat float8 not null,
  lng float8 not null,
  note text,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);
alter table group_nodes enable row level security;

drop policy if exists "group members read own group nodes" on group_nodes;
drop policy if exists "group members insert own group nodes" on group_nodes;
drop policy if exists "creator or admin deletes group node" on group_nodes;
drop policy if exists "creator or admin updates group node" on group_nodes;

create policy "group members read own group nodes" on group_nodes for select using (
  public.is_admin() or public.is_in_my_group(group_id)
);
create policy "group members insert own group nodes" on group_nodes for insert with check (
  auth.uid() is not null and created_by = auth.uid() and public.is_in_my_group(group_id)
);
create policy "creator or admin deletes group node" on group_nodes for delete using (
  created_by = auth.uid() or public.is_admin()
);
create policy "creator or admin updates group node" on group_nodes for update using (
  created_by = auth.uid() or public.is_admin()
) with check (
  created_by = auth.uid() or public.is_admin()
);

do $$
begin
  alter publication supabase_realtime add table group_nodes;
exception
  when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';

-- Crowd density and traffic reporting are restricted to admins only (no
-- reliable automated data source exists for these rural pilgrimage roads,
-- and pilgrim/volunteer self-reporting proved too noisy). This overrides
-- the more permissive "authenticated users can insert crowd_reports"
-- policy created in schema.sql.
drop policy if exists "authenticated users can insert crowd_reports" on crowd_reports;
drop policy if exists "admins insert crowd_reports" on crowd_reports;
create policy "admins insert crowd_reports" on crowd_reports for insert with check (public.is_admin() and reported_by = auth.uid());

notify pgrst, 'reload schema';
