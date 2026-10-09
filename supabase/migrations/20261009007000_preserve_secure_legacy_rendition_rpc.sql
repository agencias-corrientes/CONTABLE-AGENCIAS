-- Preserve compatibility with the currently deployed UI while requiring the new rendition permission.
create or replace function public.create_agency_rendition(
  p_organization_id uuid,
  p_agent_id uuid,
  p_rendition_date date,
  p_period_start date,
  p_period_end date,
  p_amount_due numeric,
  p_reference text default null,
  p_notes text default null,
  p_game_breakdown jsonb default '[]'::jsonb,
  p_ticket_numbers jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare v_id uuid; v_total numeric; v_item record; v_ticket text;
begin
  if not private.has_org_permission(p_organization_id, 'can_create_renditions', auth.uid()) then
    raise exception 'No tenés permiso para registrar rendiciones';
  end if;
  if not exists (select 1 from public.agency_agents where id=p_agent_id and organization_id=p_organization_id and is_active) then
    raise exception 'Operador inválido';
  end if;
  if jsonb_typeof(p_game_breakdown) <> 'array' then raise exception 'La distribución por juegos es inválida'; end if;
  if jsonb_typeof(p_ticket_numbers) <> 'array' then raise exception 'Los números de ticket son inválidos'; end if;

  select coalesce(sum((item->>'amount')::numeric),0) into v_total
  from jsonb_array_elements(p_game_breakdown) item
  where coalesce((item->>'amount')::numeric,0)>0;
  if v_total<=0 then raise exception 'Ingresá al menos un importe por juego'; end if;
  if abs(v_total-coalesce(p_amount_due,v_total))>0.005 then
    raise exception 'La suma de los juegos no coincide con el total de la rendición';
  end if;

  insert into public.agency_renditions(organization_id,agent_id,rendition_date,period_start,period_end,amount_due,reference,notes,created_by)
  values(p_organization_id,p_agent_id,p_rendition_date,p_period_start,p_period_end,v_total,
    nullif(trim(p_reference),''),nullif(trim(p_notes),''),auth.uid())
  returning id into v_id;

  for v_item in
    select (item->>'game_type_id')::uuid as game_type_id,(item->>'amount')::numeric as amount
    from jsonb_array_elements(p_game_breakdown) item where coalesce((item->>'amount')::numeric,0)>0
  loop
    if not exists(select 1 from public.agency_game_types where id=v_item.game_type_id and organization_id=p_organization_id and enabled) then
      raise exception 'Tipo de juego inválido o inactivo';
    end if;
    insert into public.agency_rendition_game_amounts(organization_id,rendition_id,game_type_id,amount,created_by)
    values(p_organization_id,v_id,v_item.game_type_id,v_item.amount,auth.uid());
  end loop;

  for v_ticket in
    select distinct trim(value) from jsonb_array_elements_text(p_ticket_numbers) value where length(trim(value))>0
  loop
    insert into public.agency_rendition_tickets(organization_id,rendition_id,ticket_number,created_by)
    values(p_organization_id,v_id,v_ticket,auth.uid())
    on conflict (rendition_id,ticket_number) do nothing;
  end loop;

  insert into public.audit_log(organization_id,user_id,action,entity,entity_id,payload)
  values(p_organization_id,auth.uid(),'create','agency_rendition',v_id,
    jsonb_build_object('agent_id',p_agent_id,'amount_due',v_total,'game_breakdown',p_game_breakdown,
      'ticket_count',jsonb_array_length(p_ticket_numbers)));
  return v_id;
end;
$function$;

revoke all on function public.create_agency_rendition(uuid, uuid, date, date, date, numeric, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_agency_rendition(uuid, uuid, date, date, date, numeric, text, text, jsonb, jsonb) to authenticated;
