ALTER TABLE public.agency_prize_payments ADD COLUMN IF NOT EXISTS included_in_ticket_ocr boolean NOT NULL DEFAULT false;
