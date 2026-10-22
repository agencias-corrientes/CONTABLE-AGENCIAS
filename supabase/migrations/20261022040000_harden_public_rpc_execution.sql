-- Restrict privileged database functions and archived commission data.
-- Applied to production on 2026-10-22 and recorded here for repeatable deployments.
-- Administrative RPCs remain available to authenticated users; each function validates
-- the caller as a platform administrator internally.

begin;

revoke execute on function public.delete_platform_agency(uuid, text, text) from public, anon;
revoke execute on function public.delete_platform_user(uuid, text, text) from public, anon;
revoke execute on function public.list_platform_agencies_and_users_v2() from public, anon;
revoke execute on function public.update_platform_agency_city(uuid, text) from public, anon;
revoke execute on function public.update_platform_agency_code(uuid, text) from public, anon;

grant execute on function public.delete_platform_agency(uuid, text, text) to authenticated, service_role;
grant execute on function public.delete_platform_user(uuid, text, text) to authenticated, service_role;
grant execute on function public.list_platform_agencies_and_users_v2() to authenticated, service_role;
grant execute on function public.update_platform_agency_city(uuid, text) to authenticated, service_role;
grant execute on function public.update_platform_agency_code(uuid, text) to authenticated, service_role;

-- Trigger-only function: it should not be callable as a user-facing RPC.
revoke execute on function public.recompute_agency_rendition_net_due() from public, anon, authenticated;
grant execute on function public.recompute_agency_rendition_net_due() to service_role;

-- These SECURITY DEFINER wrappers call the private functions as their owner.
-- Prevent direct invocation of the private cleanup routines by API roles.
revoke execute on function private.preview_agency_launch_cleanup(uuid) from public, anon, authenticated;
revoke execute on function private.clear_agency_launch_test_data(uuid) from public, anon, authenticated;
grant execute on function private.preview_agency_launch_cleanup(uuid) to service_role;
grant execute on function private.clear_agency_launch_test_data(uuid) to service_role;

-- This archive has RLS enabled but intentionally no policies; remove table-level
-- API grants as defense in depth. The privileged backend role retains access.
revoke all on table public.agency_agent_game_commissions_archive from public, anon, authenticated;

commit;
