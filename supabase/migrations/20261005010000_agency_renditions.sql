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
  p_organization_id uuid,p_rendition_id uuid,p_payment_date date,p_amount numeric,p_cash_account_id uuid,p_reference text default null,p_notes text default null
) returns uuid language plpgsql set search_path=public,pg_temp as $$
declare v_payment_id uuid; v_movement_id uuid; v_due numeric; v_paid numeric; v_agent_name text;
begin
  if not private.is_org_accounting(p_organization_id,auth.uid()) then raise exception 'Sin permisos'; end if;
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
  if v_paid+p_amount=v_due then update public.agency_renditions set status='closed',closed_at=now(),updated_at=now() where id=p_rendition_id; end if;
  return v_payment_id;
end;
$$;
revoke execute on function public.receive_agency_rendition(uuid,uuid,date,numeric,uuid,text,text) from public,anon;
grant execute on function public.receive_agency_rendition(uuid,uuid,date,numeric,uuid,text,text) to authenticated;
