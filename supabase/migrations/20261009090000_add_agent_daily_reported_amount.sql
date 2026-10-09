alter table public.agency_agent_daily_status
  add column if not exists reported_amount numeric(14,2);

do $migration$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'agency_agent_daily_status_reported_amount_check'
      and conrelid = 'public.agency_agent_daily_status'::regclass
  ) then
    alter table public.agency_agent_daily_status
      add constraint agency_agent_daily_status_reported_amount_check
      check (reported_amount is null or reported_amount > 0);
  end if;
end;
$migration$;

create or replace function public.set_agency_agent_daily_status_with_amount(
  p_organization_id uuid,
  p_agent_id uuid,
  p_operational_date date,
  p_status text,
  p_notes text default null,
  p_reported_amount numeric default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if auth.uid() is null then
    raise exception 'Se necesita iniciar sesión para confirmar la rendición';
  end if;

  if p_status = 'complete' and (
    p_reported_amount is null
    or round(p_reported_amount, 2) <= 0
    or p_reported_amount > 999999999999.99
  ) then
    raise exception 'Ingresá un monto rendido mayor que cero antes de confirmar';
  end if;

  -- Reutiliza todas las validaciones de permisos, agente y jornada existentes.
  perform public.set_agency_agent_daily_status(
    p_organization_id,
    p_agent_id,
    p_operational_date,
    p_status,
    p_notes
  );

  update public.agency_agent_daily_status
  set reported_amount = case
      when p_status = 'complete' then round(p_reported_amount, 2)
      else null
    end,
    updated_at = now(),
    updated_by = auth.uid()
  where organization_id = p_organization_id
    and agent_id = p_agent_id
    and operational_date = p_operational_date;

  if not found then
    raise exception 'No se pudo guardar el monto rendido';
  end if;

  if p_status = 'complete' then
    insert into public.audit_log (
      organization_id, user_id, action, entity, entity_id, payload
    )
    values (
      p_organization_id,
      auth.uid(),
      'record_agency_agent_reported_amount',
      'agency_agent_daily_status',
      p_agent_id,
      jsonb_build_object(
        'operational_date', p_operational_date,
        'reported_amount', round(p_reported_amount, 2)
      )
    );
  end if;
end;
$function$;

revoke all on function public.set_agency_agent_daily_status_with_amount(uuid, uuid, date, text, text, numeric) from public, anon;
grant execute on function public.set_agency_agent_daily_status_with_amount(uuid, uuid, date, text, text, numeric) to authenticated;
