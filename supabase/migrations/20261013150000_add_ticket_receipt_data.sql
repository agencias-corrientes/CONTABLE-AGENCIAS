alter table public.agency_renditions
  add column if not exists ticket_receipt_data jsonb;

comment on column public.agency_renditions.ticket_receipt_data is
  'Structured OCR extraction of an official end-of-day quiniela closure ticket; informational metadata, not an extra financial amount.';
