-- Restore the permission helper used by the rendition RPCs and employee permission checks.
-- This is intentionally scoped to the helper only; the broader security migration is reviewed separately.
CREATE OR REPLACE FUNCTION private.has_org_permission(
  p_organization_id uuid,
  p_permission text,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $function$
  SELECT
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
    ), false);
$function$;
REVOKE ALL ON FUNCTION private.has_org_permission(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_org_permission(uuid, text, uuid) TO authenticated;
