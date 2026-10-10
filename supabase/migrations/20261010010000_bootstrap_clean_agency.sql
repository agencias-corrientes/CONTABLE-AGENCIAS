-- Initialize a new agency with operational defaults and official games.
-- This migration does not delete or alter existing users or agencies.

create or replace function public.bootstrap_agency_organization(
  p_name text,
  p_legal_name text default null,
  p_tax_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_org_id uuid;
  v_email text := nullif(trim(coalesce(auth.jwt() ->> 'email', '')), '');
begin
  if v_uid is null then
    raise exception 'Authentication is required';
  end if;
  if nullif(trim(p_name), '') is null or length(trim(p_name)) > 120 then
    raise exception 'Organization name is required';
  end if;
  if exists (select 1 from public.organization_members where user_id = v_uid) then
    raise exception 'User already belongs to an organization';
  end if;

  insert into public.organizations (name, legal_name, tax_id, currency_code, timezone, created_by)
  values (trim(p_name), nullif(trim(p_legal_name), ''), nullif(trim(p_tax_id), ''),
          'ARS', 'America/Argentina/Cordoba', v_uid)
  returning id into v_org_id;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_org_id, v_uid, 'owner');

  insert into public.profiles (id) values (v_uid) on conflict (id) do nothing;

  insert into public.cash_accounts (organization_id, name, type, currency_code, is_active)
  values (v_org_id, 'Caja', 'cash', 'ARS', true);

  insert into public.agency_operational_settings (
    organization_id, rendition_cutoff_time, backup_send_time, updated_by
  ) values (v_org_id, '00:00:00', '23:50:00', v_uid);

  insert into public.organization_backup_settings (
    organization_id, recipient_email, enabled, created_by, include_ticket_photo
  ) values (v_org_id, v_email, true, v_uid, true);

  insert into public.agency_game_types (
    organization_id, name, category, enabled, sort_order, created_by
  ) values
    (v_org_id, 'Quiniela Correntina', 'Quiniela', true, 10, v_uid),
    (v_org_id, 'Quiniela Al Toque', 'Quiniela', true, 20, v_uid),
    (v_org_id, 'Quiniela Poceada Correntina', 'Poceada', true, 30, v_uid),
    (v_org_id, 'Loto Plus', 'Otros juegos', true, 40, v_uid),
    (v_org_id, 'Loto 5 Plus', 'Otros juegos', true, 50, v_uid),
    (v_org_id, 'Quini 6', 'Otros juegos', true, 60, v_uid),
    (v_org_id, 'Brinco', 'Otros juegos', true, 70, v_uid),
    (v_org_id, 'Telekino', 'Otros juegos', true, 80, v_uid),
    (v_org_id, 'Quiniela Poceada Extra', 'Poceada', false, 130, v_uid),
    (v_org_id, 'Quiniela Poceada Navidad', 'Poceada', false, 140, v_uid),
    (v_org_id, 'Loto Plus Extra', 'Otros juegos', false, 150, v_uid)
  on conflict (organization_id, lower(name)) do nothing;

  return v_org_id;
end;
$function$;

revoke all on function public.bootstrap_agency_organization(text, text, text) from public, anon;
grant execute on function public.bootstrap_agency_organization(text, text, text) to authenticated;
