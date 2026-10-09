-- Keep a versioned plain-text backup each time a rendition is created or corrected.
alter table public.agency_rendition_backup_outbox
  add column if not exists revision_no integer not null default 1;
alter table public.agency_rendition_backup_outbox
  drop constraint if exists agency_rendition_backup_outbox_rendition_id_key;
create unique index if not exists agency_rendition_backup_outbox_rendition_revision_uq
  on public.agency_rendition_backup_outbox(rendition_id, revision_no);

create or replace function private.queue_agency_rendition_backup_on_audit()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_rendition public.agency_renditions%rowtype;
  v_agent public.agency_agents%rowtype;
  v_org public.organizations%rowtype;
  v_email text;
  v_game_lines text;
  v_ticket_lines text;
  v_subject text;
  v_body text;
  v_revision integer;
begin
  if new.action not in ('create','update') or new.entity <> 'agency_rendition' or new.entity_id is null then return new; end if;
  select * into v_rendition from public.agency_renditions
    where id = new.entity_id and organization_id = new.organization_id;
  if not found then return new; end if;
  select * into v_agent from public.agency_agents
    where id = v_rendition.agent_id and organization_id = v_rendition.organization_id;
  select * into v_org from public.organizations where id = v_rendition.organization_id;
  select nullif(trim(recipient_email), '') into v_email from public.organization_backup_settings
    where organization_id = v_rendition.organization_id and enabled = true;
  if v_email is null then return new; end if;

  select coalesce(max(revision_no), 0) + 1 into v_revision
    from public.agency_rendition_backup_outbox where rendition_id = v_rendition.id;

  select string_agg(format('- %s: $ %s', game.name, to_char(amount.amount, 'FM999G999G999G990D00')), E'\n' order by game.name)
    into v_game_lines
  from public.agency_rendition_game_amounts amount
  join public.agency_game_types game on game.id = amount.game_type_id
  where amount.rendition_id = v_rendition.id and amount.organization_id = v_rendition.organization_id;

  select string_agg(
    '- ' || ticket.ticket_number ||
    case when nullif(ticket.ticket_qr_payload, '') is null then '' else E'\n  QR: ' || ticket.ticket_qr_payload end,
    E'\n' order by ticket.ticket_number
  ) into v_ticket_lines
  from public.agency_rendition_tickets ticket
  where ticket.rendition_id = v_rendition.id and ticket.organization_id = v_rendition.organization_id;

  v_subject := format('Respaldo rendición %s - %s - %s - revisión %s',
    coalesce(v_agent.code, 'sin código'), v_rendition.rendition_date,
    coalesce(v_rendition.game_period, 'período'), v_revision);
  v_body := format(
    'RESPALDO DE RENDICIÓN - AGENCIAS CORRIENTES\nRevisión del respaldo: %s\n' ||
    'Agencia: %s\nTipo: %s\nCódigo del operador: %s\nNombre: %s\n' ||
    'Fecha del juego: %s\nRegistrada: %s\nPeríodo/turno: %s\nNúmero de sorteo: %s\n' ||
    'Método de carga: %s\nReferencia: %s\n\nDETALLE POR JUEGO\n%s\n\nTOTAL RENDIDO: $ %s\n' ||
    'TICKETS / CUPONES\n%s\n\nOBSERVACIONES\n%s\n\nID DE RENDICIÓN: %s\n',
    v_revision, coalesce(v_org.name, 'Agencia'),
    case when v_agent.kind::text = 'ambulant' then 'Ambulante' else 'Subagente' end,
    coalesce(v_agent.code, '—'), coalesce(v_agent.full_name, '—'),
    v_rendition.rendition_date::text,
    to_char(v_rendition.created_at at time zone coalesce(v_org.timezone, 'America/Argentina/Cordoba'), 'YYYY-MM-DD HH24:MI:SS'),
    coalesce(v_rendition.game_period, '—'), coalesce(v_rendition.draw_number, '—'),
    coalesce(v_rendition.capture_method, 'manual'), coalesce(v_rendition.reference, '—'),
    coalesce(v_game_lines, '(sin desglose por juego)'),
    to_char(v_rendition.amount_due, 'FM999G999G999G990D00'),
    coalesce(v_ticket_lines, '(sin tickets cargados)'),
    coalesce(v_rendition.notes, '—'), v_rendition.id::text
  );

  insert into public.agency_rendition_backup_outbox(
    organization_id, rendition_id, revision_no, recipient_email, subject, text_body
  )
  values (v_rendition.organization_id, v_rendition.id, v_revision, v_email, v_subject, v_body)
  on conflict (rendition_id, revision_no) do nothing;
  return new;
exception when others then
  raise warning 'No se pudo encolar el backup de la rendición %: %', new.entity_id, sqlerrm;
  return new;
end;
$function$;

create or replace function public.update_agency_rendition_with_capture(
  p_organization_id uuid,
  p_rendition_id uuid,
  p_rendition_date date,
  p_amount_due numeric,
  p_game_breakdown jsonb,
  p_ticket_numbers jsonb,
  p_ticket_qr_payload text default null,
  p_game_period text default null,
  p_draw_number text default null,
  p_capture_method text default 'manual',
  p_reference text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_rendition public.agency_renditions%rowtype;
  v_total numeric;
  v_item record;
  v_ticket text;
begin
  if not private.has_org_permission(p_organization_id, 'can_edit_renditions', auth.uid()) then
    raise exception 'No tenés permiso para corregir rendiciones';
  end if;
  select * into v_rendition from public.agency_renditions
  where id=p_rendition_id and organization_id=p_organization_id and status='open'
  for update;
  if not found then raise exception 'Solo se pueden corregir rendiciones abiertas y vigentes'; end if;
  if exists(select 1 from public.agency_rendition_payments where rendition_id=p_rendition_id and organization_id=p_organization_id) then
    raise exception 'No se puede modificar una rendición con cobros registrados. Primero debe revertirse el cobro con un movimiento compensatorio';
  end if;
  if jsonb_typeof(p_game_breakdown) <> 'array' or jsonb_typeof(p_ticket_numbers) <> 'array' then
    raise exception 'El detalle de juegos o tickets no es válido';
  end if;
  if coalesce(p_capture_method,'manual') not in ('manual','photo','qr') then raise exception 'Método de lectura inválido'; end if;

  select coalesce(sum((item->>'amount')::numeric),0) into v_total
  from jsonb_array_elements(p_game_breakdown) item
  where coalesce((item->>'amount')::numeric,0)>0;
  if v_total<=0 then raise exception 'Ingresá al menos un importe por juego'; end if;
  if abs(v_total-coalesce(p_amount_due,v_total))>0.005 then raise exception 'La suma de los juegos no coincide con el total de la rendición'; end if;

  for v_item in
    select (item->>'game_type_id')::uuid as game_type_id, (item->>'amount')::numeric as amount
    from jsonb_array_elements(p_game_breakdown) item
    where coalesce((item->>'amount')::numeric,0)>0
  loop
    if not exists(select 1 from public.agency_game_types where id=v_item.game_type_id and organization_id=p_organization_id and enabled) then
      raise exception 'Tipo de juego inválido o inactivo';
    end if;
  end loop;

  update public.agency_renditions
  set rendition_date=p_rendition_date, period_start=p_rendition_date, period_end=p_rendition_date,
      amount_due=v_total, reference=nullif(trim(p_reference),''), notes=nullif(trim(p_notes),''),
      game_period=nullif(trim(p_game_period),''), draw_number=nullif(trim(p_draw_number),''),
      capture_method=coalesce(p_capture_method,'manual'), updated_at=now()
  where id=p_rendition_id and organization_id=p_organization_id;

  delete from public.agency_rendition_game_amounts where rendition_id=p_rendition_id and organization_id=p_organization_id;
  delete from public.agency_rendition_tickets where rendition_id=p_rendition_id and organization_id=p_organization_id;

  for v_item in
    select (item->>'game_type_id')::uuid as game_type_id, (item->>'amount')::numeric as amount
    from jsonb_array_elements(p_game_breakdown) item
    where coalesce((item->>'amount')::numeric,0)>0
  loop
    insert into public.agency_rendition_game_amounts(organization_id,rendition_id,game_type_id,amount,created_by)
    values(p_organization_id,p_rendition_id,v_item.game_type_id,v_item.amount,auth.uid());
  end loop;

  for v_ticket in
    select distinct trim(value) from jsonb_array_elements_text(p_ticket_numbers) value where length(trim(value))>0
  loop
    insert into public.agency_rendition_tickets(organization_id,rendition_id,ticket_number,created_by)
    values(p_organization_id,p_rendition_id,v_ticket,auth.uid())
    on conflict (rendition_id,ticket_number) do nothing;
  end loop;

  if nullif(trim(p_ticket_qr_payload),'') is not null then
    insert into public.agency_rendition_tickets(organization_id,rendition_id,ticket_number,ticket_qr_payload,created_by)
    values(p_organization_id,p_rendition_id,left(trim(p_ticket_qr_payload),160),trim(p_ticket_qr_payload),auth.uid())
    on conflict (rendition_id,ticket_number) do update set ticket_qr_payload=excluded.ticket_qr_payload;
  end if;

  insert into public.audit_log(organization_id,user_id,action,entity,entity_id,payload)
  values(p_organization_id,auth.uid(),'update','agency_rendition',p_rendition_id,
    jsonb_build_object('old_amount_due',v_rendition.amount_due,'new_amount_due',v_total,
      'old_rendition_date',v_rendition.rendition_date,'new_rendition_date',p_rendition_date,
      'game_period',p_game_period,'draw_number',p_draw_number,'capture_method',p_capture_method));
  return p_rendition_id;
end;
$function$;

create or replace function public.void_agency_rendition(
  p_organization_id uuid,
  p_rendition_id uuid,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare v_rendition public.agency_renditions%rowtype;
begin
  if not private.has_org_permission(p_organization_id, 'can_delete_renditions', auth.uid()) then
    raise exception 'No tenés permiso para anular rendiciones';
  end if;
  select * into v_rendition from public.agency_renditions
  where id=p_rendition_id and organization_id=p_organization_id and status='open'
  for update;
  if not found then raise exception 'Solo se pueden anular rendiciones abiertas y vigentes'; end if;
  if exists(select 1 from public.agency_rendition_payments where rendition_id=p_rendition_id and organization_id=p_organization_id) then
    raise exception 'No se puede anular una rendición con cobros registrados';
  end if;

  update public.agency_renditions
  set status='void',
      notes=concat_ws(E'\n', nullif(notes,''), 'ANULADA: ' || coalesce(nullif(trim(p_reason),''),'sin motivo informado')),
      updated_at=now()
  where id=p_rendition_id and organization_id=p_organization_id;

  insert into public.audit_log(organization_id,user_id,action,entity,entity_id,payload)
  values(p_organization_id,auth.uid(),'void','agency_rendition',p_rendition_id,
    jsonb_build_object('reason',coalesce(nullif(trim(p_reason),''),'sin motivo informado'),'amount_due',v_rendition.amount_due));
  return p_rendition_id;
end;
$function$;

revoke all on function public.update_agency_rendition_with_capture(uuid, uuid, date, numeric, jsonb, jsonb, text, text, text, text, text, text) from public, anon;
grant execute on function public.update_agency_rendition_with_capture(uuid, uuid, date, numeric, jsonb, jsonb, text, text, text, text, text, text) to authenticated;
revoke all on function public.void_agency_rendition(uuid, uuid, text) from public, anon;
grant execute on function public.void_agency_rendition(uuid, uuid, text) to authenticated;
