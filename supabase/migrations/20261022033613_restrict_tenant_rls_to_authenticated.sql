-- Restrict tenant RLS policies to signed-in users and remove anonymous data privileges.

alter policy agency_agent_daily_status_member_select on public.agency_agent_daily_status to authenticated;
alter policy agency_agent_draw_status_member_select on public.agency_agent_draw_status to authenticated;
alter policy agent_game_commissions_owner_delete on public.agency_agent_game_commissions to authenticated;
alter policy agent_game_commissions_owner_insert on public.agency_agent_game_commissions to authenticated;
alter policy agent_game_commissions_owner_update on public.agency_agent_game_commissions to authenticated;
alter policy agency_game_commission_defaults_owner_delete on public.agency_game_commission_defaults to authenticated;
alter policy agency_game_commission_defaults_owner_insert on public.agency_game_commission_defaults to authenticated;
alter policy agency_game_commission_defaults_owner_update on public.agency_game_commission_defaults to authenticated;
alter policy agency_game_types_member_select on public.agency_game_types to authenticated;
alter policy agency_game_types_owner_delete on public.agency_game_types to authenticated;
alter policy agency_game_types_owner_insert on public.agency_game_types to authenticated;
alter policy agency_game_types_owner_update on public.agency_game_types to authenticated;
alter policy agency_operational_settings_member_select on public.agency_operational_settings to authenticated;
alter policy agency_operational_settings_owner_insert on public.agency_operational_settings to authenticated;
alter policy agency_operational_settings_owner_update on public.agency_operational_settings to authenticated;
alter policy agency_rendition_backup_outbox_owner_select on public.agency_rendition_backup_outbox to authenticated;
alter policy agency_rendition_game_amounts_member_select on public.agency_rendition_game_amounts to authenticated;
alter policy agency_rendition_tickets_member_select on public.agency_rendition_tickets to authenticated;
alter policy organization_backup_settings_owner_all on public.organization_backup_settings to authenticated;
alter policy organization_member_permissions_owner_manage on public.organization_member_permissions to authenticated;
alter policy organization_member_permissions_self_select on public.organization_member_permissions to authenticated;
alter policy members_select on public.organization_members to authenticated;

revoke all on all tables in schema public from anon, public;
revoke all on all sequences in schema public from anon, public;

alter default privileges for role postgres in schema public
  revoke all on tables from anon, public;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, public;
