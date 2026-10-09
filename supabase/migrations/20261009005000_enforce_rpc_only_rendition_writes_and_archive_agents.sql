-- Enforce database writes through permission-checked RPCs.
revoke insert, update, delete on public.agency_agents from authenticated;
grant delete on public.agency_agents to authenticated;
revoke insert, update, delete on public.agency_renditions from authenticated;
revoke insert, update, delete on public.agency_rendition_game_amounts from authenticated;
revoke insert, update, delete on public.agency_rendition_tickets from authenticated;
revoke insert, update, delete on public.agency_rendition_payments from authenticated;

-- Employee collections create cash movements inside receive_agency_rendition().
-- Direct ledger changes require owner/admin.
drop policy if exists cash_movements_insert on public.cash_movements;
create policy cash_movements_insert on public.cash_movements
for insert to authenticated
with check (private.has_org_role(organization_id, array['owner'::public.organization_role,'admin'::public.organization_role], (select auth.uid())));
drop policy if exists cash_movements_update on public.cash_movements;
create policy cash_movements_update on public.cash_movements
for update to authenticated
using (private.has_org_role(organization_id, array['owner'::public.organization_role,'admin'::public.organization_role], (select auth.uid())))
with check (private.has_org_role(organization_id, array['owner'::public.organization_role,'admin'::public.organization_role], (select auth.uid())));
drop policy if exists cash_movements_delete on public.cash_movements;
create policy cash_movements_delete on public.cash_movements
for delete to authenticated
using (private.has_org_role(organization_id, array['owner'::public.organization_role,'admin'::public.organization_role], (select auth.uid())));

create or replace function public.archive_agency_agent(
  p_organization_id uuid,
  p_agent_id uuid,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare v_agent public.agency_agents%rowtype;
begin
  if not private.has_org_permission(p_organization_id, 'can_delete_agents', auth.uid()) then
    raise exception 'No tenés permiso para eliminar o archivar agentes';
  end if;
  select * into v_agent from public.agency_agents
  where id=p_agent_id and organization_id=p_organization_id
  for update;
  if not found then raise exception 'Agente no encontrado'; end if;
  if not exists(select 1 from public.agency_renditions where agent_id=p_agent_id and organization_id=p_organization_id) then
    raise exception 'El agente no tiene historial y debe eliminarse directamente';
  end if;
  update public.agency_agents set is_active=false
  where id=p_agent_id and organization_id=p_organization_id;
  insert into public.audit_log(organization_id,user_id,action,entity,entity_id,payload)
  values(p_organization_id,auth.uid(),'archive','agency_agent',p_agent_id,
    jsonb_build_object('code',v_agent.code,'name',v_agent.full_name,'reason',coalesce(nullif(trim(p_reason),''),'baja solicitada')));
  return p_agent_id;
end;
$function$;

revoke all on function public.archive_agency_agent(uuid, uuid, text) from public, anon;
grant execute on function public.archive_agency_agent(uuid, uuid, text) to authenticated;
