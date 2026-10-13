-- Only a user-confirmed official closure ticket can bypass the scheduled final-draw time.
-- The sentinel is consumed by server validation and not persisted as status notes.
CREATE OR REPLACE FUNCTION public.create_agency_rendition_with_capture_and_daily_status(p_organization_id uuid, p_agent_id uuid, p_rendition_date date, p_amount_due numeric, p_operational_date date, p_daily_status text, p_game_breakdown jsonb DEFAULT '[]'::jsonb, p_ticket_numbers jsonb DEFAULT '[]'::jsonb, p_ticket_qr_payload text DEFAULT NULL::text, p_game_period text DEFAULT NULL::text, p_draw_number text DEFAULT NULL::text, p_capture_method text DEFAULT 'manual'::text, p_reference text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_daily_status_notes text DEFAULT NULL::text, p_reported_amount numeric DEFAULT NULL::numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_rendition_id uuid; v_cutoff time; v_local_now timestamp without time zone; v_operational_date date; v_deadline time;
BEGIN
  IF coalesce(p_daily_status,'') NOT IN ('complete','incomplete') THEN RAISE EXCEPTION 'El estado diario solicitado no es válido'; END IF;
  IF p_rendition_date IS DISTINCT FROM p_operational_date THEN RAISE EXCEPTION 'La fecha de la rendición debe coincidir con la jornada operativa'; END IF;
  IF p_reported_amount IS NULL OR round(p_reported_amount,2)<=0 OR p_reported_amount>999999999999.99 THEN RAISE EXCEPTION 'Ingresá un monto rendido válido para guardar la rendición'; END IF;
  IF p_daily_status='incomplete' AND round(p_reported_amount,2)>coalesce(p_amount_due,0) THEN RAISE EXCEPTION 'El monto rendido no puede ser mayor que el total registrado'; END IF;
  SELECT coalesce((SELECT s.rendition_cutoff_time FROM public.agency_operational_settings s WHERE s.organization_id=p_organization_id),time '00:00') INTO v_cutoff;
  v_local_now:=now() AT TIME ZONE 'America/Argentina/Cordoba';
  v_operational_date:=CASE WHEN v_local_now::time<v_cutoff THEN v_local_now::date-1 ELSE v_local_now::date END;
  IF p_operational_date IS DISTINCT FROM v_operational_date THEN RAISE EXCEPTION 'La jornada operativa cambió. Actualizá la pantalla e intentá de nuevo'; END IF;
  IF p_daily_status='complete' THEN
    v_deadline:=CASE extract(dow FROM v_local_now::date)::integer WHEN 3 THEN time '22:00' WHEN 6 THEN time '22:30' WHEN 0 THEN time '21:15' ELSE time '21:00' END;
    IF v_local_now::time<v_deadline AND coalesce(p_daily_status_notes,'') <> '__CONFIRMED_OFFICIAL_CLOSURE__' THEN RAISE EXCEPTION 'La confirmación completa se habilita después del último sorteo programado'; END IF;
    p_daily_status_notes:=NULL;
  END IF;
  PERFORM set_config('app.daily_rendition_status',p_daily_status,true);
  v_rendition_id:=public.create_agency_rendition_with_capture(
    p_organization_id,p_agent_id,p_rendition_date,p_amount_due,coalesce(p_game_breakdown,'[]'::jsonb),coalesce(p_ticket_numbers,'[]'::jsonb),
    p_ticket_qr_payload,p_game_period,p_draw_number,p_capture_method,p_reference,p_notes);
  PERFORM public.set_agency_agent_daily_status_with_amount(p_organization_id,p_agent_id,p_operational_date,p_daily_status,p_daily_status_notes,p_reported_amount);
  RETURN v_rendition_id;
END;
$function$

