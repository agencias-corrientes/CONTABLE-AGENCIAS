-- Daily agency rendition backup: keep records in the outbox during the day and send one digest at 23:50 Buenos Aires time.
-- Required Vault secrets (created outside source control): agency_rendition_backup_cron_secret,
-- agency_rendition_backup_project_url, agency_rendition_backup_anon_key.
-- The Edge Function checks the SHA-256 of the Vault secret; its raw value is never committed.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.set_agency_agent_daily_status_with_amount(
  p_organization_id uuid,
  p_agent_id uuid,
  p_operational_date date,
  p_status text,
  p_notes text default null,
  p_reported_amount numeric default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if auth.uid() is null then
    raise exception 'Se necesita iniciar sesión para confirmar la rendición';
  end if;

  -- New Preview flow asks for the amount when saving "incomplete"; keeping this optional
  -- at the RPC layer preserves compatibility with the not-yet-updated Production UI.
  if p_reported_amount is not null and (
    round(p_reported_amount, 2) <= 0
    or p_reported_amount > 999999999999.99
  ) then
    raise exception 'Ingresá un monto rendido válido';
  end if;

  perform public.set_agency_agent_daily_status(
    p_organization_id,
    p_agent_id,
    p_operational_date,
    p_status,
    p_notes
  );

  update public.agency_agent_daily_status
  set reported_amount = case
      when p_reported_amount is not null then round(p_reported_amount, 2)
      else null
    end,
    updated_at = now(),
    updated_by = auth.uid()
  where organization_id = p_organization_id
    and agent_id = p_agent_id
    and operational_date = p_operational_date;

  if not found then
    raise exception 'No se pudo guardar el monto rendido';
  end if;

  if p_reported_amount is not null then
    insert into public.audit_log (
      organization_id, user_id, action, entity, entity_id, payload
    )
    values (
      p_organization_id,
      auth.uid(),
      'record_agency_agent_reported_amount',
      'agency_agent_daily_status',
      p_agent_id,
      jsonb_build_object(
        'operational_date', p_operational_date,
        'status', p_status,
        'reported_amount', round(p_reported_amount, 2)
      )
    );
  end if;
end;
$function$;

revoke all on function public.set_agency_agent_daily_status_with_amount(uuid, uuid, date, text, text, numeric) from public, anon;
grant execute on function public.set_agency_agent_daily_status_with_amount(uuid, uuid, date, text, text, numeric) to authenticated;

-- Normalize queued backup lines at creation so all email timestamps are explicit DD/MM/YYYY HH:mm:ss in Buenos Aires.
create or replace function private.normalize_agency_rendition_backup_datetime()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_game_date date;
  v_created_at timestamptz;
  v_subject text;
  v_body text;
begin
  select r.rendition_date, r.created_at
    into v_game_date, v_created_at
  from public.agency_renditions r
  where r.id = new.rendition_id
    and r.organization_id = new.organization_id;

  if not found then
    return new;
  end if;

  v_subject := regexp_replace(
    new.subject,
    '[0-9]{4}-[0-9]{2}-[0-9]{2}',
    to_char(v_game_date, 'DD/MM/YYYY')
  );

  v_body := new.text_body;
  v_body := regexp_replace(
    v_body,
    'Fecha del juego: [0-9]{4}-[0-9]{2}-[0-9]{2}',
    'Fecha del juego: ' || to_char(v_game_date, 'DD/MM/YYYY'),
    'g'
  );
  v_body := regexp_replace(
    v_body,
    'Registrada: [0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}',
    'Registrada: ' ||
      to_char(v_created_at at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI:SS') ||
      ' (Buenos Aires, Argentina)',
    'g'
  );

  update public.agency_rendition_backup_outbox
  set subject = v_subject,
      text_body = v_body
  where id = new.id;

  return new;
end;
$function$;

drop trigger if exists normalize_agency_rendition_backup_datetime on public.agency_rendition_backup_outbox;
create trigger normalize_agency_rendition_backup_datetime
after insert on public.agency_rendition_backup_outbox
for each row execute function private.normalize_agency_rendition_backup_datetime();

-- Replace the prior job, if present. 02:50 UTC is 23:50 in Buenos Aires (UTC-03:00).
do $migration$
declare
  v_existing record;
begin
  for v_existing in
    select jobid from cron.job where jobname = 'agency-rendition-daily-backup'
  loop
    perform cron.unschedule(v_existing.jobid);
  end loop;

  perform cron.schedule(
    'agency-rendition-daily-backup',
    '50 2 * * *',
    $scheduled$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'agency_rendition_backup_project_url')
          || '/functions/v1/send-rendition-backup',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'agency_rendition_backup_anon_key'),
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'agency_rendition_backup_anon_key'),
          'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'agency_rendition_backup_cron_secret')
        ),
        body := jsonb_build_object('daily_close', true),
        timeout_milliseconds := 60000
      );
    $scheduled$
  );
end;
$migration$;
