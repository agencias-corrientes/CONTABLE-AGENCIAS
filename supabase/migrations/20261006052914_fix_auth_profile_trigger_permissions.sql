create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to supabase_auth_admin;

create or replace function private.handle_new_user_profile()
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

revoke all on function private.handle_new_user_profile() from public, anon, authenticated;
grant execute on function private.handle_new_user_profile() to supabase_auth_admin;

drop trigger if exists on_auth_user_created_profile on auth.users;

create trigger on_auth_user_created_profile
after insert on auth.users
for each row
execute function private.handle_new_user_profile();
