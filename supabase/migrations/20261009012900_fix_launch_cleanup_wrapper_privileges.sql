-- Ensure exposed RPC wrappers can enter the non-exposed private schema.
-- Delegated helpers independently verify auth.uid() is owner of the given organization.
create or replace function public.preview_agency_launch_cleanup(p_organization_id uuid)
returns jsonb language sql stable security definer set search_path = public, private, pg_temp
as $function$ select private.preview_agency_launch_cleanup(p_organization_id); $function$;
revoke all on function public.preview_agency_launch_cleanup(uuid) from public, anon;
grant execute on function public.preview_agency_launch_cleanup(uuid) to authenticated;

create or replace function public.cleanup_agency_test_data(p_organization_id uuid)
returns jsonb language sql security definer set search_path = public, private, pg_temp
as $function$ select private.clear_agency_launch_test_data(p_organization_id); $function$;
revoke all on function public.cleanup_agency_test_data(uuid) from public, anon;
grant execute on function public.cleanup_agency_test_data(uuid) to authenticated;
