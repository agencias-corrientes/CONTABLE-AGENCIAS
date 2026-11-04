-- Restrict the launch-data cleanup tools to Platform Admin on the central agency 000.
-- The private helpers retain their existing owner check and cleanup behavior.
CREATE OR REPLACE FUNCTION public.preview_agency_launch_cleanup(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Solo Administración Central puede revisar la limpieza de datos de prueba' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organizations o
    WHERE o.id = p_organization_id AND o.agency_code = '000'
  ) THEN
    RAISE EXCEPTION 'La limpieza está limitada a la agencia central 000' USING ERRCODE = '42501';
  END IF;
  RETURN private.preview_agency_launch_cleanup(p_organization_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.preview_agency_launch_cleanup(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_agency_launch_cleanup(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.cleanup_agency_test_data(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Solo Administración Central puede limpiar datos de prueba' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organizations o
    WHERE o.id = p_organization_id AND o.agency_code = '000'
  ) THEN
    RAISE EXCEPTION 'La limpieza está limitada a la agencia central 000' USING ERRCODE = '42501';
  END IF;
  RETURN private.clear_agency_launch_test_data(p_organization_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.cleanup_agency_test_data(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cleanup_agency_test_data(uuid) TO authenticated;
