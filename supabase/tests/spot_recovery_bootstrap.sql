CREATE EXTENSION IF NOT EXISTS dblink;

CREATE SCHEMA cron;
CREATE TABLE cron.jobs (
  job_name text PRIMARY KEY,
  schedule text NOT NULL,
  command text NOT NULL
);
CREATE FUNCTION cron.schedule(p_job_name text, p_schedule text, p_command text)
RETURNS bigint LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO cron.jobs VALUES (p_job_name, p_schedule, p_command)
  ON CONFLICT (job_name) DO UPDATE SET schedule = excluded.schedule, command = excluded.command;
  RETURN 1;
END;
$$;

CREATE TABLE public.spot_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  spotted_at timestamptz NOT NULL
);
CREATE TABLE public.collector_aggregation_watermarks (
  aggregation text PRIMARY KEY,
  completed_hour timestamptz NOT NULL,
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
    SET completed_hour = excluded.completed_hour, rows_written = excluded.rows_written
$$;
