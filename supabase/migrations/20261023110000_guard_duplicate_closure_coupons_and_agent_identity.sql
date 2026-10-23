-- Prevent duplicate official end-of-day coupons and enforce ticket ownership at the database boundary.
-- Canonicalize agency codes in both OCR and stored receipts (e.g. 0123 and 123).
CREATE OR REPLACE FUNCTION private.normalize_closure_agency_code(p_value text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $function$
DECLARE
  v text := regexp_replace(coalesce(p_value, ''), '\D', '', 'g');
BEGIN
  IF length(v) = 4 AND v ~ '^[01][0-9]{3}$' THEN
    RETURN substring(v FROM 2);
  END IF;
  RETURN v;
END;
$function$;

-- This database guard was validated in Preview before deployment.

CREATE OR REPLACE FUNCTION private.normalize_closure_ticket_date(p_value text)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $function$
DECLARE
  v text := btrim(coalesce(p_value, ''));
  m text[];
BEGIN
  IF v ~ '^\d{4}-\d{2}-\d{2}$' THEN
    RETURN v::date;
  END IF;
  m := regexp_match(v, '^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$');
  IF m IS NULL THEN RETURN NULL; END IF;
  RETURN make_date(
    CASE WHEN length(m[3]) = 2 THEN 2000 + m[3]::integer ELSE m[3]::integer END,
    m[2]::integer,
    m[1]::integer
  );
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION private.guard_official_closure_ticket_receipt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $function$
DECLARE
  v_agent_code text;
  v_agency_code text;
  v_receipts jsonb;
  v_ticket jsonb;
  v_ticket_agency text;
  v_ticket_agent text;
  v_period text;
  v_printed_date date;
  v_key text;
  v_existing jsonb;
  v_existing_ticket jsonb;
  v_existing_agent_code text;
  v_existing_agency_code text;
  v_existing_receipts jsonb;
  v_existing_key text;
BEGIN
  -- Do not revalidate legacy OCR payloads when another update leaves the receipt unchanged.
  -- New/replaced receipt data is still checked against the current agent and prior coupons.
  IF TG_OP = 'UPDATE' AND NEW.ticket_receipt_data IS NOT DISTINCT FROM OLD.ticket_receipt_data THEN
    RETURN NEW;
  END IF;
  IF NEW.ticket_receipt_data IS NULL THEN RETURN NEW; END IF;

  SELECT a.code INTO v_agent_code
  FROM public.agency_agents a
  WHERE a.id = NEW.agent_id AND a.organization_id = NEW.organization_id;
  IF v_agent_code IS NULL THEN
    RAISE EXCEPTION 'El subagente o ambulante del ticket no pertenece a esta agencia';
  END IF;

  SELECT coalesce(nullif(btrim(o.agency_code), ''), substring(o.name FROM 'Agencia[^0-9]*([0-9]{3})'))
  INTO v_agency_code
  FROM public.organizations o WHERE o.id = NEW.organization_id;

  IF NEW.ticket_receipt_data->>'type' = 'loteria-corrientes-end-of-day-v1' THEN
    v_receipts := jsonb_build_array(NEW.ticket_receipt_data);
  ELSIF NEW.ticket_receipt_data->>'type' = 'loteria-corrientes-end-of-day-batch-v1'
        AND jsonb_typeof(NEW.ticket_receipt_data->'tickets') = 'array' THEN
    v_receipts := NEW.ticket_receipt_data->'tickets';
  ELSE
    RETURN NEW;
  END IF;

  -- Serialize the duplicate check for the same organization so two simultaneous
  -- uploads cannot both pass before either one is committed.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.organization_id::text || ':closure-coupon', 0));

  FOR v_ticket IN SELECT value FROM jsonb_array_elements(v_receipts)
  LOOP
    v_ticket_agency := private.normalize_closure_agency_code(v_ticket->>'agencyCode');
    v_ticket_agent := regexp_replace(coalesce(v_ticket->>'subagentCode', ''), '\D', '', 'g');
    v_period := regexp_replace(coalesce(v_ticket->>'periodNumber', ''), '\s', '', 'g');
    v_printed_date := private.normalize_closure_ticket_date(
      coalesce(v_ticket->'closedAt'->>'date', v_ticket->'printedAt'->>'date', v_ticket->'openedAt'->>'date')
    );

    IF v_ticket_agency = '' OR v_ticket_agent = '' OR v_period !~ '^[0-9]{7}$' OR v_printed_date IS NULL THEN
      RAISE EXCEPTION 'El ticket de cierre no contiene agencia, subagente, período y fecha verificables';
    END IF;
    IF v_agency_code IS NOT NULL AND v_agency_code <> '000' AND v_ticket_agency <> regexp_replace(v_agency_code, '\D', '', 'g') THEN
      RAISE EXCEPTION 'El ticket pertenece a otra agencia';
    END IF;
    IF v_agency_code IS NOT NULL AND v_agency_code <> '000'
       AND v_ticket_agent <> regexp_replace(v_agent_code, '\D', '', 'g')
       AND v_ticket_agent <> regexp_replace(substring(v_agent_code FROM '^[0-9]{3}-([0-9]{3}-[0-9]{2})$'), '\D', '', 'g') THEN
      RAISE EXCEPTION 'El ticket pertenece a otro subagente o ambulante';
    END IF;

    v_key := v_ticket_agency || '|' || v_ticket_agent || '|' || v_period || '|' || v_printed_date::text;

    -- Also reject duplicates inside the uploaded batch itself.
    IF (SELECT count(*) FROM jsonb_array_elements(v_receipts) x
        WHERE regexp_replace(coalesce(x.value->>'periodNumber', ''), '\s', '', 'g') = v_period
          AND private.normalize_closure_agency_code(x.value->>'agencyCode') = private.normalize_closure_agency_code(v_ticket->>'agencyCode')
          AND private.normalize_closure_ticket_date(coalesce(x.value->'closedAt'->>'date', x.value->'printedAt'->>'date', x.value->'openedAt'->>'date')) = v_printed_date
          AND regexp_replace(coalesce(x.value->>'subagentCode', ''), '\D', '', 'g') = regexp_replace(coalesce(v_ticket->>'subagentCode', ''), '\D', '', 'g')) > 1 THEN
      RAISE EXCEPTION 'El lote contiene un cupón de cierre duplicado';
    END IF;

    FOR v_existing IN
      SELECT r.ticket_receipt_data
      FROM public.agency_renditions r
      WHERE r.organization_id = NEW.organization_id
        AND r.id <> NEW.id
        AND r.game_period = 'Cierre diario'
        AND r.status <> 'void'
        AND r.ticket_receipt_data IS NOT NULL
    LOOP
      IF v_existing->>'type' = 'loteria-corrientes-end-of-day-v1' THEN
        v_existing_receipts := jsonb_build_array(v_existing);
      ELSIF v_existing->>'type' = 'loteria-corrientes-end-of-day-batch-v1'
            AND jsonb_typeof(v_existing->'tickets') = 'array' THEN
        v_existing_receipts := v_existing->'tickets';
      ELSE
        CONTINUE;
      END IF;
      FOR v_existing_ticket IN SELECT value FROM jsonb_array_elements(v_existing_receipts)
      LOOP
        v_existing_key :=
          private.normalize_closure_agency_code(v_existing_ticket->>'agencyCode') || '|' ||
          regexp_replace(coalesce(v_existing_ticket->>'subagentCode', ''), '\D', '', 'g') || '|' ||
          regexp_replace(coalesce(v_existing_ticket->>'periodNumber', ''), '\s', '', 'g') || '|' ||
          coalesce(private.normalize_closure_ticket_date(coalesce(v_existing_ticket->'closedAt'->>'date', v_existing_ticket->'printedAt'->>'date', v_existing_ticket->'openedAt'->>'date'))::text, '');
        IF v_existing_key = v_key THEN
          RAISE EXCEPTION 'Este cupón de cierre ya fue rendido anteriormente';
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS agency_rendition_guard_closure_receipt ON public.agency_renditions;
CREATE TRIGGER agency_rendition_guard_closure_receipt
BEFORE INSERT OR UPDATE OF ticket_receipt_data ON public.agency_renditions
FOR EACH ROW
EXECUTE FUNCTION private.guard_official_closure_ticket_receipt();
