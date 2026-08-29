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
