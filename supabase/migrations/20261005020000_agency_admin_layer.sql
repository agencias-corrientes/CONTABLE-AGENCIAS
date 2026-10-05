-- Operational agency layer: subagents/ambulants and renditions.
-- This migration mirrors the Preview schema already applied while iterating.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'agency_agent_kind') then
    create type public.agency_agent_kind as enum ('subagent','ambulant');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'agency_rendition_status') then
    create type public.agency_rendition_status as enum ('open','closed','void');
  end if;
end $$;

create table if not exists public.agency_agents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text, kind public.agency_agent_kind not null, full_name text not null,
  phone text, whatsapp text, address text, notes text,
  is_active boolean not null default true,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint agency_agents_name_nonempty check (length(trim(full_name)) > 0)
);
create unique index if not exists agency_agents_org_code_uq on public.agency_agents(organization_id,code) where code is not null and length(trim(code))>0;
create index if not exists agency_agents_org_kind_idx on public.agency_agents(organization_id,kind,is_active);
create unique index if not exists agency_agents_id_org_uq on public.agency_agents(id,organization_id);

create table if not exists public.agency_renditions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.agency_agents(id) on delete restrict,
  rendition_date date not null default current_date,
  period_start date, period_end date,
  amount_due numeric not null check (amount_due>0),
  status public.agency_rendition_status not null default 'open',
  reference text, notes text, closed_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists agency_renditions_agent_date_idx on public.agency_renditions(agent_id,rendition_date desc);
create index if not exists agency_renditions_org_status_idx on public.agency_renditions(organization_id,status,rendition_date desc);
create unique index if not exists agency_renditions_id_org_uq on public.agency_renditions(id,organization_id);

create table if not exists public.agency_rendition_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  rendition_id uuid not null references public.agency_renditions(id) on delete restrict,
  payment_date date not null default current_date,
  amount numeric not null check (amount>0),
  cash_account_id uuid references public.cash_accounts(id) on delete restrict,
  reference text, notes text,
  cash_movement_id uuid references public.cash_movements(id) on delete set null,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists agency_rendition_payments_rendition_idx on public.agency_rendition_payments(rendition_id,payment_date desc);
create index if not exists agency_rendition_payments_org_date_idx on public.agency_rendition_payments(organization_id,payment_date desc);

alter table public.agency_renditions add constraint agency_renditions_agent_org_fkey foreign key(agent_id,organization_id) references public.agency_agents(id,organization_id) on delete restrict;
alter table public.agency_rendition_payments add constraint agency_rendition_payments_rendition_org_fkey foreign key(rendition_id,organization_id) references public.agency_renditions(id,organization_id) on delete restrict;

alter table public.agency_agents enable row level security;
alter table public.agency_renditions enable row level security;
alter table public.agency_rendition_payments enable row level security;

drop policy if exists agency_agents_select on public.agency_agents;
create policy agency_agents_select on public.agency_agents for select to authenticated using(private.is_org_member(organization_id,(select auth.uid())));
drop policy if exists agency_agents_insert on public.agency_agents;
create policy agency_agents_insert on public.agency_agents for insert to authenticated with check(private.is_org_manager(organization_id,(select auth.uid())));
drop policy if exists agency_agents_update on public.agency_agents;
create policy agency_agents_update on public.agency_agents for update to authenticated using(private.is_org_manager(organization_id,(select auth.uid()))) with check(private.is_org_manager(organization_id,(select auth.uid())));

drop policy if exists agency_renditions_select on public.agency_renditions;
create policy agency_renditions_select on public.agency_renditions for select to authenticated using(private.is_org_member(organization_id,(select auth.uid())));
drop policy if exists agency_renditions_insert on public.agency_renditions;
create policy agency_renditions_insert on public.agency_renditions for insert to authenticated with check(private.is_org_accounting(organization_id,(select auth.uid())));
drop policy if exists agency_renditions_update on public.agency_renditions;
create policy agency_renditions_update on public.agency_renditions for update to authenticated using(private.is_org_accounting(organization_id,(select auth.uid()))) with check(private.is_org_accounting(organization_id,(select auth.uid())));

drop policy if exists agency_rendition_payments_select on public.agency_rendition_payments;
create policy agency_rendition_payments_select on public.agency_rendition_payments for select to authenticated using(private.is_org_member(organization_id,(select auth.uid())));
drop policy if exists agency_rendition_payments_insert on public.agency_rendition_payments;
create policy agency_rendition_payments_insert on public.agency_rendition_payments for insert to authenticated with check(private.is_org_accounting(organization_id,(select auth.uid())));

create or replace function public.receive_agency_rendition(
  p_organization_id uuid,
  p_rendition_id uuid,
  p_payment_date date,
  p_amount numeric,
  p_cash_account_id uuid,
  p_reference text default null,
  p_notes text default null
) returns uuid language plpgsql set search_path=public,pg_temp as $$
declare v_payment_id uuid; v_movement_id uuid; v_due numeric; v_paid numeric; v_agent_name text;
begin
  if not exists(select 1 from public.organization_members where organization_id=p_organization_id and user_id=auth.uid() and role in ('owner','admin','accountant')) then
    raise exception 'Sin permisos';
  end if;
  if p_amount<=0 then raise exception 'El importe debe ser mayor que cero'; end if;
  select r.amount_due,a.full_name into v_due,v_agent_name from public.agency_renditions r join public.agency_agents a on a.id=r.agent_id
  where r.id=p_rendition_id and r.organization_id=p_organization_id and r.status='open' for update;
  if v_due is null then raise exception 'Rendición inexistente o ya cerrada'; end if;
  if not exists(select 1 from public.cash_accounts where id=p_cash_account_id and organization_id=p_organization_id and is_active) then raise exception 'Caja/cuenta inválida'; end if;
  select coalesce(sum(amount),0) into v_paid from public.agency_rendition_payments where rendition_id=p_rendition_id;
  if v_paid+p_amount>v_due then raise exception 'La recepción supera el importe pendiente de la rendición'; end if;
  insert into public.agency_rendition_payments(organization_id,rendition_id,payment_date,amount,cash_account_id,reference,notes)
  values(p_organization_id,p_rendition_id,p_payment_date,p_amount,p_cash_account_id,p_reference,p_notes) returning id into v_payment_id;
  insert into public.cash_movements(organization_id,cash_account_id,movement_date,direction,amount,description)
  values(p_organization_id,p_cash_account_id,p_payment_date,'incoming',p_amount,coalesce(p_reference,'Rendición de '||v_agent_name)) returning id into v_movement_id;
  update public.agency_rendition_payments set cash_movement_id=v_movement_id where id=v_payment_id;
  if v_paid+p_amount=v_due then
    update public.agency_renditions set status='closed',closed_at=now(),updated_at=now() where id=p_rendition_id;
  end if;
  return v_payment_id;
end;
$$;
revoke execute on function public.receive_agency_rendition(uuid,uuid,date,numeric,uuid,text,text) from public,anon;
grant execute on function public.receive_agency_rendition(uuid,uuid,date,numeric,uuid,text,text) to authenticated;


create table if not exists public.agency_daily_closings (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 closing_date date not null, expected_amount numeric not null default 0 check(expected_amount>=0), received_amount numeric not null default 0 check(received_amount>=0), pending_amount numeric not null default 0 check(pending_amount>=0), cash_balance numeric not null default 0,
 notes text,status text not null default 'open' check(status in ('open','closed')),closed_by uuid references auth.users(id),closed_at timestamptz,created_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(organization_id,closing_date));
alter table public.agency_daily_closings enable row level security;
create policy agency_daily_closings_select on public.agency_daily_closings for select to authenticated using(private.is_org_member(organization_id,(select auth.uid())));
create policy agency_daily_closings_insert on public.agency_daily_closings for insert to authenticated with check(private.is_org_accounting(organization_id,(select auth.uid())));
create policy agency_daily_closings_update on public.agency_daily_closings for update to authenticated using(private.is_org_accounting(organization_id,(select auth.uid()))) with check(private.is_org_accounting(organization_id,(select auth.uid())));
create or replace function public.create_agency_agent(p_organization_id uuid,p_kind public.agency_agent_kind,p_full_name text,p_code text default null,p_dni text default null,p_phone text default null,p_whatsapp text default null,p_address text default null,p_notes text default null) returns uuid language plpgsql set search_path=public,pg_temp as $$declare v_id uuid;begin if not exists(select 1 from public.organization_members where organization_id=p_organization_id and user_id=auth.uid() and role in ('owner','admin')) then raise exception 'Sin permisos';end if;if trim(coalesce(p_full_name,''))='' then raise exception 'El nombre es obligatorio';end if;insert into public.agency_agents(organization_id,kind,full_name,code,dni,phone,whatsapp,address,notes,created_by) values(p_organization_id,p_kind,trim(p_full_name),nullif(trim(p_code),''),nullif(trim(p_dni),''),nullif(trim(p_phone),''),nullif(trim(p_whatsapp),''),nullif(trim(p_address),''),nullif(trim(p_notes),''),auth.uid()) returning id into v_id;insert into public.audit_log(organization_id,user_id,action,entity,entity_id,payload) values(p_organization_id,auth.uid(),'create','agency_agent',v_id,jsonb_build_object('kind',p_kind,'full_name',trim(p_full_name)));return v_id;end;$$;
revoke execute on function public.create_agency_agent(uuid,public.agency_agent_kind,text,text,text,text,text,text,text) from public,anon;grant execute on function public.create_agency_agent(uuid,public.agency_agent_kind,text,text,text,text,text,text,text) to authenticated;
create or replace function public.create_agency_rendition(p_organization_id uuid,p_agent_id uuid,p_rendition_date date,p_period_start date,p_period_end date,p_amount_due numeric,p_reference text default null,p_notes text default null) returns uuid language plpgsql set search_path=public,pg_temp as $$declare v_id uuid;begin if not exists(select 1 from public.organization_members where organization_id=p_organization_id and user_id=auth.uid() and role in ('owner','admin','accountant')) then raise exception 'Sin permisos';end if;if p_amount_due<=0 then raise exception 'El importe debe ser mayor que cero';end if;if not exists(select 1 from public.agency_agents where id=p_agent_id and organization_id=p_organization_id and is_active) then raise exception 'Operador inválido';end if;insert into public.agency_renditions(organization_id,agent_id,rendition_date,period_start,period_end,amount_due,reference,notes,created_by) values(p_organization_id,p_agent_id,p_rendition_date,p_period_start,p_period_end,p_amount_due,nullif(trim(p_reference),''),nullif(trim(p_notes),''),auth.uid()) returning id into v_id;insert into public.audit_log(organization_id,user_id,action,entity,entity_id,payload) values(p_organization_id,auth.uid(),'create','agency_rendition',v_id,jsonb_build_object('agent_id',p_agent_id,'amount_due',p_amount_due));return v_id;end;$$;
revoke execute on function public.create_agency_rendition(uuid,uuid,date,date,date,numeric,text,text) from public,anon;grant execute on function public.create_agency_rendition(uuid,uuid,date,date,date,numeric,text,text) to authenticated;
create or replace function public.close_agency_day(p_organization_id uuid,p_closing_date date,p_notes text default null) returns uuid language plpgsql set search_path=public,pg_temp as $$declare v_id uuid;v_expected numeric;v_received numeric;v_pending numeric;v_cash numeric;begin if not exists(select 1 from public.organization_members where organization_id=p_organization_id and user_id=auth.uid() and role in ('owner','admin','accountant')) then raise exception 'Sin permisos';end if;select coalesce(sum(amount_due),0) into v_expected from public.agency_renditions where organization_id=p_organization_id and rendition_date=p_closing_date and status<>'void';select coalesce(sum(p.amount),0) into v_received from public.agency_rendition_payments p join public.agency_renditions r on r.id=p.rendition_id where p.organization_id=p_organization_id and p.payment_date=p_closing_date;v_pending:=greatest(v_expected-v_received,0);select coalesce(sum(case when direction='incoming' then amount else -amount end),0) into v_cash from public.cash_movements where organization_id=p_organization_id and movement_date<=p_closing_date;insert into public.agency_daily_closings(organization_id,closing_date,expected_amount,received_amount,pending_amount,cash_balance,notes,status,closed_by,closed_at,created_by,updated_at) values(p_organization_id,p_closing_date,v_expected,v_received,v_pending,v_cash,p_notes,'closed',auth.uid(),now(),auth.uid(),now()) on conflict(organization_id,closing_date) do update set expected_amount=excluded.expected_amount,received_amount=excluded.received_amount,pending_amount=excluded.pending_amount,cash_balance=excluded.cash_balance,notes=excluded.notes,status='closed',closed_by=auth.uid(),closed_at=now(),updated_at=now() returning id into v_id;insert into public.audit_log(organization_id,user_id,action,entity,entity_id,payload) values(p_organization_id,auth.uid(),'close','agency_daily_closing',v_id,jsonb_build_object('date',p_closing_date,'expected',v_expected,'received',v_received,'pending',v_pending));return v_id;end;$$;
revoke execute on function public.close_agency_day(uuid,date,text) from public,anon;grant execute on function public.close_agency_day(uuid,date,text) to authenticated;