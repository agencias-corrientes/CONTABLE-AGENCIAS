-- Game catalog and per-rendition game revenue breakdown.
-- Applied to the target Supabase project before committing this migration.

create table if not exists public.agency_game_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  category text not null default 'Quiniela',
  enabled boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists agency_game_types_org_name_uq
  on public.agency_game_types(organization_id, lower(name));
create index if not exists agency_game_types_org_enabled_idx
  on public.agency_game_types(organization_id, enabled, sort_order);

create table if not exists public.agency_rendition_game_amounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  rendition_id uuid not null references public.agency_renditions(id) on delete cascade,
  game_type_id uuid not null references public.agency_game_types(id) on delete restrict,
  amount numeric not null check (amount > 0),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  constraint agency_rendition_game_amounts_uq unique (rendition_id, game_type_id)
);

create index if not exists agency_rendition_game_amounts_org_game_idx
  on public.agency_rendition_game_amounts(organization_id, game_type_id);
create index if not exists agency_rendition_game_amounts_rendition_idx
  on public.agency_rendition_game_amounts(rendition_id);

alter table public.agency_game_types enable row level security;
alter table public.agency_rendition_game_amounts enable row level security;

create policy agency_game_types_select on public.agency_game_types
for select to authenticated
using (private.is_org_member(organization_id, (select auth.uid())));

create policy agency_game_types_insert on public.agency_game_types
for insert to authenticated
with check (private.has_org_role(organization_id, ARRAY['owner'::organization_role,'admin'::organization_role,'accountant'::organization_role], (select auth.uid())));

create policy agency_game_types_update on public.agency_game_types
for update to authenticated
using (private.has_org_role(organization_id, ARRAY['owner'::organization_role,'admin'::organization_role,'accountant'::organization_role], (select auth.uid())))
with check (private.has_org_role(organization_id, ARRAY['owner'::organization_role,'admin'::organization_role,'accountant'::organization_role], (select auth.uid())));

create policy agency_game_types_delete on public.agency_game_types
for delete to authenticated
using (private.has_org_role(organization_id, ARRAY['owner'::organization_role,'admin'::organization_role,'accountant'::organization_role], (select auth.uid())));

create policy agency_rendition_game_amounts_select on public.agency_rendition_game_amounts
for select to authenticated
using (private.is_org_member(organization_id, (select auth.uid())));

create policy agency_rendition_game_amounts_insert on public.agency_rendition_game_amounts
for insert to authenticated
with check (private.is_org_accounting(organization_id, (select auth.uid())));

create policy agency_rendition_game_amounts_update on public.agency_rendition_game_amounts
for update to authenticated
using (private.is_org_accounting(organization_id, (select auth.uid())))
with check (private.is_org_accounting(organization_id, (select auth.uid())));

create policy agency_rendition_game_amounts_delete on public.agency_rendition_game_amounts
for delete to authenticated
using (private.is_org_accounting(organization_id, (select auth.uid())));

insert into public.agency_game_types (organization_id, name, category, enabled, sort_order, created_by)
select o.id, v.name, v.category, true, v.sort_order, m.user_id
from public.organizations o
join lateral (
  select user_id
  from public.organization_members om
  where om.organization_id = o.id and om.role='owner'::organization_role
  order by created_at
  limit 1
) m on true
cross join (values
  ('Quiniela','Quiniela',10),
  ('Quiniela Nocturna','Quiniela',20),
  ('Quini 6','Otros juegos',30),
  ('Loto','Otros juegos',40),
  ('Brinco','Otros juegos',50),
  ('Telekino','Otros juegos',60)
) as v(name, category, sort_order)
on conflict (organization_id, lower(name)) do nothing;

create or replace function public.create_agency_rendition(
  p_organization_id uuid,
  p_agent_id uuid,
  p_rendition_date date,
  p_period_start date,
  p_period_end date,
  p_amount_due numeric,
  p_reference text default null,
  p_notes text default null,
  p_game_breakdown jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_id uuid;
  v_total numeric;
  v_item record;
begin
  if not exists (
    select 1 from public.organization_members
    where organization_id = p_organization_id
      and user_id = auth.uid()
      and role in ('owner','admin','accountant')
  ) then
    raise exception 'Sin permisos';
  end if;

  if not exists (
    select 1 from public.agency_agents
    where id = p_agent_id
      and organization_id = p_organization_id
      and is_active
  ) then
    raise exception 'Operador inválido';
  end if;

  select coalesce(sum((item->>'amount')::numeric), 0)
  into v_total
  from jsonb_array_elements(p_game_breakdown) item
  where coalesce((item->>'amount')::numeric, 0) > 0;

  if v_total <= 0 then
    raise exception 'Ingresá al menos un importe por juego';
  end if;

  if abs(v_total - coalesce(p_amount_due, v_total)) > 0.005 then
    raise exception 'La suma de los juegos no coincide con el total de la rendición';
  end if;

  insert into public.agency_renditions(
    organization_id, agent_id, rendition_date, period_start, period_end,
    amount_due, reference, notes, created_by
  )
  values(
    p_organization_id, p_agent_id, p_rendition_date, p_period_start, p_period_end,
    v_total, nullif(trim(p_reference), ''), nullif(trim(p_notes), ''), auth.uid()
  )
  returning id into v_id;

  for v_item in
    select
      (item->>'game_type_id')::uuid as game_type_id,
      (item->>'amount')::numeric as amount
    from jsonb_array_elements(p_game_breakdown) item
    where coalesce((item->>'amount')::numeric, 0) > 0
  loop
    if not exists (
      select 1 from public.agency_game_types
      where id = v_item.game_type_id
        and organization_id = p_organization_id
        and enabled
    ) then
      raise exception 'Tipo de juego inválido o inactivo';
    end if;

    insert into public.agency_rendition_game_amounts(
      organization_id, rendition_id, game_type_id, amount, created_by
    )
    values(
      p_organization_id, v_id, v_item.game_type_id, v_item.amount, auth.uid()
    );
  end loop;

  insert into public.audit_log(organization_id,user_id,action,entity,entity_id,payload)
  values(
    p_organization_id,auth.uid(),'create','agency_rendition',v_id,
    jsonb_build_object('agent_id',p_agent_id,'amount_due',v_total,'game_breakdown',p_game_breakdown)
  );

  return v_id;
end;
$function$;

revoke execute on function public.create_agency_rendition(uuid,uuid,date,date,date,numeric,text,text,jsonb) from public;
grant execute on function public.create_agency_rendition(uuid,uuid,date,date,date,numeric,text,text,jsonb) to authenticated;
