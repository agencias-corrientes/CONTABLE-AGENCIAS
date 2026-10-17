-- Mostrar todas las agencias y permitir gestionar también cuentas ya existentes, no solo altas nuevas.
CREATE OR REPLACE FUNCTION public.list_platform_access_requests()
RETURNS TABLE (
  user_id uuid,
  email text,
  full_name text,
  status text,
  requested_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by text,
  review_note text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Platform administrator access required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT r.user_id, r.email, r.full_name, r.status, r.requested_at,
         r.reviewed_at, r.reviewed_by, r.review_note
  FROM public.platform_access_requests r
  WHERE r.status = 'pending'
  ORDER BY r.requested_at ASC;
END;
$function$;
REVOKE ALL ON FUNCTION public.list_platform_access_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_platform_access_requests() TO authenticated;

CREATE OR REPLACE FUNCTION public.list_platform_agencies_and_users()
RETURNS TABLE (
  organization_id uuid,
  organization_name text,
  organization_created_at timestamptz,
  user_id uuid,
  email text,
  full_name text,
  role text,
  access_status text,
  requested_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by text,
  review_note text,
  is_platform_admin boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $function$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Platform administrator access required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    o.id,
    o.name,
    o.created_at,
    m.user_id,
    u.email::text,
    coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(coalesce(u.raw_user_meta_data ->> 'full_name', '')), ''), r.full_name),
    m.role::text,
    coalesce(r.status, 'active'),
    r.requested_at,
    r.reviewed_at,
    r.reviewed_by,
    r.review_note,
    EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.email = lower(coalesce(u.email, '')))
  FROM public.organizations o
  LEFT JOIN public.organization_members m ON m.organization_id = o.id
  LEFT JOIN auth.users u ON u.id = m.user_id
  LEFT JOIN public.profiles p ON p.id = m.user_id
  LEFT JOIN public.platform_access_requests r ON r.user_id = m.user_id

  UNION ALL

  SELECT
    NULL::uuid,
    'Sin agencia vinculada'::text,
    NULL::timestamptz,
    r.user_id,
    coalesce(u.email::text, r.email),
    coalesce(nullif(btrim(p.full_name), ''), r.full_name, nullif(btrim(coalesce(u.raw_user_meta_data ->> 'full_name', '')), '')),
    NULL::text,
    r.status,
    r.requested_at,
    r.reviewed_at,
    r.reviewed_by,
    r.review_note,
    EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.email = lower(coalesce(u.email, r.email)))
  FROM public.platform_access_requests r
  LEFT JOIN auth.users u ON u.id = r.user_id
  LEFT JOIN public.profiles p ON p.id = r.user_id
  WHERE r.status <> 'pending'
    AND NOT EXISTS (
      SELECT 1 FROM public.organization_members m WHERE m.user_id = r.user_id
    )
  ORDER BY 2, 5;
END;
$function$;
REVOKE ALL ON FUNCTION public.list_platform_agencies_and_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_platform_agencies_and_users() TO authenticated;

CREATE OR REPLACE FUNCTION public.review_platform_access_request(
  p_user_id uuid,
  p_status text,
  p_note text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $function$
DECLARE
  v_email text;
  v_full_name text;
  v_is_master_admin boolean;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Platform administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('approved', 'rejected', 'suspended', 'revoked') THEN
    RAISE EXCEPTION 'Invalid access decision';
  END IF;

  SELECT lower(btrim(coalesce(u.email, ''))),
         coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(coalesce(u.raw_user_meta_data ->> 'full_name', '')), '')),
         EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.email = lower(coalesce(u.email, '')))
  INTO v_email, v_full_name, v_is_master_admin
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.id = p_user_id;

  IF NOT FOUND OR coalesce(v_email, '') = '' THEN
    RAISE EXCEPTION 'No encontramos la cuenta seleccionada';
  END IF;
  IF v_is_master_admin THEN
    RAISE EXCEPTION 'La cuenta administradora central está protegida y no se puede bloquear desde esta pantalla';
  END IF;

  INSERT INTO public.platform_access_requests (
    user_id, email, full_name, status, requested_at, reviewed_at, reviewed_by, review_note
  )
  VALUES (
    p_user_id, v_email, v_full_name, p_status, now(), now(),
    lower(btrim(coalesce(auth.jwt() ->> 'email', ''))),
    nullif(left(btrim(coalesce(p_note, '')), 500), '')
  )
  ON CONFLICT (user_id) DO UPDATE
  SET email = EXCLUDED.email,
      full_name = coalesce(EXCLUDED.full_name, public.platform_access_requests.full_name),
      status = EXCLUDED.status,
      reviewed_at = now(),
      reviewed_by = EXCLUDED.reviewed_by,
      review_note = EXCLUDED.review_note;

  RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION public.review_platform_access_request(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_platform_access_request(uuid, text, text) TO authenticated;
