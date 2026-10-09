-- Prevent a duplicate agent code within the same organization and agent type.
create unique index if not exists agency_agents_org_kind_code_uq
  on public.agency_agents (organization_id, kind, code);

-- SECURITY DEFINER routines exposed through the public schema must not be callable
-- without signing in. Internal authorization still runs inside each function.
revoke all on function public.close_agency_day(uuid, date, text) from public, anon;
grant execute on function public.close_agency_day(uuid, date, text) to authenticated;

revoke all on function public.create_agency_agent(uuid, public.agency_agent_kind, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.create_agency_agent(uuid, public.agency_agent_kind, text, text, text, text, text, text, text) to authenticated;

revoke all on function public.create_agency_rendition(uuid, uuid, date, date, date, numeric, text, text) from public, anon;
grant execute on function public.create_agency_rendition(uuid, uuid, date, date, date, numeric, text, text) to authenticated;

revoke all on function public.create_agency_rendition(uuid, uuid, date, date, date, numeric, text, text, jsonb) from public, anon;
grant execute on function public.create_agency_rendition(uuid, uuid, date, date, date, numeric, text, text, jsonb) to authenticated;

revoke all on function public.create_agency_rendition(uuid, uuid, date, date, date, numeric, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.create_agency_rendition(uuid, uuid, date, date, date, numeric, text, text, jsonb, jsonb) to authenticated;

revoke all on function public.create_agency_rendition_with_capture(uuid, uuid, date, numeric, jsonb, jsonb, text, text, text, text, text, text) from public, anon;
grant execute on function public.create_agency_rendition_with_capture(uuid, uuid, date, numeric, jsonb, jsonb, text, text, text, text, text, text) to authenticated;

revoke all on function public.receive_agency_rendition(uuid, uuid, date, numeric, uuid, text, text) from public, anon;
grant execute on function public.receive_agency_rendition(uuid, uuid, date, numeric, uuid, text, text) to authenticated;

revoke all on function public.record_agency_rendition(uuid, uuid, date, date, date, numeric, numeric, uuid, text, text) from public, anon;
grant execute on function public.record_agency_rendition(uuid, uuid, date, date, date, numeric, numeric, uuid, text, text) to authenticated;
