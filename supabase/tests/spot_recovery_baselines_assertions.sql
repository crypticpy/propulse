DO $$
DECLARE
  h1 timestamptz := date_trunc('hour', clock_timestamp()) - interval '24 hours';
  h2 timestamptz := date_trunc('hour', clock_timestamp()) - interval '48 hours';
  h3 timestamptz := date_trunc('hour', clock_timestamp()) - interval '72 hours';
  computed timestamptz;
  gap_recorded timestamptz;
BEGIN
  INSERT INTO public.band_hourly_stats VALUES
    ('20m', h1, 100), ('40m', h1, 10), ('10m', h1, 0),
    ('20m', h2, 999), ('40m', h2, 20), ('40m', h3, 30), ('10m', h3, 0);
  INSERT INTO public.region_hourly_stats VALUES
    ('20m', 'NA', h1, 80), ('40m', 'NA', h1, 8), ('20m', 'NA', h2, 888),
    ('40m', 'NA', h2, 18), ('40m', 'NA', h3, 28);
  INSERT INTO public.collector_aggregation_gaps VALUES
    ('band_hourly', h2, h2, clock_timestamp() - interval '1 minute'),
    ('region_hourly', h2, h2, clock_timestamp() - interval '1 minute');

  PERFORM public.compute_band_activity_climatology(90);
  PERFORM public.compute_region_activity_climatology(90);
  IF NOT EXISTS (SELECT 1 FROM public.band_activity_climatology
      WHERE band = '20m' AND sample_count = 2 AND p50 = 50)
    OR NOT EXISTS (SELECT 1 FROM public.region_activity_climatology
      WHERE band = '20m' AND continent = 'NA' AND sample_count = 2 AND p50 = 40) THEN
    RAISE EXCEPTION 'gap hour was densified as zero or included in rebuilt baseline';
  END IF;
  IF EXISTS (SELECT 1 FROM public.band_hourly_stats_readable WHERE hour_utc = h2)
    OR NOT EXISTS (SELECT 1 FROM public.band_hourly_stats_readable
      WHERE band = '10m' AND hour_utc = h1 AND spot_count = 0) THEN
    RAISE EXCEPTION 'readable hourly history hid a legitimate zero or exposed a known gap';
  END IF;

  SELECT recorded_at INTO gap_recorded FROM public.collector_aggregation_gaps
    WHERE aggregation = 'band_hourly' AND start_hour = h2;
  PERFORM public.record_spot_aggregation_gap('band_hourly', h2, h2);
  SELECT computed_at INTO computed FROM public.band_activity_climatology WHERE band = '20m';
  IF (SELECT recorded_at FROM public.collector_aggregation_gaps
      WHERE aggregation = 'band_hourly' AND start_hour = h2) IS DISTINCT FROM gap_recorded
    OR NOT public.spot_aggregation_baseline_current('band_hourly', computed) THEN
    RAISE EXCEPTION 'identical gap repeat invalidated rebuilt baseline';
  END IF;
  UPDATE public.band_activity_climatology
    SET computed_at = clock_timestamp() - interval '1 second';
  PERFORM public.record_spot_aggregation_gap('band_hourly', h2, h1);
  SELECT computed_at INTO computed FROM public.band_activity_climatology WHERE band = '20m';
  IF public.spot_aggregation_baseline_current('band_hourly', computed)
    OR NOT EXISTS (SELECT 1 FROM public.collector_aggregation_gaps
      WHERE aggregation = 'band_hourly' AND start_hour = h2 AND end_hour = h1
        AND recorded_at > gap_recorded) THEN
    RAISE EXCEPTION 'expanded gap did not invalidate rebuilt baseline';
  END IF;

  INSERT INTO public.spot_history VALUES
    (1, '20m', 'dxcluster', 'FT8', 'K1TEST', 'N0TEST', clock_timestamp() - interval '5 minutes',
      NULL, NULL, NULL, NULL, NULL, NULL, 'NA');
  IF NOT EXISTS (SELECT 1 FROM public.band_activity_counts()
      WHERE band = '20m' AND count_60m = 1 AND p50 IS NULL AND sample_count IS NULL) THEN
    RAISE EXCEPTION 'band raw count or stale baseline invalidation failed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.region_activity_counts('NA')
      WHERE band = '20m' AND continent = 'NA' AND count_60m = 1 AND p50 IS NOT NULL) THEN
    RAISE EXCEPTION 'band gap incorrectly invalidated region baseline';
  END IF;

  SELECT computed_at INTO computed FROM public.region_activity_climatology WHERE band = '20m' AND continent = 'NA';
  INSERT INTO public.collector_aggregation_gaps VALUES
    ('region_hourly', h1, h1, computed + interval '1 second');
  IF NOT EXISTS (SELECT 1 FROM public.region_activity_counts('NA')
      WHERE band = '20m' AND continent = 'NA' AND count_60m = 1 AND p50 IS NULL AND sample_count IS NULL) THEN
    RAISE EXCEPTION 'region raw count or stale baseline invalidation failed';
  END IF;

  IF has_table_privilege('anon', 'public.collector_aggregation_gaps', 'SELECT')
    OR NOT has_table_privilege('anon', 'public.band_hourly_stats', 'SELECT')
    OR NOT has_table_privilege('anon', 'public.band_hourly_stats_readable', 'SELECT')
    OR NOT has_function_privilege('anon', 'public.band_activity_counts()', 'EXECUTE')
    OR NOT has_function_privilege('anon', 'public.region_activity_counts(text)', 'EXECUTE')
    OR NOT has_function_privilege('anon', 'public.spot_aggregation_baseline_current(text,timestamptz)', 'EXECUTE')
    OR NOT has_function_privilege('anon', 'public.spot_aggregation_hour_readable(text,timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ledger or RPC permissions are incorrect';
  END IF;
  IF public.spot_aggregation_baseline_current(NULL, clock_timestamp()) IS DISTINCT FROM false
    OR public.spot_aggregation_baseline_current('band_hourly', NULL) IS DISTINCT FROM false
    OR public.spot_aggregation_baseline_current('path_hourly', clock_timestamp()) IS DISTINCT FROM false
    OR public.spot_aggregation_hour_readable(NULL, h1) IS DISTINCT FROM false
    OR public.spot_aggregation_hour_readable('band_hourly', NULL) IS DISTINCT FROM false
    OR public.spot_aggregation_hour_readable('path_hourly', h1) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'baseline helper accepted invalid kind or null timestamp';
  END IF;
END;
$$;

BEGIN;
SET LOCAL ROLE anon;
DO $$
DECLARE
  retained_hour timestamptz := date_trunc('hour', clock_timestamp()) - interval '72 hours';
  gap_hour timestamptz := date_trunc('hour', clock_timestamp()) - interval '48 hours';
BEGIN
  IF EXISTS (SELECT 1 FROM public.band_hourly_stats_readable WHERE hour_utc = gap_hour)
    OR NOT EXISTS (SELECT 1 FROM public.band_hourly_stats_readable
      WHERE band = '10m' AND hour_utc = retained_hour AND spot_count = 0) THEN
    RAISE EXCEPTION 'anonymous readable history contract failed';
  END IF;
  BEGIN
    PERFORM 1 FROM public.collector_aggregation_gaps LIMIT 1;
    RAISE EXCEPTION 'anonymous role read the private gap ledger';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;
RESET ROLE;
ROLLBACK;
