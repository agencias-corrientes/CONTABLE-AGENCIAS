CREATE OR REPLACE FUNCTION public.delete_agency_prize_payment(p_organization_id uuid, p_prize_payment_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_payment public.agency_prize_payments%ROWTYPE;
  v_direction text;
  v_movement_amount numeric;
  v_journal_entry_id uuid;
  v_linked_payment_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Necesitás iniciar sesión para eliminar un premio' USING ERRCODE = '42501';
  END IF;
  IF NOT private.has_org_permission(p_organization_id, 'can_register_payments', v_actor)
     OR NOT EXISTS (
       SELECT 1 FROM public.organization_members m
       WHERE m.organization_id = p_organization_id
         AND m.user_id = v_actor
         AND m.role IN ('owner', 'admin', 'accountant')
     ) THEN
    RAISE EXCEPTION 'No tenés permiso para eliminar pagos de premios' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_payment
  FROM public.agency_prize_payments
  WHERE id = p_prize_payment_id AND organization_id = p_organization_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró el pago de premio';
  END IF;

  IF v_payment.cash_movement_id IS NOT NULL THEN
    SELECT cm.direction::text, cm.amount, cm.journal_entry_id, cm.payment_id
      INTO v_direction, v_movement_amount, v_journal_entry_id, v_linked_payment_id
    FROM public.cash_movements cm
    WHERE cm.id = v_payment.cash_movement_id
      AND cm.organization_id = p_organization_id
    FOR UPDATE;
    IF NOT FOUND OR v_direction <> 'outgoing' OR round(v_movement_amount, 2) <> round(v_payment.prize_amount, 2)
       OR v_journal_entry_id IS NOT NULL OR v_linked_payment_id IS NOT NULL THEN
      RAISE EXCEPTION 'El movimiento de Caja vinculado no coincide con este pago';
    END IF;
    UPDATE public.agency_prize_payments
    SET cash_movement_id = NULL
    WHERE id = p_prize_payment_id AND organization_id = p_organization_id;
    DELETE FROM public.cash_movements
    WHERE id = v_payment.cash_movement_id AND organization_id = p_organization_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'No se pudo eliminar el movimiento de Caja vinculado';
    END IF;
  END IF;

  INSERT INTO public.audit_log(organization_id, user_id, action, entity, entity_id, payload)
  VALUES (
    p_organization_id, v_actor, 'delete_agency_prize_payment', 'agency_prize_payment', p_prize_payment_id,
    jsonb_build_object(
      'coupon_number', v_payment.coupon_number,
      'prize_amount', v_payment.prize_amount,
      'payment_date', v_payment.payment_date,
      'cash_movement_id', v_payment.cash_movement_id
    )
  );

  DELETE FROM public.agency_prize_payments
  WHERE id = p_prize_payment_id AND organization_id = p_organization_id;
END;
$function$

REVOKE ALL ON FUNCTION public.delete_agency_prize_payment(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_agency_prize_payment(uuid, uuid) TO authenticated;
