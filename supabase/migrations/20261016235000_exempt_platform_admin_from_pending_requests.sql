-- No tratar a un administrador maestro como usuario pendiente si también se registra como titular.
CREATE OR REPLACE FUNCTION private.is_org_member(p_org uuid, p_user uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = p_org
      AND om.user_id = p_user
      AND (
        EXISTS (
          SELECT 1 FROM auth.users u
          JOIN public.platform_admins pa ON lower(pa.email) = lower(coalesce(u.email, ''))
          WHERE u.id = p_user
        )
        OR NOT EXISTS (
          SELECT 1 FROM public.platform_access_requests r
          WHERE r.user_id = p_user AND r.status <> 'approved'
        )
      )
  );
$function$;

CREATE OR REPLACE FUNCTION private.is_org_manager(p_org uuid, p_user uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = p_org
      AND om.user_id = p_user
      AND om.role IN ('owner','admin')
      AND (
        EXISTS (
          SELECT 1 FROM auth.users u
          JOIN public.platform_admins pa ON lower(pa.email) = lower(coalesce(u.email, ''))
          WHERE u.id = p_user
        )
        OR NOT EXISTS (
          SELECT 1 FROM public.platform_access_requests r
          WHERE r.user_id = p_user AND r.status <> 'approved'
        )
      )
  );
$function$;

CREATE OR REPLACE FUNCTION private.is_org_accounting(p_org uuid, p_user uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = p_org
      AND om.user_id = p_user
      AND om.role IN ('owner','admin','accountant')
      AND (
        EXISTS (
          SELECT 1 FROM auth.users u
          JOIN public.platform_admins pa ON lower(pa.email) = lower(coalesce(u.email, ''))
          WHERE u.id = p_user
        )
        OR NOT EXISTS (
          SELECT 1 FROM public.platform_access_requests r
          WHERE r.user_id = p_user AND r.status <> 'approved'
        )
      )
  );
$function$;

CREATE OR REPLACE FUNCTION private.has_org_permission(
  p_organization_id uuid,
  p_permission text,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
  SELECT
    (
      EXISTS (
        SELECT 1 FROM auth.users u
        JOIN public.platform_admins pa ON lower(pa.email) = lower(coalesce(u.email, ''))
        WHERE u.id = p_user_id
      )
      OR NOT EXISTS (
        SELECT 1 FROM public.platform_access_requests r
        WHERE r.user_id = p_user_id AND r.status <> 'approved'
      )
    )
    AND (
      EXISTS (
        SELECT 1 FROM public.organization_members member
        WHERE member.organization_id = p_organization_id
          AND member.user_id = p_user_id
          AND member.role IN ('owner', 'admin')
      )
      OR coalesce((
        SELECT CASE p_permission
          WHEN 'can_create_agents' THEN permissions.can_create_agents
          WHEN 'can_delete_agents' THEN permissions.can_delete_agents
          WHEN 'can_create_renditions' THEN permissions.can_create_renditions
          WHEN 'can_edit_renditions' THEN permissions.can_edit_renditions
          WHEN 'can_delete_renditions' THEN permissions.can_delete_renditions
          WHEN 'can_register_payments' THEN permissions.can_register_payments
          WHEN 'can_manage_backups' THEN permissions.can_manage_backups
          ELSE false
        END
        FROM public.organization_member_permissions permissions
        WHERE permissions.organization_id = p_organization_id
          AND permissions.user_id = p_user_id
      ), false)
    );
$function$;

CREATE OR REPLACE FUNCTION public.capture_platform_owner_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
BEGIN
  IF coalesce(NEW.raw_user_meta_data ->> 'registration_type', '') = 'agency_owner'
     AND nullif(lower(btrim(coalesce(NEW.email, ''))), '') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.platform_admins pa
       WHERE pa.email = lower(btrim(NEW.email))
     ) THEN
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

-- Clear only central-admin request metadata; this does not delete accounts, memberships or agency records.
DELETE FROM public.platform_access_requests r
USING public.platform_admins pa
WHERE lower(r.email) = pa.email;
