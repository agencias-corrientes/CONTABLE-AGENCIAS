-- Preview fix for Supabase Auth user creation
-- Cause: auth.users trigger function was SECURITY INVOKER, so the
-- supabase_auth_admin role could not insert into public.profiles.
--
-- Apply this SQL to the Preview database only.
-- Do not run against Production until this change is approved.

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data->>'full_name', '')), '')
  )
  on conflict (id) do update
  set full_name = coalesce(excluded.full_name, public.profiles.full_name);

  return new;
end;
$function$;

-- Keep this trigger function out of the public API surface.
revoke all on function public.handle_new_user_profile() from public;
revoke all on function public.handle_new_user_profile() from anon;
revoke all on function public.handle_new_user_profile() from authenticated;

-- Verification:
-- select p.prosecdef, pg_get_userbyid(p.proowner)
-- from pg_proc p
-- join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public'
--   and p.proname = 'handle_new_user_profile';
