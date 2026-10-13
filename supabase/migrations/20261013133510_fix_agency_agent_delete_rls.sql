-- Allow authorized staff to permanently delete only agents with no rendition history.
-- Agents with historical renditions remain archived through archive_agency_agent().
drop policy if exists agency_agents_delete on public.agency_agents;

create policy agency_agents_delete
on public.agency_agents
for delete
to authenticated
using (
  private.has_org_permission(
    organization_id,
    'can_delete_agents',
    (select auth.uid())
  )
  and not exists (
    select 1
    from public.agency_renditions rendition
    where rendition.agent_id = agency_agents.id
      and rendition.organization_id = agency_agents.organization_id
  )
);
