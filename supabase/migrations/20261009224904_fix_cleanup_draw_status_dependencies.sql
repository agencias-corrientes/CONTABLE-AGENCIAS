-- Fix the cleanup order for draw statuses that reference rendition rows.
-- Replacing these owner-only RPC functions does not execute any cleanup or delete any data.
create or replace function private.preview_agency_launch_cleanup(p_organization_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = public, private, pg_temp as $function$
declare v_counts jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id and m.user_id = auth.uid() and m.role = 'owner'
  ) then
    raise exception 'Solo el titular de la agencia puede revisar o borrar datos de prueba' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'subagentes_ambulantes', (select count(*)::int from public.agency_agents where organization_id = p_organization_id),
    'rendiciones', (select count(*)::int from public.agency_renditions where organization_id = p_organization_id),
    'cobros_rendiciones', (select count(*)::int from public.agency_rendition_payments where organization_id = p_organization_id),
    'importes_por_juego', (select count(*)::int from public.agency_rendition_game_amounts where organization_id = p_organization_id),
    'tickets', (select count(*)::int from public.agency_rendition_tickets where organization_id = p_organization_id),
    'respaldos_operativos', (select count(*)::int from public.agency_rendition_backup_outbox where organization_id = p_organization_id),
    'estados_por_sorteo', (select count(*)::int from public.agency_agent_draw_status where organization_id = p_organization_id),
    'estados_diarios_asociados', (select count(*)::int from public.agency_agent_daily_status where organization_id = p_organization_id),
    'comisiones_por_agente_a_archivar', (select count(*)::int from public.agency_agent_game_commissions where organization_id = p_organization_id),
    'comisiones_globales_conservadas', (select count(*)::int from public.agency_game_commission_defaults where organization_id = p_organization_id),
    'juegos_conservados', (select count(*)::int from public.agency_game_types where organization_id = p_organization_id)
  ) into v_counts;
  return v_counts;
end;
$function$;
revoke all on function private.preview_agency_launch_cleanup(uuid) from public, anon;
grant execute on function private.preview_agency_launch_cleanup(uuid) to authenticated;

create or replace function private.clear_agency_launch_test_data(p_organization_id uuid)
returns jsonb language plpgsql security definer
set search_path = public, private, pg_temp as $function$
declare v_counts jsonb; v_global_commissions integer; v_games integer; v_archived integer;
begin
  if auth.uid() is null or not exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id and m.user_id = auth.uid() and m.role = 'owner'
  ) then
    raise exception 'Solo el titular de la agencia puede borrar datos de prueba' using errcode = '42501';
  end if;
  v_counts := private.preview_agency_launch_cleanup(p_organization_id);
  select count(*)::int into v_global_commissions from public.agency_game_commission_defaults where organization_id = p_organization_id;
  select count(*)::int into v_games from public.agency_game_types where organization_id = p_organization_id;
  insert into public.agency_agent_game_commissions_archive
    (organization_id, original_agent_id, agent_code, agent_name, game_type_id, commission_percent, created_by, original_created_at, original_updated_at)
  select c.organization_id, c.agent_id, a.code, a.full_name, c.game_type_id, c.commission_percent, c.created_by, c.created_at, c.updated_at
  from public.agency_agent_game_commissions c join public.agency_agents a on a.id = c.agent_id
  where c.organization_id = p_organization_id;
  get diagnostics v_archived = row_count;
  delete from public.agency_rendition_payments where organization_id = p_organization_id;
  delete from public.agency_rendition_tickets where organization_id = p_organization_id;
  delete from public.agency_rendition_game_amounts where organization_id = p_organization_id;
  delete from public.agency_rendition_backup_outbox where organization_id = p_organization_id;
  -- The FK agency_agent_draw_status_rendition_org_fkey uses RESTRICT.
  delete from public.agency_agent_draw_status where organization_id = p_organization_id;
  delete from public.agency_daily_closings where organization_id = p_organization_id;
  delete from public.agency_renditions where organization_id = p_organization_id;
  delete from public.agency_agents where organization_id = p_organization_id;
  return v_counts || jsonb_build_object(
    'completed', true, 'comisiones_globales_conservadas', v_global_commissions,
    'juegos_conservados', v_games, 'comisiones_por_agente_archivadas', v_archived,
    'usuarios_auth_no_modificados', true
  );
end;
$function$;
revoke all on function private.clear_agency_launch_test_data(uuid) from public, anon;
grant execute on function private.clear_agency_launch_test_data(uuid) to authenticated;

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
