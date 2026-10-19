-- Allow permanent deletion of an access account without deleting another agency's business records.
-- Rows created by a removed user in agencies they do not own are retained; creator references become NULL.
ALTER TABLE public.agency_prize_payments ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.agency_prize_payments DROP CONSTRAINT IF EXISTS agency_prize_payments_created_by_fkey;
ALTER TABLE public.agency_prize_payments
  ADD CONSTRAINT agency_prize_payments_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.cash_movements ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.cash_movements DROP CONSTRAINT IF EXISTS cash_movements_created_by_fkey;
ALTER TABLE public.cash_movements
  ADD CONSTRAINT cash_movements_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.journal_entries ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.journal_entries DROP CONSTRAINT IF EXISTS journal_entries_created_by_fkey;
ALTER TABLE public.journal_entries
  ADD CONSTRAINT journal_entries_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.journal_entries DROP CONSTRAINT IF EXISTS journal_entries_posted_by_fkey;
ALTER TABLE public.journal_entries
  ADD CONSTRAINT journal_entries_posted_by_fkey
  FOREIGN KEY (posted_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.payments ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_created_by_fkey;
ALTER TABLE public.payments
  ADD CONSTRAINT payments_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.purchase_bills ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.purchase_bills DROP CONSTRAINT IF EXISTS purchase_bills_created_by_fkey;
ALTER TABLE public.purchase_bills
  ADD CONSTRAINT purchase_bills_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.sales_invoices ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.sales_invoices DROP CONSTRAINT IF EXISTS sales_invoices_created_by_fkey;
ALTER TABLE public.sales_invoices
  ADD CONSTRAINT sales_invoices_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
