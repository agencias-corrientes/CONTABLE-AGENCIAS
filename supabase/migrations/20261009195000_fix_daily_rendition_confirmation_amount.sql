-- Fix the one-step daily rendition confirmation amount validation.
-- This replaces the original RPC definition without altering historical migration files.
CREATE OR REPLACE FUNCTION public.create_agency_rendition_with_capture_and_daily_status(
  p_organization_id uuid,
  p_agent_id uuid,
  p_rendition_date date,
  p_amount_due numeric,
  p_operational_date date,
  p_daily_status text,
  p_game_breakdown jsonb DEFAULT '[]'::jsonb,
  p_ticket_numbers jsonb DEFAULT '[]'::jsonb,
  p_ticket_qr_payload text DEFAULT NULL::text,
  p_game_period text DEFAULT NULL::text,
  p_draw_number text DEFAULT NULL::text,
  p_capture_method text DEFAULT 'manual'::text,
  p_reference text DEFAULT NULL::text,
  p_notes text DEFAULT NULL::text,
  p_daily_status_notes text DEFAULT NULL::text,
  p_reported_amount numeric DEFAULT NULL::numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_rendition_id uuid;
begin
  if coalesce(p_daily_status, '') not in ('complete', 'incomplete') then
    raise exception 'El estado diario solicitado no es válido';
  end if;

  if p_daily_status = 'incomplete' and (
    p_reported_amount is null
    or round(p_reported_amount, 2) <= 0
    or p_reported_amount > 999999999999.99
  ) then
    raise exception 'Ingresá un monto rendido válido para guardar como incompleta';
  end if;

  if p_daily_status = 'complete' then
    p_daily_status_notes := null;
    if p_reported_amount is null or round(p_reported_amount, 2) <= 0 then
      raise exception 'El monto informado debe ser mayor que cero para confirmar la rendición';
    end if;
  end if;

  v_rendition_id := public.create_agency_rendition_with_capture(
    p_organization_id,
    p_agent_id,
    p_rendition_date,
    p_amount_due,
    coalesce(p_game_breakdown, '[]'::jsonb),
    coalesce(p_ticket_numbers, '[]'::jsonb),
    p_ticket_qr_payload,
    p_game_period,
    p_draw_number,
    p_capture_method,
    p_reference,
    p_notes
  );

  -- Both operations run in the same database transaction; if the daily status
  -- cannot be recorded, the rendition and its audit/outbox effects roll back.
  perform public.set_agency_agent_daily_status_with_amount(
    p_organization_id,
    p_agent_id,
    p_operational_date,
    p_daily_status,
    p_daily_status_notes,
    p_reported_amount
  );

  return v_rendition_id;
end;
$function$;

REVOKE ALL ON FUNCTION public.create_agency_rendition_with_capture_and_daily_status(
  uuid, uuid, date, numeric, date, text, jsonb, jsonb, text, text, text, text, text, text, text, numeric
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_agency_rendition_with_capture_and_daily_status(
  uuid, uuid, date, numeric, date, text, jsonb, jsonb, text, text, text, text, text, text, text, numeric
) TO authenticated;
