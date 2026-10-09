-- Owner-confirmed removal of a user from this agency. The caller re-authenticates with password in the server action.
create or replace function public.remove_organization_member(p_organization_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_target_role text;
  v_other_owner_count integer;
begin
  if auth.uid() is null or not exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id and m.user_id = auth.uid() and m.role = 'owner'
  ) then
    raise exception 'Solo el titular puede quitar usuarios de la agencia' using errcode = '42501';
  end if;

  select role into v_target_role
  from public.organization_members
  where organization_id = p_organization_id and user_id = p_user_id;

  if v_target_role is null then
    raise exception 'El usuario no pertenece a esta agencia' using errcode = 'P0002';
  end if;

  select count(*) into v_other_owner_count
  from public.organization_members
  where organization_id = p_organization_id and role = 'owner' and user_id <> p_user_id;

  if v_target_role = 'owner' and v_other_owner_count = 0 then
    raise exception 'No se puede quitar al único titular. Primero asigná otro titular.' using errcode = '42501';
  end if;

  delete from public.organization_member_permissions
  where organization_id = p_organization_id and user_id = p_user_id;
  delete from public.organization_members
  where organization_id = p_organization_id and user_id = p_user_id;
end;
$function$;

revoke all on function public.remove_organization_member(uuid, uuid) from public, anon;
grant execute on function public.remove_organization_member(uuid, uuid) to authenticated;
