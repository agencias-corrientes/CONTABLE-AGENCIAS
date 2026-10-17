-- Persist the owner-authorized edit workflow for agency subagents and ambulants.
-- Already applied to the current Preview database; tracked here for new environments.
CREATE OR REPLACE FUNCTION public.update_agency_agent_profile(
  p_organization_id uuid,
  p_agent_id uuid,
  p_kind text,
  p_full_name text,
  p_code text,
  p_dni text DEFAULT NULL::text,
  p_phone text DEFAULT NULL::text,
  p_whatsapp text DEFAULT NULL::text,
  p_address text DEFAULT NULL::text,
  p_notes text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_agency_code text;
  v_code text := btrim(coalesce(p_code, ''));
  v_full_name text := btrim(coalesce(p_full_name, ''));
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = p_organization_id AND m.user_id = auth.uid() AND m.role = 'owner'
  ) THEN
    RAISE EXCEPTION 'Solo el titular puede editar los datos de subagentes y ambulantes' USING ERRCODE = '42501';
  END IF;
  IF p_kind NOT IN ('subagent', 'ambulant') THEN RAISE EXCEPTION 'El tipo de operador no es válido'; END IF;
  IF v_full_name = '' OR length(v_full_name) > 160 THEN RAISE EXCEPTION 'Ingresá un nombre válido para el subagente o ambulante'; END IF;
  IF v_code !~ '^[0-9]{3}-[0-9]{3}-[0-9]{2}$' THEN RAISE EXCEPTION 'El código debe tener el formato 447-005-03'; END IF;
  IF length(coalesce(p_dni, '')) > 40 OR length(coalesce(p_phone, '')) > 80 OR length(coalesce(p_whatsapp, '')) > 80 OR length(coalesce(p_address, '')) > 240 OR length(coalesce(p_notes, '')) > 2000 THEN
    RAISE EXCEPTION 'Uno de los datos del operador supera el largo permitido';
  END IF;

  SELECT coalesce(o.agency_code, substring(lower(o.name) FROM 'agencia[^0-9]*([0-9]{3})'), CASE WHEN btrim(o.name) ~ '^[0-9]{3}$' THEN btrim(o.name) END)
  INTO v_agency_code FROM public.organizations o WHERE o.id = p_organization_id;
  IF v_agency_code IS NULL OR v_agency_code !~ '^[0-9]{3}$' THEN RAISE EXCEPTION 'Primero configurá el número oficial de agencia de 3 dígitos'; END IF;
  IF split_part(v_code, '-', 1) <> v_agency_code THEN RAISE EXCEPTION 'El código del operador debe comenzar con el número oficial de esta agencia'; END IF;

  PERFORM 1 FROM public.agency_agents a WHERE a.id = p_agent_id AND a.organization_id = p_organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No encontramos ese subagente o ambulante'; END IF;

  IF EXISTS (SELECT 1 FROM public.agency_agents a WHERE lower(btrim(a.code)) = lower(btrim(v_code)) AND a.id <> p_agent_id) THEN
    RAISE EXCEPTION 'agency_agents_global_code_uq: ese código ya está utilizado' USING ERRCODE = '23505';
  END IF;

  UPDATE public.agency_agents
  SET kind = p_kind::public.agency_agent_kind, code = v_code, full_name = v_full_name,
      dni = nullif(btrim(coalesce(p_dni, '')), ''), phone = nullif(btrim(coalesce(p_phone, '')), ''),
      whatsapp = nullif(btrim(coalesce(p_whatsapp, '')), ''), address = nullif(btrim(coalesce(p_address, '')), ''),
      notes = nullif(btrim(coalesce(p_notes, '')), ''), updated_at = now()
  WHERE id = p_agent_id AND organization_id = p_organization_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.update_agency_agent_profile(uuid, uuid, text, text, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_agency_agent_profile(uuid, uuid, text, text, text, text, text, text, text, text) TO authenticated;
