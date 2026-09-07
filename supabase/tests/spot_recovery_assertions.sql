DO $$
DECLARE
  retained_hour timestamptz := date_trunc('hour', clock_timestamp()) - interval '1 hour';
  expired_hour timestamptz := date_trunc('hour', clock_timestamp()) - interval '3 hours';
  future_hour timestamptz := date_trunc('hour', clock_timestamp()) + interval '1 hour';
  result jsonb;
BEGIN
  IF has_function_privilege('anon', 'public.compute_retained_spot_hour(text,timestamptz)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.compute_retained_spot_hour(text,timestamptz)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.compute_retained_spot_hour(text,timestamptz)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.prune_retained_spots()', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.prune_retained_spots()', 'EXECUTE') THEN
    RAISE EXCEPTION 'spot recovery function permissions are unsafe';
  END IF;
  IF has_table_privilege('anon', 'public.collector_aggregation_gaps', 'SELECT')
    OR has_table_privilege('authenticated', 'public.collector_aggregation_gaps', 'SELECT')
    OR NOT has_table_privilege('service_role', 'public.collector_aggregation_gaps', 'SELECT') THEN
    RAISE EXCEPTION 'gap table permissions are unsafe';
  END IF;

  result := public.compute_retained_spot_hour('band_hourly', expired_hour);
  IF result <> jsonb_build_object('status', 'expired', 'rows', 0)
    OR EXISTS (SELECT 1 FROM public.spot_recovery_test_output WHERE hour = expired_hour)
    OR EXISTS (SELECT 1 FROM public.collector_aggregation_watermarks WHERE completed_hour = expired_hour)
    OR NOT EXISTS (SELECT 1 FROM public.collector_aggregation_gaps WHERE aggregation = 'band_hourly' AND start_hour = expired_hour AND end_hour = expired_hour) THEN
    RAISE EXCEPTION 'expired hours must record only a durable bounded gap';
  END IF;

  result := public.compute_retained_spot_hour('path_hourly', retained_hour);
  IF result <> jsonb_build_object('status', 'retained', 'rows', 1)
    OR NOT EXISTS (SELECT 1 FROM public.spot_recovery_test_output WHERE aggregation = 'path_hourly' AND hour = retained_hour)
    OR NOT EXISTS (SELECT 1 FROM public.collector_aggregation_watermarks WHERE aggregation = 'path_hourly' AND completed_hour = retained_hour AND rows_written = 1) THEN
    RAISE EXCEPTION 'retained aggregation and watermark were not written together';
  END IF;

  UPDATE public.spot_recovery_test_control SET fail_aggregation = 'region_hourly';
  BEGIN
    PERFORM public.compute_retained_spot_hour('region_hourly', retained_hour);
    RAISE EXCEPTION 'expected synthetic compute failure';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'expected synthetic compute failure' THEN RAISE; END IF;
  END;
  IF EXISTS (SELECT 1 FROM public.spot_recovery_test_output WHERE aggregation = 'region_hourly')
    OR EXISTS (SELECT 1 FROM public.collector_aggregation_watermarks WHERE aggregation = 'region_hourly') THEN
    RAISE EXCEPTION 'failed aggregation did not roll back output and watermark';
  END IF;
  UPDATE public.spot_recovery_test_control SET fail_aggregation = NULL;

  BEGIN
    PERFORM public.record_spot_aggregation_gap('band_hourly', NULL, retained_hour);
    RAISE EXCEPTION 'nullable gap accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM = 'nullable gap accepted' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.record_spot_aggregation_gap('band_hourly', retained_hour, future_hour);
    RAISE EXCEPTION 'future gap accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM = 'future gap accepted' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.record_spot_aggregation_gap('band_hourly', retained_hour, retained_hour - interval '1 hour');
    RAISE EXCEPTION 'reversed gap accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM = 'reversed gap accepted' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.compute_retained_spot_hour('band_hourly', future_hour);
    RAISE EXCEPTION 'future watermark hour accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM = 'future watermark hour accepted' THEN RAISE; END IF; END;
END;
$$;

INSERT INTO public.spot_history (spotted_at) VALUES
  (clock_timestamp() - interval '3 hours'),
  (clock_timestamp() - interval '1 hour');
UPDATE public.spot_recovery_test_control SET sleep_seconds = 1;
SELECT dblink_connect('spot_recovery_lock', 'host=/tmp dbname=postgres user=postgres');
SELECT dblink_send_query('spot_recovery_lock',
  format('SELECT public.compute_retained_spot_hour(%L, %L::timestamptz)',
    'band_hourly', date_trunc('hour', clock_timestamp()) - interval '1 hour'));
SELECT pg_sleep(0.2);
DO $$
DECLARE started timestamptz := clock_timestamp(); removed bigint;
BEGIN
  removed := public.prune_retained_spots();
  IF clock_timestamp() - started < interval '0.65 seconds' THEN
    RAISE EXCEPTION 'prune did not wait for guarded aggregation';
  END IF;
  IF removed <> 1 OR (SELECT count(*) FROM public.spot_history) <> 1 THEN
    RAISE EXCEPTION 'prune did not enforce the bounded two-hour retention';
  END IF;
END;
$$;
SELECT status FROM dblink_get_result('spot_recovery_lock') AS result(status jsonb);
SELECT dblink_disconnect('spot_recovery_lock');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.jobs WHERE job_name = 'spot_history_two_hour_window'
      AND schedule = '*/15 * * * *' AND command = 'SELECT public.prune_retained_spots()') THEN
    RAISE EXCEPTION 'coordinated retention schedule missing';
  END IF;
END;
$$;
