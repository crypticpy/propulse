CREATE TEMP TABLE monthly_test_ids (label text PRIMARY KEY, id uuid NOT NULL);

DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM public.propagation_archive_datasets
  WHERE dataset='path_hourly_stats_v1'
    AND (restore_gate_passed_at IS NOT NULL OR restore_gate_manifest_id IS NOT NULL)) THEN
  RAISE EXCEPTION 'coverage activation retained a legacy restore gate';
 END IF;
END $$;

DO $$ BEGIN
 BEGIN
  UPDATE public.propagation_archive_datasets SET coverage_contract=NULL
  WHERE dataset='path_hourly_stats_v1';
  RAISE EXCEPTION 'path coverage contract cleared';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  UPDATE public.propagation_archive_datasets SET coverage_contract='other-v1'
  WHERE dataset='path_hourly_stats_v1';
  RAISE EXCEPTION 'path coverage contract changed';
 EXCEPTION WHEN check_violation THEN NULL; END;
 IF (SELECT coverage_contract FROM public.propagation_archive_datasets
     WHERE dataset='path_hourly_stats_v1') <> 'spot-known-gaps-v1' THEN
  RAISE EXCEPTION 'path coverage contract invariant changed';
 END IF;
END $$;

CREATE FUNCTION pg_temp.verification(evidence jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$ SELECT jsonb_build_object(
 'remote_size_verified',true,'remote_sha256_verified',true,'parquet_read_verified',true,
 'row_count_verified',true,'source_bounds_verified',true,
 'aggregate_reconciliation_verified',true,'watermark_coverage_verified',true,
 'coverage_metadata_verified',true,'coverage_evidence',evidence) $$;

BEGIN;
UPDATE public.propagation_archive_datasets SET archive_enabled=true WHERE dataset='path_hourly_stats_v1';
DO $$
DECLARE e jsonb; m uuid;
BEGIN
 e := public.spot_archive_path_gap_snapshot_range('2026-05-01','2026-06-01');
 m := public.register_propagation_archive_manifest_with_coverage('path_hourly_stats_v1',1,'2026-05-01','2026-06-01',
  'path/month=2026-05/archive.parquet',1,'2026-05-01T01:00Z','2026-05-01T01:00Z','{}',repeat('a',64),10,10,repeat('b',40),e,'{}','ordinary');
 INSERT INTO monthly_test_ids VALUES ('valid',m);
 PERFORM public.verify_propagation_archive_manifest(m,pg_temp.verification(e));
 PERFORM public.seal_propagation_archive_manifest(m);
 BEGIN
  UPDATE public.propagation_archive_manifests SET coverage_evidence='{}' WHERE id=m;
  RAISE EXCEPTION 'sealed evidence mutation accepted';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'verified archive coverage evidence is immutable' THEN RAISE; END IF;
 END;
 PERFORM public.record_propagation_archive_restore(m,'fixture',1,repeat('a',64),true,true,true,true,
  jsonb_build_object('checks',jsonb_build_object('coverage_metadata_verified',true,'coverage_evidence',e)));
 IF NOT EXISTS (SELECT 1 FROM public.propagation_archive_restore_receipts WHERE manifest_id=m) THEN
  RAISE EXCEPTION 'valid restore receipt absent';
 END IF;
 IF (SELECT restore_gate_manifest_id FROM public.propagation_archive_datasets
     WHERE dataset='path_hourly_stats_v1') IS DISTINCT FROM m THEN
  RAISE EXCEPTION 'guarded restore did not restore the dataset gate';
 END IF;
END $$;
ROLLBACK;

-- A stale sealed manifest cannot write a restore receipt, and a source DELETE
-- in the same subtransaction rolls back when the pruned-row transition fails.
BEGIN;
UPDATE public.propagation_archive_datasets SET archive_enabled=true WHERE dataset='path_hourly_stats_v1';
INSERT INTO public.path_hourly_stats VALUES (91,'2026-05-04T00:00Z');
DO $$ DECLARE e jsonb; m uuid; BEGIN
 e := public.spot_archive_path_gap_snapshot_range('2026-05-01','2026-06-01');
 m := public.register_propagation_archive_manifest_with_coverage('path_hourly_stats_v1',1,'2026-05-01','2026-06-01',
  'path/month=2026-05/rollback.parquet',1,'2026-05-04','2026-05-04','{}',repeat('1',64),1,1,repeat('2',40),e,'{}','ordinary');
 PERFORM public.verify_propagation_archive_manifest(m,pg_temp.verification(e));
 PERFORM public.seal_propagation_archive_manifest(m);
 PERFORM public.record_spot_aggregation_gap('path_hourly','2026-05-04','2026-05-04');
 BEGIN
  PERFORM public.record_propagation_archive_restore(m,'stale',1,repeat('1',64),true,true,true,true,
   jsonb_build_object('checks',jsonb_build_object('coverage_metadata_verified',true,'coverage_evidence',e)));
  RAISE EXCEPTION 'stale restore accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'restore coverage evidence is missing or stale' THEN RAISE; END IF; END;
 IF EXISTS (SELECT 1 FROM public.propagation_archive_restore_receipts WHERE manifest_id=m) THEN RAISE EXCEPTION 'failed restore receipt persisted'; END IF;
 BEGIN
  INSERT INTO public.propagation_archive_replica_receipts(manifest_id,target_label,replica_locator_sha256,content_sha256,object_bytes,read_verified,signature,details)
  VALUES(m,'replica',repeat('3',64),repeat('1',64),1,true,repeat('4',64),
   jsonb_build_object('checks',jsonb_build_object('coverage_metadata_verified',true,'coverage_evidence',e)));
  RAISE EXCEPTION 'stale replica accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'replica coverage evidence is missing or stale' THEN RAISE; END IF; END;
 IF EXISTS (SELECT 1 FROM public.propagation_archive_replica_receipts WHERE manifest_id=m) THEN RAISE EXCEPTION 'failed replica receipt persisted'; END IF;
 BEGIN
  DELETE FROM public.path_hourly_stats WHERE id=91;
  UPDATE public.propagation_archive_manifests SET pruned_rows=1,pruned_at=now() WHERE id=m;
  RAISE EXCEPTION 'stale prune accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'archive coverage verification is missing or stale' THEN RAISE; END IF; END;
 IF NOT EXISTS (SELECT 1 FROM public.path_hourly_stats WHERE id=91) THEN RAISE EXCEPTION 'failed prune delete persisted'; END IF;
END $$;
ROLLBACK;

BEGIN;
UPDATE public.propagation_archive_datasets SET archive_enabled=true WHERE dataset='path_hourly_stats_v1';
DO $$ BEGIN
 BEGIN
  INSERT INTO public.propagation_archive_manifests(dataset,schema_version,range_start,range_end,time_basis,object_path,row_count,
   min_source_time,max_source_time,content_sha256,uncompressed_bytes,object_bytes,exporter_commit,status,verification)
  VALUES('path_hourly_stats_v1',1,'2026-05-01','2026-06-01','event','path/month=2026-05/bypass.parquet',0,
   NULL,NULL,repeat('5',64),0,1,repeat('6',40),'verified',pg_temp.verification(NULL));
  RAISE EXCEPTION 'direct verified insert bypass accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'archive coverage verification is missing or stale' THEN RAISE; END IF; END;
END $$;
ROLLBACK;

-- Legacy registration without coverage and unknown contracts fail closed.
BEGIN;
UPDATE public.propagation_archive_datasets SET archive_enabled=true WHERE dataset='path_hourly_stats_v1';
DO $$ DECLARE m uuid; BEGIN
 m := public.register_propagation_archive_manifest('path_hourly_stats_v1',1,'2026-05-01','2026-06-01',
  'path/month=2026-05/legacy.parquet',0,NULL,NULL,'{}',repeat('c',64),1,1,repeat('d',40));
 BEGIN PERFORM public.verify_propagation_archive_manifest(m,pg_temp.verification(NULL));
  RAISE EXCEPTION 'legacy evidence accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'archive coverage verification is missing or stale' THEN RAISE; END IF; END;
 UPDATE public.propagation_archive_datasets
 SET archive_enabled=true WHERE dataset='solar_snapshots_v1';
 m := public.register_propagation_archive_manifest('solar_snapshots_v1',1,'2026-05-01','2026-06-01',
  'solar/month=2026-05/unknown.parquet',0,NULL,NULL,'{}',repeat('0',64),0,1,repeat('1',40));
 UPDATE public.propagation_archive_datasets
 SET coverage_contract='unknown-v9' WHERE dataset='solar_snapshots_v1';
 BEGIN PERFORM public.reconcile_propagation_archive_coverage(m); RAISE EXCEPTION 'unknown contract accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'unknown archive coverage contract:%' THEN RAISE; END IF; END;
END $$;
ROLLBACK;

-- A late gap makes verification, restore and pruning transitions atomic failures.
BEGIN;
UPDATE public.propagation_archive_datasets SET archive_enabled=true WHERE dataset='path_hourly_stats_v1';
DO $$ DECLARE e jsonb; m uuid; BEGIN
 e := public.spot_archive_path_gap_snapshot_range('2026-05-01','2026-06-01');
 m := public.register_propagation_archive_manifest_with_coverage('path_hourly_stats_v1',1,'2026-05-01','2026-06-01',
  'path/month=2026-05/stale.parquet',1,'2026-05-01T02:00Z','2026-05-01T02:00Z','{}',repeat('e',64),1,1,repeat('f',40),e,'{}','ordinary');
 PERFORM public.record_spot_aggregation_gap('path_hourly','2026-05-02','2026-05-02');
 BEGIN PERFORM public.verify_propagation_archive_manifest(m,pg_temp.verification(e)); RAISE EXCEPTION 'stale verification accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'archive coverage verification is missing or stale' THEN RAISE; END IF; END;
 IF (SELECT status FROM public.propagation_archive_manifests WHERE id=m) <> 'uploading' THEN RAISE EXCEPTION 'failed verification persisted'; END IF;
END $$;
ROLLBACK;

-- ACL is service-only for externally callable coverage functions.
DO $$ BEGIN
 IF has_function_privilege('anon','public.spot_archive_path_gap_snapshot_range(timestamptz,timestamptz)','EXECUTE')
  OR has_function_privilege('authenticated','public.reconcile_propagation_archive_coverage(uuid)','EXECUTE')
  OR NOT has_function_privilege('service_role','public.spot_archive_path_gap_snapshot_range(timestamptz,timestamptz)','EXECUTE') THEN
  RAISE EXCEPTION 'monthly archive coverage ACL invalid'; END IF;
END $$;

-- Shared (584,5) lock forces reconcile to take a fresh snapshot after a late gap.
BEGIN;
UPDATE public.propagation_archive_datasets SET archive_enabled=true WHERE dataset='path_hourly_stats_v1';
DO $$ DECLARE e jsonb; m uuid; BEGIN
 e:=public.spot_archive_path_gap_snapshot_range('2026-05-01','2026-06-01');
 m:=public.register_propagation_archive_manifest_with_coverage('path_hourly_stats_v1',1,'2026-05-01','2026-06-01',
 'path/month=2026-05/concurrent.parquet',0,NULL,NULL,'{}',repeat('7',64),0,1,repeat('8',40),e,'{}','ordinary');
 INSERT INTO monthly_test_ids VALUES('concurrent',m);
END $$;
COMMIT;
CREATE FUNCTION public.monthly_test_gap() RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 PERFORM public.record_spot_aggregation_gap('path_hourly','2026-05-03','2026-05-03'); PERFORM pg_sleep(1); END $$;
SELECT dblink_connect('monthly_gap','host=/tmp dbname=postgres user=postgres');
SELECT dblink_send_query('monthly_gap','SELECT public.monthly_test_gap()');
SELECT pg_sleep(0.2);
DO $$ DECLARE started timestamptz:=clock_timestamp(); m uuid; BEGIN
 SELECT id INTO m FROM monthly_test_ids WHERE label='concurrent';
 BEGIN PERFORM public.reconcile_propagation_archive_coverage(m); RAISE EXCEPTION 'concurrent late gap accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'archive coverage evidence does not match current source coverage' THEN RAISE; END IF; END;
 IF clock_timestamp()-started < interval '0.65 seconds' THEN RAISE EXCEPTION 'reconcile did not wait for late gap'; END IF;
END $$;
SELECT result FROM dblink_get_result('monthly_gap') AS t(result text);
SELECT dblink_disconnect('monthly_gap');

BEGIN ISOLATION LEVEL REPEATABLE READ;
DO $$ DECLARE m uuid; BEGIN
 SELECT id INTO m FROM monthly_test_ids WHERE label='concurrent';
 BEGIN PERFORM public.reconcile_propagation_archive_coverage(m); RAISE EXCEPTION 'non-RC accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'archive coverage reconciliation requires read committed isolation' THEN RAISE; END IF; END;
END $$;
ROLLBACK;
