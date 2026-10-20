CREATE OR REPLACE FUNCTION public.review_platform_access_request(p_user_id uuid, p_status text, p_note text DEFAULT NULL::text)
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
         EXISTS (SELECT 1 FROM public.platform_admins pa WHERE lower(pa.email) = lower(coalesce(u.email, '')))
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
  INSERT INTO public.platform_access_requests (user_id, email, full_name, status, requested_at, reviewed_at, reviewed_by, review_note)
  VALUES (p_user_id, v_email, v_full_name, p_status, now(),
          CASE WHEN p_status IN ('approved', 'rejected') THEN now() ELSE NULL END,
          lower(btrim(coalesce(auth.jwt() ->> 'email', ''))), nullif(left(btrim(coalesce(p_note, '')), 500), ''))
  ON CONFLICT (user_id) DO UPDATE
  SET email = EXCLUDED.email,
      full_name = coalesce(EXCLUDED.full_name, public.platform_access_requests.full_name),
      status = EXCLUDED.status,
      reviewed_at = EXCLUDED.reviewed_at,
      reviewed_by = EXCLUDED.reviewed_by,
      review_note = EXCLUDED.review_note;
  RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION public.review_platform_access_request(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_platform_access_request(uuid, text, text) TO authenticated;
