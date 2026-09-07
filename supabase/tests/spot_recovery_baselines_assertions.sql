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

-- Inverse ordering: a transaction begins first, then a remote rebuild obtains
-- the lock and holds it. The older transaction's gap insert must wait and use
-- wall-clock time after that wait, so it invalidates the completed baseline.
INSERT INTO public.band_hourly_stats (band, hour_utc, spot_count) VALUES
  ('12m', date_trunc('hour', clock_timestamp()) - interval '24 hours', 12),
  ('12m', date_trunc('hour', clock_timestamp()) - interval '120 hours', 912);
CREATE FUNCTION public.spot_baseline_test_rebuild_and_sleep()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.compute_band_activity_climatology(90);
  PERFORM pg_sleep(1);
END;
$$;
SELECT dblink_connect('spot_baseline_rebuild', 'host=/tmp dbname=postgres user=postgres');
BEGIN;
SELECT transaction_timestamp() AS gap_transaction_started;
SELECT dblink_send_query('spot_baseline_rebuild',
  'SELECT public.spot_baseline_test_rebuild_and_sleep()');
SELECT pg_sleep(0.2);
DO $$
DECLARE
  started timestamptz := clock_timestamp();
  gap_hour timestamptz := date_trunc('hour', clock_timestamp()) - interval '120 hours';
BEGIN
  PERFORM public.record_spot_aggregation_gap('band_hourly', gap_hour, gap_hour);
  IF clock_timestamp() - started < interval '0.65 seconds' THEN
    RAISE EXCEPTION 'gap writer did not wait for concurrent baseline rebuild';
  END IF;
END;
$$;
COMMIT;
SELECT result FROM dblink_get_result('spot_baseline_rebuild') AS completed(result text);
SELECT dblink_disconnect('spot_baseline_rebuild');
DO $$
DECLARE
  computed timestamptz;
  recorded timestamptz;
  gap_hour timestamptz := date_trunc('hour', clock_timestamp()) - interval '120 hours';
BEGIN
  SELECT computed_at INTO STRICT computed FROM public.band_activity_climatology
    WHERE band = '12m';
  SELECT recorded_at INTO STRICT recorded FROM public.collector_aggregation_gaps
    WHERE aggregation = 'band_hourly' AND start_hour = gap_hour;
  IF recorded <= computed
    OR public.spot_aggregation_baseline_current('band_hourly', computed) THEN
    RAISE EXCEPTION 'post-rebuild gap timestamp did not invalidate baseline';
  END IF;
END;
$$;

-- A gap may be written by one collector connection while the daily baseline
-- rebuild starts on another. The rebuild must wait for that transaction and
-- take its data snapshot only after the committed gap is visible.
INSERT INTO public.band_hourly_stats (band, hour_utc, spot_count) VALUES
  ('15m', date_trunc('hour', clock_timestamp()) - interval '24 hours', 10),
  ('15m', date_trunc('hour', clock_timestamp()) - interval '72 hours', 30),
  ('15m', date_trunc('hour', clock_timestamp()) - interval '96 hours', 999);

CREATE FUNCTION public.spot_baseline_test_record_gap_and_sleep()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  gap_hour timestamptz := date_trunc('hour', clock_timestamp()) - interval '96 hours';
BEGIN
  PERFORM public.record_spot_aggregation_gap('band_hourly', gap_hour, gap_hour);
  PERFORM pg_sleep(1);
END;
$$;

SELECT dblink_connect('spot_baseline_gap', 'host=/tmp dbname=postgres user=postgres');
SELECT dblink_send_query('spot_baseline_gap',
  'SELECT public.spot_baseline_test_record_gap_and_sleep()');
SELECT pg_sleep(0.2);
DO $$
DECLARE
  started timestamptz := clock_timestamp();
BEGIN
  PERFORM public.compute_band_activity_climatology(90);
  IF clock_timestamp() - started < interval '0.65 seconds' THEN
    RAISE EXCEPTION 'baseline rebuild did not wait for concurrent gap transaction';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.band_activity_climatology
      WHERE band = '15m' AND sample_count = 1 AND p50 = 30) THEN
    RAISE EXCEPTION 'rebuild snapshot did not exclude the concurrently committed gap';
  END IF;
END;
$$;
SELECT result FROM dblink_get_result('spot_baseline_gap') AS completed(result text);
SELECT dblink_disconnect('spot_baseline_gap');

BEGIN ISOLATION LEVEL REPEATABLE READ;
DO $$
BEGIN
  BEGIN
    PERFORM public.compute_band_activity_climatology(90);
    RAISE EXCEPTION 'repeatable-read band rebuild accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'repeatable-read band rebuild accepted' THEN RAISE; END IF;
    IF SQLERRM <> 'band climatology rebuild requires read committed isolation' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.compute_region_activity_climatology(90);
    RAISE EXCEPTION 'repeatable-read region rebuild accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'repeatable-read region rebuild accepted' THEN RAISE; END IF;
    IF SQLERRM <> 'region climatology rebuild requires read committed isolation' THEN RAISE; END IF;
  END;
END;
$$;
ROLLBACK;
