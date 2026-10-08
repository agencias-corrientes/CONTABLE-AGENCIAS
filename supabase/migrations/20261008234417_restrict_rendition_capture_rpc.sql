-- Anonymous callers must never be able to invoke the rendition creation function.
revoke all on function public.create_agency_rendition_with_capture(
  uuid, uuid, date, numeric, jsonb, jsonb, text, text, text, text, text, text
) from public, anon;
grant execute on function public.create_agency_rendition_with_capture(
  uuid, uuid, date, numeric, jsonb, jsonb, text, text, text, text, text, text
) to authenticated;
