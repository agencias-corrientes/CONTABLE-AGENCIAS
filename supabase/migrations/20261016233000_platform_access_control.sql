-- Acceso centralizado a nuevas agencias. Aplicar primero en Preview y validar antes de Producción.
CREATE TABLE IF NOT EXISTS public.platform_admins (
  email text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_admins_email_lowercase CHECK (email = lower(btrim(email)))
);
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.platform_admins FROM anon, authenticated;

-- Administrador inicial del proyecto. Se puede sustituir al preparar la entrega definitiva.
INSERT INTO public.platform_admins (email)
VALUES ('aguarapaintball@gmail.com')
ON CONFLICT (email) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.platform_access_requests (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'suspended', 'revoked')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by text,
  review_note text
);
CREATE INDEX IF NOT EXISTS platform_access_requests_status_requested_idx
  ON public.platform_access_requests (status, requested_at DESC);
ALTER TABLE public.platform_access_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.platform_access_requests FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_admins pa
    WHERE lower(pa.email) = lower(btrim(coalesce(auth.jwt() ->> 'email', '')))
  );
$function$;
REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_platform_access_status()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required' USING ERRCODE = '42501';
  END IF;
  IF public.is_platform_admin() THEN
    RETURN 'approved';
  END IF;
  SELECT r.status INTO v_status
  FROM public.platform_access_requests r
  WHERE r.user_id = auth.uid();
  RETURN coalesce(v_status, 'not_requested');
END;
$function$;
REVOKE ALL ON FUNCTION public.get_platform_access_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_platform_access_status() TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_platform_access_request()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_email text := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
  v_name text := nullif(btrim(coalesce(auth.jwt() -> 'user_metadata' ->> 'full_name', '')), '');
  v_status text;
BEGIN
  IF v_uid IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'Authentication is required' USING ERRCODE = '42501';
  END IF;
  IF public.is_platform_admin() THEN
    RETURN 'approved';
  END IF;
  IF EXISTS (SELECT 1 FROM public.organization_members m WHERE m.user_id = v_uid) THEN
    RETURN 'member';
  END IF;

  INSERT INTO public.platform_access_requests (user_id, email, full_name, status)
  VALUES (v_uid, v_email, v_name, 'pending')
  ON CONFLICT (user_id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = coalesce(EXCLUDED.full_name, public.platform_access_requests.full_name)
    WHERE public.platform_access_requests.status = 'pending';

  SELECT r.status INTO v_status
  FROM public.platform_access_requests r
  WHERE r.user_id = v_uid;
  RETURN coalesce(v_status, 'pending');
END;
$function$;
REVOKE ALL ON FUNCTION public.submit_platform_access_request() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_platform_access_request() TO authenticated;

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
  ORDER BY (r.status <> 'pending'), r.requested_at DESC;
END;
$function$;
REVOKE ALL ON FUNCTION public.list_platform_access_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_platform_access_requests() TO authenticated;

CREATE OR REPLACE FUNCTION public.review_platform_access_request(
  p_user_id uuid,
  p_status text,
  p_note text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Platform administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('approved', 'rejected', 'suspended', 'revoked') THEN
    RAISE EXCEPTION 'Invalid access decision';
  END IF;
  UPDATE public.platform_access_requests
  SET status = p_status,
      reviewed_at = now(),
      reviewed_by = lower(btrim(coalesce(auth.jwt() ->> 'email', ''))),
      review_note = nullif(left(btrim(coalesce(p_note, '')), 500), '')
  WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Access request not found';
  END IF;
  RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION public.review_platform_access_request(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_platform_access_request(uuid, text, text) TO authenticated;

-- Registrations submitted through the owner sign-up flow create a pending request before email confirmation.
CREATE OR REPLACE FUNCTION public.capture_platform_owner_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $function$
BEGIN
  IF coalesce(NEW.raw_user_meta_data ->> 'registration_type', '') = 'agency_owner'
     AND nullif(lower(btrim(coalesce(NEW.email, ''))), '') IS NOT NULL THEN
    INSERT INTO public.platform_access_requests (user_id, email, full_name, status)
    VALUES (
      NEW.id,
      lower(btrim(NEW.email)),
      nullif(btrim(coalesce(NEW.raw_user_meta_data ->> 'full_name', '')), ''),
      'pending'
    )
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS on_auth_user_created_platform_access ON auth.users;
CREATE TRIGGER on_auth_user_created_platform_access
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.capture_platform_owner_request();

-- Any user-facing path that creates an organization must have central approval first.
CREATE OR REPLACE FUNCTION public.guard_organization_creation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to create an agency' USING ERRCODE = '42501';
  END IF;
  IF public.is_platform_admin() THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.platform_access_requests r
    WHERE r.user_id = auth.uid() AND r.status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Platform approval is required before creating an agency' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS guard_organization_creation ON public.organizations;
CREATE TRIGGER guard_organization_creation
BEFORE INSERT ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.guard_organization_creation();

-- Central suspension/revocation also blocks the membership helper used by RLS policies.
CREATE OR REPLACE FUNCTION private.is_org_member(p_org uuid, p_user uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = p_org
      AND om.user_id = p_user
      AND NOT EXISTS (
        SELECT 1 FROM public.platform_access_requests r
        WHERE r.user_id = p_user AND r.status IN ('rejected', 'suspended', 'revoked')
      )
  );
$function$;

CREATE OR REPLACE FUNCTION private.is_org_manager(p_org uuid, p_user uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = p_org
      AND om.user_id = p_user
      AND om.role IN ('owner', 'admin')
      AND NOT EXISTS (
        SELECT 1 FROM public.platform_access_requests r
        WHERE r.user_id = p_user AND r.status IN ('rejected', 'suspended', 'revoked')
      )
  );
$function$;
