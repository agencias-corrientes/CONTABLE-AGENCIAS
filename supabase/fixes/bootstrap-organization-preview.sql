-- Preview-only fix for the first company setup.
-- The bootstrap function must create the organization and membership before
-- the caller is a member, so it cannot depend on caller-side RLS.
-- Production is intentionally not changed by this file.

create or replace function public.bootstrap_organization(
  p_name text,
  p_legal_name text default null,
  p_tax_id text default null,
  p_start_date date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_org uuid;
begin
  if v_user is null then
    raise exception 'Usuario no autenticado';
  end if;

  if nullif(trim(p_name), '') is null then
    raise exception 'El nombre de la empresa es obligatorio';
  end if;

  insert into public.organizations(name, legal_name, tax_id, created_by)
  values (trim(p_name), nullif(trim(p_legal_name), ''), nullif(trim(p_tax_id), ''), v_user)
  returning id into v_org;

  insert into public.organization_members(organization_id, user_id, role)
  values (v_org, v_user, 'owner');

  insert into public.profiles(id)
  values (v_user)
  on conflict (id) do nothing;

  update public.profiles
  set full_name = coalesce(
    full_name,
    nullif(
      trim(
        coalesce(
          (select raw_user_meta_data->>'full_name' from auth.users where id = v_user),
          ''
        )
      ),
      ''
    )
  ),
  updated_at = now()
  where id = v_user;

  insert into public.fiscal_periods(organization_id, name, start_date, end_date)
  values (
    v_org,
    extract(year from p_start_date)::text,
    p_start_date,
    (date_trunc('year', p_start_date)::date + interval '1 year - 1 day')::date
  );

  insert into public.accounts(organization_id, code, name, type) values
    (v_org,'1.1.01','Caja','asset'),
    (v_org,'1.1.02','Bancos','asset'),
    (v_org,'1.1.03','Créditos por ventas','asset'),
    (v_org,'2.1.01','Proveedores','liability'),
    (v_org,'3.1','Patrimonio neto','equity'),
    (v_org,'4.1','Ventas y servicios','income'),
    (v_org,'5.1','Gastos administrativos','expense'),
    (v_org,'5.2','Gastos comerciales','expense'),
    (v_org,'5.3','Impuestos y tasas','expense');

  insert into public.cost_centers(organization_id, code, name) values
    (v_org,'ADMIN','Administración'),
    (v_org,'COM','Comercial');

  insert into public.cash_accounts(organization_id, name, type) values
    (v_org,'Caja principal','cash'),
    (v_org,'Banco principal','bank');

  return v_org;
end;
$$;

revoke all on function public.bootstrap_organization(text,text,text,date) from public, anon;
grant execute on function public.bootstrap_organization(text,text,text,date) to authenticated;
