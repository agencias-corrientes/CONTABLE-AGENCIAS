-- Compatibilidad de Producción con el código ya probado en Preview.
-- No modifica datos operativos ni apunta Producción a la base aislada de pruebas.

CREATE OR REPLACE FUNCTION private.enforce_agency_agent_rendition_policy()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
DECLARE
  v_policy text;
  v_periods text[];
BEGIN
  SELECT a.rendition_policy, coalesce(a.rendition_periods, '{}'::text[])
  INTO v_policy, v_periods
  FROM public.agency_agents a
  WHERE a.id = NEW.agent_id AND a.organization_id = NEW.organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subagente o ambulante inexistente';
  END IF;

  IF v_policy = 'daily' THEN
    IF lower(btrim(coalesce(NEW.game_period, ''))) <> lower('Cierre diario') THEN
      RAISE EXCEPTION 'Este operador está configurado para una sola rendición de cierre diario';
    END IF;
  ELSIF v_policy = 'selected_draws' THEN
    IF NEW.game_period IS NULL OR NOT (NEW.game_period = ANY(v_periods)) THEN
      RAISE EXCEPTION 'El sorteo no está habilitado para este operador';
    END IF;
  ELSIF lower(btrim(coalesce(NEW.game_period, ''))) = lower('Cierre diario') THEN
    RAISE EXCEPTION 'El cierre diario solo corresponde a operadores configurados con esa modalidad';
  END IF;

  -- El tope horario queda eliminado; la jornada operativa sigue validándose
  -- por set_agency_agent_daily_status durante la misma transacción.
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.confirm_agency_daily_rendition(
  p_organization_id uuid,
  p_agent_id uuid,
  p_operational_date date,
  p_cash_account_id uuid DEFAULT NULL::uuid,
  p_payment_date date DEFAULT CURRENT_DATE,
  p_notes text DEFAULT NULL::text
)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_rendition_id uuid;
  v_net_due numeric;
  v_paid numeric;
  v_remaining numeric;
  v_cutoff time;
  v_local_now timestamp without time zone;
  v_current_operational_date date;
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_org_permission(
    p_organization_id, 'can_create_renditions', auth.uid()
  ) THEN
    RAISE EXCEPTION 'No tenés permiso para confirmar rendiciones';
  END IF;

  SELECT s.rendition_cutoff_time
  INTO v_cutoff
  FROM public.agency_operational_settings s
  WHERE s.organization_id = p_organization_id;
  v_cutoff := coalesce(v_cutoff, time '00:00');

  v_local_now := now() AT TIME ZONE 'America/Argentina/Cordoba';
  v_current_operational_date :=
    CASE WHEN v_local_now::time < v_cutoff
      THEN v_local_now::date - 1
      ELSE v_local_now::date
    END;

  IF p_operational_date IS DISTINCT FROM v_current_operational_date THEN
    RAISE EXCEPTION 'La jornada operativa cambió. Actualizá la pantalla e intentá de nuevo';
  END IF;

  SELECT r.id, coalesce(r.net_due, r.amount_due)
  INTO v_rendition_id, v_net_due
  FROM public.agency_renditions r
  WHERE r.organization_id = p_organization_id
    AND r.agent_id = p_agent_id
    AND r.rendition_date = p_operational_date
    AND lower(btrim(coalesce(r.game_period, ''))) = lower('Cierre diario')
    AND r.status <> 'void'
  ORDER BY r.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_rendition_id IS NULL OR v_net_due IS NULL THEN
    RAISE EXCEPTION 'No hay una rendición diaria para confirmar';
  END IF;

  SELECT coalesce(sum(p.amount), 0)
  INTO v_paid
  FROM public.agency_rendition_payments p
  WHERE p.organization_id = p_organization_id
    AND p.rendition_id = v_rendition_id;

  v_remaining := greatest(v_net_due - v_paid, 0);

  IF v_remaining > 0.005 THEN
    IF NOT private.has_org_permission(
      p_organization_id, 'can_register_payments', auth.uid()
    ) THEN
      RAISE EXCEPTION 'No tenés permiso para registrar el cobro pendiente';
    END IF;

    IF p_cash_account_id IS NULL OR NOT EXISTS (
      SELECT 1
      FROM public.cash_accounts c
      WHERE c.id = p_cash_account_id
        AND c.organization_id = p_organization_id
        AND c.is_active
    ) THEN
      RAISE EXCEPTION 'Caja no configurada';
    END IF;

    PERFORM public.receive_agency_rendition(
      p_organization_id,
      v_rendition_id,
      p_payment_date,
      v_remaining,
      p_cash_account_id,
      NULLIF(btrim(p_notes), ''),
      'Saldo restante al confirmar cierre diario'
    );
  END IF;

  PERFORM public.set_agency_agent_daily_status_with_amount(
    p_organization_id,
    p_agent_id,
    p_operational_date,
    'complete',
    NULLIF(btrim(p_notes), ''),
    v_net_due
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.confirm_agency_daily_rendition(uuid, uuid, date, uuid, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_agency_daily_rendition(uuid, uuid, date, uuid, date, text) TO authenticated;
