-- A voided rendition is also a meaningful revision and should leave a text snapshot.
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
  if new.action not in ('create','update','void') or new.entity <> 'agency_rendition' or new.entity_id is null then return new; end if;
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
    'RESPALDO DE RENDICIÓN - AGENCIAS CORRIENTES\nRevisión del respaldo: %s\nEstado: %s\n' ||
    'Agencia: %s\nTipo: %s\nCódigo del operador: %s\nNombre: %s\n' ||
    'Fecha del juego: %s\nRegistrada: %s\nPeríodo/turno: %s\nNúmero de sorteo: %s\n' ||
    'Método de carga: %s\nReferencia: %s\n\nDETALLE POR JUEGO\n%s\n\nTOTAL RENDIDO: $ %s\n' ||
    'TICKETS / CUPONES\n%s\n\nOBSERVACIONES / MOTIVO\n%s\n\nID DE RENDICIÓN: %s\n',
    v_revision,
    case when v_rendition.status::text = 'void' then 'ANULADA' else upper(v_rendition.status::text) end,
    coalesce(v_org.name, 'Agencia'),
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
