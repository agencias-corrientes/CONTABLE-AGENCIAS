alter table public.agency_operational_settings
  add column if not exists backup_send_time time not null default time '23:50';
