alter table public.agency_renditions
  add column if not exists net_due numeric;

create or replace function public.recompute_agency_rendition_net_due()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $function$
declare v_rendition_id uuid; v_org_id uuid; v_gross numeric; v_commission numeric;
begin
  if tg_op='DELETE' then v_rendition_id:=old.rendition_id; v_org_id:=old.organization_id;
  else v_rendition_id:=new.rendition_id; v_org_id:=new.organization_id; end if;
  select r.amount_due into v_gross from public.agency_renditions r where r.id=v_rendition_id and r.organization_id=v_org_id;
  if not found then return null; end if;
  select coalesce(sum(ga.commission_amount),0) into v_commission from public.agency_rendition_game_amounts ga where ga.rendition_id=v_rendition_id and ga.organization_id=v_org_id;
  update public.agency_renditions set net_due=greatest(0,round(coalesce(v_gross,0)-v_commission,2)) where id=v_rendition_id and organization_id=v_org_id;
  return null;
end;
$function$;

drop trigger if exists recompute_agency_rendition_net_due on public.agency_rendition_game_amounts;
create trigger recompute_agency_rendition_net_due after insert or update or delete on public.agency_rendition_game_amounts
for each row execute function public.recompute_agency_rendition_net_due();

create or replace function public.receive_agency_rendition(
 p_organization_id uuid,p_rendition_id uuid,p_payment_date date,p_amount numeric,p_cash_account_id uuid,p_reference text default null,p_notes text default null
) returns uuid language plpgsql set search_path to 'public','pg_temp'
as $function$
declare v_payment_id uuid;v_movement_id uuid;v_due numeric;v_paid numeric;v_agent_name text;
begin
 if not exists(select 1 from public.organization_members where organization_id=p_organization_id and user_id=auth.uid() and role in ('owner','admin','accountant')) then raise exception 'Sin permisos';end if;
 if p_amount<=0 then raise exception 'El importe debe ser mayor que cero';end if;
 select coalesce(r.net_due,r.amount_due),a.full_name into v_due,v_agent_name from public.agency_renditions r join public.agency_agents a on a.id=r.agent_id where r.id=p_rendition_id and r.organization_id=p_organization_id and r.status='open' for update;
 if v_due is null then raise exception 'Rendición inexistente o ya cerrada';end if;
 if not exists(select 1 from public.cash_accounts where id=p_cash_account_id and organization_id=p_organization_id and is_active) then raise exception 'Caja/cuenta inválida';end if;
 select coalesce(sum(amount),0) into v_paid from public.agency_rendition_payments where rendition_id=p_rendition_id and organization_id=p_organization_id;
 if v_paid+p_amount>v_due then raise exception 'La recepción supera el importe pendiente de la rendición';end if;
 insert into public.agency_rendition_payments(organization_id,rendition_id,payment_date,amount,cash_account_id,reference,notes) values(p_organization_id,p_rendition_id,p_payment_date,p_amount,p_cash_account_id,p_reference,p_notes) returning id into v_payment_id;
 insert into public.cash_movements(organization_id,cash_account_id,movement_date,direction,amount,description) values(p_organization_id,p_cash_account_id,p_payment_date,'incoming',p_amount,coalesce(p_reference,'Rendición de '||v_agent_name)) returning id into v_movement_id;
 update public.agency_rendition_payments set cash_movement_id=v_movement_id where id=v_payment_id;
 if round(v_paid+p_amount,2)=round(v_due,2) then update public.agency_renditions set status='closed',closed_at=now(),updated_at=now() where id=p_rendition_id and organization_id=p_organization_id;end if;
 insert into public.audit_log(organization_id,user_id,action,entity,entity_id,payload) values(p_organization_id,auth.uid(),'receive','agency_rendition',p_rendition_id,jsonb_build_object('payment_id',v_payment_id,'amount',p_amount,'agent_name',v_agent_name,'closed',(round(v_paid+p_amount,2)=round(v_due,2))));
 return v_payment_id;
end;
$function$;

create or replace function public.create_and_receive_agency_daily_rendition(
 p_organization_id uuid,p_agent_id uuid,p_rendition_date date,p_amount_due numeric,p_operational_date date,p_daily_status text,p_cash_account_id uuid,p_payment_date date,
 p_game_breakdown jsonb default '[]'::jsonb,p_ticket_numbers jsonb default '[]'::jsonb,p_ticket_qr_payload text default null,p_game_period text default 'Cierre diario',
 p_draw_number text default null,p_capture_method text default 'manual',p_reference text default null,p_notes text default null,p_daily_status_notes text default null,p_reported_amount numeric default null
) returns uuid language plpgsql set search_path to 'public','pg_temp'
as $function$
declare v_rendition_id uuid;v_payment_amount numeric;v_gross_due numeric;v_commission_due numeric:=0;v_net_due numeric;v_reported_amount numeric;v_rate numeric;v_item record;
begin
 if p_daily_status not in ('complete','incomplete') then raise exception 'El estado diario solicitado no es válido';end if;
 if jsonb_typeof(coalesce(p_game_breakdown,'[]'::jsonb))<>'array' then raise exception 'La distribución por juegos no es válida';end if;
 select coalesce(sum((item->>'amount')::numeric),0) into v_gross_due from jsonb_array_elements(coalesce(p_game_breakdown,'[]'::jsonb)) item where coalesce((item->>'amount')::numeric,0)>0;
 if v_gross_due<=0 or abs(v_gross_due-coalesce(p_amount_due,v_gross_due))>0.005 then raise exception 'La suma de los juegos no coincide con el total de ventas';end if;
 for v_item in select (item->>'game_type_id')::uuid as game_type_id,(item->>'amount')::numeric as amount from jsonb_array_elements(coalesce(p_game_breakdown,'[]'::jsonb)) item where coalesce((item->>'amount')::numeric,0)>0 loop
  v_rate:=null;
  select c.commission_percent into v_rate from public.agency_agent_game_commissions c where c.organization_id=p_organization_id and c.agent_id=p_agent_id and c.game_type_id=v_item.game_type_id;
  if not found then select d.commission_percent into v_rate from public.agency_game_commission_defaults d where d.organization_id=p_organization_id and d.game_type_id=v_item.game_type_id;end if;
  v_commission_due:=v_commission_due+round((v_item.amount*coalesce(v_rate,0))/100.0,2);
 end loop;
 v_net_due:=greatest(0,round(v_gross_due-v_commission_due,2));
 if v_net_due<=0 then raise exception 'El neto a rendir debe ser mayor que cero después de descontar la comisión';end if;
 v_reported_amount:=case when p_daily_status='complete' then v_net_due else p_reported_amount end;
 if v_reported_amount is null or round(v_reported_amount,2)<=0 or round(v_reported_amount,2)>v_net_due then raise exception 'El monto rendido debe ser mayor que cero y no superar el neto después de comisión';end if;
 v_rendition_id:=public.create_agency_rendition_with_capture_and_daily_status(p_organization_id,p_agent_id,p_rendition_date,v_gross_due,p_operational_date,p_daily_status,coalesce(p_game_breakdown,'[]'::jsonb),coalesce(p_ticket_numbers,'[]'::jsonb),p_ticket_qr_payload,p_game_period,p_draw_number,p_capture_method,p_reference,p_notes,p_daily_status_notes,v_reported_amount);
 update public.agency_renditions set net_due=v_net_due,updated_at=now() where id=v_rendition_id and organization_id=p_organization_id;
 v_payment_amount:=case when p_daily_status='complete' then v_net_due else round(v_reported_amount,2) end;
 perform public.receive_agency_rendition(p_organization_id,v_rendition_id,p_payment_date,v_payment_amount,p_cash_account_id,p_reference,case when p_daily_status='incomplete' then 'Pago parcial al registrar rendición incompleta' else 'Cobro del efectivo neto al confirmar rendición diaria' end);
 return v_rendition_id;
end;
$function$;

comment on column public.agency_renditions.net_due is 'Net cash to remit after commission snapshot; amount_due remains gross sales for audit and reporting.';
