-- OCR/QR capture metadata and safe agent deletion.
alter table public.agency_renditions
  add column if not exists game_period text,
  add column if not exists draw_number text,
  add column if not exists capture_method text not null default 'manual'
    check (capture_method in ('manual', 'photo', 'qr'));

alter table public.agency_rendition_tickets
  add column if not exists ticket_qr_payload text;

drop policy if exists agency_agents_delete on public.agency_agents;
create policy agency_agents_delete on public.agency_agents
for delete to authenticated
using (
  private.is_org_manager(organization_id, (select auth.uid()))
  and not exists (
    select 1 from public.agency_renditions rendition
    where rendition.agent_id = agency_agents.id
  )
);

create or replace function public.create_agency_rendition_with_capture(
  p_organization_id uuid,
  p_agent_id uuid,
  p_rendition_date date,
  p_amount_due numeric,
  p_game_breakdown jsonb default '[]'::jsonb,
  p_ticket_numbers jsonb default '[]'::jsonb,
  p_ticket_qr_payload text default null,
  p_game_period text default null,
  p_draw_number text default null,
  p_capture_method text default 'manual',
  p_reference text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_id uuid;
  v_total numeric;
  v_item record;
  v_ticket text;
begin
  if not exists (
    select 1 from public.organization_members
    where organization_id = p_organization_id
      and user_id = auth.uid()
      and role in ('owner','admin','accountant')
  ) then raise exception 'Sin permisos'; end if;

  if not exists (
    select 1 from public.agency_agents
    where id = p_agent_id and organization_id = p_organization_id and is_active
  ) then raise exception 'Operador inválido o inactivo'; end if;

  if jsonb_typeof(p_game_breakdown) <> 'array' then
    raise exception 'La distribución por juegos es inválida';
  end if;
  if jsonb_typeof(p_ticket_numbers) <> 'array' then
    raise exception 'Los números de ticket son inválidos';
  end if;
  if coalesce(p_capture_method, 'manual') not in ('manual', 'photo', 'qr') then
    raise exception 'Método de lectura inválido';
  end if;

  select coalesce(sum((item->>'amount')::numeric), 0)
    into v_total
  from jsonb_array_elements(p_game_breakdown) item
  where coalesce((item->>'amount')::numeric, 0) > 0;

  if v_total <= 0 then raise exception 'Ingresá al menos un importe por juego'; end if;
  if abs(v_total - coalesce(p_amount_due, v_total)) > 0.005 then
    raise exception 'La suma de los juegos no coincide con el total de la rendición';
  end if;

  insert into public.agency_renditions(
    organization_id, agent_id, rendition_date, period_start, period_end,
    amount_due, reference, notes, game_period, draw_number, capture_method, created_by
  )
  values(
    p_organization_id, p_agent_id, p_rendition_date, p_rendition_date, p_rendition_date,
    v_total, nullif(trim(p_reference), ''), nullif(trim(p_notes), ''),
    nullif(trim(p_game_period), ''), nullif(trim(p_draw_number), ''),
    coalesce(p_capture_method, 'manual'), auth.uid()
  )
  returning id into v_id;

  for v_item in
    select (item->>'game_type_id')::uuid as game_type_id,
           (item->>'amount')::numeric as amount
    from jsonb_array_elements(p_game_breakdown) item
    where coalesce((item->>'amount')::numeric, 0) > 0
  loop
    if not exists (
      select 1 from public.agency_game_types
      where id = v_item.game_type_id
        and organization_id = p_organization_id
        and enabled
    ) then raise exception 'Tipo de juego inválido o inactivo'; end if;

    insert into public.agency_rendition_game_amounts(
      organization_id, rendition_id, game_type_id, amount, created_by
    )
    values(p_organization_id, v_id, v_item.game_type_id, v_item.amount, auth.uid());
  end loop;

  for v_ticket in
    select distinct trim(value)
    from jsonb_array_elements_text(p_ticket_numbers) value
    where length(trim(value)) > 0
  loop
    insert into public.agency_rendition_tickets(
      organization_id, rendition_id, ticket_number, created_by
    )
    values(p_organization_id, v_id, v_ticket, auth.uid())
    on conflict (rendition_id, ticket_number) do nothing;
  end loop;

  if nullif(trim(p_ticket_qr_payload), '') is not null then
    insert into public.agency_rendition_tickets(
      organization_id, rendition_id, ticket_number, ticket_qr_payload, created_by
    )
    values(
      p_organization_id, v_id, left(trim(p_ticket_qr_payload), 160),
      trim(p_ticket_qr_payload), auth.uid()
    )
    on conflict (rendition_id, ticket_number)
    do update set ticket_qr_payload = excluded.ticket_qr_payload;
  end if;

  insert into public.audit_log(organization_id,user_id,action,entity,entity_id,payload)
  values(
    p_organization_id,auth.uid(),'create','agency_rendition',v_id,
    jsonb_build_object(
      'agent_id',p_agent_id,
      'amount_due',v_total,
      'game_period',p_game_period,
      'draw_number',p_draw_number,
      'capture_method',p_capture_method,
      'game_breakdown',p_game_breakdown,
      'ticket_count',jsonb_array_length(p_ticket_numbers),
      'qr_detected',nullif(trim(p_ticket_qr_payload),'') is not null
    )
  );

  return v_id;
end;
$function$;

revoke all on function public.create_agency_rendition_with_capture(
  uuid, uuid, date, numeric, jsonb, jsonb, text, text, text, text, text, text
) from public, anon;
grant execute on function public.create_agency_rendition_with_capture(
  uuid, uuid, date, numeric, jsonb, jsonb, text, text, text, text, text, text
) to authenticated;
