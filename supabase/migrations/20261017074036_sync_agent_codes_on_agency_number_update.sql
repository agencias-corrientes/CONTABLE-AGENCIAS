-- When a titular corrects the official agency number, keep this tenant's agent
-- identifiers aligned in the same transaction. Any collision with another agency's
-- global agent code aborts the whole change; no records are reassigned across tenants.
CREATE OR REPLACE FUNCTION public.update_agency_profile(
  p_organization_id uuid,
  p_name text,
  p_legal_name text,
  p_tax_id text,
  p_currency_code text,
  p_timezone text,
  p_agency_code text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_agency_code text := btrim(coalesce(p_agency_code, ''));
  v_name text := btrim(coalesce(p_name, ''));
  v_named_code text;
  v_old_agency_code text;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = p_organization_id
      AND m.user_id = auth.uid()
      AND m.role = 'owner'
  ) THEN
    RAISE EXCEPTION 'Solo el titular puede modificar los datos de la agencia' USING ERRCODE = '42501';
  END IF;
  IF v_name = '' OR length(v_name) > 120 THEN
    RAISE EXCEPTION 'El nombre de la agencia es obligatorio';
  END IF;
  IF v_agency_code !~ '^[0-9]{3}$' THEN
    RAISE EXCEPTION 'El número oficial de agencia debe tener exactamente 3 dígitos';
  END IF;
  v_named_code := coalesce(
    substring(lower(v_name) FROM 'agencia[^0-9]*([0-9]{3})'),
    CASE WHEN v_name ~ '^[0-9]{3}$' THEN v_name END
  );
  IF v_named_code IS NOT NULL AND v_named_code <> v_agency_code THEN
    RAISE EXCEPTION 'El nombre de agencia indica un número distinto al número oficial ingresado';
  END IF;
  IF upper(btrim(coalesce(p_currency_code, ''))) !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'La moneda debe ser un código de tres letras';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names t WHERE t.name = p_timezone) THEN
    RAISE EXCEPTION 'La zona horaria no es válida';
  END IF;

  SELECT agency_code INTO v_old_agency_code
  FROM public.organizations
  WHERE id = p_organization_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No encontramos la agencia';
  END IF;

  IF v_old_agency_code IS NOT NULL AND v_old_agency_code <> v_agency_code THEN
    UPDATE public.agency_agents
    SET code = v_agency_code || substring(code FROM 4)
    WHERE organization_id = p_organization_id
      AND code ~ '^[0-9]{3}-[0-9]{3}-[0-9]{2}$'
      AND split_part(code, '-', 1) = v_old_agency_code;
  END IF;

  UPDATE public.organizations
  SET name = v_name,
      agency_code = v_agency_code,
      legal_name = nullif(btrim(coalesce(p_legal_name, '')), ''),
      tax_id = nullif(btrim(coalesce(p_tax_id, '')), ''),
      currency_code = upper(btrim(p_currency_code)),
      timezone = p_timezone,
      updated_at = now()
  WHERE id = p_organization_id;

  INSERT INTO public.audit_log(organization_id, user_id, action, entity, entity_id, payload)
  VALUES (
    p_organization_id, auth.uid(), 'update_agency_profile', 'organization', p_organization_id,
    jsonb_build_object('name', v_name, 'agency_code', v_agency_code,
      'previous_agency_code', v_old_agency_code,
      'currency_code', upper(btrim(p_currency_code)), 'timezone', p_timezone)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.update_agency_profile(
  uuid, text, text, text, text, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_agency_profile(
  uuid, text, text, text, text, text, text
) TO authenticated;
