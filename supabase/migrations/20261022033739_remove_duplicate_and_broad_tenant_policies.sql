-- Remove duplicate permissive policies so they cannot broaden access or add redundant checks.
-- Keep the equivalent explicit authenticated policies for each operation.

drop policy if exists agency_game_types_owner_delete on public.agency_game_types;
drop policy if exists agency_game_types_owner_insert on public.agency_game_types;
drop policy if exists agency_game_types_owner_update on public.agency_game_types;
drop policy if exists agency_game_types_member_select on public.agency_game_types;

drop policy if exists agency_rendition_game_amounts_member_select on public.agency_rendition_game_amounts;
drop policy if exists agency_rendition_tickets_member_select on public.agency_rendition_tickets;

drop policy if exists organization_backup_settings_owner_all on public.organization_backup_settings;

drop policy if exists organization_member_permissions_owner_manage on public.organization_member_permissions;
drop policy if exists organization_member_permissions_self_select on public.organization_member_permissions;

-- The older policy exposed the full membership roster to every member.
-- Keep the narrower policy that limits roster visibility to self and managers.
drop policy if exists member_select on public.organization_members;
