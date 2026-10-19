-- Allow the central administrator to correct an agency's official three-digit code.
CREATE OR REPLACE FUNCTION public.update_platform_agency_code(
  p_organization_id uuid,
  p_agency_code text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_code text := btrim(coalesce(p_agency_code, ''));
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Platform administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'Agencia inválida';
  END IF;
  IF v_code !~ '^[0-9]{3}$' THEN
    RAISE EXCEPTION 'El número oficial debe tener exactamente tres dígitos.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = p_organization_id) THEN
    RAISE EXCEPTION 'No encontramos la agencia seleccionada.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.organizations o
    WHERE o.id <> p_organization_id AND btrim(coalesce(o.agency_code, '')) = v_code
  ) THEN
    RAISE EXCEPTION 'Ese número oficial ya está asignado a otra agencia.';
  END IF;
  UPDATE public.organizations
  SET agency_code = v_code
  WHERE id = p_organization_id;
  RETURN FOUND;
END;
$function$;

-- Correct the known mistaken association only when the number 000 is not occupied.
UPDATE public.organizations o
SET agency_code = '000'
WHERE o.name = 'Agencia N.º 000'
  AND o.agency_code = '447'
  AND NOT EXISTS (
    SELECT 1 FROM public.organizations other
    WHERE other.id <> o.id AND btrim(coalesce(other.agency_code, '')) = '000'
  );
