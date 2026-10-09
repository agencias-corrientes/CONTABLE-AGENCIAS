create table if not exists public.agency_agent_daily_status (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.agency_agents(id) on delete cascade,
  operational_date date not null,
  status text not null check (status in ('incomplete', 'complete')),
  notes text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (organization_id, agent_id, operational_date)
);

create index if not exists agency_agent_daily_status_org_date_idx
  on public.agency_agent_daily_status (organization_id, operational_date);

alter table public.agency_agent_daily_status enable row level security;
revoke all on public.agency_agent_daily_status from public, anon;
grant select on public.agency_agent_daily_status to authenticated;

drop policy if exists agency_agent_daily_status_member_select
  on public.agency_agent_daily_status;
create policy agency_agent_daily_status_member_select
  on public.agency_agent_daily_status
  for select to authenticated
  using (private.is_org_member(organization_id, (select auth.uid())));

create or replace function public.set_agency_agent_daily_status(
  p_organization_id uuid,
  p_agent_id uuid,
  p_operational_date date,
  p_status text,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_cutoff time;
  v_local_now timestamp without time zone;
  v_current_operational_date date;
begin
  if not private.has_org_permission(p_organization_id, 'can_create_renditions', auth.uid()) then
    raise exception 'No tenés permiso para cambiar el estado de la rendición' using errcode = '42501';
  end if;

  if coalesce(p_status, '') not in ('incomplete', 'complete') then
    raise exception 'El estado solicitado no es válido';
  end if;

  if not exists (
    select 1
    from public.agency_agents a
    where a.id = p_agent_id
      and a.organization_id = p_organization_id
      and a.is_active
  ) then
    raise exception 'Subagente o ambulante inexistente o inactivo';
  end if;

  select coalesce(
    (select s.rendition_cutoff_time
     from public.agency_operational_settings s
     where s.organization_id = p_organization_id),
    time '00:00'
  ) into v_cutoff;

  v_local_now := now() at time zone 'America/Argentina/Cordoba';
  v_current_operational_date :=
    case when v_local_now::time < v_cutoff
      then v_local_now::date - 1
      else v_local_now::date
    end;

  if p_operational_date is distinct from v_current_operational_date then
    raise exception 'La jornada operativa cambió. Actualizá la pantalla e intentá de nuevo';
  end if;

  if p_status = 'complete' and not exists (
    select 1
    from public.agency_renditions r
    where r.organization_id = p_organization_id
      and r.agent_id = p_agent_id
      and r.status <> 'void'
      and (
        (r.created_at at time zone 'America/Argentina/Cordoba')::date
        - case when (r.created_at at time zone 'America/Argentina/Cordoba')::time < v_cutoff
          then 1 else 0 end
      ) = p_operational_date
  ) then
    raise exception 'No hay una rendición registrada en la jornada para confirmar';
  end if;

  insert into public.agency_agent_daily_status (
    organization_id, agent_id, operational_date, status, notes, updated_by, updated_at
  )
  values (
    p_organization_id,
    p_agent_id,
    p_operational_date,
    p_status,
    case when p_status = 'incomplete'
      then left(nullif(btrim(coalesce(p_notes, '')), ''), 500)
      else null
    end,
    auth.uid(),
    now()
  )
  on conflict (organization_id, agent_id, operational_date)
  do update set
    status = excluded.status,
    notes = excluded.notes,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;

  insert into public.audit_log (
    organization_id, user_id, action, entity, entity_id, payload
  )
  values (
    p_organization_id,
    auth.uid(),
    case when p_status = 'complete' then 'confirm_agency_rendition_complete' else 'mark_agency_rendition_incomplete' end,
    'agency_agent_daily_status',
    p_agent_id,
    jsonb_build_object(
      'operational_date', p_operational_date,
      'status', p_status,
      'notes', case when p_status = 'incomplete' then left(nullif(btrim(coalesce(p_notes, '')), ''), 500) else null end
    )
  );
end;
$function$;

revoke all on function public.set_agency_agent_daily_status(uuid, uuid, date, text, text) from public, anon;
grant execute on function public.set_agency_agent_daily_status(uuid, uuid, date, text, text) to authenticated;
