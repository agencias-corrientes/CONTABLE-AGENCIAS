-- Compatibility hotfix for the currently deployed app: it attaches the OCR
-- JSON with a direct UPDATE after creating the financial rendition. Permit only
-- the OCR column for authenticated users; all financial changes remain RPC-only.
revoke update on table public.agency_renditions from authenticated;
grant update (ticket_receipt_data) on table public.agency_renditions to authenticated;

drop policy if exists agency_renditions_attach_daily_receipt on public.agency_renditions;
create policy agency_renditions_attach_daily_receipt
on public.agency_renditions
for update
to authenticated
using (
  private.has_org_permission(organization_id, 'can_create_renditions', auth.uid())
  and created_by = auth.uid()
  and lower(btrim(coalesce(game_period, ''))) = 'cierre diario'
)
with check (
  private.has_org_permission(organization_id, 'can_create_renditions', auth.uid())
  and created_by = auth.uid()
  and lower(btrim(coalesce(game_period, ''))) = 'cierre diario'
);
