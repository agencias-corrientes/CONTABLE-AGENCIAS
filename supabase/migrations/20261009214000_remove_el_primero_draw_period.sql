-- Eliminar un período no oficial de los estados y de la validación en servidor.
-- No se reasigna ni se borra historial; antes de aplicar se verificó que no hay filas con ese período.
alter table public.agency_agent_draw_status
  drop constraint if exists agency_agent_draw_status_period_check;
alter table public.agency_agent_draw_status
  add constraint agency_agent_draw_status_period_check check (draw_period in (
    'La Previa','Matutina','Vespertina','Nocturna',
    'Quiniela Poceada Correntina','Loto Plus','Loto 5 Plus','Quini 6',
    'Brinco','Al Toque (acumulado diario)'
  ));

CREATE OR REPLACE FUNCTION public.create_agency_rendition_with_capture_and_draw_status(p_organization_id uuid, p_agent_id uuid, p_rendition_date date, p_amount_due numeric, p_operational_date date, p_draw_period text, p_draw_status text, p_game_breakdown jsonb DEFAULT '[]'::jsonb, p_ticket_numbers jsonb DEFAULT '[]'::jsonb, p_ticket_qr_payload text DEFAULT NULL::text, p_draw_number text DEFAULT NULL::text, p_capture_method text DEFAULT 'manual'::text, p_reference text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_status_notes text DEFAULT NULL::text, p_reported_amount numeric DEFAULT NULL::numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_rendition_id uuid;
  v_cutoff time;
  v_local_now timestamp without time zone;
  v_current_operational_date date;
  v_allowed_game_name text;
  v_day_of_week integer;
begin
  if auth.uid() is null then
    raise exception 'Se necesita iniciar sesión para registrar la rendición';
  end if;

  if not private.has_org_permission(p_organization_id,'can_create_renditions',auth.uid()) then
    raise exception 'No tenés permiso para registrar rendiciones' using errcode='42501';
  end if;

  if p_draw_period not in (
    'La Previa','Matutina','Vespertina','Nocturna',
    'Quiniela Poceada Correntina','Loto Plus','Loto 5 Plus','Quini 6',
    'Brinco','Al Toque (acumulado diario)'
  ) then
    raise exception 'El período del sorteo no está dentro del cronograma habilitado';
  end if;

  v_day_of_week := extract(dow from p_operational_date)::integer;
  if p_draw_period in ('La Previa','Matutina','Vespertina','Nocturna')
     and v_day_of_week not between 1 and 6 then
    raise exception 'Ese día no está programado para la quiniela tradicional';
  elsif p_draw_period='Quiniela Poceada Correntina' and v_day_of_week not in (2,4,6) then
    raise exception 'Ese día no está programado para la Quiniela Poceada Correntina';
  elsif p_draw_period='Loto Plus' and v_day_of_week not in (3,6) then
    raise exception 'Ese día no está programado para Loto Plus';
  elsif p_draw_period='Loto 5 Plus' and v_day_of_week <> 6 then
    raise exception 'Ese día no está programado para Loto 5 Plus';
  elsif p_draw_period='Quini 6' and v_day_of_week not in (0,3) then
    raise exception 'Ese día no está programado para Quini 6';
  elsif p_draw_period='Brinco' and v_day_of_week <> 0 then
    raise exception 'Ese día no está programado para Brinco';
  end if;

  if coalesce(p_draw_status,'') not in ('complete','incomplete') then
    raise exception 'El estado del sorteo no es válido';
  end if;
  if p_rendition_date is distinct from p_operational_date then
    raise exception 'La fecha del sorteo debe coincidir con la jornada operativa actual';
  end if;

  select coalesce(
    (select s.rendition_cutoff_time from public.agency_operational_settings s where s.organization_id=p_organization_id),
    time '00:00'
  ) into v_cutoff;

  v_local_now := now() at time zone 'America/Argentina/Cordoba';
  v_current_operational_date :=
    case when v_local_now::time < v_cutoff then v_local_now::date - 1 else v_local_now::date end;
  if p_operational_date is distinct from v_current_operational_date then
    raise exception 'La jornada operativa cambió. Actualizá la pantalla e intentá de nuevo';
  end if;

  if p_draw_status='incomplete' and (
    p_reported_amount is null or round(p_reported_amount,2)<=0
    or p_reported_amount>coalesce(p_amount_due,0) or p_reported_amount>999999999999.99
  ) then
    raise exception 'Ingresá un monto rendido válido para guardar el sorteo como incompleto';
  end if;

  if exists(
    select 1
    from public.agency_renditions r
    where r.organization_id=p_organization_id
      and r.agent_id=p_agent_id
      and r.rendition_date=p_rendition_date
      and lower(btrim(r.game_period))=lower(btrim(p_draw_period))
      and r.status<>'void'
  ) then
    raise exception 'Ya existe una rendición para este sorteo y operador';
  end if;

  v_allowed_game_name := case p_draw_period
    when 'La Previa' then 'Quiniela Correntina'
    when 'Matutina' then 'Quiniela Correntina'
    when 'Vespertina' then 'Quiniela Correntina'
    when 'Nocturna' then 'Quiniela Correntina'
    when 'Quiniela Poceada Correntina' then 'Quiniela Poceada Correntina'
    when 'Loto Plus' then 'Loto Plus'
    when 'Loto 5 Plus' then 'Loto 5 Plus'
    when 'Quini 6' then 'Quini 6'
    when 'Brinco' then 'Brinco'
    when 'Al Toque (acumulado diario)' then 'Quiniela Al Toque'
  end;

  if exists(
    select 1
    from jsonb_array_elements(coalesce(p_game_breakdown,'[]'::jsonb)) item
    left join public.agency_game_types game
      on game.id=(item->>'game_type_id')::uuid
     and game.organization_id=p_organization_id
     and game.enabled
    where coalesce((item->>'amount')::numeric,0)>0
      and (game.id is null or game.name<>v_allowed_game_name)
  ) then
    raise exception 'Hay juegos que no corresponden al período seleccionado';
  end if;

  if p_draw_status='complete' then
    p_reported_amount:=null;
    p_status_notes:=null;
  end if;

  v_rendition_id := public.create_agency_rendition_with_capture(
    p_organization_id,p_agent_id,p_rendition_date,p_amount_due,
    coalesce(p_game_breakdown,'[]'::jsonb),coalesce(p_ticket_numbers,'[]'::jsonb),
    p_ticket_qr_payload,p_draw_period,p_draw_number,p_capture_method,p_reference,p_notes
  );

  insert into public.agency_agent_draw_status(
    organization_id,agent_id,operational_date,draw_period,rendition_id,status,notes,reported_amount,updated_by,updated_at
  )
  values(
    p_organization_id,p_agent_id,p_operational_date,p_draw_period,v_rendition_id,p_draw_status,
    case when p_draw_status='incomplete' then left(nullif(btrim(coalesce(p_status_notes,'')),''),500) else null end,
    case when p_draw_status='incomplete' then round(p_reported_amount,2) else null end,
    auth.uid(),now()
  )
  on conflict(organization_id,agent_id,operational_date,draw_period)
  do update set rendition_id=excluded.rendition_id,status=excluded.status,notes=excluded.notes,
    reported_amount=excluded.reported_amount,updated_by=excluded.updated_by,updated_at=excluded.updated_at;

  insert into public.audit_log(organization_id,user_id,action,entity,entity_id,payload)
  values(
    p_organization_id,auth.uid(),
    case when p_draw_status='complete' then 'confirm_agency_draw_rendition_complete' else 'mark_agency_draw_rendition_incomplete' end,
    'agency_agent_draw_status',v_rendition_id,
    jsonb_build_object('agent_id',p_agent_id,'operational_date',p_operational_date,'draw_period',p_draw_period,
      'status',p_draw_status,'amount_due',p_amount_due,'reported_amount',p_reported_amount)
  );
  return v_rendition_id;
end;
$function$

;

revoke all on function public.create_agency_rendition_with_capture_and_draw_status(uuid,uuid,date,numeric,date,text,text,jsonb,jsonb,text,text,text,text,text,text,numeric) from public,anon;
grant execute on function public.create_agency_rendition_with_capture_and_draw_status(uuid,uuid,date,numeric,date,text,text,jsonb,jsonb,text,text,text,text,text,text,numeric) to authenticated;

CREATE OR REPLACE FUNCTION public.set_agency_agent_draw_status(p_organization_id uuid, p_agent_id uuid, p_operational_date date, p_draw_period text, p_status text, p_notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_rendition_id uuid;
  v_cutoff time;
  v_local_now timestamp without time zone;
  v_current_operational_date date;
begin
  if auth.uid() is null then
    raise exception 'Se necesita iniciar sesión para confirmar el sorteo';
  end if;
  if not private.has_org_permission(p_organization_id, 'can_create_renditions', auth.uid()) then
    raise exception 'No tenés permiso para cambiar el estado de la rendición' using errcode = '42501';
  end if;
  if coalesce(p_status, '') not in ('complete','incomplete') then
    raise exception 'El estado del sorteo no es válido';
  end if;
  if p_draw_period not in (
    'La Previa',  'Matutina', 'Vespertina', 'Nocturna',
    'Quiniela Poceada Correntina', 'Loto Plus', 'Loto 5 Plus', 'Quini 6',
    'Brinco', 'Al Toque (acumulado diario)'
  ) then
    raise exception 'El período del sorteo no está dentro del cronograma habilitado';
  end if;

  select coalesce(
    (select s.rendition_cutoff_time from public.agency_operational_settings s
      where s.organization_id = p_organization_id),
    time '00:00'
  ) into v_cutoff;
  v_local_now := now() at time zone 'America/Argentina/Cordoba';
  v_current_operational_date :=
    case when v_local_now::time < v_cutoff then v_local_now::date - 1 else v_local_now::date end;
  if p_operational_date is distinct from v_current_operational_date then
    raise exception 'La jornada operativa cambió. Actualizá la pantalla e intentá de nuevo';
  end if;

  select r.id into v_rendition_id
  from public.agency_renditions r
  where r.organization_id = p_organization_id
    and r.agent_id = p_agent_id
    and r.rendition_date = p_operational_date
    and lower(btrim(r.game_period)) = lower(btrim(p_draw_period))
    and r.status <> 'void'
  order by r.created_at desc
  limit 1;
  if v_rendition_id is null then
    raise exception 'No hay una rendición activa para este sorteo y operador';
  end if;

  insert into public.agency_agent_draw_status (
    organization_id, agent_id, operational_date, draw_period, rendition_id,
    status, notes, reported_amount, updated_by, updated_at
  ) values (
    p_organization_id, p_agent_id, p_operational_date, p_draw_period, v_rendition_id,
    p_status, case when p_status = 'incomplete' then left(nullif(btrim(coalesce(p_notes, '')), ''), 500) else null end,
    null, auth.uid(), now()
  )
  on conflict (organization_id, agent_id, operational_date, draw_period)
  do update set rendition_id = excluded.rendition_id,
                status = excluded.status,
                notes = excluded.notes,
                reported_amount = null,
                updated_by = excluded.updated_by,
                updated_at = excluded.updated_at;

  insert into public.audit_log (organization_id, user_id, action, entity, entity_id, payload)
  values (p_organization_id, auth.uid(),
    case when p_status = 'complete' then 'confirm_agency_draw_rendition_complete' else 'mark_agency_draw_rendition_incomplete' end,
    'agency_agent_draw_status', v_rendition_id,
    jsonb_build_object('agent_id', p_agent_id, 'operational_date', p_operational_date, 'draw_period', p_draw_period, 'status', p_status));
end;
$function$

;

revoke all on function public.set_agency_agent_draw_status(uuid,uuid,date,text,text,text) from public,anon;
grant execute on function public.set_agency_agent_draw_status(uuid,uuid,date,text,text,text) to authenticated;
