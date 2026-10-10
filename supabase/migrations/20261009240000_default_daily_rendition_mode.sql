-- Make one daily close the default for agency agents.
-- Preserve intentional policy selections and avoid switching an agent in the middle of an operational day.
begin;

alter table public.agency_agents
  alter column rendition_policy set default 'daily';

update public.agency_agents as agent
set rendition_policy = 'daily',
    rendition_periods = '{}'::text[],
    updated_at = now()
where agent.rendition_policy = 'per_draw'
  and not exists (
    select 1
    from public.audit_log as audit
    where audit.organization_id = agent.organization_id
      and audit.entity = 'agency_agents'
      and audit.entity_id = agent.id
      and audit.action = 'update_agency_agent_rendition_policy'
  )
  and not exists (
    select 1
    from public.agency_renditions as rendition
    left join public.agency_operational_settings as settings
      on settings.organization_id = rendition.organization_id
    cross join lateral (
      select now() at time zone 'America/Argentina/Cordoba' as local_now
    ) as clock
    where rendition.organization_id = agent.organization_id
      and rendition.agent_id = agent.id
      and rendition.status <> 'void'
      and (
        (rendition.created_at at time zone 'America/Argentina/Cordoba')::date
        - case
            when (rendition.created_at at time zone 'America/Argentina/Cordoba')::time
              < coalesce(settings.rendition_cutoff_time, time '00:00')
            then 1 else 0
          end
      ) = (
        clock.local_now::date
        - case
            when clock.local_now::time < coalesce(settings.rendition_cutoff_time, time '00:00')
            then 1 else 0
          end
      )
  );

commit;
