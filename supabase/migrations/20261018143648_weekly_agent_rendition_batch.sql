-- Weekly settlement schedules and reviewed multi-coupon closure batches.
alter table public.agency_agents
  add column if not exists rendition_frequency text not null default 'daily',
  add column if not exists rendition_weekdays text[] not null default array['mon','tue','wed','thu','fri','sat']::text[];

do $constraints$
begin
  if not exists (select 1 from pg_constraint where conname='agency_agents_rendition_frequency_ck' and conrelid='public.agency_agents'::regclass) then
    alter table public.agency_agents add constraint agency_agents_rendition_frequency_ck
      check (rendition_frequency in ('daily','weekly')
        and rendition_weekdays <@ array['mon','tue','wed','thu','fri','sat','sun']::text[]
        and (rendition_frequency <> 'weekly' or cardinality(rendition_weekdays)>0));
  end if;
end;
$constraints$;

create or replace function public.update_agency_agent_rendition_schedule(
  p_organization_id uuid, p_agent_id uuid, p_frequency text,
  p_weekdays text[] default array['mon','tue','wed','thu','fri','sat']::text[]
)
returns void language plpgsql security definer
set search_path = public, private, pg_temp
as $function$
declare v_days text[];
begin
  if auth.uid() is null or not exists (
    select 1 from public.organization_members m
    where m.organization_id=p_organization_id and m.user_id=auth.uid() and m.role='owner'
  ) then
    raise exception 'Solo el titular puede cambiar los días de rendición' using errcode='42501';
  end if;
  if p_frequency not in ('daily','weekly') then raise exception 'La frecuencia de rendición no es válida'; end if;
  select coalesce(array_agg(distinct d order by d), '{}'::text[]) into v_days
  from unnest(coalesce(p_weekdays, '{}'::text[])) as d
  where d = any(array['mon','tue','wed','thu','fri','sat','sun']::text[]);
  if coalesce(array_length(p_weekdays,1),0) <> coalesce(array_length(v_days,1),0)
     or (p_frequency='weekly' and cardinality(v_days)=0) then
    raise exception 'Seleccioná uno o más días válidos para la rendición semanal';
  end if;
  update public.agency_agents set rendition_frequency=p_frequency, rendition_weekdays=v_days, updated_at=now()
  where id=p_agent_id and organization_id=p_organization_id;
  if not found then raise exception 'No se encontró el subagente o ambulante seleccionado'; end if;
end;
$function$;

revoke all on function public.update_agency_agent_rendition_schedule(uuid,uuid,text,text[]) from public, anon;
grant execute on function public.update_agency_agent_rendition_schedule(uuid,uuid,text,text[]) to authenticated;

create or replace function public.attach_agency_rendition_ticket_receipt_data(
  p_organization_id uuid, p_rendition_id uuid, p_receipt_data jsonb
)
returns boolean language plpgsql security definer
set search_path = public, private, pg_temp
as $function$
declare v_updated_id uuid; v_ticket_count integer; v_unique_ticket_count integer;
begin
  if auth.uid() is null then raise exception 'Tenés que iniciar sesión para adjuntar el detalle del ticket'; end if;
  if p_receipt_data is null then
    if not private.has_org_permission(p_organization_id, 'can_edit_renditions', auth.uid()) then
      raise exception 'No tenés permiso para quitar el detalle OCR de esta rendición';
    end if;
  else
    if jsonb_typeof(p_receipt_data) <> 'object' then raise exception 'El detalle OCR del ticket no es válido'; end if;
    if p_receipt_data ->> 'type' = 'loteria-corrientes-end-of-day-v1' then
      if octet_length(p_receipt_data::text) > 20000 then raise exception 'El detalle OCR del ticket supera el tamaño permitido'; end if;
    elsif p_receipt_data ->> 'type' = 'loteria-corrientes-end-of-day-batch-v1' then
      if octet_length(p_receipt_data::text) > 200000
        or coalesce(p_receipt_data ->> 'userConfirmedReview','false') <> 'true'
        or jsonb_typeof(p_receipt_data -> 'tickets') <> 'array' then
        raise exception 'El lote OCR no está revisado o supera el tamaño permitido';
      end if;
      select count(*) into v_ticket_count from jsonb_array_elements(p_receipt_data -> 'tickets') t;
      if v_ticket_count < 1 or v_ticket_count > 12 then raise exception 'El lote debe contener entre 1 y 12 cupones'; end if;
      if exists (select 1 from jsonb_array_elements(p_receipt_data -> 'tickets') t
        where jsonb_typeof(t) <> 'object' or t ->> 'type' <> 'loteria-corrientes-end-of-day-v1'
          or coalesce(t ->> 'userConfirmedReview','false') <> 'true') then
        raise exception 'El lote contiene un cupón no válido o no revisado';
      end if;
      select count(distinct coalesce(t ->> 'periodNumber','') || '|' ||
        coalesce(t #>> '{closedAt,date}', t #>> '{printedAt,date}', t #>> '{openedAt,date}', ''))
        into v_unique_ticket_count from jsonb_array_elements(p_receipt_data -> 'tickets') t;
      if v_unique_ticket_count <> v_ticket_count then raise exception 'El lote contiene un cupón repetido'; end if;
    else
      raise exception 'El detalle OCR del ticket no es válido';
    end if;
    if not (
      private.has_org_permission(p_organization_id, 'can_edit_renditions', auth.uid())
      or (private.has_org_permission(p_organization_id, 'can_create_renditions', auth.uid())
        and exists (select 1 from public.agency_renditions own_rendition
          where own_rendition.id=p_rendition_id and own_rendition.organization_id=p_organization_id
            and own_rendition.created_by=auth.uid()
            and lower(btrim(coalesce(own_rendition.game_period,'')))='cierre diario'))
    ) then raise exception 'No tenés permiso para adjuntar el detalle OCR de esta rendición'; end if;
  end if;
  update public.agency_renditions r set ticket_receipt_data=p_receipt_data, updated_at=now()
  where r.id=p_rendition_id and r.organization_id=p_organization_id
    and lower(btrim(coalesce(r.game_period,'')))='cierre diario'
  returning r.id into v_updated_id;
  if v_updated_id is null then raise exception 'No se encontró una rendición diaria válida para adjuntar el detalle OCR'; end if;
  return true;
end;
$function$;
revoke all on function public.attach_agency_rendition_ticket_receipt_data(uuid,uuid,jsonb) from public, anon;
grant execute on function public.attach_agency_rendition_ticket_receipt_data(uuid,uuid,jsonb) to authenticated;
