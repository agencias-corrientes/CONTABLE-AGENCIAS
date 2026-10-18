-- Preserve the existing receipt payload format for official daily closures and
-- allow a bounded OCR transcript to be attached to any non-void rendition.
-- This stores informational ticket details only; it does not change finances.

create or replace function public.attach_agency_rendition_ticket_receipt_data(
  p_organization_id uuid,
  p_rendition_id uuid,
  p_receipt_data jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_updated_id uuid;
  v_ticket_count integer;
  v_unique_ticket_count integer;
  v_is_transcript boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Tenés que iniciar sesión para adjuntar el detalle del ticket';
  end if;

  if p_receipt_data is null then
    if not private.has_org_permission(p_organization_id, 'can_edit_renditions', auth.uid()) then
      raise exception 'No tenés permiso para quitar el detalle OCR de esta rendición';
    end if;
  else
    if jsonb_typeof(p_receipt_data) <> 'object' then
      raise exception 'El detalle OCR del ticket no es válido';
    end if;

    if p_receipt_data ->> 'type' = 'loteria-corrientes-ticket-ocr-v1' then
      v_is_transcript := true;
      if octet_length(p_receipt_data::text) > 20000
        or jsonb_typeof(p_receipt_data -> 'rawText') <> 'string'
        or length(btrim(p_receipt_data ->> 'rawText')) = 0
        or length(p_receipt_data ->> 'rawText') > 12000
        or (p_receipt_data ? 'ticketNumber' and jsonb_typeof(p_receipt_data -> 'ticketNumber') not in ('string', 'null')) then
        raise exception 'El texto OCR del ticket no es válido o supera el tamaño permitido';
      end if;
    elsif p_receipt_data ->> 'type' = 'loteria-corrientes-end-of-day-v1' then
      if octet_length(p_receipt_data::text) > 20000 then
        raise exception 'El detalle OCR del ticket supera el tamaño permitido';
      end if;
    elsif p_receipt_data ->> 'type' = 'loteria-corrientes-end-of-day-batch-v1' then
      if octet_length(p_receipt_data::text) > 200000
        or coalesce(p_receipt_data ->> 'userConfirmedReview','false') <> 'true'
        or jsonb_typeof(p_receipt_data -> 'tickets') <> 'array' then
        raise exception 'El lote OCR no está revisado o supera el tamaño permitido';
      end if;
      select count(*) into v_ticket_count from jsonb_array_elements(p_receipt_data -> 'tickets') t;
      if v_ticket_count < 1 or v_ticket_count > 12 then
        raise exception 'El lote debe contener entre 1 y 12 cupones';
      end if;
      if exists (
        select 1 from jsonb_array_elements(p_receipt_data -> 'tickets') t
        where jsonb_typeof(t) <> 'object'
          or t ->> 'type' <> 'loteria-corrientes-end-of-day-v1'
          or coalesce(t ->> 'userConfirmedReview','false') <> 'true'
      ) then
        raise exception 'El lote contiene un cupón no válido o no revisado';
      end if;
      select count(distinct coalesce(t ->> 'periodNumber','') || '|' ||
        coalesce(t #>> '{closedAt,date}', t #>> '{printedAt,date}', t #>> '{openedAt,date}', ''))
        into v_unique_ticket_count from jsonb_array_elements(p_receipt_data -> 'tickets') t;
      if v_unique_ticket_count <> v_ticket_count then
        raise exception 'El lote contiene un cupón repetido';
      end if;
    else
      raise exception 'El detalle OCR del ticket no es válido';
    end if;

    if v_is_transcript then
      if not (
        private.has_org_permission(p_organization_id, 'can_edit_renditions', auth.uid())
        or (
          private.has_org_permission(p_organization_id, 'can_create_renditions', auth.uid())
          and exists (
            select 1 from public.agency_renditions own_rendition
            where own_rendition.id = p_rendition_id
              and own_rendition.organization_id = p_organization_id
              and own_rendition.created_by = auth.uid()
              and own_rendition.status <> 'void'
          )
        )
      ) then
        raise exception 'No tenés permiso para adjuntar el detalle OCR de esta rendición';
      end if;
    elsif not (
      private.has_org_permission(p_organization_id, 'can_edit_renditions', auth.uid())
      or (
        private.has_org_permission(p_organization_id, 'can_create_renditions', auth.uid())
        and exists (
          select 1 from public.agency_renditions own_rendition
          where own_rendition.id = p_rendition_id
            and own_rendition.organization_id = p_organization_id
            and own_rendition.created_by = auth.uid()
            and lower(btrim(coalesce(own_rendition.game_period,''))) = 'cierre diario'
        )
      )
    ) then
      raise exception 'No tenés permiso para adjuntar el detalle OCR de esta rendición';
    end if;
  end if;

  update public.agency_renditions r
    set ticket_receipt_data = p_receipt_data,
        updated_at = now()
    where r.id = p_rendition_id
      and r.organization_id = p_organization_id
      and (
        (v_is_transcript and r.status <> 'void')
        or (not v_is_transcript and lower(btrim(coalesce(r.game_period,''))) = 'cierre diario')
      )
    returning r.id into v_updated_id;

  if v_updated_id is null then
    raise exception 'No se encontró una rendición válida para adjuntar el detalle OCR';
  end if;
  return true;
end;
$function$;

revoke all on function public.attach_agency_rendition_ticket_receipt_data(uuid, uuid, jsonb) from public, anon;
grant execute on function public.attach_agency_rendition_ticket_receipt_data(uuid, uuid, jsonb) to authenticated;
