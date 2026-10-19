-- Restore account-management RPCs that can be absent in a cloned preview schema.

create or replace function public.add_organization_member_by_email(
  p_organization_id uuid,
  p_email text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_user_id uuid;
  v_email text := lower(trim(coalesce(p_email, '')));
begin
  if auth.uid() is null or not private.is_org_member(p_organization_id, auth.uid()) or not exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and m.role = 'owner'
  ) then
    raise exception 'Solo el titular puede agregar empleados';
  end if;

  if v_email = '' or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'Ingresá un correo válido para el empleado';
  end if;

  select u.id
    into v_user_id
  from auth.users u
  where lower(u.email) = v_email
  order by u.created_at asc
  limit 1;

  if v_user_id is null then
    raise exception 'No encontramos una cuenta con ese correo. El empleado debe registrarse primero.';
  end if;

  if exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = v_user_id
  ) then
    raise exception 'Ese usuario ya pertenece a esta agencia';
  end if;

  insert into public.organization_members (organization_id, user_id, role)
  values (p_organization_id, v_user_id, 'accountant');

  insert into public.organization_member_permissions (organization_id, user_id, created_by)
  values (p_organization_id, v_user_id, auth.uid())
  on conflict (organization_id, user_id) do nothing;

  insert into public.audit_log (organization_id, user_id, action, entity, entity_id, payload)
  values (
    p_organization_id,
    auth.uid(),
    'add_employee',
    'organization_member',
    v_user_id,
    jsonb_build_object('email', v_email, 'role', 'accountant')
  );

  return v_user_id;
end;
$function$;

revoke all on function public.add_organization_member_by_email(uuid, text) from public, anon;
grant execute on function public.add_organization_member_by_email(uuid, text) to authenticated;

create or replace function public.list_organization_members_for_owner(p_organization_id uuid)
returns table (
  user_id uuid,
  email text,
  full_name text,
  role public.organization_role,
  can_create_agents boolean,
  can_delete_agents boolean,
  can_create_renditions boolean,
  can_edit_renditions boolean,
  can_delete_renditions boolean,
  can_register_payments boolean,
  can_manage_backups boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if auth.uid() is null or not private.is_org_member(p_organization_id, auth.uid()) or not exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and m.role = 'owner'
  ) then
    raise exception 'Solo el titular puede administrar permisos';
  end if;

  return query
  select
    m.user_id,
    u.email::text,
    coalesce(p.full_name, ''),
    m.role,
    coalesce(perms.can_create_agents, false),
    coalesce(perms.can_delete_agents, false),
    coalesce(perms.can_create_renditions, false),
    coalesce(perms.can_edit_renditions, false),
    coalesce(perms.can_delete_renditions, false),
    coalesce(perms.can_register_payments, false),
    coalesce(perms.can_manage_backups, false)
  from public.organization_members m
  join auth.users u on u.id = m.user_id
  left join public.profiles p on p.id = m.user_id
  left join public.organization_member_permissions perms
    on perms.organization_id = m.organization_id
   and perms.user_id = m.user_id
  where m.organization_id = p_organization_id
  order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end, u.email;
end;
$function$;

revoke all on function public.list_organization_members_for_owner(uuid) from public, anon;
grant execute on function public.list_organization_members_for_owner(uuid) to authenticated;
