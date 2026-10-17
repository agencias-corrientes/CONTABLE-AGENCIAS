-- Completar el bloqueo central en todas las reglas RLS de Preview que miraban miembros directamente.
-- No borra membresías ni movimientos: el estado central corta el acceso hasta que se vuelva a aprobar.

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
      AND NOT EXISTS (
        SELECT 1 FROM public.platform_access_requests r
        WHERE r.user_id = p_user AND r.status <> 'approved'
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
      AND NOT EXISTS (
        SELECT 1 FROM public.platform_access_requests r
        WHERE r.user_id = p_user AND r.status <> 'approved'
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
      AND NOT EXISTS (
        SELECT 1 FROM public.platform_access_requests r
        WHERE r.user_id = p_user AND r.status <> 'approved'
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
    NOT EXISTS (
      SELECT 1 FROM public.platform_access_requests r
      WHERE r.user_id = p_user_id AND r.status <> 'approved'
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

CREATE OR REPLACE FUNCTION private.same_org_user(p_user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT private.is_org_member(
    (SELECT me.organization_id FROM public.organization_members me
     WHERE me.user_id = auth.uid() LIMIT 1),
    auth.uid()
  ) AND EXISTS (
    SELECT 1
    FROM public.organization_members me
    JOIN public.organization_members other ON other.organization_id = me.organization_id
    WHERE me.user_id = auth.uid()
      AND other.user_id = p_user
      AND private.is_org_member(me.organization_id, me.user_id)
      AND private.is_org_member(other.organization_id, other.user_id)
  );
$function$;

DROP POLICY IF EXISTS agency_agent_daily_status_member_select ON public.agency_agent_daily_status;
CREATE POLICY agency_agent_daily_status_member_select ON public.agency_agent_daily_status
  FOR SELECT USING (private.is_org_member(organization_id, auth.uid()));

DROP POLICY IF EXISTS agency_agent_draw_status_member_select ON public.agency_agent_draw_status;
CREATE POLICY agency_agent_draw_status_member_select ON public.agency_agent_draw_status
  FOR SELECT USING (private.is_org_member(organization_id, auth.uid()));

DROP POLICY IF EXISTS agent_game_commissions_owner_delete ON public.agency_agent_game_commissions;
CREATE POLICY agent_game_commissions_owner_delete ON public.agency_agent_game_commissions
  FOR DELETE USING (private.is_org_member(organization_id, auth.uid()) AND EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = agency_agent_game_commissions.organization_id
      AND m.user_id = auth.uid() AND m.role = 'owner'
  ));

DROP POLICY IF EXISTS agent_game_commissions_owner_insert ON public.agency_agent_game_commissions;
CREATE POLICY agent_game_commissions_owner_insert ON public.agency_agent_game_commissions
  FOR INSERT WITH CHECK (private.is_org_member(organization_id, auth.uid()) AND EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = agency_agent_game_commissions.organization_id
      AND m.user_id = auth.uid() AND m.role = 'owner'
  ));

DROP POLICY IF EXISTS agent_game_commissions_owner_update ON public.agency_agent_game_commissions;
CREATE POLICY agent_game_commissions_owner_update ON public.agency_agent_game_commissions
  FOR UPDATE USING (private.is_org_member(organization_id, auth.uid()) AND EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = agency_agent_game_commissions.organization_id
      AND m.user_id = auth.uid() AND m.role = 'owner'
  )) WITH CHECK (private.is_org_member(organization_id, auth.uid()) AND EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = agency_agent_game_commissions.organization_id
      AND m.user_id = auth.uid() AND m.role = 'owner'
  ));

DROP POLICY IF EXISTS agency_game_commission_defaults_owner_delete ON public.agency_game_commission_defaults;
CREATE POLICY agency_game_commission_defaults_owner_delete ON public.agency_game_commission_defaults
  FOR DELETE USING (private.is_org_member(organization_id, auth.uid()) AND EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = agency_game_commission_defaults.organization_id
      AND m.user_id = auth.uid() AND m.role = 'owner'
  ));

DROP POLICY IF EXISTS agency_game_commission_defaults_owner_insert ON public.agency_game_commission_defaults;
CREATE POLICY agency_game_commission_defaults_owner_insert ON public.agency_game_commission_defaults
  FOR INSERT WITH CHECK (private.is_org_member(organization_id, auth.uid()) AND EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = agency_game_commission_defaults.organization_id
      AND m.user_id = auth.uid() AND m.role = 'owner'
  ));

DROP POLICY IF EXISTS agency_game_commission_defaults_owner_update ON public.agency_game_commission_defaults;
CREATE POLICY agency_game_commission_defaults_owner_update ON public.agency_game_commission_defaults
  FOR UPDATE USING (private.is_org_member(organization_id, auth.uid()) AND EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = agency_game_commission_defaults.organization_id
      AND m.user_id = auth.uid() AND m.role = 'owner'
  )) WITH CHECK (private.is_org_member(organization_id, auth.uid()) AND EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = agency_game_commission_defaults.organization_id
      AND m.user_id = auth.uid() AND m.role = 'owner'
  ));

DROP POLICY IF EXISTS agency_game_types_member_select ON public.agency_game_types;
CREATE POLICY agency_game_types_member_select ON public.agency_game_types
  FOR SELECT USING (private.is_org_member(organization_id, auth.uid()));

DROP POLICY IF EXISTS agency_game_types_owner_delete ON public.agency_game_types;
CREATE POLICY agency_game_types_owner_delete ON public.agency_game_types
  FOR DELETE USING (private.is_org_member(organization_id, auth.uid()) AND EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = agency_game_types.organization_id
      AND m.user_id = auth.uid() AND m.role = 'owner'
  ));

DROP POLICY IF EXISTS agency_game_types_owner_insert ON public.agency_game_types;
CREATE POLICY agency_game_types_owner_insert ON public.agency_game_types
  FOR INSERT WITH CHECK (private.is_org_member(organization_id, auth.uid()) AND EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = agency_game_types.organization_id
      AND m.user_id = auth.uid() AND m.role = 'owner'
  ));

DROP POLICY IF EXISTS agency_game_types_owner_update ON public.agency_game_types;
CREATE POLICY agency_game_types_owner_update ON public.agency_game_types
  FOR UPDATE USING (private.is_org_member(organization_id, auth.uid()) AND EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = agency_game_types.organization_id
      AND m.user_id = auth.uid() AND m.role = 'owner'
  )) WITH CHECK (private.is_org_member(organization_id, auth.uid()) AND EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = agency_game_types.organization_id
      AND m.user_id = auth.uid() AND m.role = 'owner'
  ));

DROP POLICY IF EXISTS agency_operational_settings_member_select ON public.agency_operational_settings;
CREATE POLICY agency_operational_settings_member_select ON public.agency_operational_settings
  FOR SELECT USING (private.is_org_member(organization_id, auth.uid()));

DROP POLICY IF EXISTS agency_operational_settings_owner_insert ON public.agency_operational_settings;
CREATE POLICY agency_operational_settings_owner_insert ON public.agency_operational_settings
  FOR INSERT WITH CHECK (private.is_org_member(organization_id, auth.uid()) AND EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = agency_operational_settings.organization_id
      AND m.user_id = auth.uid() AND m.role = 'owner'
  ));

DROP POLICY IF EXISTS agency_operational_settings_owner_update ON public.agency_operational_settings;
CREATE POLICY agency_operational_settings_owner_update ON public.agency_operational_settings
  FOR UPDATE USING (private.is_org_member(organization_id, auth.uid()) AND EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = agency_operational_settings.organization_id
      AND m.user_id = auth.uid() AND m.role = 'owner'
  )) WITH CHECK (private.is_org_member(organization_id, auth.uid()) AND EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = agency_operational_settings.organization_id
      AND m.user_id = auth.uid() AND m.role = 'owner'
  ));

DROP POLICY IF EXISTS agency_rendition_backup_outbox_owner_select ON public.agency_rendition_backup_outbox;
CREATE POLICY agency_rendition_backup_outbox_owner_select ON public.agency_rendition_backup_outbox
  FOR SELECT USING (private.is_org_member(organization_id, auth.uid()) AND EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = agency_rendition_backup_outbox.organization_id
      AND m.user_id = auth.uid() AND m.role = 'owner'
  ));

DROP POLICY IF EXISTS agency_rendition_game_amounts_member_select ON public.agency_rendition_game_amounts;
CREATE POLICY agency_rendition_game_amounts_member_select ON public.agency_rendition_game_amounts
  FOR SELECT USING (private.is_org_member(organization_id, auth.uid()));

DROP POLICY IF EXISTS agency_rendition_tickets_member_select ON public.agency_rendition_tickets;
CREATE POLICY agency_rendition_tickets_member_select ON public.agency_rendition_tickets
  FOR SELECT USING (private.is_org_member(organization_id, auth.uid()));

DROP POLICY IF EXISTS organization_backup_settings_owner_all ON public.organization_backup_settings;
CREATE POLICY organization_backup_settings_owner_all ON public.organization_backup_settings
  FOR ALL USING (private.is_org_member(organization_id, auth.uid()) AND EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = organization_backup_settings.organization_id
      AND m.user_id = auth.uid() AND m.role = 'owner'
  )) WITH CHECK (private.is_org_member(organization_id, auth.uid()) AND EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = organization_backup_settings.organization_id
      AND m.user_id = auth.uid() AND m.role = 'owner'
  ));

DROP POLICY IF EXISTS organization_member_permissions_owner_manage ON public.organization_member_permissions;
CREATE POLICY organization_member_permissions_owner_manage ON public.organization_member_permissions
  FOR ALL USING (private.is_org_member(organization_id, auth.uid()) AND EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = organization_member_permissions.organization_id
      AND m.user_id = auth.uid() AND m.role = 'owner'
  )) WITH CHECK (private.is_org_member(organization_id, auth.uid()) AND EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = organization_member_permissions.organization_id
      AND m.user_id = auth.uid() AND m.role = 'owner'
  ));

DROP POLICY IF EXISTS organization_member_permissions_self_select ON public.organization_member_permissions;
CREATE POLICY organization_member_permissions_self_select ON public.organization_member_permissions
  FOR SELECT USING (private.is_org_member(organization_id, auth.uid()) AND (
    user_id = auth.uid() OR EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.organization_id = organization_member_permissions.organization_id
        AND m.user_id = auth.uid() AND m.role = 'owner'
    )
  ));

DROP POLICY IF EXISTS members_select ON public.organization_members;
CREATE POLICY members_select ON public.organization_members
  FOR SELECT USING (private.is_org_member(organization_id, auth.uid()) AND (
    auth.uid() = user_id OR private.is_org_manager(organization_id, auth.uid())
  ));
