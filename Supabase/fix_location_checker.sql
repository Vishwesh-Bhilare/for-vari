-- Run this in the Supabase SQL Editor.
--
-- The original group-location helpers queried `profiles` as the calling user.
-- Because those helpers are evaluated from a `profiles` RLS policy, PostgreSQL
-- can recursively apply that same policy and reject the group-member lookup.
-- Running them as security-definer functions avoids that recursion while the
-- functions still only return a boolean for the authenticated user's group.

create or replace function public.is_in_my_group(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_group_id is not null and exists (
    select 1
    from public.profiles
    where id = auth.uid() and group_id = target_group_id
  );
$$;

create or replace function public.shares_group_with(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles as mine
    join public.profiles as target on target.id = target_user_id
    where mine.id = auth.uid()
      and mine.group_id is not null
      and mine.group_id = target.group_id
  );
$$;

-- Group-member and location queries use this predicate frequently.
create index if not exists profiles_group_id_idx on public.profiles (group_id);
