-- SQL commands to setup Pilgrim Photo Uploads in Supabase

-- 1. Ensure photo_url column exists on public.profiles
alter table public.profiles add column if not exists photo_url text;

-- 2. Create public storage bucket for pilgrim photos
insert into storage.buckets (id, name, public)
values ('member-photos', 'member-photos', true)
on conflict (id) do update set public = true;

-- 3. Configure storage object RLS policies for public reading and authenticated uploading
drop policy if exists "Anyone can view member photos" on storage.objects;
drop policy if exists "Authenticated users can upload member photos" on storage.objects;
drop policy if exists "Users can update own member photos" on storage.objects;

create policy "Anyone can view member photos"
  on storage.objects for select
  using (bucket_id = 'member-photos');

create policy "Authenticated users can upload member photos"
  on storage.objects for insert
  with check (bucket_id = 'member-photos' and auth.role() = 'authenticated');

create policy "Users can update own member photos"
  on storage.objects for update
  using (bucket_id = 'member-photos' and auth.role() = 'authenticated');

notify pgrst, 'reload schema';
