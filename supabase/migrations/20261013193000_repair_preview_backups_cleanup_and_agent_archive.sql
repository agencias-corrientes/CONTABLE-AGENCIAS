-- Restore missing Preview support for backups, owner launch cleanup and archival of agents with history.
-- Defines support only: it does not execute the cleanup or delete operational data.
create unique index if not exists agency_renditions_id_organization_id_uq on public.agency_renditions(id, organization_id);
create table if not exists public.agency_rendition_backup_outbox (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 rendition_id uuid not null,
 revision_no integer not null default 1,
 recipient_email text not null,
 subject text not null,
 text_body text not null,
 status text not null default 'pending' check (status in ('pending','sending','sent','failed')),
 attempt_count integer not null default 0,
 last_attempt_at timestamptz,
 sent_at timestamptz,
 last_error text,
 created_at timestamptz not null default now(),
 constraint agency_rendition_backup_outbox_rendition_org_fkey foreign key (rendition_id, organization_id)
 references public.agency_renditions(id, organization_id) on delete cascade
);
alter table public.agency_rendition_backup_outbox add column if not exists revision_no integer not null default 1;
alter table public.agency_rendition_backup_outbox drop constraint if exists agency_rendition_backup_outbox_rendition_id_key;
create unique index if not exists agency_rendition_backup_outbox_rendition_revision_uq on public.agency_rendition_backup_outbox(rendition_id, revision_no);
alter table public.organization_backup_settings add column if not exists include_ticket_photo boolean not null default true;
alter table public.agency_rendition_backup_outbox enable row level security;
revoke all on public.agency_rendition_backup_outbox from anon, authenticated;
grant select on public.agency_rendition_backup_outbox to authenticated;
drop policy if exists agency_rendition_backup_outbox_member_select on public.agency_rendition_backup_outbox;
drop policy if exists agency_rendition_backup_outbox_owner_select on public.agency_rendition_backup_outbox;
create policy agency_rendition_backup_outbox_owner_select on public.agency_rendition_backup_outbox for select to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id=agency_rendition_backup_outbox.organization_id and m.user_id=(select auth.uid()) and m.role='owner'));

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
    to_char(v_rendition.rendition_date, 'DD/MM/YYYY'),
    to_char(v_rendition.created_at at time zone coalesce(v_org.timezone, 'America/Argentina/Cordoba'), 'DD/MM/YYYY HH24:MI:SS'),
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
revoke all on function private.queue_agency_rendition_backup_on_audit() from public, anon;
grant execute on function private.queue_agency_rendition_backup_on_audit() to authenticated;
drop trigger if exists audit_log_agency_rendition_backup on public.audit_log;
create trigger audit_log_agency_rendition_backup after insert on public.audit_log for each row execute function private.queue_agency_rendition_backup_on_audit();

create or replace function private.preview_agency_launch_cleanup(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_counts jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id and m.user_id = auth.uid() and m.role = 'owner'
  ) then
    raise exception 'Solo el titular de la agencia puede revisar o borrar datos de prueba' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'subagentes_ambulantes', (select count(*)::int from public.agency_agents where organization_id = p_organization_id),
    'rendiciones', (select count(*)::int from public.agency_renditions where organization_id = p_organization_id),
    'cobros_rendiciones', (select count(*)::int from public.agency_rendition_payments where organization_id = p_organization_id),
    'importes_por_juego', (select count(*)::int from public.agency_rendition_game_amounts where organization_id = p_organization_id),
    'tickets', (select count(*)::int from public.agency_rendition_tickets where organization_id = p_organization_id),
    'respaldos', (select count(*)::int from public.agency_rendition_backup_outbox where organization_id = p_organization_id),
    'movimientos_caja', (select count(*)::int from public.cash_movements where organization_id = p_organization_id),
    'cierres_diarios', (select count(*)::int from public.agency_daily_closings where organization_id = p_organization_id),
    'comisiones', (select count(*)::int from public.agency_agent_game_commissions where organization_id = p_organization_id),
    'contactos', (select count(*)::int from public.contacts where organization_id = p_organization_id),
    'asientos_contables', (select count(*)::int from public.journal_entries where organization_id = p_organization_id),
    'lineas_contables', (select count(*)::int from public.journal_lines jl join public.journal_entries je on je.id = jl.journal_entry_id where je.organization_id = p_organization_id),
    'facturas_venta', (select count(*)::int from public.sales_invoices where organization_id = p_organization_id),
    'items_facturas_venta', (select count(*)::int from public.sales_invoice_items si join public.sales_invoices inv on inv.id = si.invoice_id where inv.organization_id = p_organization_id),
    'facturas_compra', (select count(*)::int from public.purchase_bills where organization_id = p_organization_id),
    'items_facturas_compra', (select count(*)::int from public.purchase_bill_items pi join public.purchase_bills b on b.id = pi.bill_id where b.organization_id = p_organization_id),
    'pagos_contables', (select count(*)::int from public.payments where organization_id = p_organization_id),
    'empleados_vinculados', (select count(*)::int from public.organization_members where organization_id = p_organization_id and role <> 'owner'),
    'permisos_empleados', (select count(*)::int from public.organization_member_permissions where organization_id = p_organization_id and user_id in (select user_id from public.organization_members where organization_id = p_organization_id and role <> 'owner')),
    'registros_auditoria', (select count(*)::int from public.audit_log where organization_id = p_organization_id)
  ) into v_counts;
  return v_counts;
end;
$function$;
revoke all on function private.preview_agency_launch_cleanup(uuid) from public, anon;
grant execute on function private.preview_agency_launch_cleanup(uuid) to authenticated;

create or replace function private.clear_agency_launch_test_data(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_counts jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id and m.user_id = auth.uid() and m.role = 'owner'
  ) then
    raise exception 'Solo el titular de la agencia puede borrar datos de prueba' using errcode = '42501';
  end if;
  v_counts := private.preview_agency_launch_cleanup(p_organization_id);
  delete from public.agency_rendition_payments where organization_id = p_organization_id;
  delete from public.payments where organization_id = p_organization_id;
  delete from public.cash_movements where organization_id = p_organization_id;
  delete from public.agency_rendition_tickets where organization_id = p_organization_id;
  delete from public.agency_rendition_game_amounts where organization_id = p_organization_id;
  delete from public.agency_rendition_backup_outbox where organization_id = p_organization_id;
  delete from public.agency_daily_closings where organization_id = p_organization_id;
  delete from public.agency_renditions where organization_id = p_organization_id;
  delete from public.agency_agent_game_commissions where organization_id = p_organization_id;
  delete from public.agency_agents where organization_id = p_organization_id;
  delete from public.journal_lines jl where exists (
    select 1 from public.journal_entries je where je.id = jl.journal_entry_id and je.organization_id = p_organization_id
  );
  delete from public.sales_invoice_items si where exists (
    select 1 from public.sales_invoices inv where inv.id = si.invoice_id and inv.organization_id = p_organization_id
  );
  delete from public.purchase_bill_items pi where exists (
    select 1 from public.purchase_bills b where b.id = pi.bill_id and b.organization_id = p_organization_id
  );
  delete from public.sales_invoices where organization_id = p_organization_id;
  delete from public.purchase_bills where organization_id = p_organization_id;
  delete from public.journal_entries where organization_id = p_organization_id;
  delete from public.contacts where organization_id = p_organization_id;
  delete from public.audit_log where organization_id = p_organization_id;
  delete from public.organization_member_permissions
  where organization_id = p_organization_id
    and user_id in (select user_id from public.organization_members where organization_id = p_organization_id and role <> 'owner');
  delete from public.organization_members where organization_id = p_organization_id and role <> 'owner';
  update public.organization_backup_settings
  set recipient_email = null, enabled = true, updated_at = now()
  where organization_id = p_organization_id;
  return v_counts || jsonb_build_object('completed', true);
end;
$function$;
revoke all on function private.clear_agency_launch_test_data(uuid) from public, anon;
grant execute on function private.clear_agency_launch_test_data(uuid) to authenticated;

create or replace function public.preview_agency_launch_cleanup(p_organization_id uuid)
returns jsonb language sql stable security definer set search_path=public,private,pg_temp
as $function$ select private.preview_agency_launch_cleanup(p_organization_id); $function$;
revoke all on function public.preview_agency_launch_cleanup(uuid) from public, anon;
grant execute on function public.preview_agency_launch_cleanup(uuid) to authenticated;
create or replace function public.cleanup_agency_test_data(p_organization_id uuid)
returns jsonb language sql security definer set search_path=public,private,pg_temp
as $function$ select private.clear_agency_launch_test_data(p_organization_id); $function$;
revoke all on function public.cleanup_agency_test_data(uuid) from public, anon;
grant execute on function public.cleanup_agency_test_data(uuid) to authenticated;

create or replace function public.archive_agency_agent(
  p_organization_id uuid,
  p_agent_id uuid,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare v_agent public.agency_agents%rowtype;
begin
  if not private.has_org_permission(p_organization_id, 'can_delete_agents', auth.uid()) then
    raise exception 'No tenés permiso para eliminar o archivar agentes';
  end if;
  select * into v_agent from public.agency_agents
  where id=p_agent_id and organization_id=p_organization_id
  for update;
  if not found then raise exception 'Agente no encontrado'; end if;
  if not exists(select 1 from public.agency_renditions where agent_id=p_agent_id and organization_id=p_organization_id) then
    raise exception 'El agente no tiene historial y debe eliminarse directamente';
  end if;
  update public.agency_agents set is_active=false
  where id=p_agent_id and organization_id=p_organization_id;
  insert into public.audit_log(organization_id,user_id,action,entity,entity_id,payload)
  values(p_organization_id,auth.uid(),'archive','agency_agent',p_agent_id,
    jsonb_build_object('code',v_agent.code,'name',v_agent.full_name,'reason',coalesce(nullif(trim(p_reason),''),'baja solicitada')));
  return p_agent_id;
end;
$function$;
revoke all on function public.archive_agency_agent(uuid, uuid, text) from public, anon;
grant execute on function public.archive_agency_agent(uuid, uuid, text) to authenticated;

drop policy if exists agency_ticket_photo_owner_delete on storage.objects;
create policy agency_ticket_photo_owner_delete on storage.objects for delete to authenticated
using (bucket_id='agency-rendition-tickets' and exists (
 select 1 from public.organization_members m where m.organization_id::text=(storage.foldername(name))[1]
 and m.user_id=(select auth.uid()) and m.role='owner'
));
