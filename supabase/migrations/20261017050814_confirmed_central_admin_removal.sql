-- Retiro explícito de un administrador central: exige escribir QUITAR y protege al último.
CREATE OR REPLACE FUNCTION public.remove_platform_admin_confirmed(p_email text, p_confirmation text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE v_email text := lower(btrim(coalesce(p_email, ''))); v_count integer;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Platform administrator access required' USING ERRCODE = '42501'; END IF;
  IF upper(btrim(coalesce(p_confirmation, ''))) <> 'QUITAR' THEN RAISE EXCEPTION 'La confirmación final debe ser la palabra QUITAR.'; END IF;
  SELECT count(*) INTO v_count FROM public.platform_admins;
  IF v_count <= 1 THEN RAISE EXCEPTION 'No se puede quitar el último administrador central. Primero autorizá otra cuenta.'; END IF;
  DELETE FROM public.platform_admins WHERE email = v_email;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ese correo no figura como administrador central.'; END IF;
  RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION public.remove_platform_admin_confirmed(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_platform_admin_confirmed(text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.remove_platform_admin(text) FROM PUBLIC, anon, authenticated;
