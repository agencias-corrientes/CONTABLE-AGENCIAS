-- Add only indexes that support frequent rendition joins, daily status lookups, and cash-account foreign keys.
-- Existing indexes are intentionally retained; usage statistics on Preview are too sparse to justify dropping any.
CREATE INDEX IF NOT EXISTS agency_agent_daily_status_agent_idx ON public.agency_agent_daily_status(agent_id);
CREATE INDEX IF NOT EXISTS agency_agent_draw_status_agent_idx ON public.agency_agent_draw_status(agent_id);
CREATE INDEX IF NOT EXISTS agency_agent_draw_status_rendition_idx ON public.agency_agent_draw_status(rendition_id);
CREATE INDEX IF NOT EXISTS agency_rendition_game_amounts_game_type_idx ON public.agency_rendition_game_amounts(game_type_id);
CREATE INDEX IF NOT EXISTS agency_rendition_payments_cash_account_idx ON public.agency_rendition_payments(cash_account_id);
CREATE INDEX IF NOT EXISTS agency_rendition_payments_cash_movement_idx ON public.agency_rendition_payments(cash_movement_id);
CREATE INDEX IF NOT EXISTS agency_rendition_payments_org_rendition_idx ON public.agency_rendition_payments(organization_id,rendition_id);
