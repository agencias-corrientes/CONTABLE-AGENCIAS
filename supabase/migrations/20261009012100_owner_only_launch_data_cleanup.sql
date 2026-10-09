-- Owner-only, explicitly confirmed cleanup for test data before the agency opens.
-- It removes organization-scoped operational records while preserving the organization,
-- owner login, seeded catalogs, cash-account configuration and game catalog.

create or replace function private.preview_agency_launch_cleanup(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_counts jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id and m.user_id = auth.uid() and m.role = 'owner'
  ) then
    raise exception 'Solo el titular de la agencia puede revisar o borrar datos de prueba' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'subagentes_ambulantes', (select count(*)::int from public.agency_agents where organization_id = p_organization_id),
    'rendiciones', (select count(*)::int from public.agency_renditions where organization_id = p_organization_id),
    'cobros_rendiciones', (select count(*)::int from public.agency_rendition_payments where organization_id = p_organization_id),
    'importes_por_juego', (select count(*)::int from public.agency_rendition_game_amounts where organization_id = p_organization_id),
    'tickets', (select count(*)::int from public.agency_rendition_tickets where organization_id = p_organization_id),
    'respaldos', (select count(*)::int from public.agency_rendition_backup_outbox where organization_id = p_organization_id),
    'movimientos_caja', (select count(*)::int from public.cash_movements where organization_id = p_organization_id),
    'cierres_diarios', (select count(*)::int from public.agency_daily_closings where organization_id = p_organization_id),
    'comisiones', (select count(*)::int from public.agency_agent_game_commissions where organization_id = p_organization_id),
    'contactos', (select count(*)::int from public.contacts where organization_id = p_organization_id),
    'asientos_contables', (select count(*)::int from public.journal_entries where organization_id = p_organization_id),
    'lineas_contables', (select count(*)::int from public.journal_lines jl join public.journal_entries je on je.id = jl.journal_entry_id where je.organization_id = p_organization_id),
    'facturas_venta', (select count(*)::int from public.sales_invoices where organization_id = p_organization_id),
    'items_facturas_venta', (select count(*)::int from public.sales_invoice_items si join public.sales_invoices inv on inv.id = si.invoice_id where inv.organization_id = p_organization_id),
    'facturas_compra', (select count(*)::int from public.purchase_bills where organization_id = p_organization_id),
    'items_facturas_compra', (select count(*)::int from public.purchase_bill_items pi join public.purchase_bills b on b.id = pi.bill_id where b.organization_id = p_organization_id),
    'pagos_contables', (select count(*)::int from public.payments where organization_id = p_organization_id),
    'empleados_vinculados', (select count(*)::int from public.organization_members where organization_id = p_organization_id and role <> 'owner'),
    'permisos_empleados', (select count(*)::int from public.organization_member_permissions where organization_id = p_organization_id and user_id in (select user_id from public.organization_members where organization_id = p_organization_id and role <> 'owner')),
    'registros_auditoria', (select count(*)::int from public.audit_log where organization_id = p_organization_id)
  ) into v_counts;
  return v_counts;
end;
$function$;

revoke all on function private.preview_agency_launch_cleanup(uuid) from public, anon;
grant execute on function private.preview_agency_launch_cleanup(uuid) to authenticated;

create or replace function private.clear_agency_launch_test_data(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_counts jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id and m.user_id = auth.uid() and m.role = 'owner'
  ) then
    raise exception 'Solo el titular de la agencia puede borrar datos de prueba' using errcode = '42501';
  end if;
  v_counts := private.preview_agency_launch_cleanup(p_organization_id);
  delete from public.agency_rendition_payments where organization_id = p_organization_id;
  delete from public.payments where organization_id = p_organization_id;
  delete from public.cash_movements where organization_id = p_organization_id;
  delete from public.agency_rendition_tickets where organization_id = p_organization_id;
  delete from public.agency_rendition_game_amounts where organization_id = p_organization_id;
  delete from public.agency_rendition_backup_outbox where organization_id = p_organization_id;
  delete from public.agency_daily_closings where organization_id = p_organization_id;
  delete from public.agency_renditions where organization_id = p_organization_id;
  delete from public.agency_agent_game_commissions where organization_id = p_organization_id;
  delete from public.agency_agents where organization_id = p_organization_id;
  delete from public.journal_lines jl where exists (
    select 1 from public.journal_entries je where je.id = jl.journal_entry_id and je.organization_id = p_organization_id
  );
  delete from public.sales_invoice_items si where exists (
    select 1 from public.sales_invoices inv where inv.id = si.invoice_id and inv.organization_id = p_organization_id
  );
  delete from public.purchase_bill_items pi where exists (
    select 1 from public.purchase_bills b where b.id = pi.bill_id and b.organization_id = p_organization_id
  );
  delete from public.sales_invoices where organization_id = p_organization_id;
  delete from public.purchase_bills where organization_id = p_organization_id;
  delete from public.journal_entries where organization_id = p_organization_id;
  delete from public.contacts where organization_id = p_organization_id;
  delete from public.audit_log where organization_id = p_organization_id;
  delete from public.organization_member_permissions
  where organization_id = p_organization_id
    and user_id in (select user_id from public.organization_members where organization_id = p_organization_id and role <> 'owner');
  delete from public.organization_members where organization_id = p_organization_id and role <> 'owner';
  update public.organization_backup_settings
  set recipient_email = null, enabled = true, updated_at = now()
  where organization_id = p_organization_id;
  return v_counts || jsonb_build_object('completed', true);
end;
$function$;

revoke all on function private.clear_agency_launch_test_data(uuid) from public, anon;
grant execute on function private.clear_agency_launch_test_data(uuid) to authenticated;

create or replace function public.preview_agency_launch_cleanup(p_organization_id uuid)
returns jsonb language sql stable security invoker set search_path = public, private, pg_temp
as $function$ select private.preview_agency_launch_cleanup(p_organization_id); $function$;
revoke all on function public.preview_agency_launch_cleanup(uuid) from public, anon;
grant execute on function public.preview_agency_launch_cleanup(uuid) to authenticated;

create or replace function public.cleanup_agency_test_data(p_organization_id uuid)
returns jsonb language sql security invoker set search_path = public, private, pg_temp
as $function$ select private.clear_agency_launch_test_data(p_organization_id); $function$;
revoke all on function public.cleanup_agency_test_data(uuid) from public, anon;
grant execute on function public.cleanup_agency_test_data(uuid) to authenticated;

drop policy if exists agency_ticket_photo_owner_delete on storage.objects;
create policy agency_ticket_photo_owner_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'agency-rendition-tickets'
  and exists (
    select 1 from public.organization_members m
    where m.organization_id::text = (storage.foldername(name))[1]
      and m.user_id = (select auth.uid()) and m.role = 'owner'
  )
);
