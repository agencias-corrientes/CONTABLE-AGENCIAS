-- Tighten attachment rights: creators can attach/recover OCR only on their own
-- daily closure; users with edit permission can repair any closure in their agency.
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
begin
  if auth.uid() is null then
    raise exception 'Tenés que iniciar sesión para adjuntar el detalle del ticket';
  end if;

  if p_receipt_data is null then
    if not private.has_org_permission(p_organization_id, 'can_edit_renditions', auth.uid()) then
      raise exception 'No tenés permiso para quitar el detalle OCR de esta rendición';
    end if;
  else
    if jsonb_typeof(p_receipt_data) <> 'object'
      or p_receipt_data ->> 'type' <> 'loteria-corrientes-end-of-day-v1'
      or octet_length(p_receipt_data::text) > 20000 then
      raise exception 'El detalle OCR del ticket no es válido o supera el tamaño permitido';
    end if;

    if not (
      private.has_org_permission(p_organization_id, 'can_edit_renditions', auth.uid())
      or (
        private.has_org_permission(p_organization_id, 'can_create_renditions', auth.uid())
        and exists (
          select 1
          from public.agency_renditions own_rendition
          where own_rendition.id = p_rendition_id
            and own_rendition.organization_id = p_organization_id
            and own_rendition.created_by = auth.uid()
            and lower(btrim(coalesce(own_rendition.game_period, ''))) = 'cierre diario'
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
      and lower(btrim(coalesce(r.game_period, ''))) = 'cierre diario'
    returning r.id into v_updated_id;

  if v_updated_id is null then
    raise exception 'No se encontró el cierre diario existente de esta agencia';
  end if;

  return true;
end;
$function$;

revoke all on function public.attach_agency_rendition_ticket_receipt_data(uuid, uuid, jsonb) from public, anon;
grant execute on function public.attach_agency_rendition_ticket_receipt_data(uuid, uuid, jsonb) to authenticated;
