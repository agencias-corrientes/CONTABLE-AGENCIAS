-- Quiniela Corrientes operator codes use a three-digit official agency number.
ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_agency_code_format_ck;
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_agency_code_format_ck
  CHECK (agency_code IS NULL OR agency_code ~ '^[0-9]{3}$');

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
    substring(lower(v_name) FROM 'agencia[^0-9]*([0-9]{3})'),
    CASE WHEN v_name ~ '^[0-9]{3}$' THEN v_name END
  );
  IF v_agency_code IS NULL OR v_agency_code !~ '^[0-9]{3}$' THEN
    RAISE EXCEPTION 'Número oficial de agencia obligatorio: debe tener 3 dígitos';
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

  UPDATE public.organizations
  SET name = v_name,
      agency_code = v_agency_code,
      legal_name = nullif(btrim(coalesce(p_legal_name, '')), ''),
      tax_id = nullif(btrim(coalesce(p_tax_id, '')), ''),
      currency_code = upper(btrim(p_currency_code)),
      timezone = p_timezone,
      updated_at = now()
  WHERE id = p_organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No encontramos la agencia';
  END IF;

  INSERT INTO public.audit_log(organization_id, user_id, action, entity, entity_id, payload)
  VALUES (
    p_organization_id, auth.uid(), 'update_agency_profile', 'organization', p_organization_id,
    jsonb_build_object('name', v_name, 'agency_code', v_agency_code,
      'currency_code', upper(btrim(p_currency_code)), 'timezone', p_timezone)
  );
END;
$function$;

-- Keep agency ownership validation at the database boundary as well as in the UI.
CREATE OR REPLACE FUNCTION public.create_agency_agent(
  p_organization_id uuid,
  p_kind public.agency_agent_kind,
  p_full_name text,
  p_code text DEFAULT NULL,
  p_dni text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_whatsapp text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_id uuid;
  v_agency_code text;
  v_code text := btrim(coalesce(p_code, ''));
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = p_organization_id
      AND user_id = auth.uid()
      AND role IN ('owner','admin')
  ) THEN
    RAISE EXCEPTION 'Sin permisos';
  END IF;
  IF trim(coalesce(p_full_name,'')) = '' THEN
    RAISE EXCEPTION 'El nombre es obligatorio';
  END IF;
  IF v_code !~ '^[0-9]{3}-[0-9]{3}-[0-9]{2}$' THEN
    RAISE EXCEPTION 'El código de subagente o ambulante no tiene el formato oficial';
  END IF;

  SELECT coalesce(
    o.agency_code,
    substring(lower(o.name) FROM 'agencia[^0-9]*([0-9]{3})'),
    CASE WHEN btrim(o.name) ~ '^[0-9]{3}$' THEN btrim(o.name) END
  )
  INTO v_agency_code
  FROM public.organizations o
  WHERE o.id = p_organization_id;

  IF v_agency_code IS NULL OR v_agency_code !~ '^[0-9]{3}$' THEN
    RAISE EXCEPTION 'Primero configurá el número oficial de agencia de 3 dígitos';
  END IF;
  IF split_part(v_code, '-', 1) <> v_agency_code THEN
    RAISE EXCEPTION 'El código del agente debe comenzar con el número oficial de esta agencia';
  END IF;

  INSERT INTO public.agency_agents(
    organization_id, kind, full_name, code, dni, phone, whatsapp, address, notes, created_by
  ) VALUES (
    p_organization_id, p_kind, trim(p_full_name), v_code,
    nullif(trim(p_dni), ''), nullif(trim(p_phone), ''), nullif(trim(p_whatsapp), ''),
    nullif(trim(p_address), ''), nullif(trim(p_notes), ''), auth.uid()
  )
  RETURNING id INTO v_id;

  INSERT INTO public.audit_log(organization_id,user_id,action,entity,entity_id,payload)
  VALUES (p_organization_id,auth.uid(),'create','agency_agent',v_id,
    jsonb_build_object('kind',p_kind,'full_name',trim(p_full_name),'code',v_code));
  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.bootstrap_agency_organization(text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_agency_organization(text,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.update_agency_profile(uuid,text,text,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_agency_profile(uuid,text,text,text,text,text,text) TO authenticated;
