-- Close direct-RPC permission gaps and enforce the daily-close deadline in the database.
CREATE OR REPLACE FUNCTION public.create_agency_rendition_with_capture(
  p_organization_id uuid,
  p_agent_id uuid,
  p_rendition_date date,
  p_amount_due numeric,
  p_game_breakdown jsonb DEFAULT '[]'::jsonb,
  p_ticket_numbers jsonb DEFAULT '[]'::jsonb,
  p_ticket_qr_payload text DEFAULT NULL,
  p_game_period text DEFAULT NULL,
  p_draw_number text DEFAULT NULL,
  p_capture_method text DEFAULT 'manual',
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $function$
DECLARE v_id uuid; v_total numeric; v_item record; v_ticket text;
BEGIN
  IF NOT private.has_org_permission(p_organization_id,'can_create_renditions',auth.uid()) THEN RAISE EXCEPTION 'No tenés permiso para registrar rendiciones'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.organization_members WHERE organization_id=p_organization_id AND user_id=auth.uid() AND role IN ('owner','admin','accountant')) THEN RAISE EXCEPTION 'Sin permisos'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.agency_agents WHERE id=p_agent_id AND organization_id=p_organization_id AND is_active) THEN RAISE EXCEPTION 'Operador inválido o inactivo'; END IF;
  IF jsonb_typeof(p_game_breakdown)<>'array' OR jsonb_typeof(p_ticket_numbers)<>'array' THEN RAISE EXCEPTION 'La distribución por juegos o los números de ticket son inválidos'; END IF;
  IF coalesce(p_capture_method,'manual') NOT IN ('manual','photo','qr') THEN RAISE EXCEPTION 'Método de lectura inválido'; END IF;
  SELECT coalesce(sum((item->>'amount')::numeric),0) INTO v_total FROM jsonb_array_elements(p_game_breakdown) item WHERE coalesce((item->>'amount')::numeric,0)>0;
  IF v_total<=0 THEN RAISE EXCEPTION 'Ingresá al menos un importe por juego'; END IF;
  IF abs(v_total-coalesce(p_amount_due,v_total))>0.005 THEN RAISE EXCEPTION 'La suma de los juegos no coincide con el total de la rendición'; END IF;
  INSERT INTO public.agency_renditions(organization_id,agent_id,rendition_date,period_start,period_end,amount_due,reference,notes,game_period,draw_number,capture_method,created_by)
  VALUES(p_organization_id,p_agent_id,p_rendition_date,p_rendition_date,p_rendition_date,v_total,nullif(trim(p_reference),''),nullif(trim(p_notes),''),nullif(trim(p_game_period),''),nullif(trim(p_draw_number),''),coalesce(p_capture_method,'manual'),auth.uid())
  RETURNING id INTO v_id;
  FOR v_item IN SELECT (item->>'game_type_id')::uuid game_type_id,(item->>'amount')::numeric amount FROM jsonb_array_elements(p_game_breakdown) item WHERE coalesce((item->>'amount')::numeric,0)>0 LOOP
    IF NOT EXISTS(SELECT 1 FROM public.agency_game_types WHERE id=v_item.game_type_id AND organization_id=p_organization_id AND enabled) THEN RAISE EXCEPTION 'Tipo de juego inválido o inactivo'; END IF;
    INSERT INTO public.agency_rendition_game_amounts(organization_id,rendition_id,game_type_id,amount,created_by) VALUES(p_organization_id,v_id,v_item.game_type_id,v_item.amount,auth.uid());
  END LOOP;
  FOR v_ticket IN SELECT DISTINCT trim(value) FROM jsonb_array_elements_text(p_ticket_numbers) value WHERE length(trim(value))>0 LOOP
    INSERT INTO public.agency_rendition_tickets(organization_id,rendition_id,ticket_number,created_by) VALUES(p_organization_id,v_id,v_ticket,auth.uid()) ON CONFLICT(rendition_id,ticket_number) DO NOTHING;
  END LOOP;
  IF nullif(trim(p_ticket_qr_payload),'') IS NOT NULL THEN
    INSERT INTO public.agency_rendition_tickets(organization_id,rendition_id,ticket_number,ticket_qr_payload,created_by) VALUES(p_organization_id,v_id,left(trim(p_ticket_qr_payload),160),trim(p_ticket_qr_payload),auth.uid()) ON CONFLICT(rendition_id,ticket_number) DO UPDATE SET ticket_qr_payload=excluded.ticket_qr_payload;
  END IF;
  INSERT INTO public.audit_log(organization_id,user_id,action,entity,entity_id,payload)
  VALUES(p_organization_id,auth.uid(),'create','agency_rendition',v_id,jsonb_build_object('agent_id',p_agent_id,'amount_due',v_total,'game_period',p_game_period,'draw_number',p_draw_number,'capture_method',p_capture_method,'game_breakdown',p_game_breakdown,'ticket_count',jsonb_array_length(p_ticket_numbers),'qr_detected',nullif(trim(p_ticket_qr_payload),'') IS NOT NULL));
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_agency_agent_daily_status_with_amount(
  p_organization_id uuid,p_agent_id uuid,p_operational_date date,p_status text,p_notes text DEFAULT NULL,p_reported_amount numeric DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $function$
DECLARE v_amount_due numeric; v_cutoff time; v_local_now timestamp without time zone; v_current_operational_date date; v_deadline time;
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_org_permission(p_organization_id,'can_create_renditions',auth.uid()) THEN RAISE EXCEPTION 'No tenés permiso para confirmar la rendición'; END IF;
  IF p_status NOT IN ('complete','incomplete') THEN RAISE EXCEPTION 'El estado diario solicitado no es válido'; END IF;
  IF p_reported_amount IS NULL OR round(p_reported_amount,2)<=0 OR p_reported_amount>999999999999.99 THEN RAISE EXCEPTION 'Ingresá un monto rendido mayor que cero antes de guardar'; END IF;
  SELECT s.rendition_cutoff_time INTO v_cutoff FROM public.agency_operational_settings s WHERE s.organization_id=p_organization_id;
  v_cutoff:=coalesce(v_cutoff,time '00:00'); v_local_now:=now() AT TIME ZONE 'America/Argentina/Cordoba';
  v_current_operational_date:=CASE WHEN v_local_now::time<v_cutoff THEN v_local_now::date-1 ELSE v_local_now::date END;
  IF p_operational_date IS DISTINCT FROM v_current_operational_date THEN RAISE EXCEPTION 'La jornada operativa cambió. Actualizá la pantalla e intentá de nuevo'; END IF;
  IF p_status='complete' THEN
    v_deadline:=CASE extract(dow FROM v_local_now::date)::integer WHEN 3 THEN time '22:00' WHEN 6 THEN time '22:30' WHEN 0 THEN time '21:15' ELSE time '21:00' END;
    IF v_local_now::time<v_deadline THEN RAISE EXCEPTION 'La confirmación completa se habilita después del último sorteo programado'; END IF;
  END IF;
  SELECT r.amount_due INTO v_amount_due FROM public.agency_renditions r WHERE r.organization_id=p_organization_id AND r.agent_id=p_agent_id AND r.rendition_date=p_operational_date AND lower(btrim(coalesce(r.game_period,'')))=lower('Cierre diario') AND r.status<>'void' ORDER BY r.created_at DESC LIMIT 1;
  IF v_amount_due IS NULL THEN RAISE EXCEPTION 'No hay una rendición diaria para guardar'; END IF;
  IF round(p_reported_amount,2)>v_amount_due THEN RAISE EXCEPTION 'El monto rendido no puede superar el total registrado'; END IF;
  PERFORM public.set_agency_agent_daily_status(p_organization_id,p_agent_id,p_operational_date,p_status,p_notes);
  UPDATE public.agency_agent_daily_status SET reported_amount=round(p_reported_amount,2),updated_at=now(),updated_by=auth.uid() WHERE organization_id=p_organization_id AND agent_id=p_agent_id AND operational_date=p_operational_date;
  IF NOT FOUND THEN RAISE EXCEPTION 'No se pudo guardar el monto rendido'; END IF;
  INSERT INTO public.audit_log(organization_id,user_id,action,entity,entity_id,payload) VALUES(p_organization_id,auth.uid(),'record_agency_agent_reported_amount','agency_agent_daily_status',p_agent_id,jsonb_build_object('operational_date',p_operational_date,'status',p_status,'reported_amount',round(p_reported_amount,2)));
END;
$function$;

REVOKE ALL ON FUNCTION public.set_agency_agent_daily_status(uuid,uuid,date,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bootstrap_organization(text,text,text,date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_agency_agent_daily_status_with_amount(uuid,uuid,date,text,text,numeric) TO authenticated;
