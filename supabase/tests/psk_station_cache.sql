DO $$
DECLARE
  claim jsonb;
  blocked jsonb;
  completed jsonb;
  cached jsonb;
  denied boolean := false;
BEGIN
  ASSERT NOT has_function_privilege('anon', 'public.psk_station_claim(text)', 'EXECUTE');
  ASSERT NOT has_function_privilege('authenticated', 'public.psk_station_finish(text,uuid,jsonb)', 'EXECUTE');
  ASSERT has_function_privilege('service_role', 'public.psk_station_claim(text)', 'EXECUTE');
  ASSERT NOT has_table_privilege('anon', 'public.psk_station_cache', 'SELECT');
  claim := public.psk_station_claim('N0TEST');
  ASSERT claim->>'token' IS NOT NULL;
  blocked := public.psk_station_claim('W1AW');
  ASSERT blocked->>'token' IS NULL AND blocked->>'snapshot' IS NULL;
  ASSERT (blocked->>'retryAt')::double precision = (claim->>'retryAt')::double precision;
  completed := public.psk_station_finish('N0TEST', (claim->>'token')::uuid,
    jsonb_build_object('callsign','N0TEST','status','ok','reports','[]'::jsonb,
      'fetchedAt',extract(epoch FROM clock_timestamp())*1000,'checkedAt',extract(epoch FROM clock_timestamp())*1000,
      'retryAt',0,'windowMinutes',1440,'limit',1000,'limited',false,'discarded',0));
  ASSERT (completed->>'retryAt')::double precision >= extract(epoch FROM clock_timestamp() + interval '299 seconds') * 1000;
  cached := public.psk_station_claim('N0TEST');
  ASSERT cached->>'token' IS NULL AND cached->'snapshot' = completed;
  BEGIN
    PERFORM public.psk_station_finish('N0TEST', (claim->>'token')::uuid, completed);
  EXCEPTION WHEN OTHERS THEN denied := true;
  END;
  ASSERT denied, 'A completed lease must not publish twice';

  -- Simulate time advancing in this disposable database; a replacement lease
  -- fences out a delayed completion from the previous request.
  UPDATE public.psk_station_gate SET next_query_at = '-infinity';
  blocked := public.psk_station_claim('W1AW');
  ASSERT blocked->>'token' IS NOT NULL;
  denied := false;
  BEGIN
    PERFORM public.psk_station_finish('N0TEST', (claim->>'token')::uuid, completed);
  EXCEPTION WHEN OTHERS THEN denied := true;
  END;
  ASSERT denied, 'A superseded lease must not overwrite the cache';
  completed := public.psk_station_finish('W1AW', (blocked->>'token')::uuid,
    jsonb_build_object('callsign','W1AW','status','unavailable','reports','[]'::jsonb,
      'fetchedAt',NULL,'checkedAt',extract(epoch FROM clock_timestamp())*1000,
      'retryAt',0,'windowMinutes',1440,'limit',1000,'limited',false,'discarded',0));
  ASSERT public.psk_station_claim('K2ABC')->>'token' IS NULL, 'Failure must retain the global cooldown';

  INSERT INTO public.psk_station_cache(callsign,snapshot,updated_at)
    SELECT 'K'||n||'TEST', completed || jsonb_build_object('callsign','K'||n||'TEST'), clock_timestamp()
    FROM generate_series(1,126) AS n;
  ASSERT (SELECT count(*) FROM public.psk_station_cache) = 128;
  UPDATE public.psk_station_gate SET next_query_at = '-infinity';
  claim := public.psk_station_claim('K999TEST');
  PERFORM public.psk_station_finish('K999TEST', (claim->>'token')::uuid,
    completed || jsonb_build_object('callsign','K999TEST'));
  ASSERT (SELECT count(*) FROM public.psk_station_cache) = 128, 'Cache capacity is bounded';
END;
$$;
TRUNCATE public.psk_station_cache;
UPDATE public.psk_station_gate SET next_query_at = '-infinity', token = NULL, callsign = NULL;
