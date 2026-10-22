-- Avoid re-evaluating auth.uid() for each row in frequently used RLS policies.
do $$
declare
  p record;
  using_expr text;
  check_expr text;
begin
  for p in
    select schemaname, tablename, policyname, cmd, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and policyname = any (array[
        'members_select',
        'agency_renditions_attach_daily_receipt',
        'agency_rendition_payments_update',
        'agency_rendition_backup_outbox_owner_select',
        'agent_game_commissions_owner_delete',
        'agent_game_commissions_owner_insert',
        'agent_game_commissions_owner_update',
        'agency_game_commission_defaults_owner_delete',
        'agency_game_commission_defaults_owner_insert',
        'agency_game_commission_defaults_owner_update',
        'agency_operational_settings_member_select',
        'agency_operational_settings_owner_insert',
        'agency_operational_settings_owner_update',
        'agency_agent_daily_status_member_select',
        'agency_agent_draw_status_member_select',
        'agency_prize_payments_member_select'
      ])
  loop
    using_expr := case when p.qual is null then null else replace(p.qual, 'auth.uid()', '(select auth.uid())') end;
    check_expr := case when p.with_check is null then null else replace(p.with_check, 'auth.uid()', '(select auth.uid())') end;

    if p.cmd in ('SELECT', 'DELETE') and using_expr is not null then
      execute format('alter policy %I on %I.%I using (%s)', p.policyname, p.schemaname, p.tablename, using_expr);
    elsif p.cmd = 'INSERT' and check_expr is not null then
      execute format('alter policy %I on %I.%I with check (%s)', p.policyname, p.schemaname, p.tablename, check_expr);
    elsif p.cmd = 'UPDATE' and using_expr is not null and check_expr is not null then
      execute format('alter policy %I on %I.%I using (%s) with check (%s)', p.policyname, p.schemaname, p.tablename, using_expr, check_expr);
    end if;
  end loop;
end
$$;
