create or replace function public.update_agency_profile(
  p_organization_id uuid,
  p_name text,
  p_legal_name text,
  p_tax_id text,
  p_currency_code text,
  p_timezone text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if auth.uid() is null or not exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and m.role = 'owner'
  ) then
    raise exception 'Solo el titular puede modificar los datos de la agencia' using errcode = '42501';
  end if;

  if nullif(btrim(coalesce(p_name, '')), '') is null then
    raise exception 'El nombre de la agencia es obligatorio';
  end if;
  if upper(btrim(coalesce(p_currency_code, ''))) !~ '^[A-Z]{3}$' then
    raise exception 'La moneda debe ser un código de tres letras';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names t where t.name = p_timezone) then
    raise exception 'La zona horaria no es válida';
  end if;

  update public.organizations
  set name = btrim(p_name),
      legal_name = nullif(btrim(coalesce(p_legal_name, '')), ''),
      tax_id = nullif(btrim(coalesce(p_tax_id, '')), ''),
      currency_code = upper(btrim(p_currency_code)),
      timezone = p_timezone,
      updated_at = now()
  where id = p_organization_id;

  if not found then
    raise exception 'No encontramos la agencia';
  end if;

  insert into public.audit_log(organization_id, user_id, action, entity, entity_id, payload)
  values (
    p_organization_id, auth.uid(), 'update_agency_profile', 'organization', p_organization_id,
    jsonb_build_object('name', btrim(p_name), 'currency_code', upper(btrim(p_currency_code)), 'timezone', p_timezone)
  );
end;
$function$;

create or replace function public.delete_agency_organization(
  p_organization_id uuid,
  p_confirmation text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_name text;
begin
  if auth.uid() is null or not exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and m.role = 'owner'
  ) then
    raise exception 'Solo el titular puede eliminar la agencia' using errcode = '42501';
  end if;

  select o.name into v_name
  from public.organizations o
  where o.id = p_organization_id
  for update;

  if v_name is null then
    raise exception 'No encontramos la agencia';
  end if;

  if coalesce(p_confirmation, '') <> 'ELIMINAR: ' || v_name then
    raise exception 'La confirmación no coincide con el nombre de la agencia';
  end if;

  delete from public.organizations where id = p_organization_id;
end;
$function$;

revoke all on function public.update_agency_profile(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.update_agency_profile(uuid, text, text, text, text, text) to authenticated;
revoke all on function public.delete_agency_organization(uuid, text) from public, anon;
grant execute on function public.delete_agency_organization(uuid, text) to authenticated;
