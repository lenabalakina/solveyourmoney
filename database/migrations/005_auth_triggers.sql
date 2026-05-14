-- 005_auth_triggers.sql
-- Trigger: auto-create profiles + financial_profiles when auth.users gets a new row.
-- security definer + empty search_path prevents privilege escalation.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Create the public profile for the new user
  insert into public.profiles (id, email, display_name, role, onboarding_status)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      split_part(new.email, '@', 1)
    ),
    'user',
    'pending'
  )
  on conflict (id) do nothing;

  -- Create a default financial_profiles row so the dashboard always has a base record
  insert into public.financial_profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- Drop before recreate so re-running the migration is safe
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_auth_user();
