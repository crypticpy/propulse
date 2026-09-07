-- Serialize raw expiry with protected aggregation. This does not assert feed
-- completeness: it proves only that retention has not truncated the input hour.
CREATE TABLE public.collector_aggregation_gaps (
  aggregation text NOT NULL CHECK (aggregation IN ('band_hourly', 'path_hourly', 'region_hourly')),
  start_hour timestamptz NOT NULL,
  end_hour timestamptz NOT NULL CHECK (end_hour >= start_hour),
  reason text NOT NULL DEFAULT 'raw_expired' CHECK (reason = 'raw_expired'),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (aggregation, start_hour)
);
ALTER TABLE public.collector_aggregation_gaps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.collector_aggregation_gaps FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.collector_aggregation_gaps TO service_role;

CREATE FUNCTION public.record_spot_aggregation_gap(
  p_aggregation text, p_start_hour timestamptz, p_end_hour timestamptz
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET timezone = 'UTC' AS $$
BEGIN
  IF p_aggregation IS NULL OR p_aggregation NOT IN ('band_hourly', 'path_hourly', 'region_hourly')
    OR p_start_hour IS NULL OR p_end_hour IS NULL
    OR NOT isfinite(p_start_hour) OR NOT isfinite(p_end_hour)
    OR p_start_hour <> date_trunc('hour', p_start_hour)
    OR p_end_hour <> date_trunc('hour', p_end_hour)
    OR p_end_hour < p_start_hour OR p_end_hour >= date_trunc('hour', clock_timestamp()) THEN
    RAISE EXCEPTION 'invalid aggregation gap';
  END IF;
  INSERT INTO public.collector_aggregation_gaps (aggregation, start_hour, end_hour)
    VALUES (p_aggregation, p_start_hour, p_end_hour)
    ON CONFLICT (aggregation, start_hour) DO UPDATE
      SET end_hour = greatest(collector_aggregation_gaps.end_hour, excluded.end_hour),
          recorded_at = now();
END;
$$;

CREATE FUNCTION public.compute_retained_spot_hour(p_aggregation text, p_hour timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET timezone = 'UTC' AS $$
DECLARE
  written integer;
  checked_at timestamptz;
BEGIN
  IF p_aggregation IS NULL OR p_aggregation NOT IN ('band_hourly', 'path_hourly', 'region_hourly')
    OR p_hour IS NULL OR NOT isfinite(p_hour) OR p_hour <> date_trunc('hour', p_hour) THEN
    RAISE EXCEPTION 'invalid aggregation hour';
  END IF;
  -- All guarded aggregators can run together; expiry waits until they finish.
  PERFORM pg_advisory_xact_lock_shared(584, 1);
  checked_at := clock_timestamp();
  IF p_hour + interval '1 hour' > checked_at THEN
    RAISE EXCEPTION 'aggregation hour has not ended';
  END IF;
  IF p_hour < checked_at - interval '2 hours' THEN
    PERFORM public.record_spot_aggregation_gap(p_aggregation, p_hour, p_hour);
    RETURN jsonb_build_object('status', 'expired', 'rows', 0);
  END IF;
  CASE p_aggregation
    WHEN 'band_hourly' THEN written := public.compute_band_hourly_stats(p_hour);
    WHEN 'path_hourly' THEN written := public.compute_path_hourly_stats(p_hour);
    WHEN 'region_hourly' THEN written := public.compute_region_hourly_stats(p_hour);
  END CASE;
  -- Compute and progress commit atomically. 'retained' is not 'complete':
  -- source outages/late arrivals require independent coverage evidence.
  PERFORM public.record_collector_aggregation_watermark(p_aggregation, p_hour, written);
  RETURN jsonb_build_object('status', 'retained', 'rows', written);
END;
$$;

CREATE FUNCTION public.prune_retained_spots()
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET timezone = 'UTC' AS $$
DECLARE
  deleted bigint;
  cutoff timestamptz;
BEGIN
  PERFORM pg_advisory_xact_lock(584, 1);
  cutoff := clock_timestamp() - interval '2 hours';
  DELETE FROM public.spot_history WHERE spotted_at < cutoff;
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.record_spot_aggregation_gap(text,timestamptz,timestamptz),
  public.compute_retained_spot_hour(text,timestamptz), public.prune_retained_spots()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_spot_aggregation_gap(text,timestamptz,timestamptz),
  public.compute_retained_spot_hour(text,timestamptz), public.prune_retained_spots()
  TO service_role;

-- Same named job and retention policy, now coordinated with aggregation.
SELECT cron.schedule('spot_history_two_hour_window', '*/15 * * * *',
  'SELECT public.prune_retained_spots()');
NOTIFY pgrst, 'reload schema';
