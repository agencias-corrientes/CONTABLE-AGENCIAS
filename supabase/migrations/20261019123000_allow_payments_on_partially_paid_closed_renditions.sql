CREATE OR REPLACE FUNCTION public.receive_agency_rendition(
  p_organization_id uuid,
  p_rendition_id uuid,
  p_payment_date date,
  p_amount numeric,
  p_cash_account_id uuid,
  p_reference text DEFAULT NULL::text,
  p_notes text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_payment_id uuid;
  v_movement_id uuid;
  v_due numeric;
  v_paid numeric;
  v_agent_name text;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = p_organization_id
      AND user_id = auth.uid()
      AND role IN ('owner','admin','accountant')
  ) THEN
    RAISE EXCEPTION 'Sin permisos para registrar cobros';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'El importe debe ser mayor que cero';
  END IF;
  IF p_payment_date IS NULL THEN
    RAISE EXCEPTION 'Indicá la fecha del cobro';
  END IF;

  -- A confirmed/closed rendition may still have an unpaid balance.
  -- Only void renditions are forbidden; paid total is checked below.
  SELECT COALESCE(r.net_due, r.amount_due), a.full_name
    INTO v_due, v_agent_name
  FROM public.agency_renditions r
  JOIN public.agency_agents a ON a.id = r.agent_id
  WHERE r.id = p_rendition_id
    AND r.organization_id = p_organization_id
    AND r.status <> 'void'
  FOR UPDATE OF r;

  IF v_due IS NULL THEN
    RAISE EXCEPTION 'No se encontró una rendición vigente para cobrar';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.cash_accounts
    WHERE id = p_cash_account_id
      AND organization_id = p_organization_id
      AND is_active
  ) THEN
    RAISE EXCEPTION 'La cuenta Caja no existe o está inactiva';
  END IF;

  SELECT COALESCE(SUM(amount), 0)
    INTO v_paid
  FROM public.agency_rendition_payments
  WHERE rendition_id = p_rendition_id
    AND organization_id = p_organization_id;

  IF round(v_paid + p_amount, 2) > round(v_due, 2) THEN
    RAISE EXCEPTION 'El cobro supera el saldo pendiente de la rendición';
  END IF;

  INSERT INTO public.agency_rendition_payments(
    organization_id, rendition_id, payment_date, amount,
    cash_account_id, reference, notes
  ) VALUES (
    p_organization_id, p_rendition_id, p_payment_date, round(p_amount,2),
    p_cash_account_id, p_reference, p_notes
  ) RETURNING id INTO v_payment_id;

  INSERT INTO public.cash_movements(
    organization_id, cash_account_id, movement_date, direction, amount, description
  ) VALUES (
    p_organization_id, p_cash_account_id, p_payment_date, 'incoming',
    round(p_amount,2), COALESCE(p_reference, 'Cobro de rendición de ' || v_agent_name)
  ) RETURNING id INTO v_movement_id;

  UPDATE public.agency_rendition_payments
  SET cash_movement_id = v_movement_id
  WHERE id = v_payment_id;

  IF round(v_paid + p_amount, 2) >= round(v_due, 2) THEN
    UPDATE public.agency_renditions
    SET status = 'closed', closed_at = COALESCE(closed_at, now()), updated_at = now()
    WHERE id = p_rendition_id AND organization_id = p_organization_id;
  END IF;

  INSERT INTO public.audit_log(organization_id, user_id, action, entity, entity_id, payload)
  VALUES (
    p_organization_id, auth.uid(), 'receive', 'agency_rendition', p_rendition_id,
    jsonb_build_object(
      'payment_id', v_payment_id,
      'amount', round(p_amount,2),
      'agent_name', v_agent_name,
      'previously_paid', round(v_paid,2),
      'new_paid_total', round(v_paid + p_amount,2),
      'net_due', round(v_due,2),
      'closed', round(v_paid + p_amount,2) >= round(v_due,2)
    )
  );

  RETURN v_payment_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.receive_agency_rendition(uuid, uuid, date, numeric, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receive_agency_rendition(uuid, uuid, date, numeric, uuid, text, text) TO authenticated;