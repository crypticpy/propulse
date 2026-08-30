-- =============================================================================
-- DB growth guard + path_hourly_stats day archival support
--
-- Context (2026-08-29): the database reached 671 MB, 557 MB of which is
-- path_hourly_stats (~75-80K rows/day, ~430 MB/month, no retention). The
-- table is an append-only ML training aggregate; nothing live reads more
-- than a 7-day window, so history belongs in cheap object storage, not the
-- hot database. collector_health (38 MB) is ops telemetry with no readers
-- at all.
--
-- Three pieces:
--   1. collector_health 30-day retention (pg_cron, same pattern as
--      spot_history_two_hour_window).
--   2. db_size_report() — size snapshot RPC for the collector's db-size
--      guard job, which degrades /health when the DB exceeds its budget.
--   3. prune_archived_path_hourly_stats(day, expected_rows) — the ONLY
--      delete path for archived days. Fail-closed: refuses unless the live
--      row count exactly matches the verified archive manifest's count.
--
-- The heavyweight archive-worker pipeline (sealed manifests + restore
-- gates, migrations 20260719*) remains dormant and untouched; this is the
-- lightweight collector-hosted path documented in
-- docs/runbooks/AGGREGATE-ARCHIVAL.md.
-- =============================================================================

-- ── 1. collector_health retention ───────────────────────────────────────────

SELECT cron.schedule(
  'collector_health_30d_window',
  '20 3 * * *',
  $$DELETE FROM public.collector_health WHERE reported_at < now() - interval '30 days'$$
);

-- ── 2. Size report for the collector's db-size guard ────────────────────────

CREATE OR REPLACE FUNCTION public.db_size_report()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'database_bytes', pg_database_size(current_database()),
    'captured_at', now(),
    'tables', (
      SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM (
        SELECT c.relname AS table_name,
               pg_total_relation_size(c.oid) AS total_bytes,
               c.reltuples::bigint AS approx_rows
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
        ORDER BY pg_total_relation_size(c.oid) DESC
        LIMIT 10
      ) t
    )
  );
$$;

REVOKE ALL ON FUNCTION public.db_size_report() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.db_size_report() TO service_role;

-- ── 3. Fail-closed delete for archived path_hourly_stats days ───────────────
-- Deletes exactly one UTC day, and only when the live row count matches the
-- count recorded in the day's verified archive manifest. Any drift (rows
-- added after archiving, partial prior delete, wrong manifest) raises and
-- deletes nothing. Function-level statement_timeout overrides the role's
-- 8s PostgREST limit; a full day is ~80K rows, well within 120s.

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
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_archived_path_hourly_stats(date, bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_archived_path_hourly_stats(date, bigint)
  TO service_role;
