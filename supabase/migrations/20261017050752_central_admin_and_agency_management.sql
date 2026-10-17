-- Administración de administradores centrales y ciclo de vida de usuarios/agencias.
-- Diseñado para aplicarse primero en Preview. No cambia permisos ni datos de Producción.
CREATE OR REPLACE FUNCTION public.list_platform_admins()
RETURNS TABLE (email text, created_at timestamptz, is_current_admin boolean, has_account boolean, email_confirmed boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth, pg_temp
AS $function$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Platform administrator access required' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT pa.email, pa.created_at,
         pa.email = lower(btrim(coalesce(auth.jwt() ->> 'email', ''))),
         EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = pa.email),
         EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = pa.email AND u.email_confirmed_at IS NOT NULL)
  FROM public.platform_admins pa
  ORDER BY pa.created_at ASC, pa.email ASC;
END;
$function$;
REVOKE ALL ON FUNCTION public.list_platform_admins() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_platform_admins() TO authenticated;

CREATE OR REPLACE FUNCTION public.add_platform_admin(p_email text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp
AS $function$
DECLARE v_email text := lower(btrim(coalesce(p_email, ''))); v_user_id uuid; v_confirmed_at timestamptz;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Platform administrator access required' USING ERRCODE = '42501'; END IF;
  IF v_email = '' OR length(v_email) > 254 OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'Invalid email address'; END IF;
  SELECT u.id, u.email_confirmed_at INTO v_user_id, v_confirmed_at FROM auth.users u WHERE lower(u.email) = v_email LIMIT 1;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'No existe una cuenta registrada con ese correo. Primero debe crear su cuenta y confirmar el email.'; END IF;
  IF v_confirmed_at IS NULL THEN RAISE EXCEPTION 'Ese correo todavía no fue confirmado. Primero debe confirmar el email.'; END IF;
  INSERT INTO public.platform_admins (email) VALUES (v_email) ON CONFLICT (email) DO NOTHING;
  DELETE FROM public.platform_access_requests WHERE user_id = v_user_id;
  RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION public.add_platform_admin(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_platform_admin(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_platform_admin(p_email text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE v_email text := lower(btrim(coalesce(p_email, ''))); v_count integer;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Platform administrator access required' USING ERRCODE = '42501'; END IF;
  SELECT count(*) INTO v_count FROM public.platform_admins;
  IF v_count <= 1 THEN RAISE EXCEPTION 'No se puede quitar el último administrador central. Primero autorizá otra cuenta.'; END IF;
  DELETE FROM public.platform_admins WHERE email = v_email;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ese correo no figura como administrador central.'; END IF;
  RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION public.remove_platform_admin(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_platform_admin(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_platform_users()
RETURNS TABLE (
  user_id uuid, email text, full_name text, created_at timestamptz, email_confirmed_at timestamptz,
  is_platform_admin boolean, membership_count integer, agency_names text, owner_agency_count integer, created_agency_count integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth, pg_temp
AS $function$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Platform administrator access required' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT u.id, u.email::text,
         coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(coalesce(u.raw_user_meta_data ->> 'full_name', '')), '')),
         u.created_at, u.email_confirmed_at,
         EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.email = lower(coalesce(u.email, ''))),
         coalesce(ms.membership_count, 0)::integer,
         coalesce(ms.agency_names, 'Sin agencia vinculada')::text,
         coalesce(ms.owner_agency_count, 0)::integer,
         coalesce(cs.created_agency_count, 0)::integer
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  LEFT JOIN LATERAL (
    SELECT count(*)::integer AS membership_count,
           string_agg(DISTINCT o.name, ', ' ORDER BY o.name) AS agency_names,
           count(*) FILTER (WHERE m.role::text = 'owner')::integer AS owner_agency_count
    FROM public.organization_members m JOIN public.organizations o ON o.id = m.organization_id WHERE m.user_id = u.id
  ) ms ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::integer AS created_agency_count FROM public.organizations o WHERE o.created_by = u.id
  ) cs ON true
  ORDER BY lower(coalesce(u.email, '')), u.created_at;
END;
$function$;
REVOKE ALL ON FUNCTION public.list_platform_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_platform_users() TO authenticated;

CREATE OR REPLACE FUNCTION public.update_platform_user_name(p_user_id uuid, p_full_name text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp
AS $function$
DECLARE v_name text := nullif(btrim(coalesce(p_full_name, '')), '');
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Platform administrator access required' USING ERRCODE = '42501'; END IF;
  IF p_user_id IS NULL OR v_name IS NULL OR length(v_name) > 120 THEN RAISE EXCEPTION 'Ingresá un nombre válido de hasta 120 caracteres.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN RAISE EXCEPTION 'No encontramos la cuenta seleccionada.'; END IF;
  INSERT INTO public.profiles (id, full_name) VALUES (p_user_id, v_name)
  ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, updated_at = now();
  UPDATE auth.users SET raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('full_name', v_name), updated_at = now() WHERE id = p_user_id;
  UPDATE public.platform_access_requests SET full_name = v_name WHERE user_id = p_user_id;
  RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION public.update_platform_user_name(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_platform_user_name(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_platform_agency_name(p_organization_id uuid, p_name text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE v_name text := btrim(coalesce(p_name, ''));
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Platform administrator access required' USING ERRCODE = '42501'; END IF;
  IF p_organization_id IS NULL OR v_name = '' OR length(v_name) > 120 THEN RAISE EXCEPTION 'Ingresá un nombre de agencia válido de hasta 120 caracteres.'; END IF;
  UPDATE public.organizations SET name = v_name, updated_at = now() WHERE id = p_organization_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'No encontramos la agencia seleccionada.'; END IF;
  RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION public.update_platform_agency_name(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_platform_agency_name(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.transfer_platform_agency_owner(p_organization_id uuid, p_previous_owner_user_id uuid, p_new_owner_email text, p_confirm_name text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp
AS $function$
DECLARE v_agency_name text; v_new_email text := lower(btrim(coalesce(p_new_owner_email, ''))); v_new_user_id uuid; v_confirmed_at timestamptz; v_status text;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Platform administrator access required' USING ERRCODE = '42501'; END IF;
  SELECT o.name INTO v_agency_name FROM public.organizations o WHERE o.id = p_organization_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'No encontramos la agencia seleccionada.'; END IF;
  IF btrim(coalesce(p_confirm_name, '')) <> v_agency_name THEN RAISE EXCEPTION 'Para transferir, escribí exactamente el nombre actual de la agencia.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = p_organization_id AND m.user_id = p_previous_owner_user_id AND m.role::text = 'owner') THEN RAISE EXCEPTION 'La cuenta anterior ya no figura como titular de esa agencia.'; END IF;
  IF v_new_email = '' OR v_new_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'Ingresá un correo válido de la nueva persona titular.'; END IF;
  SELECT u.id, u.email_confirmed_at INTO v_new_user_id, v_confirmed_at FROM auth.users u WHERE lower(u.email) = v_new_email LIMIT 1;
  IF v_new_user_id IS NULL THEN RAISE EXCEPTION 'La nueva persona titular debe crear su cuenta y confirmar el correo primero.'; END IF;
  IF v_confirmed_at IS NULL THEN RAISE EXCEPTION 'El correo de la nueva persona titular todavía no está confirmado.'; END IF;
  IF v_new_user_id = p_previous_owner_user_id THEN RAISE EXCEPTION 'La nueva persona titular debe ser una cuenta diferente.'; END IF;
  IF EXISTS (SELECT 1 FROM public.organization_members m WHERE m.user_id = v_new_user_id AND m.organization_id <> p_organization_id) THEN RAISE EXCEPTION 'La cuenta nueva ya pertenece a otra agencia. Cada titular necesita una cuenta separada.'; END IF;
  SELECT r.status INTO v_status FROM public.platform_access_requests r WHERE r.user_id = v_new_user_id;
  IF v_status IS NOT NULL AND v_status <> 'approved' AND NOT EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.email = v_new_email) THEN RAISE EXCEPTION 'La nueva cuenta todavía no está autorizada por Administración Central.'; END IF;
  INSERT INTO public.organization_members (organization_id, user_id, role) VALUES (p_organization_id, v_new_user_id, 'owner'::public.organization_role)
  ON CONFLICT (organization_id, user_id) DO UPDATE SET role = 'owner'::public.organization_role;
  UPDATE public.organizations SET created_by = v_new_user_id, updated_at = now() WHERE id = p_organization_id AND created_by = p_previous_owner_user_id;
  DELETE FROM public.organization_member_permissions WHERE organization_id = p_organization_id AND user_id = p_previous_owner_user_id;
  DELETE FROM public.organization_members WHERE organization_id = p_organization_id AND user_id = p_previous_owner_user_id;
  RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION public.transfer_platform_agency_owner(uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_platform_agency_owner(uuid, uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_platform_agency(p_organization_id uuid, p_confirm_name text, p_confirmation text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp
AS $function$
DECLARE v_name text;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Platform administrator access required' USING ERRCODE = '42501'; END IF;
  IF btrim(coalesce(p_confirmation, '')) <> 'ELIMINAR' THEN RAISE EXCEPTION 'La confirmación final debe ser la palabra ELIMINAR.'; END IF;
  SELECT o.name INTO v_name FROM public.organizations o WHERE o.id = p_organization_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'No encontramos la agencia seleccionada.'; END IF;
  IF btrim(coalesce(p_confirm_name, '')) <> v_name THEN RAISE EXCEPTION 'El nombre escrito no coincide con el nombre actual de la agencia.'; END IF;
  DELETE FROM public.organizations WHERE id = p_organization_id;
  RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION public.delete_platform_agency(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_platform_agency(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_platform_user(p_user_id uuid, p_confirm_email text, p_confirmation text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp
AS $function$
DECLARE v_email text;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Platform administrator access required' USING ERRCODE = '42501'; END IF;
  IF btrim(coalesce(p_confirmation, '')) <> 'ELIMINAR' THEN RAISE EXCEPTION 'La confirmación final debe ser la palabra ELIMINAR.'; END IF;
  IF p_user_id IS NULL OR p_user_id = auth.uid() THEN RAISE EXCEPTION 'No podés eliminar la cuenta con la que estás usando Administración Central. Ingresá con otro administrador autorizado.'; END IF;
  SELECT lower(btrim(coalesce(u.email, ''))) INTO v_email FROM auth.users u WHERE u.id = p_user_id;
  IF NOT FOUND OR v_email = '' THEN RAISE EXCEPTION 'No encontramos la cuenta seleccionada.'; END IF;
  IF btrim(lower(coalesce(p_confirm_email, ''))) <> v_email THEN RAISE EXCEPTION 'El correo escrito no coincide con el de la cuenta seleccionada.'; END IF;
  IF EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.email = v_email) THEN RAISE EXCEPTION 'Primero retirale el permiso de administrador central desde la lista de administradores.'; END IF;
  IF EXISTS (SELECT 1 FROM public.organization_members m WHERE m.user_id = p_user_id AND m.role::text = 'owner') THEN RAISE EXCEPTION 'La cuenta todavía es titular de una agencia. Transferí la titularidad o eliminá esa agencia primero.'; END IF;
  IF EXISTS (SELECT 1 FROM public.organizations o WHERE o.created_by = p_user_id) THEN RAISE EXCEPTION 'La cuenta creó una agencia que todavía existe. Transferí la titularidad de esa agencia o eliminá la agencia primero.'; END IF;
  DELETE FROM auth.sessions WHERE user_id = p_user_id;
  DELETE FROM public.organization_member_permissions WHERE user_id = p_user_id;
  DELETE FROM public.organization_members WHERE user_id = p_user_id;
  DELETE FROM public.platform_access_requests WHERE user_id = p_user_id;
  DELETE FROM auth.users WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'No se pudo eliminar la cuenta de autenticación.'; END IF;
  RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION public.delete_platform_user(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_platform_user(uuid, text, text) TO authenticated;
