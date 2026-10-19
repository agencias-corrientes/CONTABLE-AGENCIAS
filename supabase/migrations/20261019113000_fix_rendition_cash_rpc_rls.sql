-- Preview-only fix: receive_agency_rendition already validates agency membership,
-- role, positive amount, rendition state, cash account, and overpayment.
-- SECURITY DEFINER lets this atomic RPC write both linked payment and cash movement
-- despite end-user table RLS, without granting direct table write access.
ALTER FUNCTION public.receive_agency_rendition(uuid, uuid, date, numeric, uuid, text, text)
  SECURITY DEFINER;
ALTER FUNCTION public.receive_agency_rendition(uuid, uuid, date, numeric, uuid, text, text)
  SET search_path = public, pg_temp;