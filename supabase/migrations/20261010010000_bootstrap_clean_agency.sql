-- Set up all agency-specific tables required by the clean owner onboarding flow.
-- Safe for existing databases: all table/column/index creation is guarded.
-- This migration does not delete existing users, organizations, agents, or renditions.

create table if not exists public.organization_member_permissions (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  can_create_agents boolean not null default false,
  can_delete_agents boolean not null default false,
  can_create_renditions boolean not null default false,
  can_edit_renditions boolean not null default false,
  can_delete_renditions boolean not null default false,
  can_register_payments boolean not null default false,
  can_manage_backups boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id),
  constraint organization_member_permissions_member_fkey
    foreign key (organization_id, user_id)
    references public.organization_members(organization_id, user_id) on delete cascade
);

create table if not exists public.agency_game_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  category text not null default 'Quiniela',
  enabled boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);
create unique index if not exists agency_game_types_org_lower_name_uidx
  on public.agency_game_types (organization_id, lower(name));

create table if not exists public.agency_operational_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  rendition_cutoff_time time not null default '00:00:00',
  backup_send_time time not null default '23:50:00',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_backup_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  recipient_email text,
  enabled boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  include_ticket_photo boolean not null default true
);

alter table public.agency_agents
  add column if not exists rendition_policy text not null default 'daily',
  add column if not exists rendition_periods text[] not null default '{}'::text[];

alter table public.agency_renditions
  add column if not exists game_period text,
  add column if not exists draw_number text,
  add column if not exists capture_method text not null default 'manual';

create table if not exists public.agency_rendition_game_amounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  rendition_id uuid not null references public.agency_renditions(id) on delete cascade,
  game_type_id uuid not null references public.agency_game_types(id) on delete restrict,
  amount numeric not null check (amount > 0),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  commission_percent numeric not null default 0,
  commission_amount numeric not null default 0
);
create index if not exists agency_rendition_game_amounts_org_rendition_idx
  on public.agency_rendition_game_amounts (organization_id, rendition_id);

create table if not exists public.agency_rendition_tickets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  rendition_id uuid not null references public.agency_renditions(id) on delete cascade,
  ticket_number text not null,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  ticket_qr_payload text,
  unique (rendition_id, ticket_number)
);
create index if not exists agency_rendition_tickets_org_ticket_idx
  on public.agency_rendition_tickets (organization_id, ticket_number);

create table if not exists public.agency_agent_daily_status (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.agency_agents(id) on delete cascade,
  operational_date date not null,
  status text not null,
  notes text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  reported_amount numeric,
  primary key (organization_id, agent_id, operational_date)
);

create table if not exists public.agency_agent_draw_status (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.agency_agents(id) on delete cascade,
  operational_date date not null,
  draw_period text not null,
  rendition_id uuid not null references public.agency_renditions(id) on delete cascade,
  status text not null,
  notes text,
  reported_amount numeric,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (organization_id, agent_id, operational_date, draw_period)
);

alter table public.organization_member_permissions enable row level security;
alter table public.agency_game_types enable row level security;
alter table public.agency_operational_settings enable row level security;
alter table public.organization_backup_settings enable row level security;
alter table public.agency_rendition_game_amounts enable row level security;
alter table public.agency_rendition_tickets enable row level security;
alter table public.agency_agent_daily_status enable row level security;
alter table public.agency_agent_draw_status enable row level security;

grant select, insert, update, delete on public.organization_member_permissions to authenticated;
grant select, insert, update, delete on public.agency_game_types to authenticated;
grant select, insert, update, delete on public.agency_operational_settings to authenticated;
grant select, insert, update, delete on public.organization_backup_settings to authenticated;
grant select on public.agency_rendition_game_amounts to authenticated;
grant select on public.agency_rendition_tickets to authenticated;
grant select on public.agency_agent_daily_status to authenticated;
grant select on public.agency_agent_draw_status to authenticated;

drop policy if exists organization_member_permissions_self_select on public.organization_member_permissions;
create policy organization_member_permissions_self_select on public.organization_member_permissions
  for select to authenticated using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.organization_members m
      where m.organization_id = organization_member_permissions.organization_id
        and m.user_id = (select auth.uid()) and m.role = 'owner'
    )
  );
drop policy if exists organization_member_permissions_owner_manage on public.organization_member_permissions;
create policy organization_member_permissions_owner_manage on public.organization_member_permissions
  for all to authenticated using (
    exists (
      select 1 from public.organization_members m
      where m.organization_id = organization_member_permissions.organization_id
        and m.user_id = (select auth.uid()) and m.role = 'owner'
    )
  ) with check (
    exists (
      select 1 from public.organization_members m
      where m.organization_id = organization_member_permissions.organization_id
        and m.user_id = (select auth.uid()) and m.role = 'owner'
    )
  );

drop policy if exists agency_game_types_member_select on public.agency_game_types;
create policy agency_game_types_member_select on public.agency_game_types
  for select to authenticated using (
    exists (select 1 from public.organization_members m
      where m.organization_id = agency_game_types.organization_id and m.user_id = (select auth.uid()))
  );
drop policy if exists agency_game_types_owner_insert on public.agency_game_types;
create policy agency_game_types_owner_insert on public.agency_game_types
  for insert to authenticated with check (
    exists (select 1 from public.organization_members m
      where m.organization_id = agency_game_types.organization_id and m.user_id = (select auth.uid()) and m.role = 'owner')
  );
drop policy if exists agency_game_types_owner_update on public.agency_game_types;
create policy agency_game_types_owner_update on public.agency_game_types
  for update to authenticated using (
    exists (select 1 from public.organization_members m
      where m.organization_id = agency_game_types.organization_id and m.user_id = (select auth.uid()) and m.role = 'owner')
  ) with check (
    exists (select 1 from public.organization_members m
      where m.organization_id = agency_game_types.organization_id and m.user_id = (select auth.uid()) and m.role = 'owner')
  );
drop policy if exists agency_game_types_owner_delete on public.agency_game_types;
create policy agency_game_types_owner_delete on public.agency_game_types
  for delete to authenticated using (
    exists (select 1 from public.organization_members m
      where m.organization_id = agency_game_types.organization_id and m.user_id = (select auth.uid()) and m.role = 'owner')
  );

drop policy if exists agency_operational_settings_member_select on public.agency_operational_settings;
create policy agency_operational_settings_member_select on public.agency_operational_settings
  for select to authenticated using (
    exists (select 1 from public.organization_members m
      where m.organization_id = agency_operational_settings.organization_id and m.user_id = (select auth.uid()))
  );
drop policy if exists agency_operational_settings_owner_insert on public.agency_operational_settings;
create policy agency_operational_settings_owner_insert on public.agency_operational_settings
  for insert to authenticated with check (
    exists (select 1 from public.organization_members m
      where m.organization_id = agency_operational_settings.organization_id and m.user_id = (select auth.uid()) and m.role = 'owner')
  );
drop policy if exists agency_operational_settings_owner_update on public.agency_operational_settings;
create policy agency_operational_settings_owner_update on public.agency_operational_settings
  for update to authenticated using (
    exists (select 1 from public.organization_members m
      where m.organization_id = agency_operational_settings.organization_id and m.user_id = (select auth.uid()) and m.role = 'owner')
  ) with check (
    exists (select 1 from public.organization_members m
      where m.organization_id = agency_operational_settings.organization_id and m.user_id = (select auth.uid()) and m.role = 'owner')
  );

drop policy if exists organization_backup_settings_owner_all on public.organization_backup_settings;
create policy organization_backup_settings_owner_all on public.organization_backup_settings
  for all to authenticated using (
    exists (select 1 from public.organization_members m
      where m.organization_id = organization_backup_settings.organization_id and m.user_id = (select auth.uid()) and m.role = 'owner')
  ) with check (
    exists (select 1 from public.organization_members m
      where m.organization_id = organization_backup_settings.organization_id and m.user_id = (select auth.uid()) and m.role = 'owner')
  );

drop policy if exists agency_rendition_game_amounts_member_select on public.agency_rendition_game_amounts;
create policy agency_rendition_game_amounts_member_select on public.agency_rendition_game_amounts
  for select to authenticated using (
    exists (select 1 from public.organization_members m
      where m.organization_id = agency_rendition_game_amounts.organization_id and m.user_id = (select auth.uid()))
  );
drop policy if exists agency_rendition_tickets_member_select on public.agency_rendition_tickets;
create policy agency_rendition_tickets_member_select on public.agency_rendition_tickets
  for select to authenticated using (
    exists (select 1 from public.organization_members m
      where m.organization_id = agency_rendition_tickets.organization_id and m.user_id = (select auth.uid()))
  );
drop policy if exists agency_agent_daily_status_member_select on public.agency_agent_daily_status;
create policy agency_agent_daily_status_member_select on public.agency_agent_daily_status
  for select to authenticated using (
    exists (select 1 from public.organization_members m
      where m.organization_id = agency_agent_daily_status.organization_id and m.user_id = (select auth.uid()))
  );
drop policy if exists agency_agent_draw_status_member_select on public.agency_agent_draw_status;
create policy agency_agent_draw_status_member_select on public.agency_agent_draw_status
  for select to authenticated using (
    exists (select 1 from public.organization_members m
      where m.organization_id = agency_agent_draw_status.organization_id and m.user_id = (select auth.uid()))
  );

-- Initialize a clean agency without generating any sample agents or renditions.
create or replace function public.bootstrap_agency_organization(
  p_name text,
  p_legal_name text default null,
  p_tax_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_org_id uuid;
  v_email text := nullif(trim(coalesce(auth.jwt() ->> 'email', '')), '');
begin
  if v_uid is null then
    raise exception 'Authentication is required';
  end if;
  if nullif(trim(p_name), '') is null or length(trim(p_name)) > 120 then
    raise exception 'Organization name is required';
  end if;
  if exists (select 1 from public.organization_members where user_id = v_uid) then
    raise exception 'User already belongs to an organization';
  end if;

  insert into public.organizations (name, legal_name, tax_id, currency_code, timezone, created_by)
  values (trim(p_name), nullif(trim(p_legal_name), ''), nullif(trim(p_tax_id), ''),
          'ARS', 'America/Argentina/Cordoba', v_uid)
  returning id into v_org_id;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_org_id, v_uid, 'owner');

  insert into public.profiles (id) values (v_uid) on conflict (id) do nothing;

  insert into public.cash_accounts (organization_id, name, type, currency_code, is_active)
  values (v_org_id, 'Caja', 'cash', 'ARS', true);

  insert into public.agency_operational_settings (
    organization_id, rendition_cutoff_time, backup_send_time, updated_by
  ) values (v_org_id, '00:00:00', '23:50:00', v_uid);

  insert into public.organization_backup_settings (
    organization_id, recipient_email, enabled, created_by, include_ticket_photo
  ) values (v_org_id, v_email, true, v_uid, true);

  insert into public.agency_game_types (
    organization_id, name, category, enabled, sort_order, created_by
  ) values
    (v_org_id, 'Quiniela Correntina', 'Quiniela', true, 10, v_uid),
    (v_org_id, 'Quiniela Al Toque', 'Quiniela', true, 20, v_uid),
    (v_org_id, 'Quiniela Poceada Correntina', 'Poceada', true, 30, v_uid),
    (v_org_id, 'Loto Plus', 'Otros juegos', true, 40, v_uid),
    (v_org_id, 'Loto 5 Plus', 'Otros juegos', true, 50, v_uid),
    (v_org_id, 'Quini 6', 'Otros juegos', true, 60, v_uid),
    (v_org_id, 'Brinco', 'Otros juegos', true, 70, v_uid),
    (v_org_id, 'Telekino', 'Otros juegos', true, 80, v_uid),
    (v_org_id, 'Quiniela Poceada Extra', 'Poceada', false, 130, v_uid),
    (v_org_id, 'Quiniela Poceada Navidad', 'Poceada', false, 140, v_uid),
    (v_org_id, 'Loto Plus Extra', 'Otros juegos', false, 150, v_uid)
  on conflict (organization_id, lower(name)) do nothing;

  return v_org_id;
end;
$function$;

revoke all on function public.bootstrap_agency_organization(text, text, text) from public, anon;
grant execute on function public.bootstrap_agency_organization(text, text, text) to authenticated;
