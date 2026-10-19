-- Fix daily correction so a successfully corrected and fully paid closure clears the stale incomplete status.
-- Intended for the isolated CONTABLE-AGENCIAS-PREVIEW database.
create or replace function public.correct_agency_daily_rendition_net_amount(
  p_organization_id uuid,
  p_rendition_id uuid,
  p_new_net_amount numeric,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_rendition public.agency_renditions%rowtype;
  v_old_net numeric;
  v_old_paid numeric;
  v_new_paid numeric := 0;
  v_payment_count integer := 0;
  v_index integer := 0;
  v_remainder numeric;
  v_piece numeric;
  v_direction text;
  v_movement_amount numeric;
  v_payment record;
begin
  if auth.uid() is null or not private.has_org_permission(p_organization_id, 'can_edit_renditions', auth.uid()) then
    raise exception 'No tenés permiso para corregir rendiciones';
  end if;
  if p_new_net_amount is null or round(p_new_net_amount, 2) <= 0 or p_new_net_amount > 999999999999.99 then
    raise exception 'El nuevo importe neto debe ser mayor que cero';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception 'Indicá el motivo de la corrección';
  end if;

  select r.* into v_rendition
  from public.agency_renditions r
  where r.id = p_rendition_id
    and r.organization_id = p_organization_id
    and lower(btrim(coalesce(r.game_period, ''))) = 'cierre diario'
    and r.status = 'closed'
  for update;
  if not found then
    raise exception 'Solo se puede corregir un cierre diario confirmado y cobrado';
  end if;

  v_old_net := coalesce(v_rendition.net_due, v_rendition.amount_due);
  select count(*), coalesce(sum(p.amount), 0)
    into v_payment_count, v_old_paid
  from public.agency_rendition_payments p
  where p.organization_id = p_organization_id
    and p.rendition_id = p_rendition_id;

  if v_payment_count = 0 or abs(round(v_old_paid, 2) - round(v_old_net, 2)) > 0.01 then
    raise exception 'Los cobros vinculados a Caja no coinciden con el importe del cierre';
  end if;
  if round(p_new_net_amount, 2) < v_payment_count * 0.01 then
    raise exception 'El importe es demasiado bajo para redistribuir los cobros registrados';
  end if;

  v_remainder := round(p_new_net_amount, 2);
  for v_payment in
    select p.id, p.amount, p.cash_movement_id, p.created_at
    from public.agency_rendition_payments p
    where p.organization_id = p_organization_id
      and p.rendition_id = p_rendition_id
    order by p.created_at, p.id
    for update
  loop
    v_index := v_index + 1;
    if v_payment.cash_movement_id is null then
      raise exception 'Falta el movimiento de Caja vinculado a uno de los cobros';
    end if;

    select cm.direction::text, cm.amount
      into v_direction, v_movement_amount
    from public.cash_movements cm
    where cm.id = v_payment.cash_movement_id
      and cm.organization_id = p_organization_id
    for update;
    if not found or v_direction <> 'incoming' or round(v_movement_amount, 2) <> round(v_payment.amount, 2) then
      raise exception 'Un cobro y su movimiento vinculado de Caja no coinciden';
    end if;

    if v_index < v_payment_count then
      v_piece := round(v_payment.amount * (round(p_new_net_amount, 2) / v_old_paid), 2);
      v_piece := least(v_piece, v_remainder - ((v_payment_count - v_index) * 0.01));
    else
      v_piece := round(v_remainder, 2);
    end if;
    if v_piece < 0.01 then
      raise exception 'El importe corregido no permite mantener positivos los cobros existentes; anulá el cierre para volver a registrarlo';
    end if;

    update public.agency_rendition_payments
      set amount = round(v_piece, 2)
      where id = v_payment.id
        and organization_id = p_organization_id;
    update public.cash_movements
      set amount = round(v_piece, 2)
      where id = v_payment.cash_movement_id
        and organization_id = p_organization_id;

    v_remainder := round(v_remainder - v_piece, 2);
    v_new_paid := round(v_new_paid + v_piece, 2);
  end loop;

  if round(v_new_paid, 2) <> round(p_new_net_amount, 2) then
    raise exception 'No se pudo cuadrar el importe con los cobros existentes de Caja';
  end if;

  update public.agency_renditions
    set net_due = round(p_new_net_amount, 2),
        updated_at = now()
    where id = p_rendition_id
      and organization_id = p_organization_id;

  update public.agency_agent_daily_status
    set status = 'complete',
        reported_amount = round(p_new_net_amount, 2),
        notes = null,
        updated_at = now(),
        updated_by = auth.uid()
    where organization_id = p_organization_id
      and agent_id = v_rendition.agent_id
      and operational_date = v_rendition.rendition_date;

  insert into public.audit_log(organization_id, user_id, action, entity, entity_id, payload)
  values (
    p_organization_id, auth.uid(), 'correct_daily_rendition_net_amount',
    'agency_rendition', p_rendition_id,
    jsonb_build_object(
      'old_net_due', v_old_net,
      'new_net_due', round(p_new_net_amount, 2),
      'old_paid_total', round(v_old_paid, 2),
      'new_paid_total', round(v_new_paid, 2),
      'payment_count', v_payment_count,
      'reason', left(trim(p_reason), 1000)
    )
  );
end;
$function$;

revoke all on function public.correct_agency_daily_rendition_net_amount(uuid, uuid, numeric, text) from public, anon;
grant execute on function public.correct_agency_daily_rendition_net_amount(uuid, uuid, numeric, text) to authenticated;

create or replace function public.annul_agency_daily_rendition(
  p_organization_id uuid,
  p_rendition_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_rendition public.agency_renditions%rowtype;
  v_payment record;
  v_direction text;
  v_movement_amount numeric;
  v_payment_count integer := 0;
  v_reversed_total numeric := 0;
  v_agent_code text;
  v_today date := (now() at time zone 'America/Argentina/Cordoba')::date;
begin
  if auth.uid() is null or not private.has_org_permission(p_organization_id, 'can_delete_renditions', auth.uid()) then
    raise exception 'No tenés permiso para anular rendiciones';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception 'Indicá el motivo de la anulación';
  end if;

  select r.* into v_rendition
  from public.agency_renditions r
  where r.id = p_rendition_id
    and r.organization_id = p_organization_id
    and lower(btrim(coalesce(r.game_period, ''))) = 'cierre diario'
    and r.status in ('open', 'closed')
  for update;
  if not found then
    raise exception 'No se encontró un cierre diario vigente para anular';
  end if;

  select a.code into v_agent_code
  from public.agency_agents a
  where a.id = v_rendition.agent_id
    and a.organization_id = p_organization_id;

  for v_payment in
    select p.id, p.amount, p.cash_account_id, p.cash_movement_id, p.created_at
    from public.agency_rendition_payments p
    where p.organization_id = p_organization_id
      and p.rendition_id = p_rendition_id
    order by p.created_at, p.id
    for update
  loop
    v_payment_count := v_payment_count + 1;
    if v_payment.cash_movement_id is null then
      raise exception 'Falta el movimiento de Caja vinculado a uno de los cobros; no se anuló nada';
    end if;

    select cm.direction::text, cm.amount
      into v_direction, v_movement_amount
    from public.cash_movements cm
    where cm.id = v_payment.cash_movement_id
      and cm.organization_id = p_organization_id
    for update;
    if not found or v_direction <> 'incoming' or round(v_movement_amount, 2) <> round(v_payment.amount, 2) then
      raise exception 'Un cobro y su movimiento de Caja no coinciden; no se anuló nada';
    end if;

    insert into public.cash_movements(
      organization_id, cash_account_id, movement_date, direction, amount, description, created_by
    )
    values (
      p_organization_id,
      v_payment.cash_account_id,
      v_today,
      'outgoing',
      round(v_payment.amount, 2),
      left('Reversión por anulación del cierre diario ' || coalesce(v_agent_code, v_rendition.agent_id::text)
        || ' · rendición ' || p_rendition_id::text || ' · ' || trim(p_reason), 500),
      auth.uid()
    );
    v_reversed_total := round(v_reversed_total + v_payment.amount, 2);
  end loop;

  update public.agency_renditions
    set status = 'void',
        closed_at = coalesce(closed_at, now()),
        updated_at = now()
    where id = p_rendition_id
      and organization_id = p_organization_id;

  update public.agency_agent_daily_status
    set status = 'incomplete',
        reported_amount = null,
        notes = left(concat_ws(E'\n', nullif(trim(notes), ''),
          'Cierre diario anulado: ' || left(trim(p_reason), 1000)),
          2000),
        updated_at = now(),
        updated_by = auth.uid()
    where organization_id = p_organization_id
      and agent_id = v_rendition.agent_id
      and operational_date = v_rendition.rendition_date;

  insert into public.audit_log(organization_id, user_id, action, entity, entity_id, payload)
  values (
    p_organization_id, auth.uid(), 'annul_daily_agency_rendition',
    'agency_rendition', p_rendition_id,
    jsonb_build_object(
      'reason', left(trim(p_reason), 1000),
      'original_rendition_status', v_rendition.status,
      'original_paid_amount', v_reversed_total,
      'payment_count', v_payment_count,
      'cash_reversal', 'outgoing'
    )
  );
end;
$function$;

revoke all on function public.annul_agency_daily_rendition(uuid, uuid, text) from public, anon;
grant execute on function public.annul_agency_daily_rendition(uuid, uuid, text) to authenticated;
