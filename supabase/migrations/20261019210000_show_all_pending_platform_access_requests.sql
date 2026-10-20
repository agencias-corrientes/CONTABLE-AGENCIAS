-- Fix: keep pending owner registrations visible to central admins even when
-- Supabase email confirmation state has not synchronized after the user follows
-- the confirmation link. The admin can explicitly approve or reject each request.
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
SET search_path = public, auth, pg_temp
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
