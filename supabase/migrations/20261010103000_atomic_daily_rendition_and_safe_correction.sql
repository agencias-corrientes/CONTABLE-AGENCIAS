-- Atomic daily rendition save: the rendition, daily status, collection and cash movement commit or roll back together.
-- Editing an incomplete rendition may preserve existing payments, but cannot lower its total below money already received.
create or replace function public.update_agency_rendition_with_capture(
  p_organization_id uuid,
  p_rendition_id uuid,
  p_rendition_date date,
  p_amount_due numeric,
  p_game_breakdown jsonb,
  p_ticket_numbers jsonb,
  p_ticket_qr_payload text default null,
  p_game_period text default null,
  p_draw_number text default null,
  p_capture_method text default 'manual',
  p_reference text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_rendition public.agency_renditions%rowtype;
  v_total numeric;
  v_paid numeric;
  v_item record;
  v_ticket text;
begin
  if not private.has_org_permission(p_organization_id, 'can_edit_renditions', auth.uid()) then
    raise exception 'No tenés permiso para corregir rendiciones';
  end if;
  select * into v_rendition from public.agency_renditions
  where id=p_rendition_id and organization_id=p_organization_id and status='open'
  for update;
  if not found then raise exception 'Solo se pueden corregir rendiciones abiertas y vigentes'; end if;
    if jsonb_typeof(p_game_breakdown) <> 'array' or jsonb_typeof(p_ticket_numbers) <> 'array' then
    raise exception 'El detalle de juegos o tickets no es válido';
  end if;
  if coalesce(p_capture_method,'manual') not in ('manual','photo','qr') then raise exception 'Método de lectura inválido'; end if;

  select coalesce(sum((item->>'amount')::numeric),0) into v_total
  from jsonb_array_elements(p_game_breakdown) item
  where coalesce((item->>'amount')::numeric,0)>0;
  if v_total<=0 then raise exception 'Ingresá al menos un importe por juego'; end if;
  if abs(v_total-coalesce(p_amount_due,v_total))>0.005 then raise exception 'La suma de los juegos no coincide con el total de la rendición'; end if;
  select coalesce(sum(amount),0) into v_paid from public.agency_rendition_payments where rendition_id=p_rendition_id and organization_id=p_organization_id;
  if v_total + 0.005 < v_paid then raise exception 'El nuevo total no puede ser inferior a los cobros ya registrados'; end if;

  for v_item in
    select (item->>'game_type_id')::uuid as game_type_id, (item->>'amount')::numeric as amount
    from jsonb_array_elements(p_game_breakdown) item
    where coalesce((item->>'amount')::numeric,0)>0
  loop
    if not exists(select 1 from public.agency_game_types where id=v_item.game_type_id and organization_id=p_organization_id and enabled) then
      raise exception 'Tipo de juego inválido o inactivo';
    end if;
  end loop;

  update public.agency_renditions
  set rendition_date=p_rendition_date, period_start=p_rendition_date, period_end=p_rendition_date,
      amount_due=v_total, reference=nullif(trim(p_reference),''), notes=nullif(trim(p_notes),''),
      game_period=nullif(trim(p_game_period),''), draw_number=nullif(trim(p_draw_number),''),
      capture_method=coalesce(p_capture_method,'manual'), updated_at=now()
  where id=p_rendition_id and organization_id=p_organization_id;

  delete from public.agency_rendition_game_amounts where rendition_id=p_rendition_id and organization_id=p_organization_id;
  delete from public.agency_rendition_tickets where rendition_id=p_rendition_id and organization_id=p_organization_id;

  for v_item in
    select (item->>'game_type_id')::uuid as game_type_id, (item->>'amount')::numeric as amount
    from jsonb_array_elements(p_game_breakdown) item
    where coalesce((item->>'amount')::numeric,0)>0
  loop
    insert into public.agency_rendition_game_amounts(organization_id,rendition_id,game_type_id,amount,created_by)
    values(p_organization_id,p_rendition_id,v_item.game_type_id,v_item.amount,auth.uid());
  end loop;

  for v_ticket in
    select distinct trim(value) from jsonb_array_elements_text(p_ticket_numbers) value where length(trim(value))>0
  loop
    insert into public.agency_rendition_tickets(organization_id,rendition_id,ticket_number,created_by)
    values(p_organization_id,p_rendition_id,v_ticket,auth.uid())
    on conflict (rendition_id,ticket_number) do nothing;
  end loop;

  if nullif(trim(p_ticket_qr_payload),'') is not null then
    insert into public.agency_rendition_tickets(organization_id,rendition_id,ticket_number,ticket_qr_payload,created_by)
    values(p_organization_id,p_rendition_id,left(trim(p_ticket_qr_payload),160),trim(p_ticket_qr_payload),auth.uid())
    on conflict (rendition_id,ticket_number) do update set ticket_qr_payload=excluded.ticket_qr_payload;
  end if;

  insert into public.audit_log(organization_id,user_id,action,entity,entity_id,payload)
  values(p_organization_id,auth.uid(),'update','agency_rendition',p_rendition_id,
    jsonb_build_object('old_amount_due',v_rendition.amount_due,'new_amount_due',v_total,
      'old_rendition_date',v_rendition.rendition_date,'new_rendition_date',p_rendition_date,
      'game_period',p_game_period,'draw_number',p_draw_number,'capture_method',p_capture_method));
  return p_rendition_id;
end;
$function$;


REVOKE ALL ON FUNCTION public.update_agency_rendition_with_capture(uuid,uuid,date,numeric,jsonb,jsonb,text,text,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_agency_rendition_with_capture(uuid,uuid,date,numeric,jsonb,jsonb,text,text,text,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_and_receive_agency_daily_rendition(
  p_organization_id uuid,
  p_agent_id uuid,
  p_rendition_date date,
  p_amount_due numeric,
  p_operational_date date,
  p_daily_status text,
  p_cash_account_id uuid,
  p_payment_date date,
  p_game_breakdown jsonb DEFAULT '[]'::jsonb,
  p_ticket_numbers jsonb DEFAULT '[]'::jsonb,
  p_ticket_qr_payload text DEFAULT NULL,
  p_game_period text DEFAULT 'Cierre diario',
  p_draw_number text DEFAULT NULL,
  p_capture_method text DEFAULT 'manual',
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_daily_status_notes text DEFAULT NULL,
  p_reported_amount numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_rendition_id uuid;
  v_payment_amount numeric;
BEGIN
  IF p_daily_status NOT IN ('complete','incomplete') THEN
    RAISE EXCEPTION 'El estado diario solicitado no es válido';
  END IF;
  IF p_reported_amount IS NULL OR p_reported_amount <= 0 OR p_reported_amount > p_amount_due THEN
    RAISE EXCEPTION 'El monto rendido debe ser mayor que cero y no superar el total registrado';
  END IF;
  v_rendition_id := public.create_agency_rendition_with_capture_and_daily_status(
    p_organization_id, p_agent_id, p_rendition_date, p_amount_due, p_operational_date,
    p_daily_status, p_game_breakdown, p_ticket_numbers, p_ticket_qr_payload, p_game_period,
    p_draw_number, p_capture_method, p_reference, p_notes, p_daily_status_notes, p_reported_amount
  );
  v_payment_amount := CASE WHEN p_daily_status='complete' THEN p_amount_due ELSE p_reported_amount END;
  PERFORM public.receive_agency_rendition(
    p_organization_id, v_rendition_id, p_payment_date, v_payment_amount,
    p_cash_account_id, p_reference,
    CASE WHEN p_daily_status='incomplete' THEN 'Pago parcial al registrar rendición incompleta' ELSE 'Cobro al confirmar rendición diaria' END
  );
  RETURN v_rendition_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.create_and_receive_agency_daily_rendition(uuid,uuid,date,numeric,date,text,uuid,date,jsonb,jsonb,text,text,text,text,text,text,text,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_and_receive_agency_daily_rendition(uuid,uuid,date,numeric,date,text,uuid,date,jsonb,jsonb,text,text,text,text,text,text,text,numeric) TO authenticated;
