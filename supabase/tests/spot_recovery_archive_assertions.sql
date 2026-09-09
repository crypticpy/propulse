BEGIN;
INSERT INTO public.path_hourly_stats VALUES (1,'2026-05-01T01:00:00Z');
DO $$
DECLARE s jsonb;
BEGIN
 s := public.spot_archive_path_gap_snapshot('2026-05-01');
 IF s <> '{"version":1,"scope":"known-gaps-only","day":"2026-05-01","gaps":[]}'::jsonb THEN
  RAISE EXCEPTION 'empty snapshot contract mismatch';
 END IF;
 PERFORM public.record_spot_aggregation_gap('path_hourly','2026-04-30T23:00:00Z','2026-05-01T00:00:00Z');
 PERFORM public.record_spot_aggregation_gap('path_hourly','2026-05-02T00:00:00Z','2026-05-02T00:00:00Z');
 PERFORM public.record_spot_aggregation_gap('band_hourly','2026-05-01T01:00:00Z','2026-05-01T01:00:00Z');
 BEGIN
  PERFORM public.prune_archived_path_hourly_stats_with_coverage('2026-05-01',1,s);
  RAISE EXCEPTION 'stale snapshot was accepted';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'archive gap snapshot changed; refusing to prune' THEN RAISE; END IF;
 END;
 IF (SELECT count(*) FROM public.path_hourly_stats) <> 1 THEN RAISE EXCEPTION 'stale snapshot deleted data'; END IF;
 s := public.spot_archive_path_gap_snapshot('2026-05-01');
 IF jsonb_array_length(s->'gaps') <> 1 OR s #>> '{gaps,0,start_hour}' <> '2026-04-30T23:00:00.000000Z' THEN
  RAISE EXCEPTION 'inclusive day overlap or source provenance mismatch';
 END IF;
 BEGIN
  PERFORM public.prune_archived_path_hourly_stats_with_coverage('2026-05-01',2,s);
  RAISE EXCEPTION 'wrong row count accepted';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'wrong row count accepted' THEN RAISE; END IF;
 END;
 IF (SELECT count(*) FROM public.path_hourly_stats) <> 1 THEN RAISE EXCEPTION 'wrong count deleted data'; END IF;
 IF public.prune_archived_path_hourly_stats_with_coverage('2026-05-01',1,s) <> 1 THEN RAISE EXCEPTION 'valid prune failed'; END IF;
 IF has_function_privilege('anon','public.spot_archive_path_gap_snapshot(date)','EXECUTE')
  OR has_function_privilege('authenticated','public.prune_archived_path_hourly_stats_with_coverage(date,bigint,jsonb)','EXECUTE')
  OR NOT has_function_privilege('service_role','public.spot_archive_path_gap_snapshot(date)','EXECUTE') THEN
  RAISE EXCEPTION 'archive coverage permissions invalid';
 END IF;
END;
$$;
ROLLBACK;

-- A gap transaction remains uncommitted while the guarded prune starts.
-- Prune must wait, refresh its snapshot, and retain the only hot copy.
INSERT INTO public.path_hourly_stats VALUES (2,'2026-05-03T01:00:00Z');
CREATE FUNCTION public.spot_recovery_archive_test_gap() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM public.record_spot_aggregation_gap('path_hourly','2026-05-03T00:00:00Z','2026-05-03T00:00:00Z');
 PERFORM pg_sleep(1);
END;
$$;
SELECT dblink_connect('archive_gap','host=/tmp dbname=postgres user=postgres');
SELECT dblink_send_query('archive_gap','SELECT public.spot_recovery_archive_test_gap()');
SELECT pg_sleep(0.2);
DO $$
DECLARE started timestamptz := clock_timestamp();
BEGIN
 BEGIN
  PERFORM public.prune_archived_path_hourly_stats_with_coverage('2026-05-03',1,
   '{"version":1,"scope":"known-gaps-only","day":"2026-05-03","gaps":[]}'::jsonb);
  RAISE EXCEPTION 'concurrent gap was missed';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'archive gap snapshot changed; refusing to prune' THEN RAISE; END IF;
 END;
 IF clock_timestamp()-started < interval '0.65 seconds' THEN RAISE EXCEPTION 'prune did not wait for gap writer'; END IF;
 IF (SELECT count(*) FROM public.path_hourly_stats WHERE id=2) <> 1 THEN RAISE EXCEPTION 'concurrent gap deleted source'; END IF;
END;
$$;
SELECT result FROM dblink_get_result('archive_gap') AS t(result text);
SELECT dblink_disconnect('archive_gap');
BEGIN ISOLATION LEVEL REPEATABLE READ;
DO $$
BEGIN
 BEGIN
  PERFORM public.prune_archived_path_hourly_stats_with_coverage('2026-05-03',1,'{}'::jsonb);
  RAISE EXCEPTION 'repeatable read accepted';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'archive coverage prune requires read committed isolation' THEN RAISE; END IF;
 END;
END;
$$;
ROLLBACK;

BEGIN;
INSERT INTO public.collector_aggregation_gaps(aggregation,start_hour,end_hour)
SELECT 'path_hourly', '2025-01-01T00:00:00Z'::timestamptz + n * interval '1 hour',
 '2026-06-01T00:00:00Z'::timestamptz FROM generate_series(0,1000) n;
DO $$
BEGIN
 BEGIN
  PERFORM public.spot_archive_path_gap_snapshot('2026-06-01');
  RAISE EXCEPTION 'oversized gap snapshot accepted';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'archive gap snapshot exceeds bounded range limit' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.spot_archive_path_gap_snapshot(NULL);
  RAISE EXCEPTION 'null day accepted';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'archive coverage requires a completed finite UTC day' THEN RAISE; END IF;
 END;
END;
$$;
SET LOCAL ROLE anon;
DO $$
BEGIN
 BEGIN
  PERFORM public.spot_archive_path_gap_snapshot('2026-06-01');
  RAISE EXCEPTION 'anonymous snapshot access accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  PERFORM public.prune_archived_path_hourly_stats_with_coverage('2026-06-01',0,'{}'::jsonb);
  RAISE EXCEPTION 'anonymous prune access accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END;
$$;
ROLLBACK;
