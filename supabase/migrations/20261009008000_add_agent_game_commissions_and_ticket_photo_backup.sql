-- Commission defaults per agent/game and immutable commission snapshots per rendition.
create table if not exists public.agency_agent_game_commissions (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.agency_agents(id) on delete cascade,
  game_type_id uuid not null references public.agency_game_types(id) on delete cascade,
  commission_percent numeric(5,2) not null default 0 check (commission_percent between 0 and 100),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, agent_id, game_type_id)
);
create index if not exists agency_agent_game_commissions_agent_idx on public.agency_agent_game_commissions(organization_id,agent_id);

alter table public.agency_agent_game_commissions enable row level security;
revoke all on public.agency_agent_game_commissions from anon;
grant select,insert,update,delete on public.agency_agent_game_commissions to authenticated;
drop policy if exists agent_game_commissions_member_select on public.agency_agent_game_commissions;
create policy agent_game_commissions_member_select on public.agency_agent_game_commissions for select to authenticated
using (private.is_org_member(organization_id,(select auth.uid())));
drop policy if exists agent_game_commissions_owner_insert on public.agency_agent_game_commissions;
create policy agent_game_commissions_owner_insert on public.agency_agent_game_commissions for insert to authenticated
with check (exists(select 1 from public.organization_members m where m.organization_id=agency_agent_game_commissions.organization_id and m.user_id=(select auth.uid()) and m.role='owner'));
drop policy if exists agent_game_commissions_owner_update on public.agency_agent_game_commissions;
create policy agent_game_commissions_owner_update on public.agency_agent_game_commissions for update to authenticated
using (exists(select 1 from public.organization_members m where m.organization_id=agency_agent_game_commissions.organization_id and m.user_id=(select auth.uid()) and m.role='owner'))
with check (exists(select 1 from public.organization_members m where m.organization_id=agency_agent_game_commissions.organization_id and m.user_id=(select auth.uid()) and m.role='owner'));
drop policy if exists agent_game_commissions_owner_delete on public.agency_agent_game_commissions;
create policy agent_game_commissions_owner_delete on public.agency_agent_game_commissions for delete to authenticated
using (exists(select 1 from public.organization_members m where m.organization_id=agency_agent_game_commissions.organization_id and m.user_id=(select auth.uid()) and m.role='owner'));

alter table public.agency_rendition_game_amounts add column if not exists commission_percent numeric(5,2) not null default 0 check (commission_percent between 0 and 100);
alter table public.agency_rendition_game_amounts add column if not exists commission_amount numeric(12,2) not null default 0 check (commission_amount >= 0);

create or replace function private.snapshot_agency_agent_game_commission()
returns trigger language plpgsql security definer set search_path=public,private,pg_temp as $function$
declare v_agent_id uuid; v_percent numeric(5,2);
begin
 select r.agent_id into v_agent_id from public.agency_renditions r where r.id=new.rendition_id and r.organization_id=new.organization_id;
 if v_agent_id is null then raise exception 'No se encontró el agente de la rendición'; end if;
 select coalesce(c.commission_percent,0) into v_percent from public.agency_agent_game_commissions c
 where c.organization_id=new.organization_id and c.agent_id=v_agent_id and c.game_type_id=new.game_type_id;
 new.commission_percent:=coalesce(v_percent,0);
 new.commission_amount:=round((new.amount*new.commission_percent)/100.0,2);
 return new;
end;
$function$;
revoke all on function private.snapshot_agency_agent_game_commission() from public,anon,authenticated;
drop trigger if exists agency_rendition_game_commission_snapshot on public.agency_rendition_game_amounts;
create trigger agency_rendition_game_commission_snapshot before insert on public.agency_rendition_game_amounts for each row execute function private.snapshot_agency_agent_game_commission();

alter table public.organization_backup_settings add column if not exists include_ticket_photo boolean not null default true;
alter table public.agency_rendition_backup_outbox add column if not exists ticket_photo_path text;

create or replace function public.attach_agency_rendition_backup_photo(p_organization_id uuid,p_rendition_id uuid,p_photo_path text)
returns uuid language plpgsql security definer set search_path=public,private,pg_temp as $function$
declare v_outbox_id uuid;
begin
 if not exists(select 1 from public.organization_members m where m.organization_id=p_organization_id and m.user_id=auth.uid()
   and (m.role='owner' or private.has_org_permission(p_organization_id,'can_create_renditions',auth.uid()) or private.has_org_permission(p_organization_id,'can_edit_renditions',auth.uid()))) then
   raise exception 'No tenés permiso para adjuntar la foto';
 end if;
 if p_photo_path not like p_organization_id::text||'/'||p_rendition_id::text||'/%' then raise exception 'La ubicación de la foto no corresponde'; end if;
 select id into v_outbox_id from public.agency_rendition_backup_outbox
 where organization_id=p_organization_id and rendition_id=p_rendition_id order by revision_no desc limit 1 for update;
 if v_outbox_id is null then raise exception 'No existe respaldo para esta rendición'; end if;
 update public.agency_rendition_backup_outbox set ticket_photo_path=p_photo_path,
   text_body=text_body||E'\nFOTO DEL TICKET: se adjunta al correo del titular si está disponible.\n'
 where id=v_outbox_id;
 return v_outbox_id;
end;
$function$;
revoke all on function public.attach_agency_rendition_backup_photo(uuid,uuid,text) from public,anon;
grant execute on function public.attach_agency_rendition_backup_photo(uuid,uuid,text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('agency-rendition-tickets','agency-rendition-tickets',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=5242880,allowed_mime_types=array['image/jpeg','image/png','image/webp'];
drop policy if exists agency_ticket_photo_insert on storage.objects;
create policy agency_ticket_photo_insert on storage.objects for insert to authenticated
with check (bucket_id='agency-rendition-tickets' and exists(
 select 1 from public.agency_renditions r join public.organization_members m on m.organization_id=r.organization_id and m.user_id=(select auth.uid())
 where r.id::text=(storage.foldername(name))[2] and r.organization_id::text=(storage.foldername(name))[1]
 and (m.role='owner' or private.has_org_permission(r.organization_id,'can_create_renditions',(select auth.uid())) or private.has_org_permission(r.organization_id,'can_edit_renditions',(select auth.uid())))
));
drop policy if exists agency_ticket_photo_owner_select on storage.objects;
create policy agency_ticket_photo_owner_select on storage.objects for select to authenticated using(
 bucket_id='agency-rendition-tickets' and exists(select 1 from public.organization_members m where m.organization_id::text=(storage.foldername(name))[1] and m.user_id=(select auth.uid()) and m.role='owner')
);

-- Prepare a new plain-text backup snapshot on creation, correction, or annulment.
create or replace function private.queue_agency_rendition_backup_on_audit()
returns trigger language plpgsql security definer set search_path=public,private,pg_temp as $function$
declare
 v_rendition public.agency_renditions%rowtype; v_agent public.agency_agents%rowtype; v_org public.organizations%rowtype;
 v_email text; v_owner_email text; v_game_lines text; v_ticket_lines text; v_subject text; v_body text; v_revision integer;
begin
 if new.action not in ('create','update','void') or new.entity<>'agency_rendition' or new.entity_id is null then return new; end if;
 select * into v_rendition from public.agency_renditions where id=new.entity_id and organization_id=new.organization_id;
 if not found then return new; end if;
 select * into v_agent from public.agency_agents where id=v_rendition.agent_id and organization_id=v_rendition.organization_id;
 select * into v_org from public.organizations where id=v_rendition.organization_id;
 select nullif(trim(recipient_email),'') into v_email from public.organization_backup_settings where organization_id=v_rendition.organization_id and enabled=true;
 select u.email into v_owner_email from public.organization_members m join auth.users u on u.id=m.user_id
 where m.organization_id=v_rendition.organization_id and m.role='owner' order by m.created_at limit 1;
 v_email:=coalesce(v_email,v_owner_email);
 if nullif(trim(v_email),'') is null then raise warning 'No hay correo del titular para el backup %',new.entity_id; return new; end if;
 select coalesce(max(revision_no),0)+1 into v_revision from public.agency_rendition_backup_outbox where rendition_id=v_rendition.id;
 select string_agg(format('- %s: vendido $ %s · comisión %s%% ($ %s) · neto $ %s',
  g.name,to_char(a.amount,'FM999G999G999G990D00'),to_char(a.commission_percent,'FM990D00'),
  to_char(a.commission_amount,'FM999G999G999G990D00'),to_char(a.amount-a.commission_amount,'FM999G999G999G990D00')),E'\n' order by g.name)
 into v_game_lines from public.agency_rendition_game_amounts a join public.agency_game_types g on g.id=a.game_type_id
 where a.rendition_id=v_rendition.id and a.organization_id=v_rendition.organization_id;
 select string_agg('- '||ticket_number||case when nullif(ticket_qr_payload,'') is null then '' else E'\n QR: '||ticket_qr_payload end,E'\n' order by ticket_number)
 into v_ticket_lines from public.agency_rendition_tickets where rendition_id=v_rendition.id and organization_id=v_rendition.organization_id;
 v_subject:=format('Backup rendición %s - %s - revisión %s',coalesce(v_agent.code,'sin código'),v_rendition.rendition_date,v_revision);
 v_body:=format('BACKUP DE RENDICIÓN - AGENCIAS CORRIENTES\nRevisión: %s\nEstado: %s\nAgencia: %s\nTipo: %s\nCódigo: %s\nNombre: %s\nFecha del juego: %s\nRegistrada: %s\nPeríodo/turno: %s\nNúmero de sorteo: %s\nMétodo: %s\nReferencia: %s\n\nDETALLE POR JUEGO\n%s\n\nTOTAL VENDIDO: $ %s\nTOTAL COMISIÓN: $ %s\nNETO ESTIMADO: $ %s\n\nTICKETS / CUPONES\n%s\n\nOBSERVACIONES / MOTIVO\n%s\n\nID DE RENDICIÓN: %s\n',
 v_revision,case when v_rendition.status::text='void' then 'ANULADA' else upper(v_rendition.status::text) end,coalesce(v_org.name,'Agencia'),
 case when v_agent.kind::text='ambulant' then 'Ambulante' else 'Subagente' end,coalesce(v_agent.code,'—'),coalesce(v_agent.full_name,'—'),
 v_rendition.rendition_date::text,to_char(v_rendition.created_at at time zone coalesce(v_org.timezone,'America/Argentina/Cordoba'),'YYYY-MM-DD HH24:MI:SS'),
 coalesce(v_rendition.game_period,'—'),coalesce(v_rendition.draw_number,'—'),coalesce(v_rendition.capture_method,'manual'),coalesce(v_rendition.reference,'—'),
 coalesce(v_game_lines,'(sin desglose por juego)'),to_char(v_rendition.amount_due,'FM999G999G999G990D00'),
 to_char(coalesce((select sum(commission_amount) from public.agency_rendition_game_amounts where rendition_id=v_rendition.id and organization_id=v_rendition.organization_id),0),'FM999G999G999G990D00'),
 to_char(v_rendition.amount_due-coalesce((select sum(commission_amount) from public.agency_rendition_game_amounts where rendition_id=v_rendition.id and organization_id=v_rendition.organization_id),0),'FM999G999G999G990D00'),
 coalesce(v_ticket_lines,'(sin tickets cargados)'),coalesce(v_rendition.notes,'—'),v_rendition.id::text);
 insert into public.agency_rendition_backup_outbox(organization_id,rendition_id,revision_no,recipient_email,subject,text_body)
 values(v_rendition.organization_id,v_rendition.id,v_revision,v_email,v_subject,v_body)
 on conflict(rendition_id,revision_no) do nothing;
 return new;
exception when others then raise warning 'No se pudo encolar backup %: %',new.entity_id,sqlerrm; return new;
end;
$function$;
drop trigger if exists audit_log_agency_rendition_backup on public.audit_log;
create trigger audit_log_agency_rendition_backup after insert on public.audit_log for each row execute function private.queue_agency_rendition_backup_on_audit();
