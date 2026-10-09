create table if not exists public.agency_operational_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  rendition_cutoff_time time not null default time '00:00',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint agency_operational_settings_cutoff_valid
    check (rendition_cutoff_time >= time '00:00' and rendition_cutoff_time < time '24:00')
);
alter table public.agency_operational_settings enable row level security;
revoke all on public.agency_operational_settings from anon;
grant select, insert, update on public.agency_operational_settings to authenticated;

drop policy if exists agency_operational_settings_member_select on public.agency_operational_settings;
create policy agency_operational_settings_member_select
  on public.agency_operational_settings for select to authenticated
  using (private.is_org_member(organization_id, (select auth.uid())));

drop policy if exists agency_operational_settings_owner_insert on public.agency_operational_settings;
create policy agency_operational_settings_owner_insert
  on public.agency_operational_settings for insert to authenticated
  with check (exists (
    select 1 from public.organization_members member
    where member.organization_id = agency_operational_settings.organization_id
      and member.user_id = (select auth.uid()) and member.role = 'owner'
  ));

drop policy if exists agency_operational_settings_owner_update on public.agency_operational_settings;
create policy agency_operational_settings_owner_update
  on public.agency_operational_settings for update to authenticated
  using (exists (
    select 1 from public.organization_members member
    where member.organization_id = agency_operational_settings.organization_id
      and member.user_id = (select auth.uid()) and member.role = 'owner'
  ))
  with check (exists (
    select 1 from public.organization_members member
    where member.organization_id = agency_operational_settings.organization_id
      and member.user_id = (select auth.uid()) and member.role = 'owner'
  ));
