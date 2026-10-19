CREATE OR REPLACE FUNCTION public.update_agency_prize_payment(p_organization_id uuid, p_prize_payment_id uuid, p_coupon_number text, p_prize_amount numeric, p_payment_date date, p_game_name text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_included_in_ticket_ocr boolean DEFAULT false)
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
  v_coupon text := btrim(coalesce(p_coupon_number, ''));
  v_old_amount numeric;
  v_old_coupon text;
  v_old_date date;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Necesitás iniciar sesión para corregir un premio' USING ERRCODE = '42501';
  END IF;
  IF NOT private.has_org_permission(p_organization_id, 'can_register_payments', v_actor)
     OR NOT EXISTS (
       SELECT 1 FROM public.organization_members m
       WHERE m.organization_id = p_organization_id
         AND m.user_id = v_actor
         AND m.role IN ('owner', 'admin', 'accountant')
     ) THEN
    RAISE EXCEPTION 'No tenés permiso para corregir pagos de premios' USING ERRCODE = '42501';
  END IF;
  IF v_coupon = '' OR length(v_coupon) > 128 OR regexp_replace(upper(v_coupon), '[^A-Z0-9]', '', 'g') = '' THEN
    RAISE EXCEPTION 'Ingresá un número de cupón válido';
  END IF;
  IF p_prize_amount IS NULL OR p_prize_amount <= 0 OR p_prize_amount > 999999999999.99 THEN
    RAISE EXCEPTION 'Ingresá un importe de premio mayor que cero';
  END IF;
  IF p_payment_date IS NULL THEN
    RAISE EXCEPTION 'La fecha del pago no es válida';
  END IF;

  SELECT * INTO v_payment
  FROM public.agency_prize_payments
  WHERE id = p_prize_payment_id AND organization_id = p_organization_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró el pago de premio';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.agency_prize_payments p
    WHERE p.organization_id = p_organization_id
      AND p.id <> p_prize_payment_id
      AND p.normalized_coupon_number = regexp_replace(upper(v_coupon), '[^A-Z0-9]', '', 'g')
  ) THEN
    RAISE EXCEPTION 'Ese cupón ya tiene un premio pagado registrado en esta agencia' USING ERRCODE = '23505';
  END IF;

  v_old_amount := v_payment.prize_amount;
  v_old_coupon := v_payment.coupon_number;
  v_old_date := v_payment.payment_date;
  IF v_payment.cash_movement_id IS NULL THEN
    INSERT INTO public.cash_movements(
      organization_id, cash_account_id, movement_date, direction, amount, description, created_by
    ) VALUES (
      p_organization_id, v_payment.cash_account_id, p_payment_date, 'outgoing',
      round(p_prize_amount, 2), 'Pago de premio · cupón ' || v_coupon, v_actor
    ) RETURNING id INTO v_payment.cash_movement_id;
  ELSE
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
    UPDATE public.cash_movements
    SET movement_date = p_payment_date,
        amount = round(p_prize_amount, 2),
        description = 'Pago de premio · cupón ' || v_coupon
    WHERE id = v_payment.cash_movement_id
      AND organization_id = p_organization_id;
  END IF;

  UPDATE public.agency_prize_payments
  SET coupon_number = v_coupon,
      game_name = nullif(btrim(coalesce(p_game_name, '')), ''),
      prize_amount = round(p_prize_amount, 2),
      payment_date = p_payment_date,
      notes = nullif(btrim(coalesce(p_notes, '')), ''),
      included_in_ticket_ocr = coalesce(p_included_in_ticket_ocr, false),
      cash_movement_id = v_payment.cash_movement_id
  WHERE id = p_prize_payment_id AND organization_id = p_organization_id;

  INSERT INTO public.audit_log(organization_id, user_id, action, entity, entity_id, payload)
  VALUES (
    p_organization_id, v_actor, 'correct_agency_prize_payment', 'agency_prize_payment', p_prize_payment_id,
    jsonb_build_object(
      'old_coupon_number', v_old_coupon, 'coupon_number', v_coupon,
      'old_prize_amount', v_old_amount, 'prize_amount', round(p_prize_amount, 2),
      'old_payment_date', v_old_date, 'payment_date', p_payment_date,
      'included_in_ticket_ocr', coalesce(p_included_in_ticket_ocr, false),
      'cash_movement_id', v_payment.cash_movement_id
    )
  );
END;
$function$

REVOKE ALL ON FUNCTION public.update_agency_prize_payment(uuid, uuid, text, numeric, date, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_agency_prize_payment(uuid, uuid, text, numeric, date, text, text, boolean) TO authenticated;
