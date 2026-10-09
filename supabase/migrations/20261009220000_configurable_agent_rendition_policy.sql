-- Configurable rendition policy per subagent/ambulant.
-- Existing operators remain in per-draw mode unless the owner explicitly changes them.
alter table public.agency_agents
  add column if not exists rendition_policy text not null default 'per_draw',
  add column if not exists rendition_periods text[] not null default '{}'::text[];

do $constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='agency_agents_rendition_policy_ck'
      and conrelid='public.agency_agents'::regclass
  ) then
    alter table public.agency_agents add constraint agency_agents_rendition_policy_ck
      check (
        rendition_policy in ('per_draw','selected_draws','daily')
        and rendition_periods <@ array[
          'La Previa','Matutina','Vespertina','Nocturna','Quiniela Poceada Correntina',
          'Loto Plus','Loto 5 Plus','Quini 6','Brinco','Al Toque (acumulado diario)'
        ]::text[]
        and (rendition_policy <> 'selected_draws' or cardinality(rendition_periods)>0)
      );
  end if;
end;
$constraints$;

create or replace function public.update_agency_agent_rendition_policy(
  p_organization_id uuid, p_agent_id uuid, p_policy text, p_periods text[] default '{}'::text[]
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_periods text[];
  v_previous_policy text;
  v_previous_periods text[];
  v_cutoff time;
  v_local_now timestamp without time zone;
  v_operational_date date;
begin
  if auth.uid() is null or not exists (
    select 1 from public.organization_members m
    where m.organization_id=p_organization_id and m.user_id=auth.uid() and m.role='owner'
  ) then
    raise exception 'Solo el titular puede cambiar la modalidad de rendición' using errcode='42501';
  end if;
  if p_policy not in ('per_draw','selected_draws','daily') then
    raise exception 'La modalidad de rendición no es válida';
  end if;

  select coalesce(array_agg(cleaned.period order by cleaned.period), '{}'::text[]) into v_periods
  from (
    select distinct btrim(value) as period
    from unnest(coalesce(p_periods, '{}'::text[])) as supplied(value)
    where nullif(btrim(value), '') is not null
  ) cleaned;

  if p_policy <> 'selected_draws' then
    v_periods := '{}'::text[];
  elsif cardinality(v_periods)=0 then
    raise exception 'Seleccioná al menos un sorteo para esta modalidad';
  end if;

  if exists (
    select 1 from unnest(v_periods) as selected(period)
    where selected.period <> all (array[
      'La Previa','Matutina','Vespertina','Nocturna','Quiniela Poceada Correntina',
      'Loto Plus','Loto 5 Plus','Quini 6','Brinco','Al Toque (acumulado diario)'
    ]::text[])
  ) then
    raise exception 'Hay un sorteo seleccionado que no pertenece al cronograma habilitado';
  end if;

  select a.rendition_policy,a.rendition_periods into v_previous_policy,v_previous_periods
  from public.agency_agents a where a.id=p_agent_id and a.organization_id=p_organization_id for update;
  if not found then raise exception 'No encontramos ese subagente o ambulante'; end if;

  if v_previous_policy is distinct from p_policy or coalesce(v_previous_periods,'{}'::text[]) is distinct from v_periods then
    select coalesce((select s.rendition_cutoff_time from public.agency_operational_settings s where s.organization_id=p_organization_id),time '00:00') into v_cutoff;
    v_local_now := now() at time zone 'America/Argentina/Cordoba';
    v_operational_date := case when v_local_now::time < v_cutoff then v_local_now::date-1 else v_local_now::date end;
    if exists (
      select 1 from public.agency_renditions r
      where r.organization_id=p_organization_id and r.agent_id=p_agent_id and r.status<>'void'
        and (
          (r.created_at at time zone 'America/Argentina/Cordoba')::date
          - case when (r.created_at at time zone 'America/Argentina/Cordoba')::time < v_cutoff then 1 else 0 end
        )=v_operational_date
    ) then raise exception 'No se puede cambiar la modalidad durante una jornada con rendiciones registradas'; end if;
  end if;

  update public.agency_agents set rendition_policy=p_policy,rendition_periods=v_periods,updated_at=now()
  where id=p_agent_id and organization_id=p_organization_id;
  insert into public.audit_log(organization_id,user_id,action,entity,entity_id,payload)
  values(p_organization_id,auth.uid(),'update_agency_agent_rendition_policy','agency_agents',p_agent_id,
    jsonb_build_object('rendition_policy',p_policy,'rendition_periods',v_periods));
end;
$function$;

revoke all on function public.update_agency_agent_rendition_policy(uuid,uuid,text,text[]) from public,anon;
grant execute on function public.update_agency_agent_rendition_policy(uuid,uuid,text,text[]) to authenticated;

create or replace function private.enforce_agency_agent_rendition_policy()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_policy text;
  v_periods text[];
  v_cutoff time;
  v_local_now timestamp without time zone;
  v_operational_date date;
  v_daily_close_deadline time;
begin
  select a.rendition_policy,coalesce(a.rendition_periods,'{}'::text[]) into v_policy,v_periods
  from public.agency_agents a where a.id=new.agent_id and a.organization_id=new.organization_id;
  if not found then raise exception 'Subagente o ambulante inexistente'; end if;

  if v_policy='daily' then
    if lower(btrim(coalesce(new.game_period,'')))<>lower('Cierre diario') then
      raise exception 'Este operador está configurado para una sola rendición de cierre diario';
    end if;

    select coalesce((select s.rendition_cutoff_time from public.agency_operational_settings s where s.organization_id=new.organization_id),time '00:00')
      into v_cutoff;
    v_local_now := now() at time zone 'America/Argentina/Cordoba';
    v_operational_date := case when v_local_now::time < v_cutoff then v_local_now::date-1 else v_local_now::date end;
    v_daily_close_deadline := case extract(dow from v_local_now::date)::integer
      when 3 then time '22:00'
      when 6 then time '22:30'
      when 0 then time '21:15'
      else time '21:00'
    end;

    if v_operational_date=new.rendition_date
       and v_local_now::date=new.rendition_date
       and v_local_now::time < v_daily_close_deadline then
      raise exception 'El cierre diario se habilita después del último sorteo programado de la jornada';
    end if;
  elsif v_policy='selected_draws' then
    if new.game_period is null or not (new.game_period=any(v_periods)) then
      raise exception 'El sorteo no está habilitado para este operador';
    end if;
  elsif lower(btrim(coalesce(new.game_period,'')))=lower('Cierre diario') then
    raise exception 'El cierre diario solo corresponde a operadores configurados con esa modalidad';
  end if;
  return new;
end;
$function$;

drop trigger if exists enforce_agency_agent_rendition_policy on public.agency_renditions;
create trigger enforce_agency_agent_rendition_policy before insert on public.agency_renditions
for each row execute function private.enforce_agency_agent_rendition_policy();
