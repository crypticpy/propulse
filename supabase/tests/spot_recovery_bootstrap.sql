CREATE EXTENSION IF NOT EXISTS dblink;

CREATE ROLE spot_recovery_cron_owner NOLOGIN;
CREATE SCHEMA cron;
CREATE TABLE cron.job (
  jobid bigint PRIMARY KEY,
  jobname text NOT NULL,
  schedule text NOT NULL,
  command text NOT NULL,
  database text NOT NULL,
  username text NOT NULL,
  active boolean NOT NULL
);
INSERT INTO cron.job VALUES (
  58400, 'spot_history_two_hour_window', '*/15 * * * *',
  'DELETE FROM public.spot_history WHERE spotted_at < now() - interval ''2 hours''',
  'postgres', 'spot_recovery_cron_owner', true
);
CREATE FUNCTION cron.alter_job(
  job_id bigint,
  schedule text DEFAULT NULL,
  command text DEFAULT NULL,
  database text DEFAULT NULL,
  username text DEFAULT NULL,
  active boolean DEFAULT NULL
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE cron.job AS existing SET
    schedule = coalesce(alter_job.schedule, existing.schedule),
    command = coalesce(alter_job.command, existing.command),
    database = coalesce(alter_job.database, existing.database),
    username = coalesce(alter_job.username, existing.username),
    active = coalesce(alter_job.active, existing.active)
  WHERE existing.jobid = alter_job.job_id;
END;
$$;

CREATE TABLE public.spot_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  spotted_at timestamptz NOT NULL
);
CREATE TABLE public.collector_aggregation_watermarks (
  aggregation text PRIMARY KEY,
  hour_utc timestamptz NOT NULL,
  rows_written integer NOT NULL
);
CREATE TABLE public.spot_recovery_test_output (
  aggregation text NOT NULL,
  hour timestamptz NOT NULL
);
CREATE TABLE public.spot_recovery_test_control (
  fail_aggregation text,
  sleep_seconds double precision NOT NULL DEFAULT 0
);
INSERT INTO public.spot_recovery_test_control DEFAULT VALUES;

CREATE FUNCTION public.spot_recovery_compute(p_aggregation text, p_hour timestamptz)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE delay_seconds double precision;
BEGIN
  SELECT sleep_seconds INTO delay_seconds FROM public.spot_recovery_test_control;
  IF delay_seconds > 0 THEN PERFORM pg_sleep(delay_seconds); END IF;
  INSERT INTO public.spot_recovery_test_output VALUES (p_aggregation, p_hour);
  IF (SELECT fail_aggregation FROM public.spot_recovery_test_control) = p_aggregation THEN
    RAISE EXCEPTION 'synthetic compute failure';
  END IF;
  RETURN 1;
END;
$$;
CREATE FUNCTION public.compute_band_hourly_stats(p_hour timestamptz) RETURNS integer
  LANGUAGE sql AS $$ SELECT public.spot_recovery_compute('band_hourly', p_hour) $$;
CREATE FUNCTION public.compute_path_hourly_stats(p_hour timestamptz) RETURNS integer
  LANGUAGE sql AS $$ SELECT public.spot_recovery_compute('path_hourly', p_hour) $$;
CREATE FUNCTION public.compute_region_hourly_stats(p_hour timestamptz) RETURNS integer
  LANGUAGE sql AS $$ SELECT public.spot_recovery_compute('region_hourly', p_hour) $$;
CREATE FUNCTION public.record_collector_aggregation_watermark(
  p_aggregation text, p_hour timestamptz, p_rows integer
) RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.collector_aggregation_watermarks VALUES (p_aggregation, p_hour, p_rows)
  ON CONFLICT (aggregation) DO UPDATE
    SET hour_utc = excluded.hour_utc, rows_written = excluded.rows_written
  WHERE excluded.hour_utc >= collector_aggregation_watermarks.hour_utc
$$;
