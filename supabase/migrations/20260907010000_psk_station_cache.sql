-- #287: shared public-provider quota and bounded station snapshots.
-- Apply manually before deploying the station endpoint. All app instances use
-- the same database. No table or RPC is accessible to anonymous browser clients.
CREATE TABLE IF NOT EXISTS public.psk_station_gate (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  next_query_at timestamptz NOT NULL DEFAULT '-infinity',
  token uuid,
  callsign text
);
INSERT INTO public.psk_station_gate(singleton) VALUES (true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS public.psk_station_cache (
  callsign text PRIMARY KEY,
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.psk_station_gate ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.psk_station_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.psk_station_gate, public.psk_station_cache FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.psk_station_claim(p_callsign text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  gate public.psk_station_gate%ROWTYPE;
  cached jsonb;
  now_at timestamptz;
  lease uuid;
  retry_ms double precision;
BEGIN
  IF p_callsign IS NULL OR length(p_callsign) > 32 OR p_callsign !~ '^[A-Z0-9]+(/[A-Z0-9]+)*$'
     OR p_callsign !~ '[A-Z]' OR p_callsign !~ '[0-9]' THEN
    RAISE EXCEPTION 'Invalid station callsign';
  END IF;
  SELECT * INTO STRICT gate FROM public.psk_station_gate WHERE singleton FOR UPDATE;
  now_at := clock_timestamp();
  SELECT snapshot INTO cached FROM public.psk_station_cache WHERE callsign = p_callsign;
  IF cached IS NOT NULL AND (cached->>'retryAt')::double precision > extract(epoch FROM now_at) * 1000 THEN
    RETURN jsonb_build_object('token', NULL, 'snapshot', cached, 'retryAt', cached->'retryAt');
  END IF;
  IF gate.next_query_at > now_at THEN
    RETURN jsonb_build_object('token', NULL, 'snapshot', cached,
      'retryAt', extract(epoch FROM gate.next_query_at) * 1000);
  END IF;
  lease := gen_random_uuid();
  -- Ten seconds for claim delivery/start, then five minutes of provider cooldown.
  UPDATE public.psk_station_gate SET next_query_at = now_at + interval '310 seconds',
    token = lease, callsign = p_callsign WHERE singleton;
  retry_ms := extract(epoch FROM now_at + interval '310 seconds') * 1000;
  RETURN jsonb_build_object('token', lease, 'snapshot', cached, 'retryAt', retry_ms);
END;
$$;

CREATE OR REPLACE FUNCTION public.psk_station_finish(p_callsign text, p_token uuid, p_snapshot jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  gate public.psk_station_gate%ROWTYPE;
  now_at timestamptz;
  retry_at timestamptz;
  result jsonb;
BEGIN
  SELECT * INTO STRICT gate FROM public.psk_station_gate WHERE singleton FOR UPDATE;
  IF p_token IS NULL OR gate.token IS DISTINCT FROM p_token OR gate.callsign IS DISTINCT FROM p_callsign THEN
    RAISE EXCEPTION 'PSK lease mismatch';
  END IF;
  IF p_snapshot IS NULL OR jsonb_typeof(p_snapshot) <> 'object' OR octet_length(p_snapshot::text) > 500000
     OR p_snapshot->>'callsign' IS DISTINCT FROM p_callsign
     OR p_snapshot->>'status' IS NULL OR p_snapshot->>'status' NOT IN ('ok', 'stale', 'unavailable')
     OR jsonb_typeof(p_snapshot->'reports') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid PSK snapshot';
  END IF;
  IF jsonb_array_length(p_snapshot->'reports') > 1000 THEN RAISE EXCEPTION 'Too many PSK reports'; END IF;
  now_at := clock_timestamp();
  -- Completion is a known upper bound on provider start, so a fresh five
  -- minutes is safe without retaining the unused start-delivery allowance.
  retry_at := now_at + interval '300 seconds';
  result := jsonb_set(p_snapshot, '{retryAt}', to_jsonb(extract(epoch FROM retry_at) * 1000));
  UPDATE public.psk_station_gate SET next_query_at = retry_at, token = NULL WHERE singleton;
  DELETE FROM public.psk_station_cache WHERE updated_at < now_at - interval '24 hours';
  IF NOT EXISTS (SELECT FROM public.psk_station_cache WHERE callsign = p_callsign) THEN
    DELETE FROM public.psk_station_cache WHERE callsign IN (
      SELECT callsign FROM public.psk_station_cache ORDER BY updated_at DESC, callsign OFFSET 127
    );
  END IF;
  INSERT INTO public.psk_station_cache(callsign, snapshot, updated_at) VALUES (p_callsign, result, now_at)
    ON CONFLICT (callsign) DO UPDATE SET snapshot = EXCLUDED.snapshot, updated_at = EXCLUDED.updated_at;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.psk_station_claim(text), public.psk_station_finish(text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.psk_station_claim(text), public.psk_station_finish(text, uuid, jsonb) TO service_role;
