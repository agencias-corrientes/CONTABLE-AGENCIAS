-- General commission defaults per game. Individual rows remain optional overrides.
create table if not exists public.agency_game_commission_defaults (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  game_type_id uuid not null references public.agency_game_types(id) on delete cascade,
  commission_percent numeric(5,2) not null default 0 check (commission_percent between 0 and 100),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, game_type_id)
);
create index if not exists agency_game_commission_defaults_org_idx on public.agency_game_commission_defaults(organization_id);
alter table public.agency_game_commission_defaults enable row level security;
revoke all on public.agency_game_commission_defaults from anon;
grant select, insert, update, delete on public.agency_game_commission_defaults to authenticated;

drop policy if exists agency_game_commission_defaults_member_select on public.agency_game_commission_defaults;
create policy agency_game_commission_defaults_member_select on public.agency_game_commission_defaults for select to authenticated
using (private.is_org_member(organization_id, (select auth.uid())));

drop policy if exists agency_game_commission_defaults_owner_insert on public.agency_game_commission_defaults;
create policy agency_game_commission_defaults_owner_insert on public.agency_game_commission_defaults for insert to authenticated
with check (exists (select 1 from public.organization_members m where m.organization_id=agency_game_commission_defaults.organization_id and m.user_id=(select auth.uid()) and m.role='owner'));

drop policy if exists agency_game_commission_defaults_owner_update on public.agency_game_commission_defaults;
create policy agency_game_commission_defaults_owner_update on public.agency_game_commission_defaults for update to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id=agency_game_commission_defaults.organization_id and m.user_id=(select auth.uid()) and m.role='owner'))
with check (exists (select 1 from public.organization_members m where m.organization_id=agency_game_commission_defaults.organization_id and m.user_id=(select auth.uid()) and m.role='owner'));

drop policy if exists agency_game_commission_defaults_owner_delete on public.agency_game_commission_defaults;
create policy agency_game_commission_defaults_owner_delete on public.agency_game_commission_defaults for delete to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id=agency_game_commission_defaults.organization_id and m.user_id=(select auth.uid()) and m.role='owner'));

create or replace function private.snapshot_agency_agent_game_commission()
returns trigger language plpgsql security definer set search_path=public,private,pg_temp
as $function$
declare v_agent_id uuid; v_percent numeric(5,2);
begin
  select r.agent_id into v_agent_id from public.agency_renditions r
  where r.id=new.rendition_id and r.organization_id=new.organization_id;
  if v_agent_id is null then raise exception 'No se encontró el agente de la rendición'; end if;

  select c.commission_percent into v_percent from public.agency_agent_game_commissions c
  where c.organization_id=new.organization_id and c.agent_id=v_agent_id and c.game_type_id=new.game_type_id;
  if not found then
    select d.commission_percent into v_percent from public.agency_game_commission_defaults d
    where d.organization_id=new.organization_id and d.game_type_id=new.game_type_id;
  end if;
  new.commission_percent:=coalesce(v_percent,0);
  new.commission_amount:=round((new.amount*new.commission_percent)/100.0,2);
  return new;
end;
$function$;
revoke all on function private.snapshot_agency_agent_game_commission() from public,anon,authenticated;

create or replace function public.list_organization_members_for_owner(p_organization_id uuid)
returns table(
  user_id uuid, email text, full_name text, role public.organization_role,
  can_create_agents boolean, can_delete_agents boolean, can_create_renditions boolean,
  can_edit_renditions boolean, can_delete_renditions boolean, can_register_payments boolean,
  can_manage_backups boolean
)
language plpgsql security definer set search_path=public,pg_temp
as $function$
begin
  if not exists (
    select 1 from public.organization_members as requester
    where requester.organization_id=p_organization_id
      and requester.user_id=(select auth.uid())
      and requester.role='owner'
  ) then
    raise exception 'Solo el titular puede administrar permisos' using errcode='42501';
  end if;

  return query
  select member.user_id, users.email::text, coalesce(profiles.full_name,'')::text, member.role,
    coalesce(permissions.can_create_agents,false),
    coalesce(permissions.can_delete_agents,false),
    coalesce(permissions.can_create_renditions,false),
    coalesce(permissions.can_edit_renditions,false),
    coalesce(permissions.can_delete_renditions,false),
    coalesce(permissions.can_register_payments,false),
    coalesce(permissions.can_manage_backups,false)
  from public.organization_members as member
  join auth.users as users on users.id=member.user_id
  left join public.profiles as profiles on profiles.id=member.user_id
  left join public.organization_member_permissions as permissions
    on permissions.organization_id=member.organization_id and permissions.user_id=member.user_id
  where member.organization_id=p_organization_id
  order by case member.role when 'owner' then 0 when 'admin' then 1 else 2 end, users.email;
end;
$function$;
revoke all on function public.list_organization_members_for_owner(uuid) from public,anon;
grant execute on function public.list_organization_members_for_owner(uuid) to authenticated;
