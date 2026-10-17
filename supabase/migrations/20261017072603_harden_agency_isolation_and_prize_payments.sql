-- Preview-first safety fixes for agency isolation and prize payouts.
-- This migration must be applied to the Preview database before deploying the UI.

-- Agency/subagent codes already contain the official agency number. They must never
-- be claimed by a different tenant, even when the caller cannot SELECT that tenant's rows.
CREATE UNIQUE INDEX IF NOT EXISTS agency_agents_global_code_uq
  ON public.agency_agents (lower(btrim(code)))
  WHERE code IS NOT NULL AND btrim(code) <> '';

-- If the agency number is written as "Agencia N.º 251", reserve it globally.
-- Other tenant data remains protected by organization_id + RLS; no tenant data is exposed.
CREATE UNIQUE INDEX IF NOT EXISTS organizations_agency_number_uq
  ON public.organizations ((substring(lower(name) FROM 'agencia[^0-9]*([0-9]{3,6})')))
  WHERE substring(lower(name) FROM 'agencia[^0-9]*([0-9]{3,6})') IS NOT NULL;

-- Keep the cash-movement pointer attached to each rendition payment. Without an
-- UPDATE policy the write could silently affect zero rows under RLS.
DROP POLICY IF EXISTS agency_rendition_payments_update ON public.agency_rendition_payments;
CREATE POLICY agency_rendition_payments_update
  ON public.agency_rendition_payments
  FOR UPDATE TO authenticated
  USING (private.is_org_accounting(organization_id, auth.uid()))
  WITH CHECK (private.is_org_accounting(organization_id, auth.uid()));

-- The daily close consists of multiple related inserts and updates. Run it as one
-- guarded database transaction so the RLS state cannot leave a partial Caja record.
CREATE OR REPLACE FUNCTION public.create_and_receive_agency_daily_rendition(
  p_organization_id uuid,
  p_agent_id uuid,
  p_rendition_date date,
  p_amount_due numeric,
  p_operational_date date,
  p_daily_status text,
  p_cash_account_id uuid,
  p_payment_date date,
  p_game_breakdown jsonb DEFAULT '[]'::jsonb,
  p_ticket_numbers jsonb DEFAULT '[]'::jsonb,
  p_ticket_qr_payload text DEFAULT NULL,
  p_game_period text DEFAULT 'Cierre diario',
  p_draw_number text DEFAULT NULL,
  p_capture_method text DEFAULT 'manual',
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_daily_status_notes text DEFAULT NULL,
  p_reported_amount numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $function$
DECLARE
  v_rendition_id uuid;
  v_payment_amount numeric;
  v_gross_due numeric;
  v_commission_due numeric := 0;
  v_net_due numeric;
  v_reported_amount numeric;
  v_rate numeric;
  v_item record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Necesitás iniciar sesión para registrar una rendición' USING ERRCODE = '42501';
  END IF;
  IF NOT private.has_org_permission(p_organization_id, 'can_create_renditions', auth.uid()) THEN
    RAISE EXCEPTION 'No tenés permiso para registrar rendiciones' USING ERRCODE = '42501';
  END IF;
  IF NOT private.has_org_permission(p_organization_id, 'can_register_payments', auth.uid()) THEN
    RAISE EXCEPTION 'No tenés permiso para registrar cobros' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = p_organization_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin', 'accountant')
  ) THEN
    RAISE EXCEPTION 'Sin permisos para registrar una rendición y su cobro' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.agency_agents
    WHERE id = p_agent_id AND organization_id = p_organization_id AND is_active
  ) THEN
    RAISE EXCEPTION 'El subagente o ambulante no pertenece a esta agencia o está inactivo';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.cash_accounts
    WHERE id = p_cash_account_id AND organization_id = p_organization_id AND is_active
  ) THEN
    RAISE EXCEPTION 'Caja/cuenta inválida para esta agencia';
  END IF;
  IF p_rendition_date IS DISTINCT FROM p_operational_date THEN
    RAISE EXCEPTION 'La fecha de la rendición debe coincidir con la jornada operativa';
  END IF;
  IF coalesce(p_daily_status, '') NOT IN ('complete', 'incomplete') THEN
    RAISE EXCEPTION 'El estado diario solicitado no es válido';
  END IF;
  IF jsonb_typeof(coalesce(p_game_breakdown, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'La distribución por juegos no es válida';
  END IF;

  SELECT coalesce(sum((item->>'amount')::numeric), 0)
    INTO v_gross_due
  FROM jsonb_array_elements(coalesce(p_game_breakdown, '[]'::jsonb)) item
  WHERE coalesce((item->>'amount')::numeric, 0) > 0;

  IF v_gross_due <= 0 OR abs(v_gross_due - coalesce(p_amount_due, v_gross_due)) > 0.005 THEN
    RAISE EXCEPTION 'La suma de los juegos no coincide con el total de ventas';
  END IF;

  FOR v_item IN
    SELECT (item->>'game_type_id')::uuid AS game_type_id,
           (item->>'amount')::numeric AS amount
    FROM jsonb_array_elements(coalesce(p_game_breakdown, '[]'::jsonb)) item
    WHERE coalesce((item->>'amount')::numeric, 0) > 0
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.agency_game_types
      WHERE id = v_item.game_type_id AND organization_id = p_organization_id AND enabled
    ) THEN
      RAISE EXCEPTION 'Tipo de juego inválido, inactivo o perteneciente a otra agencia';
    END IF;

    v_rate := NULL;
    SELECT c.commission_percent INTO v_rate
    FROM public.agency_agent_game_commissions c
    WHERE c.organization_id = p_organization_id
      AND c.agent_id = p_agent_id
      AND c.game_type_id = v_item.game_type_id;
    IF NOT FOUND THEN
      SELECT d.commission_percent INTO v_rate
      FROM public.agency_game_commission_defaults d
      WHERE d.organization_id = p_organization_id
        AND d.game_type_id = v_item.game_type_id;
    END IF;
    v_commission_due := v_commission_due + round((v_item.amount * coalesce(v_rate, 0)) / 100.0, 2);
  END LOOP;

  v_net_due := greatest(0, round(v_gross_due - v_commission_due, 2));
  IF v_net_due <= 0 THEN
    RAISE EXCEPTION 'El neto a rendir debe ser mayor que cero después de descontar la comisión';
  END IF;
  v_reported_amount := CASE WHEN p_daily_status = 'complete' THEN v_net_due ELSE p_reported_amount END;
  IF v_reported_amount IS NULL OR round(v_reported_amount, 2) <= 0 OR round(v_reported_amount, 2) > v_net_due THEN
    RAISE EXCEPTION 'El monto rendido debe ser mayor que cero y no superar el neto después de comisión';
  END IF;

  v_rendition_id := public.create_agency_rendition_with_capture_and_daily_status(
    p_organization_id, p_agent_id, p_rendition_date, v_gross_due,
    p_operational_date, p_daily_status,
    coalesce(p_game_breakdown, '[]'::jsonb),
    coalesce(p_ticket_numbers, '[]'::jsonb),
    p_ticket_qr_payload, p_game_period, p_draw_number, p_capture_method,
    p_reference, p_notes, p_daily_status_notes, v_reported_amount
  );

  UPDATE public.agency_renditions
  SET net_due = v_net_due, updated_at = now()
  WHERE id = v_rendition_id AND organization_id = p_organization_id;

  v_payment_amount := CASE WHEN p_daily_status = 'complete' THEN v_net_due ELSE round(v_reported_amount, 2) END;
  PERFORM public.receive_agency_rendition(
    p_organization_id, v_rendition_id, p_payment_date, v_payment_amount, p_cash_account_id,
    p_reference,
    CASE WHEN p_daily_status = 'incomplete'
      THEN 'Pago parcial al registrar rendición incompleta'
      ELSE 'Cobro del efectivo neto al confirmar rendición diaria'
    END
  );
  RETURN v_rendition_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_and_receive_agency_daily_rendition(
  uuid, uuid, date, numeric, date, text, uuid, date, jsonb, jsonb, text, text, text, text, text, text, text, numeric
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_and_receive_agency_daily_rendition(
  uuid, uuid, date, numeric, date, text, uuid, date, jsonb, jsonb, text, text, text, text, text, text, text, numeric
) TO authenticated;

-- Prize payments are tenant-scoped, non-duplicable by normalized coupon number,
-- and always create the Caja outgoing movement in the same SQL transaction.
CREATE TABLE IF NOT EXISTS public.agency_prize_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  coupon_number text NOT NULL CHECK (length(btrim(coupon_number)) BETWEEN 1 AND 128),
  normalized_coupon_number text GENERATED ALWAYS AS (
    regexp_replace(upper(btrim(coupon_number)), '[^A-Z0-9]', '', 'g')
  ) STORED,
  game_name text,
  prize_amount numeric(14,2) NOT NULL CHECK (prize_amount > 0 AND prize_amount <= 999999999999.99),
  payment_date date NOT NULL,
  capture_method text NOT NULL CHECK (capture_method IN ('manual', 'photo', 'qr')),
  qr_payload text,
  photo_path text,
  cash_account_id uuid NOT NULL REFERENCES public.cash_accounts(id) ON DELETE RESTRICT,
  cash_movement_id uuid REFERENCES public.cash_movements(id) ON DELETE RESTRICT,
  notes text,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS agency_prize_payments_org_coupon_uq
  ON public.agency_prize_payments (organization_id, normalized_coupon_number);
CREATE INDEX IF NOT EXISTS agency_prize_payments_org_paid_at_idx
  ON public.agency_prize_payments (organization_id, payment_date DESC, created_at DESC);

ALTER TABLE public.agency_prize_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agency_prize_payments_member_select ON public.agency_prize_payments;
CREATE POLICY agency_prize_payments_member_select
  ON public.agency_prize_payments
  FOR SELECT TO authenticated
  USING (private.is_org_member(organization_id, auth.uid()));
REVOKE ALL ON public.agency_prize_payments FROM anon, authenticated;
GRANT SELECT ON public.agency_prize_payments TO authenticated;

CREATE OR REPLACE FUNCTION public.register_agency_prize_payment(
  p_organization_id uuid,
  p_cash_account_id uuid,
  p_coupon_number text,
  p_prize_amount numeric,
  p_payment_date date,
  p_capture_method text,
  p_game_name text DEFAULT NULL,
  p_qr_payload text DEFAULT NULL,
  p_photo_path text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $function$
DECLARE
  v_payment_id uuid;
  v_movement_id uuid;
  v_coupon text := btrim(coalesce(p_coupon_number, ''));
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Necesitás iniciar sesión para registrar un premio' USING ERRCODE = '42501';
  END IF;
  IF NOT private.has_org_permission(p_organization_id, 'can_register_payments', v_actor) THEN
    RAISE EXCEPTION 'No tenés permiso para pagar premios' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = p_organization_id
      AND user_id = v_actor
      AND role IN ('owner', 'admin', 'accountant')
  ) THEN
    RAISE EXCEPTION 'Sin permisos para pagar premios' USING ERRCODE = '42501';
  END IF;
  IF v_coupon = '' OR length(v_coupon) > 128 OR regexp_replace(upper(v_coupon), '[^A-Z0-9]', '', 'g') = '' THEN
    RAISE EXCEPTION 'Ingresá un número de cupón válido';
  END IF;
  IF p_prize_amount IS NULL OR p_prize_amount <= 0 OR p_prize_amount > 999999999999.99 THEN
    RAISE EXCEPTION 'Ingresá un importe de premio mayor que cero';
  END IF;
  IF p_payment_date IS NULL THEN
    RAISE EXCEPTION 'La fecha de pago no es válida';
  END IF;
  IF coalesce(p_capture_method, '') NOT IN ('manual', 'photo', 'qr') THEN
    RAISE EXCEPTION 'El método de identificación del cupón no es válido';
  END IF;
  IF p_qr_payload IS NOT NULL AND length(p_qr_payload) > 4000 THEN
    RAISE EXCEPTION 'El contenido QR supera el límite permitido';
  END IF;
  IF p_photo_path IS NOT NULL AND p_photo_path NOT LIKE p_organization_id::text || '/prizes/%' THEN
    RAISE EXCEPTION 'La foto del premio no pertenece a esta agencia';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.cash_accounts
    WHERE id = p_cash_account_id AND organization_id = p_organization_id AND is_active
  ) THEN
    RAISE EXCEPTION 'No hay una cuenta Caja activa para esta agencia';
  END IF;

  INSERT INTO public.agency_prize_payments(
    organization_id, cash_account_id, coupon_number, game_name, prize_amount,
    payment_date, capture_method, qr_payload, photo_path, notes, created_by
  ) VALUES (
    p_organization_id, p_cash_account_id, v_coupon, nullif(btrim(coalesce(p_game_name, '')), ''),
    round(p_prize_amount, 2), p_payment_date, p_capture_method,
    nullif(btrim(coalesce(p_qr_payload, '')), ''),
    p_photo_path, nullif(btrim(coalesce(p_notes, '')), ''), v_actor
  ) RETURNING id INTO v_payment_id;

  INSERT INTO public.cash_movements(
    organization_id, cash_account_id, movement_date, direction, amount, description, created_by
  ) VALUES (
    p_organization_id, p_cash_account_id, p_payment_date, 'outgoing',
    round(p_prize_amount, 2), 'Pago de premio · cupón ' || v_coupon, v_actor
  ) RETURNING id INTO v_movement_id;

  UPDATE public.agency_prize_payments
  SET cash_movement_id = v_movement_id
  WHERE id = v_payment_id AND organization_id = p_organization_id;

  INSERT INTO public.audit_log(organization_id, user_id, action, entity, entity_id, payload)
  VALUES (
    p_organization_id, v_actor, 'pay_prize', 'agency_prize_payment', v_payment_id,
    jsonb_build_object('coupon_number', v_coupon, 'prize_amount', round(p_prize_amount, 2),
      'cash_movement_id', v_movement_id, 'capture_method', p_capture_method, 'game_name', p_game_name)
  );

  RETURN v_payment_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Ese cupón ya tiene un premio pagado registrado en esta agencia. No se descontó dos veces de Caja.'
      USING ERRCODE = '23505';
END;
$function$;

REVOKE ALL ON FUNCTION public.register_agency_prize_payment(
  uuid, uuid, text, numeric, date, text, text, text, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_agency_prize_payment(
  uuid, uuid, text, numeric, date, text, text, text, text, text
) TO authenticated;

-- Private proof photo storage; first path segment is always the tenant organization ID.
INSERT INTO storage.buckets (id, name, public)
VALUES ('agency-rendition-tickets', 'agency-rendition-tickets', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS agency_prize_photos_select ON storage.objects;
CREATE POLICY agency_prize_photos_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'agency-rendition-tickets'
    AND (storage.foldername(name))[1] IN (
      SELECT om.organization_id::text FROM public.organization_members om WHERE om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS agency_prize_photos_insert ON storage.objects;
CREATE POLICY agency_prize_photos_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'agency-rendition-tickets'
    AND (storage.foldername(name))[1] IN (
      SELECT om.organization_id::text FROM public.organization_members om WHERE om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS agency_prize_photos_delete ON storage.objects;
CREATE POLICY agency_prize_photos_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'agency-rendition-tickets'
    AND (storage.foldername(name))[1] IN (
      SELECT om.organization_id::text FROM public.organization_members om WHERE om.user_id = auth.uid()
    )
  );
