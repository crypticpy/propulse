CREATE EXTENSION IF NOT EXISTS dblink;
CREATE TABLE public.collector_aggregation_gaps (
 aggregation text NOT NULL, start_hour timestamptz NOT NULL,
 end_hour timestamptz NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now(),
 reason text NOT NULL DEFAULT 'raw_expired', PRIMARY KEY(aggregation,start_hour)
);
REVOKE ALL ON public.collector_aggregation_gaps FROM PUBLIC,anon,authenticated;
CREATE TABLE public.path_hourly_stats (id bigint PRIMARY KEY,hour_utc timestamptz);
-- Keep aggregate gaps out of climatology samples and invalidate any baseline
-- computed before a newly recorded gap, without exposing the gap ledger.
CREATE OR REPLACE FUNCTION public.record_spot_aggregation_gap(
  p_aggregation text, p_start_hour timestamptz, p_end_hour timestamptz
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET timezone = 'UTC' AS $$
BEGIN
  IF p_aggregation IS NULL OR p_aggregation NOT IN ('band_hourly', 'path_hourly', 'region_hourly')
    OR p_start_hour IS NULL OR p_end_hour IS NULL
    OR NOT isfinite(p_start_hour) OR NOT isfinite(p_end_hour)
    OR p_start_hour <> date_trunc('hour', p_start_hour)
    OR p_end_hour <> date_trunc('hour', p_end_hour)
    OR p_end_hour < p_start_hour
    OR p_end_hour >= clock_timestamp() - interval '2 hours' THEN
    RAISE EXCEPTION 'invalid aggregation gap';
  END IF;
  -- Lock allocation: (584,5) serializes only gap/baseline ordering. The spot
  -- aggregation and retention workers use other keys in the 584 namespace.
  -- Serialize gap visibility with climatology rebuild snapshots. PL/pgSQL's
  -- following INSERT gets a fresh READ COMMITTED snapshot after this wait.
  PERFORM pg_advisory_xact_lock(584, 5);
  INSERT INTO public.collector_aggregation_gaps AS existing_gap
      (aggregation, start_hour, end_hour, recorded_at)
    VALUES (p_aggregation, p_start_hour, p_end_hour, clock_timestamp())
    ON CONFLICT (aggregation, start_hour) DO UPDATE
      SET end_hour = excluded.end_hour,
          recorded_at = clock_timestamp()
      WHERE excluded.end_hour > existing_gap.end_hour;
END;
$$;

REVOKE ALL ON FUNCTION public.record_spot_aggregation_gap(text,timestamptz,timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_spot_aggregation_gap(text,timestamptz,timestamptz)
  TO service_role;

-- =============================================================================
-- prune_archived_path_hourly_stats: close the count→delete race.
--
-- Review finding (PR #58): the original function counted live rows and then
-- deleted in a separate statement. Under READ COMMITTED a row committed
-- between the two statements would be deleted without being in the archive.
--
-- Fix: the count check stays as a cheap fast-fail with a clear message, but
-- the authoritative check now happens AFTER the delete — if the number of
-- rows actually deleted differs from the archived count, RAISE EXCEPTION
-- aborts the function's transaction and rolls the delete back, so no row is
-- ever lost. This is preferred over LOCK TABLE, which would block the
-- aggregator's writers for the duration of the delete; an aborted prune is
-- simply retried by a later collector pass.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.prune_archived_path_hourly_stats(
  p_day date,
  p_expected_rows bigint
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '120s'
AS $$
DECLARE
  v_start timestamptz := p_day::timestamp AT TIME ZONE 'UTC';
  v_end   timestamptz := (p_day + 1)::timestamp AT TIME ZONE 'UTC';
  v_live bigint;
  v_deleted bigint;
BEGIN
  IF p_expected_rows IS NULL OR p_expected_rows < 0 THEN
    RAISE EXCEPTION 'prune_archived_path_hourly_stats: invalid expected row count %',
      p_expected_rows;
  END IF;

  -- Fast-fail with a descriptive error before touching any rows.
  SELECT count(*) INTO v_live
  FROM public.path_hourly_stats
  WHERE hour_utc >= v_start AND hour_utc < v_end;

  IF v_live <> p_expected_rows THEN
    RAISE EXCEPTION
      'prune_archived_path_hourly_stats: live count % != archived count % for % — refusing to delete',
      v_live, p_expected_rows, p_day;
  END IF;

  DELETE FROM public.path_hourly_stats
  WHERE hour_utc >= v_start AND hour_utc < v_end;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- Authoritative race check: a row committed between the count and the
  -- delete makes the totals disagree; raising here rolls the delete back.
  IF v_deleted <> p_expected_rows THEN
    RAISE EXCEPTION
      'prune_archived_path_hourly_stats: deleted % != archived count % for % — concurrent write detected, delete rolled back',
      v_deleted, p_expected_rows, p_day;
  END IF;

  RETURN v_deleted;
END;
$$;

-- CREATE OR REPLACE preserves the existing ACL, but restate it so this file
-- stands alone on a fresh replay.
REVOKE ALL ON FUNCTION public.prune_archived_path_hourly_stats(date, bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_archived_path_hourly_stats(date, bigint)
  TO service_role;
