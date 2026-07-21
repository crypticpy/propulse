-- Drop the live-WSPR research pipeline storage (~14.7 GB).
--
-- The hourly M5 "research shadow" ingest was never an approved production
-- data path: NowCast/FutureCast are served by the pre-trained models on
-- Railway, and WSPR history for training comes from the public wspr.live
-- archive, so nothing here is irreplaceable. The rolling store had grown
-- to 18.4M rows / 11 GB (plus 3.6 GB of derived features) with retention
-- never operated, and was the direct cause of instance IO exhaustion.

DROP VIEW IF EXISTS public.wspr_observations_live;

DROP TABLE IF EXISTS public.wspr_observations_rolling CASCADE;
DROP TABLE IF EXISTS public.wspr_observations_partitioned_v1 CASCADE;
DROP TABLE IF EXISTS public.wspr_path_hourly_compact_v1 CASCADE;

DROP TABLE IF EXISTS
  public.wspr_path_hourly_features,
  public.wspr_observation_keys_v1,
  public.wspr_feature_watermarks,
  public.wspr_compact_benchmark_receipts,
  public.wspr_compact_cutover_audit,
  public.wspr_compact_feature_controls,
  public.wspr_compact_parity_observations,
  public.wspr_compact_partitions,
  public.wspr_compact_reader_receipts,
  public.wspr_compact_reconciliations,
  public.wspr_compact_write_failures
  CASCADE;

-- Remove every wspr_* function (ingest RPCs, compact cutover machinery,
-- lag lookups) so nothing can silently repopulate the dropped stores.
DO $$
DECLARE fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE '%wspr%'
  LOOP
    EXECUTE format('DROP FUNCTION %s CASCADE', fn.signature);
  END LOOP;
END $$;
