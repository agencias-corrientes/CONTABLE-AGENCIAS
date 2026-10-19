CREATE OR REPLACE FUNCTION public.register_agency_prize_payment_with_ocr_status(p_organization_id uuid, p_cash_account_id uuid, p_coupon_number text, p_prize_amount numeric, p_payment_date date, p_capture_method text, p_included_in_ticket_ocr boolean DEFAULT false, p_game_name text DEFAULT NULL::text, p_qr_payload text DEFAULT NULL::text, p_photo_path text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_payment_id uuid;
BEGIN
  v_payment_id := public.register_agency_prize_payment(
    p_organization_id, p_cash_account_id, p_coupon_number, p_prize_amount,
    p_payment_date, p_capture_method, p_game_name, p_qr_payload, p_photo_path, p_notes
  );
  UPDATE public.agency_prize_payments
  SET included_in_ticket_ocr = coalesce(p_included_in_ticket_ocr, false)
  WHERE id = v_payment_id
    AND organization_id = p_organization_id
    AND created_by = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se pudo asociar el pago al estado del ticket OCR';
  END IF;
  INSERT INTO public.audit_log(organization_id, user_id, action, entity, entity_id, payload)
  VALUES (
    p_organization_id, auth.uid(), 'set_prize_payment_ocr_inclusion', 'agency_prize_payment', v_payment_id,
    jsonb_build_object('included_in_ticket_ocr', coalesce(p_included_in_ticket_ocr, false))
  );
  RETURN v_payment_id;
END;
$function$

REVOKE ALL ON FUNCTION public.register_agency_prize_payment_with_ocr_status(uuid, uuid, text, numeric, date, text, boolean, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_agency_prize_payment_with_ocr_status(uuid, uuid, text, numeric, date, text, boolean, text, text, text, text) TO authenticated;
