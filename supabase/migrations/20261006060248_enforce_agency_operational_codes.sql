alter table public.agency_agents
  alter column code set not null;

alter table public.agency_agents
  add constraint agency_agents_code_format_ck
  check (code ~ '^[0-9]{3}-[0-9]{3}-[0-9]{2}$');

create or replace function public.create_agency_agent(
  p_organization_id uuid,
  p_kind agency_agent_kind,
  p_full_name text,
  p_code text default null,
  p_dni text default null,
  p_phone text default null,
  p_whatsapp text default null,
  p_address text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_id uuid;
  v_code text := trim(coalesce(p_code, ''));
begin
  if not exists(
    select 1 from public.organization_members
    where organization_id = p_organization_id
      and user_id = auth.uid()
      and role in ('owner','admin')
  ) then
    raise exception 'Sin permisos';
  end if;

  if trim(coalesce(p_full_name,''))='' then
    raise exception 'El nombre es obligatorio';
  end if;

  if v_code !~ '^[0-9]{3}-[0-9]{3}-[0-9]{2}$' then
    raise exception 'El código debe tener el formato 251-010-01';
  end if;

  insert into public.agency_agents(
    organization_id,kind,full_name,code,dni,phone,whatsapp,address,notes,created_by
  )
  values(
    p_organization_id,p_kind,trim(p_full_name),v_code,
    nullif(trim(p_dni),''),nullif(trim(p_phone),''),nullif(trim(p_whatsapp),''),
    nullif(trim(p_address),''),nullif(trim(p_notes),''),auth.uid()
  )
  returning id into v_id;

  insert into public.audit_log(organization_id,user_id,action,entity,entity_id,payload)
  values(
    p_organization_id,auth.uid(),'create','agency_agent',v_id,
    jsonb_build_object('kind',p_kind,'code',v_code,'full_name',trim(p_full_name))
  );

  return v_id;
end;
$function$;