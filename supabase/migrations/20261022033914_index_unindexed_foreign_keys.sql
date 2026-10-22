-- Add covering indexes for foreign keys identified by Supabase's performance advisor.
-- These support joins and parent-row updates/deletes as agency data grows.

create index if not exists idx_auditfix_agent_daily_status_agent_id on public.agency_agent_daily_status (agent_id);
create index if not exists idx_auditfix_agent_daily_status_updated_by on public.agency_agent_daily_status (updated_by);
create index if not exists idx_auditfix_agent_draw_status_agent_org on public.agency_agent_draw_status (agent_id, organization_id);
create index if not exists idx_auditfix_agent_draw_status_rendition_org on public.agency_agent_draw_status (rendition_id, organization_id);
create index if not exists idx_auditfix_agent_draw_status_updated_by on public.agency_agent_draw_status (updated_by);
create index if not exists idx_auditfix_agent_game_commissions_agent_id on public.agency_agent_game_commissions (agent_id);
create index if not exists idx_auditfix_agent_game_commissions_created_by on public.agency_agent_game_commissions (created_by);
create index if not exists idx_auditfix_agent_game_commissions_game_type_id on public.agency_agent_game_commissions (game_type_id);
create index if not exists idx_auditfix_game_commission_defaults_created_by on public.agency_game_commission_defaults (created_by);
create index if not exists idx_auditfix_game_commission_defaults_game_type_id on public.agency_game_commission_defaults (game_type_id);
create index if not exists idx_auditfix_operational_settings_updated_by on public.agency_operational_settings (updated_by);
create index if not exists idx_auditfix_prize_payments_cash_account_id on public.agency_prize_payments (cash_account_id);
create index if not exists idx_auditfix_prize_payments_cash_movement_id on public.agency_prize_payments (cash_movement_id);
create index if not exists idx_auditfix_prize_payments_created_by on public.agency_prize_payments (created_by);
create index if not exists idx_auditfix_rendition_backup_outbox_org_id on public.agency_rendition_backup_outbox (organization_id);
create index if not exists idx_auditfix_rendition_backup_outbox_rendition_org on public.agency_rendition_backup_outbox (rendition_id, organization_id);
create index if not exists idx_auditfix_rendition_game_amounts_game_type_id on public.agency_rendition_game_amounts (game_type_id);
create index if not exists idx_auditfix_rendition_payments_rendition_org on public.agency_rendition_payments (rendition_id, organization_id);
create index if not exists idx_auditfix_renditions_agent_org on public.agency_renditions (agent_id, organization_id);
create index if not exists idx_auditfix_backup_settings_created_by on public.organization_backup_settings (created_by);
create index if not exists idx_auditfix_member_permissions_created_by on public.organization_member_permissions (created_by);
