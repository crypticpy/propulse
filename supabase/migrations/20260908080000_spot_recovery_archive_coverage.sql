-- Known-gap evidence is not upstream completeness certification.
CREATE FUNCTION public.spot_archive_path_gap_snapshot(p_day date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' SET timezone = 'UTC' AS $$
DECLARE
  day_start timestamptz;
  day_end timestamptz;
  ranges jsonb;
BEGIN
  IF p_day IS NULL OR NOT isfinite(p_day)
    OR p_day >= (clock_timestamp() AT TIME ZONE 'UTC')::date THEN
    RAISE EXCEPTION 'archive coverage requires a completed finite UTC day';
  END IF;
  day_start := p_day::timestamp AT TIME ZONE 'UTC';
  day_end := (p_day + 1)::timestamp AT TIME ZONE 'UTC';
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'start_hour', to_char(g.start_hour, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'end_hour', to_char(g.end_hour, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'recorded_at', to_char(g.recorded_at, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'reason', g.reason
  ) ORDER BY g.start_hour), '[]'::jsonb) INTO ranges
  FROM (
    SELECT start_hour, end_hour, recorded_at, reason
    FROM public.collector_aggregation_gaps
    WHERE aggregation = 'path_hourly'
      AND start_hour < day_end AND end_hour >= day_start
    ORDER BY start_hour LIMIT 1001
  ) g;
  IF jsonb_array_length(ranges) > 1000 THEN
    RAISE EXCEPTION 'archive gap snapshot exceeds bounded range limit';
  END IF;
  RETURN jsonb_build_object('version', 1, 'scope', 'known-gaps-only',
    'day', p_day::text, 'gaps', ranges);
END;
$$;

CREATE FUNCTION public.prune_archived_path_hourly_stats_with_coverage(
  p_day date, p_expected_rows bigint, p_gap_snapshot jsonb
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' SET timezone = 'UTC' SET statement_timeout = '120s' AS $$
DECLARE
  current_snapshot jsonb;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'archive coverage prune requires read committed isolation';
  END IF;
  IF p_expected_rows IS NULL OR p_expected_rows < 0 OR p_gap_snapshot IS NULL THEN
    RAISE EXCEPTION 'archive prune requires row count and known-gap snapshot';
  END IF;
  -- Shared protocol with record_spot_aggregation_gap / baseline rebuilds.
  -- The next statement gets a fresh snapshot after a waiting writer commits.
  PERFORM pg_advisory_xact_lock(584, 5);
  SELECT public.spot_archive_path_gap_snapshot(p_day) INTO current_snapshot;
  IF current_snapshot IS DISTINCT FROM p_gap_snapshot THEN
    RAISE EXCEPTION 'archive gap snapshot changed; refusing to prune';
  END IF;
  -- Preserve the existing authoritative count/delete rollback check.
  RETURN public.prune_archived_path_hourly_stats(p_day, p_expected_rows);
END;
$$;

REVOKE ALL ON FUNCTION public.spot_archive_path_gap_snapshot(date),
  public.prune_archived_path_hourly_stats_with_coverage(date,bigint,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spot_archive_path_gap_snapshot(date),
  public.prune_archived_path_hourly_stats_with_coverage(date,bigint,jsonb)
  TO service_role;
NOTIFY pgrst, 'reload schema';
