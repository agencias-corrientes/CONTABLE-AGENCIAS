-- Confirm the daily rendition and collect any remaining balance atomically.
CREATE OR REPLACE FUNCTION public.confirm_agency_daily_rendition(
  p_organization_id uuid,
  p_agent_id uuid,
  p_operational_date date,
  p_cash_account_id uuid DEFAULT NULL,
  p_payment_date date DEFAULT CURRENT_DATE,
  p_notes text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $function$
DECLARE
  v_rendition_id uuid; v_due numeric; v_paid numeric; v_remaining numeric;
  v_cutoff time; v_local_now timestamp without time zone; v_current_operational_date date; v_deadline time;
BEGIN
  IF NOT private.has_org_permission(p_organization_id, 'can_create_renditions', auth.uid()) THEN RAISE EXCEPTION 'No tenés permiso para confirmar rendiciones'; END IF;
  SELECT s.rendition_cutoff_time INTO v_cutoff FROM public.agency_operational_settings s WHERE s.organization_id=p_organization_id;
  v_cutoff := coalesce(v_cutoff, time '00:00');
  v_local_now := now() AT TIME ZONE 'America/Argentina/Cordoba';
  v_current_operational_date := CASE WHEN v_local_now::time < v_cutoff THEN v_local_now::date - 1 ELSE v_local_now::date END;
  IF p_operational_date IS DISTINCT FROM v_current_operational_date THEN RAISE EXCEPTION 'La jornada operativa cambió. Actualizá la pantalla e intentá de nuevo'; END IF;
  v_deadline := CASE extract(dow FROM v_local_now::date)::integer WHEN 3 THEN time '22:00' WHEN 6 THEN time '22:30' WHEN 0 THEN time '21:15' ELSE time '21:00' END;
  IF v_local_now::time < v_deadline THEN RAISE EXCEPTION 'La confirmación completa se habilita después del último sorteo programado'; END IF;
  SELECT r.id, r.amount_due INTO v_rendition_id, v_due FROM public.agency_renditions r
  WHERE r.organization_id=p_organization_id AND r.agent_id=p_agent_id AND r.rendition_date=p_operational_date
    AND lower(btrim(coalesce(r.game_period,'')))=lower('Cierre diario') AND r.status <> 'void'
  ORDER BY r.created_at DESC LIMIT 1 FOR UPDATE;
  IF v_rendition_id IS NULL THEN RAISE EXCEPTION 'No hay una rendición diaria para confirmar'; END IF;
  SELECT coalesce(sum(p.amount),0) INTO v_paid FROM public.agency_rendition_payments p WHERE p.organization_id=p_organization_id AND p.rendition_id=v_rendition_id;
  v_remaining := greatest(v_due-v_paid,0);
  IF v_remaining > 0.005 THEN
    IF NOT private.has_org_permission(p_organization_id, 'can_register_payments', auth.uid()) THEN RAISE EXCEPTION 'No tenés permiso para registrar el cobro pendiente'; END IF;
    IF p_cash_account_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.cash_accounts c WHERE c.id=p_cash_account_id AND c.organization_id=p_organization_id AND c.is_active) THEN RAISE EXCEPTION 'Caja no configurada'; END IF;
    PERFORM public.receive_agency_rendition(p_organization_id,v_rendition_id,p_payment_date,v_remaining,p_cash_account_id,NULLIF(trim(p_notes),''),'Saldo restante al confirmar cierre diario');
  END IF;
  PERFORM public.set_agency_agent_daily_status_with_amount(p_organization_id,p_agent_id,p_operational_date,'complete',NULLIF(trim(p_notes),''),v_due);
END;
$function$;
REVOKE ALL ON FUNCTION public.confirm_agency_daily_rendition(uuid,uuid,date,uuid,date,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_agency_daily_rendition(uuid,uuid,date,uuid,date,text) TO authenticated;
