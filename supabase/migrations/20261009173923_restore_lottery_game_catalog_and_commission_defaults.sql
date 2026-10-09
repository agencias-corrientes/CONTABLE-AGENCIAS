CREATE OR REPLACE FUNCTION public.bootstrap_organization(
  p_name text,
  p_legal_name text DEFAULT NULL::text,
  p_tax_id text DEFAULT NULL::text,
  p_start_date date DEFAULT (date_trunc('year'::text, (CURRENT_DATE)::timestamp with time zone))::date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org_id uuid;
  v_period_id uuid;
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Authentication is required';
  end if;
  if nullif(trim(p_name), '') is null then
    raise exception 'Organization name is required';
  end if;
  if exists (
    select 1 from public.organization_members where user_id = v_uid
  ) then
    raise exception 'User already belongs to an organization';
  end if;

  insert into public.organizations (name, legal_name, tax_id, created_by)
  values (trim(p_name), nullif(trim(p_legal_name), ''),
          nullif(trim(p_tax_id), ''), v_uid)
  returning id into v_org_id;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_org_id, v_uid, 'owner');

  insert into public.profiles (id) values (v_uid)
  on conflict (id) do nothing;

  insert into public.fiscal_periods (organization_id, name, start_date, end_date, status)
  values (v_org_id, extract(year from p_start_date)::text, p_start_date,
          make_date(extract(year from p_start_date)::int, 12, 31), 'open')
  returning id into v_period_id;

  insert into public.cost_centers (organization_id, code, name)
  values (v_org_id, 'ADM', 'Administración'),
         (v_org_id, 'COM', 'Comercial'),
         (v_org_id, 'GEN', 'General');

  insert into public.accounts (organization_id, code, name, type, allow_posting)
  values
    (v_org_id, '1', 'ACTIVO', 'asset', false),
    (v_org_id, '1.1', 'ACTIVO CORRIENTE', 'asset', false),
    (v_org_id, '1.1.01', 'Caja', 'asset', true),
    (v_org_id, '1.1.02', 'Bancos', 'asset', true),
    (v_org_id, '1.1.03', 'Créditos por ventas', 'asset', true),
    (v_org_id, '2', 'PASIVO', 'liability', false),
    (v_org_id, '2.1', 'PASIVO CORRIENTE', 'liability', false),
    (v_org_id, '2.1.01', 'Proveedores', 'liability', true),
    (v_org_id, '3', 'PATRIMONIO NETO', 'equity', false),
    (v_org_id, '3.1', 'Capital', 'equity', true),
    (v_org_id, '4', 'INGRESOS', 'income', false),
    (v_org_id, '4.1', 'Ventas y servicios', 'income', true),
    (v_org_id, '5', 'EGRESOS', 'expense', false),
    (v_org_id, '5.1', 'Gastos administrativos', 'expense', true),
    (v_org_id, '5.2', 'Gastos comerciales', 'expense', true),
    (v_org_id, '5.3', 'Impuestos y tasas', 'expense', true);

  update public.accounts child
     set parent_id = parent.id
    from public.accounts parent
   where child.organization_id = v_org_id
     and parent.organization_id = v_org_id
     and (
       (child.code = '1.1' and parent.code = '1')
       or (child.code = '2.1' and parent.code = '2')
       or (child.code = '3.1' and parent.code = '3')
       or (child.code = '4.1' and parent.code = '4')
       or (child.code = '5.1' and parent.code = '5')
       or (child.code = '5.2' and parent.code = '5')
       or (child.code = '5.3' and parent.code = '5')
       or (child.code in ('1.1.01','1.1.02','1.1.03') and parent.code = '1.1')
       or (child.code = '2.1.01' and parent.code = '2.1')
     );

  insert into public.cash_accounts (organization_id, name, type)
  values (v_org_id, 'Caja principal', 'cash'),
         (v_org_id, 'Banco principal', 'bank');

  -- Inicializa el catálogo de juegos oficiales y de uso habitual por agencia.
  insert into public.agency_game_types
    (organization_id, name, category, enabled, sort_order, created_by)
  values
    (v_org_id, 'Quiniela Correntina', 'Quiniela', true, 10, v_uid),
    (v_org_id, 'Quiniela Poceada Correntina', 'Poceada', true, 20, v_uid),
    (v_org_id, 'Quiniela Al Toque', 'Quiniela', true, 30, v_uid),
    (v_org_id, 'Quini 6', 'Otros juegos', true, 40, v_uid),
    (v_org_id, 'Loto Plus', 'Otros juegos', true, 50, v_uid),
    (v_org_id, 'Loto 5 Plus', 'Otros juegos', true, 60, v_uid),
    (v_org_id, 'Brinco', 'Otros juegos', true, 70, v_uid),
    (v_org_id, 'Telekino', 'Otros juegos', true, 80, v_uid),
    (v_org_id, 'Lotería Unificada', 'Otros juegos', true, 90, v_uid);

  insert into public.agency_game_commission_defaults
    (organization_id, game_type_id, commission_percent, created_by)
  select v_org_id, g.id, 0, v_uid
  from public.agency_game_types g
  where g.organization_id = v_org_id;

  return v_org_id;
end;
$function$;

-- Restaura el catálogo para organizaciones existentes que lo tengan completamente vacío.
WITH seeds(name, category, sort_order) AS (
  VALUES
    ('Quiniela Correntina', 'Quiniela', 10),
    ('Quiniela Poceada Correntina', 'Poceada', 20),
    ('Quiniela Al Toque', 'Quiniela', 30),
    ('Quini 6', 'Otros juegos', 40),
    ('Loto Plus', 'Otros juegos', 50),
    ('Loto 5 Plus', 'Otros juegos', 60),
    ('Brinco', 'Otros juegos', 70),
    ('Telekino', 'Otros juegos', 80),
    ('Lotería Unificada', 'Otros juegos', 90)
)
INSERT INTO public.agency_game_types
  (organization_id, name, category, enabled, sort_order, created_by)
SELECT o.id, s.name, s.category, true, s.sort_order, o.created_by
FROM public.organizations o
CROSS JOIN seeds s
WHERE NOT EXISTS (
  SELECT 1 FROM public.agency_game_types existing
  WHERE existing.organization_id = o.id
);

-- Inicializa comisiones generales editables (0% hasta que el titular confirme las tasas reales).
INSERT INTO public.agency_game_commission_defaults
  (organization_id, game_type_id, commission_percent, created_by)
SELECT g.organization_id, g.id, 0, g.created_by
FROM public.agency_game_types g
LEFT JOIN public.agency_game_commission_defaults d
  ON d.organization_id = g.organization_id
 AND d.game_type_id = g.id
WHERE d.game_type_id IS NULL;
