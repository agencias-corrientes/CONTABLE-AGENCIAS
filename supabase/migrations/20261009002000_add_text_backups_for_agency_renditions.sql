-- Durable plain-text backup for every rendition, sent to the address chosen by the agency owner.
create table if not exists public.organization_backup_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  recipient_email text,
  enabled boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.organization_backup_settings enable row level security;
revoke all on public.organization_backup_settings from anon, authenticated;
grant select, insert, update, delete on public.organization_backup_settings to authenticated;

drop policy if exists organization_backup_settings_owner_select on public.organization_backup_settings;
create policy organization_backup_settings_owner_select on public.organization_backup_settings
for select to authenticated
using (exists (
  select 1 from public.organization_members member
  where member.organization_id = organization_backup_settings.organization_id
    and member.user_id = (select auth.uid()) and member.role = 'owner'
));
drop policy if exists organization_backup_settings_owner_insert on public.organization_backup_settings;
create policy organization_backup_settings_owner_insert on public.organization_backup_settings
for insert to authenticated
with check (exists (
  select 1 from public.organization_members member
  where member.organization_id = organization_backup_settings.organization_id
    and member.user_id = (select auth.uid()) and member.role = 'owner'
));
drop policy if exists organization_backup_settings_owner_update on public.organization_backup_settings;
create policy organization_backup_settings_owner_update on public.organization_backup_settings
for update to authenticated
using (exists (
  select 1 from public.organization_members member
  where member.organization_id = organization_backup_settings.organization_id
    and member.user_id = (select auth.uid()) and member.role = 'owner'
))
with check (exists (
  select 1 from public.organization_members member
  where member.organization_id = organization_backup_settings.organization_id
    and member.user_id = (select auth.uid()) and member.role = 'owner'
));
drop policy if exists organization_backup_settings_owner_delete on public.organization_backup_settings;
create policy organization_backup_settings_owner_delete on public.organization_backup_settings
for delete to authenticated
using (exists (
  select 1 from public.organization_members member
  where member.organization_id = organization_backup_settings.organization_id
    and member.user_id = (select auth.uid()) and member.role = 'owner'
));

create table if not exists public.agency_rendition_backup_outbox (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  rendition_id uuid not null,
  recipient_email text not null,
  subject text not null,
  text_body text not null,
  status text not null default 'pending' check (status in ('pending','sending','sent','failed')),
  attempt_count integer not null default 0,
  last_attempt_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (rendition_id),
  constraint agency_rendition_backup_outbox_rendition_org_fkey
    foreign key (rendition_id, organization_id)
    references public.agency_renditions(id, organization_id) on delete cascade
);

alter table public.agency_rendition_backup_outbox enable row level security;
revoke all on public.agency_rendition_backup_outbox from anon, authenticated;
grant select on public.agency_rendition_backup_outbox to authenticated;
drop policy if exists agency_rendition_backup_outbox_member_select on public.agency_rendition_backup_outbox;
create policy agency_rendition_backup_outbox_member_select on public.agency_rendition_backup_outbox
for select to authenticated
using (private.has_org_permission(organization_id, 'can_manage_backups', (select auth.uid())));

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
begin
  if new.action <> 'create' or new.entity <> 'agency_rendition' or new.entity_id is null then return new; end if;
  select * into v_rendition from public.agency_renditions
  where id = new.entity_id and organization_id = new.organization_id;
  if not found then return new; end if;
  select * into v_agent from public.agency_agents
  where id = v_rendition.agent_id and organization_id = v_rendition.organization_id;
  select * into v_org from public.organizations where id = v_rendition.organization_id;
  select nullif(trim(recipient_email), '') into v_email from public.organization_backup_settings
  where organization_id = v_rendition.organization_id and enabled = true;
  if v_email is null then return new; end if;

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

  v_subject := format('Respaldo rendición %s - %s - %s', coalesce(v_agent.code, 'sin código'), v_rendition.rendition_date, coalesce(v_rendition.game_period, 'período'));
  v_body := format(
    'RESPALDO DE RENDICIÓN - AGENCIAS CORRIENTES\n' ||
    'Agencia: %s\nTipo: %s\nCódigo del operador: %s\nNombre: %s\n' ||
    'Fecha del juego: %s\nRegistrada: %s\nPeríodo/turno: %s\nNúmero de sorteo: %s\n' ||
    'Método de carga: %s\nReferencia: %s\n\nDETALLE POR JUEGO\n%s\n\nTOTAL RENDIDO: $ %s\n' ||
    'TICKETS / CUPONES\n%s\n\nOBSERVACIONES\n%s\n\nID DE RENDICIÓN: %s\n',
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

  insert into public.agency_rendition_backup_outbox(organization_id,rendition_id,recipient_email,subject,text_body)
  values(v_rendition.organization_id,v_rendition.id,v_email,v_subject,v_body)
  on conflict (rendition_id) do nothing;
  return new;
exception when others then
  raise warning 'No se pudo encolar el backup de la rendición %: %', new.entity_id, sqlerrm;
  return new;
end;
$function$;

drop trigger if exists audit_log_agency_rendition_backup on public.audit_log;
create trigger audit_log_agency_rendition_backup
after insert on public.audit_log
for each row execute function private.queue_agency_rendition_backup_on_audit();
