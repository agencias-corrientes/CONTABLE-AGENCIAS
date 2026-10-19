-- Simplify central deletion and show pending owner requests only after email confirmation.
CREATE OR REPLACE FUNCTION public.delete_platform_user(p_user_id uuid, p_confirm_email text, p_confirmation text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'auth', 'storage', 'pg_temp'
AS $function$
DECLARE v_email text; v_org_id uuid;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Platform administrator access required' USING ERRCODE = '42501'; END IF;
  IF btrim(coalesce(p_confirmation, '')) <> 'ELIMINAR' THEN RAISE EXCEPTION 'La confirmación final debe ser la palabra ELIMINAR.'; END IF;
  IF p_user_id IS NULL OR p_user_id = auth.uid() THEN RAISE EXCEPTION 'No podés eliminar la cuenta con la que estás usando Administración Central.'; END IF;
  SELECT lower(btrim(coalesce(u.email, ''))) INTO v_email FROM auth.users u WHERE u.id = p_user_id;
  IF NOT FOUND OR v_email = '' THEN RAISE EXCEPTION 'No encontramos la cuenta seleccionada.'; END IF;
  IF btrim(lower(coalesce(p_confirm_email, ''))) <> v_email THEN RAISE EXCEPTION 'El correo de confirmación no coincide.'; END IF;
  IF EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.email = v_email) THEN RAISE EXCEPTION 'No se puede eliminar una cuenta administradora central desde esta operación.'; END IF;
  FOR v_org_id IN
    SELECT DISTINCT o.id FROM public.organizations o
    WHERE o.created_by = p_user_id OR EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.organization_id = o.id AND m.user_id = p_user_id AND m.role::text = 'owner'
    )
  LOOP
    DELETE FROM storage.objects WHERE bucket_id = 'agency-rendition-tickets'
      AND (name = v_org_id::text OR name LIKE v_org_id::text || '/%');
  END LOOP;
  DELETE FROM public.organizations o
  WHERE o.created_by = p_user_id OR EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = o.id AND m.user_id = p_user_id AND m.role::text = 'owner'
  );
  DELETE FROM auth.sessions WHERE user_id = p_user_id;
  DELETE FROM public.organization_member_permissions WHERE user_id = p_user_id;
  DELETE FROM public.organization_members WHERE user_id = p_user_id;
  DELETE FROM public.platform_access_requests WHERE user_id = p_user_id;
  DELETE FROM public.profiles WHERE id = p_user_id;
  DELETE FROM auth.users WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'No se pudo eliminar la cuenta de autenticación.'; END IF;
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_platform_agency(p_organization_id uuid, p_confirm_name text, p_confirmation text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'auth', 'storage', 'pg_temp'
AS $function$
DECLARE v_name text; v_owner_ids uuid[]; v_owner_id uuid;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Platform administrator access required' USING ERRCODE = '42501'; END IF;
  IF btrim(coalesce(p_confirmation, '')) <> 'ELIMINAR' THEN RAISE EXCEPTION 'La confirmación final debe ser la palabra ELIMINAR.'; END IF;
  SELECT o.name INTO v_name FROM public.organizations o WHERE o.id = p_organization_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'No encontramos la agencia seleccionada.'; END IF;
  IF btrim(coalesce(p_confirm_name, '')) <> v_name THEN RAISE EXCEPTION 'El nombre escrito no coincide con el nombre actual de la agencia.'; END IF;
  SELECT array_agg(DISTINCT candidate.user_id) INTO v_owner_ids
  FROM (
    SELECT o.created_by AS user_id FROM public.organizations o WHERE o.id = p_organization_id
    UNION SELECT m.user_id FROM public.organization_members m WHERE m.organization_id = p_organization_id AND m.role::text = 'owner'
  ) candidate;
  DELETE FROM storage.objects WHERE bucket_id = 'agency-rendition-tickets'
    AND (name = p_organization_id::text OR name LIKE p_organization_id::text || '/%');
  DELETE FROM public.organizations WHERE id = p_organization_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'No se pudo eliminar la agencia seleccionada.'; END IF;
  FOREACH v_owner_id IN ARRAY coalesce(v_owner_ids, ARRAY[]::uuid[]) LOOP
    IF v_owner_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.platform_admins pa JOIN auth.users u ON lower(u.email) = lower(pa.email) WHERE u.id = v_owner_id)
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

CREATE OR REPLACE FUNCTION public.list_platform_access_requests()
RETURNS TABLE(user_id uuid, email text, full_name text, status text, requested_at timestamptz, reviewed_at timestamptz, reviewed_by text, review_note text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Platform administrator access required' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT r.user_id, r.email, r.full_name, r.status, r.requested_at, r.reviewed_at, r.reviewed_by, r.review_note
  FROM public.platform_access_requests r JOIN auth.users u ON u.id = r.user_id
  WHERE r.status = 'pending' AND u.email_confirmed_at IS NOT NULL ORDER BY r.requested_at ASC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.review_platform_access_request(p_user_id uuid, p_status text, p_note text DEFAULT NULL::text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE v_email text; v_full_name text; v_is_master_admin boolean; v_email_confirmed boolean;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Platform administrator access required' USING ERRCODE = '42501'; END IF;
  IF p_status NOT IN ('approved', 'rejected', 'suspended', 'revoked') THEN RAISE EXCEPTION 'Invalid access decision'; END IF;
  SELECT lower(btrim(coalesce(u.email, ''))),
         coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(coalesce(u.raw_user_meta_data ->> 'full_name', '')), '')),
         EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.email = lower(coalesce(u.email, ''))),
         (u.email_confirmed_at IS NOT NULL)
  INTO v_email, v_full_name, v_is_master_admin, v_email_confirmed
  FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id WHERE u.id = p_user_id;
  IF NOT FOUND OR coalesce(v_email, '') = '' THEN RAISE EXCEPTION 'No encontramos la cuenta seleccionada'; END IF;
  IF p_status IN ('approved', 'rejected') AND NOT coalesce(v_email_confirmed, false) THEN RAISE EXCEPTION 'El titular debe confirmar su correo antes de aprobar o rechazar el alta.'; END IF;
  IF v_is_master_admin THEN RAISE EXCEPTION 'La cuenta administradora central está protegida y no se puede bloquear desde esta pantalla'; END IF;
  INSERT INTO public.platform_access_requests (user_id, email, full_name, status, requested_at, reviewed_at, reviewed_by, review_note)
  VALUES (p_user_id, v_email, v_full_name, p_status, now(),
          CASE WHEN p_status IN ('approved', 'rejected') THEN now() ELSE NULL END,
          lower(btrim(coalesce(auth.jwt() ->> 'email', ''))), nullif(left(btrim(coalesce(p_note, '')), 500), ''))
  ON CONFLICT (user_id) DO UPDATE
  SET email = EXCLUDED.email, full_name = coalesce(EXCLUDED.full_name, public.platform_access_requests.full_name),
      status = EXCLUDED.status, reviewed_at = EXCLUDED.reviewed_at, reviewed_by = EXCLUDED.reviewed_by, review_note = EXCLUDED.review_note;
  RETURN true;
END;
$function$;
