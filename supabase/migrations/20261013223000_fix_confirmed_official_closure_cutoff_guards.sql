-- A reviewed official FIN DE JORNADA ticket may confirm the daily rendition before the normal cutoff.
-- Pass this explicit approval through the insert trigger and nested status validator; do not persist the marker.

CREATE OR REPLACE FUNCTION public.create_agency_rendition_with_capture_and_daily_status(
  p_organization_id uuid, p_agent_id uuid, p_rendition_date date, p_amount_due numeric,
  p_operational_date date, p_daily_status text, p_game_breakdown jsonb DEFAULT '[]'::jsonb,
  p_ticket_numbers jsonb DEFAULT '[]'::jsonb, p_ticket_qr_payload text DEFAULT NULL::text,
  p_game_period text DEFAULT NULL::text, p_draw_number text DEFAULT NULL::text,
  p_capture_method text DEFAULT 'manual'::text, p_reference text DEFAULT NULL::text,
  p_notes text DEFAULT NULL::text, p_daily_status_notes text DEFAULT NULL::text,
  p_reported_amount numeric DEFAULT NULL::numeric
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_rendition_id uuid;
  v_cutoff time;
  v_local_now timestamp without time zone;
  v_operational_date date;
  v_deadline time;
  v_confirmed_official_closure boolean;
BEGIN
  v_confirmed_official_closure :=
    coalesce(p_daily_status, '') = 'complete'
    AND coalesce(p_daily_status_notes, '') = '__CONFIRMED_OFFICIAL_CLOSURE__';
  PERFORM set_config('app.confirmed_official_closure', CASE WHEN v_confirmed_official_closure THEN 'true' ELSE 'false' END, true);

  IF coalesce(p_daily_status, '') NOT IN ('complete', 'incomplete') THEN RAISE EXCEPTION 'El estado diario solicitado no es válido'; END IF;
  IF p_rendition_date IS DISTINCT FROM p_operational_date THEN RAISE EXCEPTION 'La fecha de la rendición debe coincidir con la jornada operativa'; END IF;
  IF p_reported_amount IS NULL OR round(p_reported_amount, 2) <= 0 OR p_reported_amount > 999999999999.99 THEN RAISE EXCEPTION 'Ingresá un monto rendido válido para guardar la rendición'; END IF;
  IF p_daily_status = 'incomplete' AND round(p_reported_amount, 2) > coalesce(p_amount_due, 0) THEN RAISE EXCEPTION 'El monto rendido no puede ser mayor que el total registrado'; END IF;

  SELECT coalesce((SELECT s.rendition_cutoff_time FROM public.agency_operational_settings s WHERE s.organization_id = p_organization_id), time '00:00') INTO v_cutoff;
  v_local_now := now() AT TIME ZONE 'America/Argentina/Cordoba';
  v_operational_date := CASE WHEN v_local_now::time < v_cutoff THEN v_local_now::date - 1 ELSE v_local_now::date END;
  IF p_operational_date IS DISTINCT FROM v_operational_date THEN RAISE EXCEPTION 'La jornada operativa cambió. Actualizá la pantalla e intentá de nuevo'; END IF;

  IF p_daily_status = 'complete' THEN
    v_deadline := CASE extract(dow FROM v_local_now::date)::integer WHEN 3 THEN time '22:00' WHEN 6 THEN time '22:30' WHEN 0 THEN time '21:15' ELSE time '21:00' END;
    IF v_local_now::time < v_deadline AND NOT v_confirmed_official_closure THEN
      RAISE EXCEPTION 'La confirmación completa se habilita después del último sorteo programado';
    END IF;
    IF NOT v_confirmed_official_closure THEN p_daily_status_notes := NULL; END IF;
  END IF;

  PERFORM set_config('app.daily_rendition_status', p_daily_status, true);
  v_rendition_id := public.create_agency_rendition_with_capture(
    p_organization_id, p_agent_id, p_rendition_date, p_amount_due,
    coalesce(p_game_breakdown, '[]'::jsonb), coalesce(p_ticket_numbers, '[]'::jsonb),
    p_ticket_qr_payload, p_game_period, p_draw_number, p_capture_method, p_reference, p_notes
  );
  PERFORM public.set_agency_agent_daily_status_with_amount(
    p_organization_id, p_agent_id, p_operational_date, p_daily_status, p_daily_status_notes, p_reported_amount
  );
  RETURN v_rendition_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_agency_agent_daily_status_with_amount(
  p_organization_id uuid, p_agent_id uuid, p_operational_date date, p_status text,
  p_notes text DEFAULT NULL::text, p_reported_amount numeric DEFAULT NULL::numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_amount_due numeric;
  v_cutoff time;
  v_local_now timestamp without time zone;
  v_current_operational_date date;
  v_deadline time;
  v_confirmed_official_closure boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_org_permission(p_organization_id, 'can_create_renditions', auth.uid()) THEN RAISE EXCEPTION 'No tenés permiso para confirmar la rendición'; END IF;
  IF p_status NOT IN ('complete', 'incomplete') THEN RAISE EXCEPTION 'El estado diario solicitado no es válido'; END IF;
  IF p_reported_amount IS NULL OR round(p_reported_amount, 2) <= 0 OR p_reported_amount > 999999999999.99 THEN RAISE EXCEPTION 'Ingresá un monto rendido mayor que cero antes de guardar'; END IF;

  SELECT s.rendition_cutoff_time INTO v_cutoff FROM public.agency_operational_settings s WHERE s.organization_id = p_organization_id;
  v_cutoff := coalesce(v_cutoff, time '00:00');
  v_local_now := now() AT TIME ZONE 'America/Argentina/Cordoba';
  v_current_operational_date := CASE WHEN v_local_now::time < v_cutoff THEN v_local_now::date - 1 ELSE v_local_now::date END;
  IF p_operational_date IS DISTINCT FROM v_current_operational_date THEN RAISE EXCEPTION 'La jornada operativa cambió. Actualizá la pantalla e intentá de nuevo'; END IF;

  v_confirmed_official_closure := coalesce(current_setting('app.confirmed_official_closure', true), 'false') = 'true';
  IF p_status = 'complete' THEN
    v_deadline := CASE extract(dow FROM v_local_now::date)::integer WHEN 3 THEN time '22:00' WHEN 6 THEN time '22:30' WHEN 0 THEN time '21:15' ELSE time '21:00' END;
    IF v_local_now::time < v_deadline AND NOT v_confirmed_official_closure THEN RAISE EXCEPTION 'La confirmación completa se habilita después del último sorteo programado'; END IF;
  END IF;

  SELECT r.amount_due INTO v_amount_due
  FROM public.agency_renditions r
  WHERE r.organization_id = p_organization_id AND r.agent_id = p_agent_id
    AND r.rendition_date = p_operational_date AND lower(btrim(coalesce(r.game_period, ''))) = lower('Cierre diario')
    AND r.status <> 'void'
  ORDER BY r.created_at DESC LIMIT 1;
  IF v_amount_due IS NULL THEN RAISE EXCEPTION 'No hay una rendición diaria para guardar'; END IF;
  IF round(p_reported_amount, 2) > v_amount_due THEN RAISE EXCEPTION 'El monto rendido no puede superar el total registrado'; END IF;

  PERFORM public.set_agency_agent_daily_status(p_organization_id, p_agent_id, p_operational_date, p_status, p_notes);

  UPDATE public.agency_agent_daily_status
  SET reported_amount = round(p_reported_amount, 2), updated_at = now(), updated_by = auth.uid()
  WHERE organization_id = p_organization_id AND agent_id = p_agent_id AND operational_date = p_operational_date;
  IF NOT FOUND THEN RAISE EXCEPTION 'No se pudo guardar el monto rendido'; END IF;

  INSERT INTO public.audit_log(organization_id, user_id, action, entity, entity_id, payload)
  VALUES (p_organization_id, auth.uid(), 'record_agency_agent_reported_amount', 'agency_agent_daily_status', p_agent_id,
    jsonb_build_object('operational_date', p_operational_date, 'status', p_status, 'reported_amount', round(p_reported_amount, 2)));
END;
$function$;

CREATE OR REPLACE FUNCTION private.enforce_agency_agent_rendition_policy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
DECLARE
  v_policy text;
  v_periods text[];
  v_daily_status text;
  v_confirmed_official_closure boolean;
  v_local_now timestamp without time zone;
  v_deadline time;
BEGIN
  SELECT a.rendition_policy, coalesce(a.rendition_periods, '{}'::text[]) INTO v_policy, v_periods
  FROM public.agency_agents a WHERE a.id = NEW.agent_id AND a.organization_id = NEW.organization_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Subagente o ambulante inexistente'; END IF;

  IF v_policy = 'daily' THEN
    IF lower(btrim(coalesce(NEW.game_period, ''))) <> lower('Cierre diario') THEN RAISE EXCEPTION 'Este operador está configurado para una sola rendición de cierre diario'; END IF;
    v_daily_status := coalesce(current_setting('app.daily_rendition_status', true), '');
    v_confirmed_official_closure := coalesce(current_setting('app.confirmed_official_closure', true), 'false') = 'true';
    IF v_daily_status NOT IN ('complete', 'incomplete') THEN RAISE EXCEPTION 'Registrá la rendición diaria con su estado completo o incompleto'; END IF;

    IF v_daily_status = 'complete' THEN
      v_local_now := now() AT TIME ZONE 'America/Argentina/Cordoba';
      v_deadline := CASE extract(dow FROM v_local_now::date)::integer WHEN 3 THEN time '22:00' WHEN 6 THEN time '22:30' WHEN 0 THEN time '21:15' ELSE time '21:00' END;
      IF v_local_now::time < v_deadline AND NOT v_confirmed_official_closure THEN RAISE EXCEPTION 'La confirmación completa se habilita después del último sorteo programado'; END IF;
    END IF;
  ELSIF v_policy = 'selected_draws' THEN
    IF NEW.game_period IS NULL OR NOT (NEW.game_period = ANY(v_periods)) THEN RAISE EXCEPTION 'El sorteo no está habilitado para este operador'; END IF;
  ELSIF lower(btrim(coalesce(NEW.game_period, ''))) = lower('Cierre diario') THEN
    RAISE EXCEPTION 'El cierre diario solo corresponde a operadores configurados con esa modalidad';
  END IF;
  RETURN NEW;
END;
$function$;
