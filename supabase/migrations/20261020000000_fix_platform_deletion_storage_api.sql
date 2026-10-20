-- Use the Supabase Storage API to delete stored files; direct SQL DELETE on storage.objects is blocked.
CREATE POLICY platform_admin_agency_ticket_storage_select
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'agency-rendition-tickets' AND public.is_platform_admin());

CREATE POLICY platform_admin_agency_ticket_storage_delete
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'agency-rendition-tickets' AND public.is_platform_admin());

CREATE OR REPLACE FUNCTION public.list_platform_user_owned_agencies(
  p_user_id uuid, p_confirm_email text, p_confirmation text
)
RETURNS uuid[]
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_email text;
  v_organization_ids uuid[];
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Platform administrator access required' USING ERRCODE = '42501';
  END IF;
  IF btrim(coalesce(p_confirmation, '')) <> 'ELIMINAR' THEN
    RAISE EXCEPTION 'La confirmación final debe ser la palabra ELIMINAR.';
  END IF;
  IF p_user_id IS NULL OR p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'No podés eliminar la cuenta con la que estás usando Administración Central.';
  END IF;

  SELECT lower(btrim(coalesce(u.email, ''))) INTO v_email
  FROM auth.users u WHERE u.id = p_user_id;
  IF NOT FOUND OR v_email = '' THEN
    RAISE EXCEPTION 'No encontramos la cuenta seleccionada.';
  END IF;
  IF lower(btrim(coalesce(p_confirm_email, ''))) <> v_email THEN
    RAISE EXCEPTION 'El correo de confirmación no coincide.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.platform_admins pa WHERE lower(btrim(pa.email)) = v_email) THEN
    RAISE EXCEPTION 'No se puede eliminar una cuenta administradora central desde esta operación.';
  END IF;

  SELECT coalesce(array_agg(agency.id ORDER BY agency.id), ARRAY[]::uuid[])
  INTO v_organization_ids
  FROM (
    SELECT DISTINCT o.id
    FROM public.organizations o
    WHERE o.created_by = p_user_id
       OR EXISTS (
         SELECT 1 FROM public.organization_members m
         WHERE m.organization_id = o.id AND m.user_id = p_user_id AND m.role::text = 'owner'
       )
  ) AS agency;

  RETURN v_organization_ids;
END;
$function$;

REVOKE ALL ON FUNCTION public.list_platform_user_owned_agencies(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_platform_user_owned_agencies(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.validate_platform_agency_delete(
  p_organization_id uuid, p_confirm_name text, p_confirmation text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE v_name text;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Platform administrator access required' USING ERRCODE = '42501';
  END IF;
  IF btrim(coalesce(p_confirmation, '')) <> 'ELIMINAR' THEN
    RAISE EXCEPTION 'La confirmación final debe ser la palabra ELIMINAR.';
  END IF;

  SELECT o.name INTO v_name FROM public.organizations o WHERE o.id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No encontramos la agencia seleccionada.';
  END IF;
  IF btrim(coalesce(p_confirm_name, '')) <> v_name THEN
    RAISE EXCEPTION 'El nombre escrito no coincide con el nombre actual de la agencia.';
  END IF;
  RETURN p_organization_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.validate_platform_agency_delete(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validate_platform_agency_delete(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_platform_user(
  p_user_id uuid, p_confirm_email text, p_confirmation text
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE v_email text;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Platform administrator access required' USING ERRCODE = '42501';
  END IF;
  IF btrim(coalesce(p_confirmation, '')) <> 'ELIMINAR' THEN
    RAISE EXCEPTION 'La confirmación final debe ser la palabra ELIMINAR.';
  END IF;
  IF p_user_id IS NULL OR p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'No podés eliminar la cuenta con la que estás usando Administración Central.';
  END IF;

  SELECT lower(btrim(coalesce(u.email, ''))) INTO v_email
  FROM auth.users u WHERE u.id = p_user_id;
  IF NOT FOUND OR v_email = '' THEN
    RAISE EXCEPTION 'No encontramos la cuenta seleccionada.';
  END IF;
  IF lower(btrim(coalesce(p_confirm_email, ''))) <> v_email THEN
    RAISE EXCEPTION 'El correo de confirmación no coincide.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.platform_admins pa WHERE lower(btrim(pa.email)) = v_email) THEN
    RAISE EXCEPTION 'No se puede eliminar una cuenta administradora central desde esta operación.';
  END IF;

  DELETE FROM public.organizations o
  WHERE o.created_by = p_user_id
     OR EXISTS (
       SELECT 1 FROM public.organization_members m
       WHERE m.organization_id = o.id AND m.user_id = p_user_id AND m.role::text = 'owner'
     );

  DELETE FROM auth.sessions WHERE user_id = p_user_id;
  DELETE FROM public.organization_member_permissions WHERE user_id = p_user_id;
  DELETE FROM public.organization_members WHERE user_id = p_user_id;
  DELETE FROM public.platform_access_requests WHERE user_id = p_user_id;
  DELETE FROM public.profiles WHERE id = p_user_id;
  DELETE FROM auth.users WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se pudo eliminar la cuenta de autenticación.';
  END IF;
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_platform_agency(
  p_organization_id uuid, p_confirm_name text, p_confirmation text
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_name text;
  v_owner_ids uuid[];
  v_owner_id uuid;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Platform administrator access required' USING ERRCODE = '42501';
  END IF;
  IF btrim(coalesce(p_confirmation, '')) <> 'ELIMINAR' THEN
    RAISE EXCEPTION 'La confirmación final debe ser la palabra ELIMINAR.';
  END IF;

  SELECT o.name INTO v_name FROM public.organizations o WHERE o.id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No encontramos la agencia seleccionada.';
  END IF;
  IF btrim(coalesce(p_confirm_name, '')) <> v_name THEN
    RAISE EXCEPTION 'El nombre escrito no coincide con el nombre actual de la agencia.';
  END IF;

  SELECT array_agg(DISTINCT candidate.user_id) INTO v_owner_ids
  FROM (
    SELECT o.created_by AS user_id FROM public.organizations o WHERE o.id = p_organization_id
    UNION
    SELECT m.user_id FROM public.organization_members m
    WHERE m.organization_id = p_organization_id AND m.role::text = 'owner'
  ) candidate;

  DELETE FROM public.organizations WHERE id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se pudo eliminar la agencia seleccionada.';
  END IF;

  FOREACH v_owner_id IN ARRAY coalesce(v_owner_ids, ARRAY[]::uuid[]) LOOP
    IF v_owner_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.platform_admins pa
        JOIN auth.users u ON lower(u.email) = lower(pa.email)
        WHERE u.id = v_owner_id
      )
      AND NOT EXISTS (SELECT 1 FROM public.organizations o WHERE o.created_by = v_owner_id)
      AND NOT EXISTS (SELECT 1 FROM public.organization_members m WHERE m.user_id = v_owner_id)
    THEN
      DELETE FROM auth.sessions WHERE user_id = v_owner_id;
      DELETE FROM public.organization_member_permissions WHERE user_id = v_owner_id;
      DELETE FROM public.organization_members WHERE user_id = v_owner_id;
      DELETE FROM public.platform_access_requests WHERE user_id = v_owner_id;
      DELETE FROM public.profiles WHERE id = v_owner_id;
      DELETE FROM auth.users WHERE id = v_owner_id;
    END IF;
  END LOOP;
  RETURN true;
END;
$function$;
