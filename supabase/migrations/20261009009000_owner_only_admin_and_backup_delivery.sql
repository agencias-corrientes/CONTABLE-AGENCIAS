-- Only the official agency owner has administrator powers; employee flags grant specific abilities.
create or replace function private.has_org_permission(
  p_organization_id uuid,
  p_permission text,
  p_user_id uuid default auth.uid()
)
returns boolean language sql stable security definer set search_path=public,private,pg_temp as $function$
 select exists(select 1 from public.organization_members member where member.organization_id=p_organization_id and member.user_id=p_user_id and member.role='owner')
 or coalesce((select case p_permission
   when 'can_create_agents' then permissions.can_create_agents when 'can_delete_agents' then permissions.can_delete_agents
   when 'can_create_renditions' then permissions.can_create_renditions when 'can_edit_renditions' then permissions.can_edit_renditions
   when 'can_delete_renditions' then permissions.can_delete_renditions when 'can_register_payments' then permissions.can_register_payments
   when 'can_manage_backups' then permissions.can_manage_backups else false end
  from public.organization_member_permissions permissions where permissions.organization_id=p_organization_id and permissions.user_id=p_user_id),false);
$function$;
revoke all on function private.has_org_permission(uuid,text,uuid) from public,anon;
grant execute on function private.has_org_permission(uuid,text,uuid) to authenticated;

drop policy if exists agency_game_types_insert on public.agency_game_types;
create policy agency_game_types_insert on public.agency_game_types for insert to authenticated
with check(exists(select 1 from public.organization_members m where m.organization_id=agency_game_types.organization_id and m.user_id=(select auth.uid()) and m.role='owner'));
drop policy if exists agency_game_types_update on public.agency_game_types;
create policy agency_game_types_update on public.agency_game_types for update to authenticated
using(exists(select 1 from public.organization_members m where m.organization_id=agency_game_types.organization_id and m.user_id=(select auth.uid()) and m.role='owner'))
with check(exists(select 1 from public.organization_members m where m.organization_id=agency_game_types.organization_id and m.user_id=(select auth.uid()) and m.role='owner'));
drop policy if exists agency_game_types_delete on public.agency_game_types;
create policy agency_game_types_delete on public.agency_game_types for delete to authenticated
using(exists(select 1 from public.organization_members m where m.organization_id=agency_game_types.organization_id and m.user_id=(select auth.uid()) and m.role='owner'));

drop policy if exists agency_rendition_backup_outbox_member_select on public.agency_rendition_backup_outbox;
drop policy if exists agency_rendition_backup_outbox_owner_select on public.agency_rendition_backup_outbox;
create policy agency_rendition_backup_outbox_owner_select on public.agency_rendition_backup_outbox for select to authenticated
using(exists(select 1 from public.organization_members m where m.organization_id=agency_rendition_backup_outbox.organization_id and m.user_id=(select auth.uid()) and m.role='owner'));
