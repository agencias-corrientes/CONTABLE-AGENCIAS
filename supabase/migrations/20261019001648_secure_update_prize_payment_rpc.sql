REVOKE ALL ON FUNCTION public.update_agency_prize_payment(uuid, uuid, text, numeric, date, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_agency_prize_payment(uuid, uuid, text, numeric, date, text, text, boolean) TO authenticated;
