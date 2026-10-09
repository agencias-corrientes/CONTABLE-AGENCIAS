-- Per-employee permissions for Agencias Corrientes.
-- The agency owner is the only role that can grant/revoke these flags.
create table if not exists public.organization_member_permissions (
  organization_id uuid not null,
  user_id uuid not null,
  can_create_agents boolean not null default false,
  can_delete_agents boolean not null default false,
  can_create_renditions boolean not null default false,
  can_edit_renditions boolean not null default false,
  can_delete_renditions boolean not null default false,
  can_register_payments boolean not null default false,
  can_manage_backups boolean not null default false,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id),
  foreign key (organization_id, user_id)
    references public.organization_members(organization_id, user_id) on delete cascade
);

alter table public.organization_member_permissions enable row level security;
revoke all on public.organization_member_permissions from anon, authenticated;
grant select, insert, update, delete on public.organization_member_permissions to authenticated;

drop policy if exists member_permissions_select on public.organization_member_permissions;
create policy member_permissions_select on public.organization_member_permissions
for select to authenticated
using (
  private.is_org_member(organization_id, (select auth.uid()))
  and (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.organization_members manager
      where manager.organization_id = organization_member_permissions.organization_id
        and manager.user_id = (select auth.uid())
        and manager.role = 'owner'
    )
  )
);

drop policy if exists member_permissions_insert on public.organization_member_permissions;
create policy member_permissions_insert on public.organization_member_permissions
for insert to authenticated
with check (
  exists (
    select 1 from public.organization_members manager
    where manager.organization_id = organization_member_permissions.organization_id
      and manager.user_id = (select auth.uid())
      and manager.role = 'owner'
  )
);

drop policy if exists member_permissions_update on public.organization_member_permissions;
create policy member_permissions_update on public.organization_member_permissions
for update to authenticated
using (
  exists (
    select 1 from public.organization_members manager
    where manager.organization_id = organization_member_permissions.organization_id
      and manager.user_id = (select auth.uid())
      and manager.role = 'owner'
  )
)
with check (
  exists (
    select 1 from public.organization_members manager
    where manager.organization_id = organization_member_permissions.organization_id
      and manager.user_id = (select auth.uid())
      and manager.role = 'owner'
  )
);

drop policy if exists member_permissions_delete on public.organization_member_permissions;
create policy member_permissions_delete on public.organization_member_permissions
for delete to authenticated
using (
  exists (
    select 1 from public.organization_members manager
    where manager.organization_id = organization_member_permissions.organization_id
      and manager.user_id = (select auth.uid())
      and manager.role = 'owner'
  )
);

create or replace function private.has_org_permission(
  p_organization_id uuid,
  p_permission text,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $function$
  select
    exists (
      select 1 from public.organization_members member
      where member.organization_id = p_organization_id
        and member.user_id = p_user_id
        and member.role in ('owner', 'admin')
    )
    or coalesce((
      select case p_permission
        when 'can_create_agents' then permissions.can_create_agents
        when 'can_delete_agents' then permissions.can_delete_agents
        when 'can_create_renditions' then permissions.can_create_renditions
        when 'can_edit_renditions' then permissions.can_edit_renditions
        when 'can_delete_renditions' then permissions.can_delete_renditions
        when 'can_register_payments' then permissions.can_register_payments
        when 'can_manage_backups' then permissions.can_manage_backups
        else false
      end
      from public.organization_member_permissions permissions
      where permissions.organization_id = p_organization_id
        and permissions.user_id = p_user_id
    ), false);
$function$;

revoke all on function private.has_org_permission(uuid, text, uuid) from public, anon;
grant execute on function private.has_org_permission(uuid, text, uuid) to authenticated;

create or replace function public.add_organization_member_by_email(
  p_organization_id uuid,
  p_email text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_user_id uuid;
begin
  if not exists (
    select 1 from public.organization_members
    where organization_id = p_organization_id and user_id = auth.uid() and role = 'owner'
  ) then raise exception 'Solo el titular puede agregar empleados'; end if;

  if trim(coalesce(p_email, '')) = '' then raise exception 'Ingresá el correo del empleado'; end if;
  select users.id into v_user_id
  from auth.users users
  where lower(users.email) = lower(trim(p_email))
  limit 1;

  if v_user_id is null then
    raise exception 'No encontramos una cuenta con ese correo. El empleado debe registrarse primero.';
  end if;

  if exists (
    select 1 from public.organization_members
    where organization_id = p_organization_id and user_id = v_user_id
  ) then raise exception 'Ese usuario ya pertenece a esta agencia'; end if;

  insert into public.organization_members(organization_id, user_id, role)
  values (p_organization_id, v_user_id, 'accountant');

  insert into public.organization_member_permissions(organization_id, user_id, created_by)
  values (p_organization_id, v_user_id, auth.uid())
  on conflict (organization_id, user_id) do nothing;

  insert into public.audit_log(organization_id, user_id, action, entity, entity_id, payload)
  values (p_organization_id, auth.uid(), 'add_employee', 'organization_member', v_user_id,
    jsonb_build_object('email', lower(trim(p_email)), 'role', 'accountant'));
  return v_user_id;
end;
$function$;

revoke all on function public.add_organization_member_by_email(uuid, text) from public, anon;
grant execute on function public.add_organization_member_by_email(uuid, text) to authenticated;

create or replace function public.list_organization_members_for_owner(p_organization_id uuid)
returns table (
  user_id uuid,
  email text,
  full_name text,
  role public.organization_role,
  can_create_agents boolean,
  can_delete_agents boolean,
  can_create_renditions boolean,
  can_edit_renditions boolean,
  can_delete_renditions boolean,
  can_register_payments boolean,
  can_manage_backups boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if not exists (
    select 1 from public.organization_members
    where organization_id = p_organization_id and user_id = auth.uid() and role = 'owner'
  ) then raise exception 'Solo el titular puede administrar permisos'; end if;

  return query
  select member.user_id, users.email::text, coalesce(profiles.full_name, ''), member.role,
    coalesce(permissions.can_create_agents, false),
    coalesce(permissions.can_delete_agents, false),
    coalesce(permissions.can_create_renditions, false),
    coalesce(permissions.can_edit_renditions, false),
    coalesce(permissions.can_delete_renditions, false),
    coalesce(permissions.can_register_payments, false),
    coalesce(permissions.can_manage_backups, false)
  from public.organization_members member
  join auth.users users on users.id = member.user_id
  left join public.profiles profiles on profiles.id = member.user_id
  left join public.organization_member_permissions permissions
    on permissions.organization_id = member.organization_id and permissions.user_id = member.user_id
  where member.organization_id = p_organization_id
  order by case member.role when 'owner' then 0 when 'admin' then 1 else 2 end, users.email;
end;
$function$;

revoke all on function public.list_organization_members_for_owner(uuid) from public, anon;
grant execute on function public.list_organization_members_for_owner(uuid) to authenticated;

-- Agent creation/deletion require a manager or an explicitly granted permission.
drop policy if exists agency_agents_insert on public.agency_agents;
create policy agency_agents_insert on public.agency_agents
for insert to authenticated
with check (private.has_org_permission(organization_id, 'can_create_agents', (select auth.uid())));

drop policy if exists agency_agents_delete on public.agency_agents;
create policy agency_agents_delete on public.agency_agents
for delete to authenticated
using (
  private.has_org_permission(organization_id, 'can_delete_agents', (select auth.uid()))
  and not exists (
    select 1 from public.agency_renditions rendition
    where rendition.agent_id = agency_agents.id
  )
);

-- Only owner/admin can manage game catalog and game prices.
drop policy if exists agency_game_types_insert on public.agency_game_types;
create policy agency_game_types_insert on public.agency_game_types
for insert to authenticated
with check (
  exists (select 1 from public.organization_members member
    where member.organization_id = agency_game_types.organization_id
      and member.user_id = (select auth.uid()) and member.role in ('owner','admin'))
);
drop policy if exists agency_game_types_update on public.agency_game_types;
create policy agency_game_types_update on public.agency_game_types
for update to authenticated
using (
  exists (select 1 from public.organization_members member
    where member.organization_id = agency_game_types.organization_id
      and member.user_id = (select auth.uid()) and member.role in ('owner','admin'))
)
with check (
  exists (select 1 from public.organization_members member
    where member.organization_id = agency_game_types.organization_id
      and member.user_id = (select auth.uid()) and member.role in ('owner','admin'))
);
drop policy if exists agency_game_types_delete on public.agency_game_types;
create policy agency_game_types_delete on public.agency_game_types
for delete to authenticated
using (
  exists (select 1 from public.organization_members member
    where member.organization_id = agency_game_types.organization_id
      and member.user_id = (select auth.uid()) and member.role in ('owner','admin'))
);

-- Permissions for rendition registration, correction, deletion, and payments.
drop policy if exists agency_renditions_insert on public.agency_renditions;
create policy agency_renditions_insert on public.agency_renditions
for insert to authenticated
with check (private.has_org_permission(organization_id, 'can_create_renditions', (select auth.uid())));
drop policy if exists agency_renditions_update on public.agency_renditions;
create policy agency_renditions_update on public.agency_renditions
for update to authenticated
using (private.has_org_permission(organization_id, 'can_edit_renditions', (select auth.uid())))
with check (private.has_org_permission(organization_id, 'can_edit_renditions', (select auth.uid())));
drop policy if exists agency_renditions_delete on public.agency_renditions;
create policy agency_renditions_delete on public.agency_renditions
for delete to authenticated
using (private.has_org_permission(organization_id, 'can_delete_renditions', (select auth.uid())));

drop policy if exists agency_rendition_game_amounts_insert on public.agency_rendition_game_amounts;
create policy agency_rendition_game_amounts_insert on public.agency_rendition_game_amounts
for insert to authenticated
with check (private.has_org_permission(organization_id, 'can_create_renditions', (select auth.uid())));
drop policy if exists agency_rendition_game_amounts_update on public.agency_rendition_game_amounts;
create policy agency_rendition_game_amounts_update on public.agency_rendition_game_amounts
for update to authenticated
using (private.has_org_permission(organization_id, 'can_edit_renditions', (select auth.uid())))
with check (private.has_org_permission(organization_id, 'can_edit_renditions', (select auth.uid())));
drop policy if exists agency_rendition_game_amounts_delete on public.agency_rendition_game_amounts;
create policy agency_rendition_game_amounts_delete on public.agency_rendition_game_amounts
for delete to authenticated
using (private.has_org_permission(organization_id, 'can_edit_renditions', (select auth.uid())));

drop policy if exists agency_rendition_tickets_insert on public.agency_rendition_tickets;
create policy agency_rendition_tickets_insert on public.agency_rendition_tickets
for insert to authenticated
with check (private.has_org_permission(organization_id, 'can_create_renditions', (select auth.uid())));
drop policy if exists agency_rendition_tickets_delete on public.agency_rendition_tickets;
create policy agency_rendition_tickets_delete on public.agency_rendition_tickets
for delete to authenticated
using (private.has_org_permission(organization_id, 'can_edit_renditions', (select auth.uid())));

drop policy if exists agency_rendition_payments_insert on public.agency_rendition_payments;
create policy agency_rendition_payments_insert on public.agency_rendition_payments
for insert to authenticated
with check (private.has_org_permission(organization_id, 'can_register_payments', (select auth.uid())));

-- Retain the existing accounting/audit semantics while enforcing per-user permissions.
create or replace function public.create_agency_agent(
  p_organization_id uuid,
  p_kind public.agency_agent_kind,
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
declare v_id uuid; v_code text := trim(coalesce(p_code, ''));
begin
  if not private.has_org_permission(p_organization_id, 'can_create_agents', auth.uid()) then
    raise exception 'No tenés permiso para dar de alta subagentes o ambulantes';
  end if;
  if trim(coalesce(p_full_name, '')) = '' then raise exception 'El nombre es obligatorio'; end if;
  if v_code !~ '^[0-9]{3}-[0-9]{3}-[0-9]{2}$' then raise exception 'El código debe tener el formato 251-010-01'; end if;
  if exists(select 1 from public.agency_agents where organization_id=p_organization_id and kind=p_kind and code=v_code) then
    raise exception 'Ese subagente o ambulante ya está cargado';
  end if;

  insert into public.agency_agents(organization_id,kind,full_name,code,dni,phone,whatsapp,address,notes,created_by)
  values(p_organization_id,p_kind,trim(p_full_name),v_code,nullif(trim(p_dni),''),nullif(trim(p_phone),''),nullif(trim(p_whatsapp),''),nullif(trim(p_address),''),nullif(trim(p_notes),''),auth.uid())
  returning id into v_id;

  insert into public.audit_log(organization_id,user_id,action,entity,entity_id,payload)
  values(p_organization_id,auth.uid(),'create','agency_agent',v_id,jsonb_build_object('kind',p_kind,'code',v_code,'full_name',trim(p_full_name)));
  return v_id;
end;
$function$;

create or replace function public.create_agency_rendition_with_capture(
  p_organization_id uuid,
  p_agent_id uuid,
  p_rendition_date date,
  p_amount_due numeric,
  p_game_breakdown jsonb default '[]'::jsonb,
  p_ticket_numbers jsonb default '[]'::jsonb,
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
declare v_id uuid; v_total numeric; v_item record; v_ticket text;
begin
  if not private.has_org_permission(p_organization_id, 'can_create_renditions', auth.uid()) then
    raise exception 'No tenés permiso para registrar rendiciones';
  end if;
  if not exists(select 1 from public.agency_agents where id=p_agent_id and organization_id=p_organization_id and is_active) then
    raise exception 'Operador inválido o inactivo';
  end if;
  if jsonb_typeof(p_game_breakdown) <> 'array' then raise exception 'La distribución por juegos es inválida'; end if;
  if jsonb_typeof(p_ticket_numbers) <> 'array' then raise exception 'Los números de ticket son inválidos'; end if;
  if coalesce(p_capture_method, 'manual') not in ('manual','photo','qr') then raise exception 'Método de lectura inválido'; end if;

  select coalesce(sum((item->>'amount')::numeric),0) into v_total
  from jsonb_array_elements(p_game_breakdown) item
  where coalesce((item->>'amount')::numeric,0)>0;

  if v_total<=0 then raise exception 'Ingresá al menos un importe por juego'; end if;
  if abs(v_total-coalesce(p_amount_due,v_total))>0.005 then raise exception 'La suma de los juegos no coincide con el total de la rendición'; end if;

  insert into public.agency_renditions(organization_id,agent_id,rendition_date,period_start,period_end,amount_due,reference,notes,game_period,draw_number,capture_method,created_by)
  values(p_organization_id,p_agent_id,p_rendition_date,p_rendition_date,p_rendition_date,v_total,nullif(trim(p_reference),''),nullif(trim(p_notes),''),nullif(trim(p_game_period),''),nullif(trim(p_draw_number),''),coalesce(p_capture_method,'manual'),auth.uid())
  returning id into v_id;

  for v_item in
    select (item->>'game_type_id')::uuid as game_type_id,(item->>'amount')::numeric as amount
    from jsonb_array_elements(p_game_breakdown) item where coalesce((item->>'amount')::numeric,0)>0
  loop
    if not exists(select 1 from public.agency_game_types where id=v_item.game_type_id and organization_id=p_organization_id and enabled) then raise exception 'Tipo de juego inválido o inactivo'; end if;
    insert into public.agency_rendition_game_amounts(organization_id,rendition_id,game_type_id,amount,created_by)
    values(p_organization_id,v_id,v_item.game_type_id,v_item.amount,auth.uid());
  end loop;

  for v_ticket in
    select distinct trim(value) from jsonb_array_elements_text(p_ticket_numbers) value where length(trim(value))>0
  loop
    insert into public.agency_rendition_tickets(organization_id,rendition_id,ticket_number,created_by)
    values(p_organization_id,v_id,v_ticket,auth.uid())
    on conflict (rendition_id,ticket_number) do nothing;
  end loop;

  if nullif(trim(p_ticket_qr_payload),'') is not null then
    insert into public.agency_rendition_tickets(organization_id,rendition_id,ticket_number,ticket_qr_payload,created_by)
    values(p_organization_id,v_id,left(trim(p_ticket_qr_payload),160),trim(p_ticket_qr_payload),auth.uid())
    on conflict (rendition_id,ticket_number) do update set ticket_qr_payload=excluded.ticket_qr_payload;
  end if;

  insert into public.audit_log(organization_id,user_id,action,entity,entity_id,payload)
  values(p_organization_id,auth.uid(),'create','agency_rendition',v_id,
    jsonb_build_object('agent_id',p_agent_id,'amount_due',v_total,'game_period',p_game_period,'draw_number',p_draw_number,'capture_method',p_capture_method,
      'game_breakdown',p_game_breakdown,'ticket_count',jsonb_array_length(p_ticket_numbers),'qr_detected',nullif(trim(p_ticket_qr_payload),'') is not null));
  return v_id;
end;
$function$;

create or replace function public.receive_agency_rendition(
  p_organization_id uuid, p_rendition_id uuid, p_payment_date date, p_amount numeric,
  p_cash_account_id uuid, p_reference text default null, p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare v_payment_id uuid; v_movement_id uuid; v_due numeric; v_paid numeric; v_agent_name text;
begin
  if not private.has_org_permission(p_organization_id, 'can_register_payments', auth.uid()) then raise exception 'No tenés permiso para registrar cobros'; end if;
  if p_amount<=0 then raise exception 'El importe debe ser mayor que cero'; end if;
  select r.amount_due,a.full_name into v_due,v_agent_name
  from public.agency_renditions r join public.agency_agents a on a.id=r.agent_id
  where r.id=p_rendition_id and r.organization_id=p_organization_id and r.status='open' for update;
  if v_due is null then raise exception 'Rendición inexistente o ya cerrada'; end if;
  if not exists(select 1 from public.cash_accounts where id=p_cash_account_id and organization_id=p_organization_id and is_active) then raise exception 'Caja/cuenta inválida'; end if;
  select coalesce(sum(amount),0) into v_paid from public.agency_rendition_payments where rendition_id=p_rendition_id;
  if v_paid+p_amount>v_due then raise exception 'La recepción supera el importe pendiente de la rendición'; end if;
  insert into public.agency_rendition_payments(organization_id,rendition_id,payment_date,amount,cash_account_id,reference,notes)
  values(p_organization_id,p_rendition_id,p_payment_date,p_amount,p_cash_account_id,p_reference,p_notes)
  returning id into v_payment_id;
  insert into public.cash_movements(organization_id,cash_account_id,movement_date,direction,amount,description)
  values(p_organization_id,p_cash_account_id,p_payment_date,'incoming',p_amount,coalesce(p_reference,'Rendición de '||v_agent_name))
  returning id into v_movement_id;
  update public.agency_rendition_payments set cash_movement_id=v_movement_id where id=v_payment_id;
  if v_paid+p_amount=v_due then update public.agency_renditions set status='closed',closed_at=now(),updated_at=now() where id=p_rendition_id; end if;
  insert into public.audit_log(organization_id,user_id,action,entity,entity_id,payload)
  values(p_organization_id,auth.uid(),'receive','agency_rendition',p_rendition_id,jsonb_build_object('payment_id',v_payment_id,'amount',p_amount,'agent_name',v_agent_name,'closed',(v_paid+p_amount=v_due)));
  return v_payment_id;
end;
$function$;

revoke all on function public.create_agency_agent(uuid, public.agency_agent_kind, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.create_agency_agent(uuid, public.agency_agent_kind, text, text, text, text, text, text, text) to authenticated;
revoke all on function public.create_agency_rendition_with_capture(uuid, uuid, date, numeric, jsonb, jsonb, text, text, text, text, text, text) from public, anon;
grant execute on function public.create_agency_rendition_with_capture(uuid, uuid, date, numeric, jsonb, jsonb, text, text, text, text, text, text) to authenticated;
revoke all on function public.receive_agency_rendition(uuid, uuid, date, numeric, uuid, text, text) from public, anon;
grant execute on function public.receive_agency_rendition(uuid, uuid, date, numeric, uuid, text, text) to authenticated;
