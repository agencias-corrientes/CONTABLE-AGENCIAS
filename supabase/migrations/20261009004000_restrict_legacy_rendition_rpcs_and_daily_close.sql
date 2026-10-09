-- The active rendition workflow uses the permission-checked *_with_capture RPCs.
-- Disable legacy paths that accepted the broad accountant membership role.
revoke all on function public.create_agency_rendition(uuid, uuid, date, date, date, numeric, text, text) from public, anon, authenticated;
revoke all on function public.create_agency_rendition(uuid, uuid, date, date, date, numeric, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.create_agency_rendition(uuid, uuid, date, date, date, numeric, text, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.record_agency_rendition(uuid, uuid, date, date, date, numeric, numeric, uuid, text, text) from public, anon, authenticated;

-- Only the agency owner or admin can finalize the daily close.
create or replace function public.close_agency_day(
  p_organization_id uuid,
  p_closing_date date,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_id uuid;
  v_expected numeric;
  v_received numeric;
  v_pending numeric;
  v_cash numeric;
begin
  if not exists (
    select 1 from public.organization_members
    where organization_id = p_organization_id
      and user_id = auth.uid()
      and role in ('owner','admin')
  ) then
    raise exception 'Solo el titular o administrador puede cerrar el día';
  end if;

  select coalesce(sum(amount_due),0) into v_expected
  from public.agency_renditions
  where organization_id=p_organization_id
    and rendition_date=p_closing_date
    and status <> 'void';

  select coalesce(sum(p.amount),0) into v_received
  from public.agency_rendition_payments p
  join public.agency_renditions r on r.id=p.rendition_id
  where p.organization_id=p_organization_id and p.payment_date=p_closing_date;
  v_pending:=greatest(v_expected-v_received,0);

  select coalesce(sum(case when direction='incoming' then amount else -amount end),0) into v_cash
  from public.cash_movements
  where organization_id=p_organization_id and movement_date<=p_closing_date;

  insert into public.agency_daily_closings(
    organization_id,closing_date,expected_amount,received_amount,pending_amount,cash_balance,
    notes,status,closed_by,closed_at,created_by,updated_at
  )
  values(
    p_organization_id,p_closing_date,v_expected,v_received,v_pending,v_cash,
    p_notes,'closed',auth.uid(),now(),auth.uid(),now()
  )
  on conflict(organization_id,closing_date) do update set
    expected_amount=excluded.expected_amount,
    received_amount=excluded.received_amount,
    pending_amount=excluded.pending_amount,
    cash_balance=excluded.cash_balance,
    notes=excluded.notes,
    status='closed',
    closed_by=auth.uid(),
    closed_at=now(),
    updated_at=now()
  returning id into v_id;

  insert into public.audit_log(organization_id,user_id,action,entity,entity_id,payload)
  values(
    p_organization_id,auth.uid(),'close','agency_daily_closing',v_id,
    jsonb_build_object('date',p_closing_date,'expected',v_expected,'received',v_received,'pending',v_pending)
  );
  return v_id;
end;
$function$;

revoke all on function public.close_agency_day(uuid, date, text) from public, anon;
grant execute on function public.close_agency_day(uuid, date, text) to authenticated;
