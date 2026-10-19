-- Keep the daily review state synchronized with actual money received.
-- When the final outstanding balance is collected, Pendiente hoy clears automatically.
create or replace function public.sync_agency_daily_status_after_payment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_rendition_id uuid;
  v_org_id uuid;
  v_agent_id uuid;
  v_date date;
  v_due numeric;
  v_paid numeric;
  v_period text;
begin
  if tg_op = 'DELETE' then
    v_rendition_id := old.rendition_id;
    v_org_id := old.organization_id;
  else
    v_rendition_id := new.rendition_id;
    v_org_id := new.organization_id;
  end if;

  select r.agent_id, r.rendition_date, r.game_period,
         round(coalesce(r.net_due, r.amount_due), 2)
    into v_agent_id, v_date, v_period, v_due
  from public.agency_renditions r
  where r.id = v_rendition_id and r.organization_id = v_org_id
    and r.status <> 'void';

  if not found or lower(btrim(coalesce(v_period, ''))) <> 'cierre diario' then
    return coalesce(new, old);
  end if;

  select round(coalesce(sum(p.amount), 0), 2)
    into v_paid
  from public.agency_rendition_payments p
  where p.organization_id = v_org_id and p.rendition_id = v_rendition_id;

  update public.agency_agent_daily_status
     set status = case when v_paid + 0.005 >= v_due then 'complete' else 'incomplete' end,
         reported_amount = least(v_paid, v_due),
         notes = case when v_paid + 0.005 >= v_due then null else notes end,
         updated_at = now(),
         updated_by = auth.uid()
   where organization_id = v_org_id and agent_id = v_agent_id and operational_date = v_date;

  return coalesce(new, old);
end;
$function$;

drop trigger if exists sync_agency_daily_status_after_payment on public.agency_rendition_payments;
create trigger sync_agency_daily_status_after_payment
after insert or update or delete on public.agency_rendition_payments
for each row execute function public.sync_agency_daily_status_after_payment();

revoke all on function public.sync_agency_daily_status_after_payment() from public, anon;
