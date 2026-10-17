-- Stable official agency identifier. Display names are free-form, so the
-- agency number must be stored and made unique independently from the name.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS agency_code text;

UPDATE public.organizations
SET agency_code = coalesce(
  substring(lower(btrim(name)) FROM 'agencia[^0-9]*([0-9]{3,6})'),
  CASE WHEN btrim(name) ~ '^[0-9]{3,6}$' THEN btrim(name) END
)
WHERE agency_code IS NULL;

DO $block$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.organizations'::regclass
      AND conname = 'organizations_agency_code_format_ck'
  ) THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT organizations_agency_code_format_ck
      CHECK (agency_code IS NULL OR agency_code ~ '^[0-9]{3,6}$');
  END IF;
END;
$block$;

CREATE UNIQUE INDEX IF NOT EXISTS organizations_agency_code_uq
  ON public.organizations (agency_code)
  WHERE agency_code IS NOT NULL AND btrim(agency_code) <> '';

-- Enforce the official number in the database too. A direct RPC call cannot
-- create a tenant without a valid, globally unique agency code.
CREATE OR REPLACE FUNCTION public.bootstrap_agency_organization(
  p_name text,
  p_legal_name text DEFAULT NULL::text,
  p_tax_id text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_org_id uuid;
  v_email text := nullif(trim(coalesce(auth.jwt() ->> 'email', '')), '');
  v_name text := trim(coalesce(p_name, ''));
  v_agency_code text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication is required';
  END IF;
  IF v_name = '' OR length(v_name) > 120 THEN
    RAISE EXCEPTION 'Organization name is required';
  END IF;
  v_agency_code := coalesce(
    substring(lower(v_name) FROM 'agencia[^0-9]*([0-9]{3,6})'),
    CASE WHEN v_name ~ '^[0-9]{3,6}$' THEN v_name END
  );
  IF v_agency_code IS NULL OR v_agency_code !~ '^[0-9]{3,6}$' THEN
    RAISE EXCEPTION 'Número oficial de agencia obligatorio';
  END IF;
  IF EXISTS (SELECT 1 FROM public.organization_members WHERE user_id = v_uid) THEN
    RAISE EXCEPTION 'User already belongs to an organization';
  END IF;

  INSERT INTO public.organizations
    (name, agency_code, legal_name, tax_id, currency_code, timezone, created_by)
  VALUES
    (v_name, v_agency_code, nullif(trim(p_legal_name), ''), nullif(trim(p_tax_id), ''),
     'ARS', 'America/Argentina/Cordoba', v_uid)
  RETURNING id INTO v_org_id;

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (v_org_id, v_uid, 'owner');

  INSERT INTO public.profiles (id) VALUES (v_uid) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.cash_accounts (organization_id, name, type, currency_code, is_active)
  VALUES (v_org_id, 'Caja', 'cash', 'ARS', true);

  INSERT INTO public.agency_operational_settings (
    organization_id, rendition_cutoff_time, backup_send_time, updated_by
  ) VALUES (v_org_id, '00:00:00', '23:50:00', v_uid);

  INSERT INTO public.organization_backup_settings (
    organization_id, recipient_email, enabled, created_by, include_ticket_photo
  ) VALUES (v_org_id, v_email, true, v_uid, true);

  INSERT INTO public.agency_game_types (
    organization_id, name, category, enabled, sort_order, created_by
  ) VALUES
    (v_org_id, 'Quiniela Correntina', 'Quiniela', true, 10, v_uid),
    (v_org_id, 'Quiniela Al Toque', 'Quiniela', true, 20, v_uid),
    (v_org_id, 'Quiniela Poceada Correntina', 'Poceada', true, 30, v_uid),
    (v_org_id, 'Loto Plus', 'Otros juegos', true, 40, v_uid),
    (v_org_id, 'Loto 5 Plus', 'Otros juegos', true, 50, v_uid),
    (v_org_id, 'Quini 6', 'Otros juegos', true, 60, v_uid),
    (v_org_id, 'Brinco', 'Otros juegos', true, 70, v_uid),
    (v_org_id, 'Telekino', 'Otros juegos', true, 80, v_uid),
    (v_org_id, 'Quiniela Poceada Extra', 'Poceada', false, 130, v_uid),
    (v_org_id, 'Quiniela Poceada Navidad', 'Poceada', false, 140, v_uid),
    (v_org_id, 'Loto Plus Extra', 'Otros juegos', false, 150, v_uid)
  ON CONFLICT (organization_id, lower(name)) DO NOTHING;

  RETURN v_org_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.bootstrap_agency_organization(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_agency_organization(text, text, text) TO authenticated;

COMMENT ON COLUMN public.organizations.agency_code IS
  'Official agency number; globally unique and authoritative for ticket and agent ownership checks.';
