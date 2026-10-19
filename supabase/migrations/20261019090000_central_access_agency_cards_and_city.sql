alter table public.organizations
  add column if not exists city text;

create or replace function public.list_platform_agencies_and_users_v2()
returns table (
  organization_id uuid,
  organization_name text,
  organization_agency_code text,
  organization_city text,
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
language plpgsql
stable
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $function$
begin
  if not public.is_platform_admin() then
    raise exception 'Platform administrator access required' using errcode = '42501';
  end if;

  return query
  select
    o.id,
    o.name,
    o.agency_code::text,
    o.city::text,
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
    exists (
      select 1 from public.platform_admins pa
      where pa.email = lower(coalesce(u.email, ''))
    )
  from public.organizations o
  left join public.organization_members m on m.organization_id = o.id
  left join auth.users u on u.id = m.user_id
  left join public.profiles p on p.id = m.user_id
  left join public.platform_access_requests r on r.user_id = m.user_id

  union all

  select
    null::uuid,
    'Sin agencia vinculada'::text,
    null::text,
    null::text,
    null::timestamptz,
    r.user_id,
    coalesce(u.email::text, r.email),
    coalesce(nullif(btrim(p.full_name), ''), r.full_name, nullif(btrim(coalesce(u.raw_user_meta_data ->> 'full_name', '')), '')),
    null::text,
    r.status,
    r.requested_at,
    r.reviewed_at,
    r.reviewed_by,
    r.review_note,
    exists (
      select 1 from public.platform_admins pa
      where pa.email = lower(coalesce(u.email, r.email))
    )
  from public.platform_access_requests r
  left join auth.users u on u.id = r.user_id
  left join public.profiles p on p.id = r.user_id
  where r.status <> 'pending'
    and not exists (
      select 1 from public.organization_members m where m.user_id = r.user_id
    )
  order by 2, 7;
end;
$function$;

grant execute on function public.list_platform_agencies_and_users_v2() to authenticated;

create or replace function public.update_platform_agency_city(
  p_organization_id uuid,
  p_city text
)
returns void
language plpgsql
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $function$
begin
  if not public.is_platform_admin() then
    raise exception 'Platform administrator access required' using errcode = '42501';
  end if;

  if length(btrim(coalesce(p_city, ''))) > 120 then
    raise exception 'Agency city is too long';
  end if;

  update public.organizations
  set city = nullif(btrim(coalesce(p_city, '')), '')
  where id = p_organization_id;

  if not found then
    raise exception 'Agency not found';
  end if;
end;
$function$;

grant execute on function public.update_platform_agency_city(uuid, text) to authenticated;
