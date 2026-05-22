-- 007_backfill_profiles.sql
-- Backfills profiles + financial_profiles for auth users who signed up
-- before the on_auth_user_created trigger (migration 005) was applied.
-- Safe to run multiple times (ON CONFLICT DO NOTHING).

insert into public.profiles (id, email, display_name, role, onboarding_status)
select
  id,
  email,
  coalesce(
    raw_user_meta_data ->> 'display_name',
    split_part(email, '@', 1)
  ),
  'user',
  'pending'
from auth.users
on conflict (id) do nothing;

insert into public.financial_profiles (user_id)
select id from auth.users
on conflict (user_id) do nothing;
