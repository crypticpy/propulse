-- Compact WSPR storage retires only exact hourly partitions after the same
-- sealed-manifest, restore, inventory, retention, and row-count gates used by
-- the partitioned spot and rolling-observation stores.

CREATE OR REPLACE FUNCTION public.drop_sealed_wspr_compact_partition(
  p_range_start timestamptz,
  p_now timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  control public.wspr_compact_feature_controls%ROWTYPE;
  partition_record public.wspr_compact_partitions%ROWTYPE;
  archive_dataset public.propagation_archive_datasets%ROWTYPE;
  manifest public.propagation_archive_manifests%ROWTYPE;
  inventory public.propagation_archive_reconciliations%ROWTYPE;
  child_rows bigint;
BEGIN
  IF p_now IS NULL OR p_range_start IS NULL
    OR p_range_start <> date_trunc('hour', p_range_start)
  THEN
    RAISE EXCEPTION 'an aligned compact partition retirement time is required';
  END IF;
  SELECT * INTO control
  FROM public.wspr_compact_feature_controls
  WHERE singleton
  FOR UPDATE;
  IF control.mode <> 'compact' OR control.reader_receipt_id IS NULL THEN
    RAISE EXCEPTION 'compact partition retirement requires authoritative compact mode';
  END IF;
  SELECT * INTO partition_record
  FROM public.wspr_compact_partitions
  WHERE range_start = p_range_start AND state = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'active compact partition not found'; END IF;
  SELECT * INTO archive_dataset
  FROM public.propagation_archive_datasets
  WHERE dataset = 'wspr_path_features_compact_v1';
  IF partition_record.range_end > p_now - archive_dataset.hot_retention THEN
    RAISE EXCEPTION 'compact partition is still inside retention';
  END IF;

  SELECT * INTO manifest
  FROM public.propagation_archive_manifests
  WHERE dataset = 'wspr_path_features_compact_v1'
    AND range_start = partition_record.range_start
    AND range_end = partition_record.range_end
    AND status IN ('sealed', 'restored')
    AND sealed_at IS NOT NULL
    AND cardinality(quality_flags) = 0
  ORDER BY sealed_at DESC
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'an exact sealed compact manifest is required before retirement';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.propagation_archive_restore_receipts
    WHERE manifest_id = manifest.id AND passed
  ) THEN
    RAISE EXCEPTION 'a passing compact restore receipt is required before retirement';
  END IF;
  SELECT * INTO inventory
  FROM public.propagation_archive_reconciliations
  ORDER BY reconciled_at DESC LIMIT 1;
  IF NOT FOUND OR NOT inventory.passed
    OR inventory.reconciled_at < manifest.sealed_at
    OR inventory.reconciled_at < p_now - interval '36 hours'
  THEN
    RAISE EXCEPTION 'a fresh passing object inventory is required before retirement';
  END IF;

  EXECUTE format('SELECT count(*) FROM %s', partition_record.child_relation)
  INTO child_rows;
  IF child_rows <> manifest.row_count THEN
    RAISE EXCEPTION
      'compact partition rows do not reconcile with manifest: expected %, found %',
      manifest.row_count, child_rows;
  END IF;
  EXECUTE format(
    'ALTER TABLE public.wspr_path_hourly_compact_v1 DETACH PARTITION %s',
    partition_record.child_relation
  );
  UPDATE public.wspr_compact_partitions
  SET state = 'detached', manifest_id = manifest.id, retired_at = now()
  WHERE id = partition_record.id;
  EXECUTE format('DROP TABLE %s', partition_record.child_relation);
  UPDATE public.wspr_compact_partitions
  SET state = 'dropped' WHERE id = partition_record.id;
  UPDATE public.propagation_archive_manifests
  SET pruned_rows = row_count, pruned_at = now(), updated_at = now()
  WHERE id = manifest.id;
  INSERT INTO public.propagation_archive_lifecycle_audit (
    manifest_id, dataset, action, prior_status, next_status, details
  ) VALUES (
    manifest.id, 'wspr_path_features_compact_v1', 'partition_dropped',
    manifest.status, manifest.status,
    jsonb_build_object(
      'child_relation', partition_record.child_relation,
      'range_start', partition_record.range_start,
      'range_end', partition_record.range_end,
      'rows', child_rows,
      'object_inventory_id', inventory.id
    )
  );
  RETURN jsonb_build_object(
    'status', 'dropped',
    'dataset', 'wspr_path_features_compact_v1',
    'child_relation', partition_record.child_relation,
    'manifest_id', manifest.id,
    'rows', child_rows
  );
END;
$$;

REVOKE ALL ON FUNCTION public.drop_sealed_wspr_compact_partition(
  timestamptz, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.drop_sealed_wspr_compact_partition(
  timestamptz, timestamptz
) TO service_role;

COMMENT ON FUNCTION public.drop_sealed_wspr_compact_partition(
  timestamptz, timestamptz
) IS
  'Detach and drop one compact WSPR hour only after authoritative cutover, sealed archive, restore, inventory, retention, and exact row-count gates pass.';
