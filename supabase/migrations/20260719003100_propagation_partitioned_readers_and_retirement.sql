-- Route settled spot aggregators through the reversible live view and provide
-- the only authorized partition-retirement operation.

CREATE OR REPLACE FUNCTION public.refresh_callsign_fields(
  lookback interval DEFAULT '1 day'
)
RETURNS integer
LANGUAGE sql
SET statement_timeout = '300s'
AS $$
  WITH sightings AS (
    SELECT tx_callsign AS callsign, upper(left(tx_grid, 2)) AS field, count(*) AS n
    FROM public.spot_history_live
    WHERE spotted_at >= now() - lookback
      AND upper(left(tx_grid, 2)) ~ '^[A-R]{2}$'
    GROUP BY 1, 2
    UNION ALL
    SELECT rx_callsign, upper(left(rx_grid, 2)), count(*)
    FROM public.spot_history_live
    WHERE spotted_at >= now() - lookback
      AND upper(left(rx_grid, 2)) ~ '^[A-R]{2}$'
    GROUP BY 1, 2
  ),
  per_call AS (
    SELECT callsign, field, sum(n) AS n,
           sum(sum(n)) OVER (PARTITION BY callsign) AS total
    FROM sightings
    GROUP BY 1, 2
  ),
  dominant AS (
    SELECT DISTINCT ON (callsign)
           callsign, field, n::integer AS sightings, (n / total)::real AS share
    FROM per_call
    ORDER BY callsign, n DESC
  ),
  ins AS (
    INSERT INTO public.callsign_fields (callsign, field, sightings, share, updated_at)
    SELECT callsign, field, sightings, share, now()
    FROM dominant
    WHERE share >= 0.8 AND sightings >= 5
    ON CONFLICT (callsign) DO UPDATE SET
      field = excluded.field,
      sightings = excluded.sightings,
      share = excluded.share,
      updated_at = excluded.updated_at
    RETURNING 1
  )
  SELECT count(*)::integer FROM ins;
$$;

CREATE OR REPLACE FUNCTION public.compute_path_hourly_stats(
  hour_start timestamptz
)
RETURNS integer
LANGUAGE sql
SET statement_timeout = '120s'
AS $$
  WITH classified AS (
    SELECT
      CASE
        WHEN s.mode = 'CW' THEN 'cw'
        WHEN s.mode IN ('FT8','FT4','FT2','JS8','VARAC','WSPR','RTTY','FREEDV',
                        'PKT','DATA','OLIVIA','JT65','JT9','MSK144','Q65',
                        'FST4','FST4W') THEN 'digital'
      END AS mode_class,
      s.band,
      coalesce(
        CASE WHEN upper(left(s.tx_grid, 2)) ~ '^[A-R]{2}$'
             THEN upper(left(s.tx_grid, 2)) END,
        cf_tx.field
      ) AS tx_field,
      coalesce(
        CASE WHEN upper(left(s.rx_grid, 2)) ~ '^[A-R]{2}$'
             THEN upper(left(s.rx_grid, 2)) END,
        cf_rx.field
      ) AS rx_field,
      (s.tx_grid IS NULL AND cf_tx.field IS NOT NULL)
        OR (s.rx_grid IS NULL AND cf_rx.field IS NOT NULL) AS backfilled,
      s.tx_callsign,
      s.rx_callsign,
      s.snr
    FROM public.spot_history_live s
    LEFT JOIN public.callsign_fields cf_tx ON cf_tx.callsign = s.tx_callsign
    LEFT JOIN public.callsign_fields cf_rx ON cf_rx.callsign = s.rx_callsign
    WHERE s.spotted_at >= date_trunc('hour', hour_start)
      AND s.spotted_at < date_trunc('hour', hour_start) + interval '1 hour'
  ),
  ins AS (
    INSERT INTO public.path_hourly_stats
      (hour_utc, band, mode_class, tx_field, rx_field,
       spot_count, unique_tx, unique_rx, avg_snr, median_snr, backfilled_count)
    SELECT
      date_trunc('hour', hour_start),
      band,
      mode_class,
      tx_field,
      rx_field,
      count(*)::integer,
      count(DISTINCT tx_callsign)::integer,
      count(DISTINCT rx_callsign)::integer,
      round(avg(snr)::numeric, 1)::real,
      (percentile_cont(0.5) WITHIN GROUP (ORDER BY snr))::real,
      (count(*) FILTER (WHERE backfilled))::integer
    FROM classified
    WHERE mode_class IS NOT NULL
      AND tx_field IS NOT NULL
      AND rx_field IS NOT NULL
    GROUP BY band, mode_class, tx_field, rx_field
    ON CONFLICT (hour_utc, band, mode_class, tx_field, rx_field) DO UPDATE SET
      spot_count = excluded.spot_count,
      unique_tx = excluded.unique_tx,
      unique_rx = excluded.unique_rx,
      avg_snr = excluded.avg_snr,
      median_snr = excluded.median_snr,
      backfilled_count = excluded.backfilled_count
    RETURNING 1
  )
  SELECT count(*)::integer FROM ins;
$$;

CREATE OR REPLACE FUNCTION public.compute_band_hourly_stats(
  hour_start timestamptz
)
RETURNS integer
LANGUAGE sql
SET statement_timeout = '120s'
AS $$
  WITH spot_base AS (
    SELECT *
    FROM public.spot_history_live
    WHERE spotted_at >= date_trunc('hour', hour_start)
      AND spotted_at < date_trunc('hour', hour_start) + interval '1 hour'
  ),
  core AS (
    SELECT
      band,
      count(*)::integer AS spot_count,
      count(DISTINCT tx_callsign)::integer AS unique_tx,
      count(DISTINCT rx_callsign)::integer AS unique_rx,
      round(avg(snr)::numeric, 1)::real AS avg_snr,
      min(snr)::smallint AS min_snr,
      max(snr)::smallint AS max_snr,
      (percentile_cont(0.5) WITHIN GROUP (ORDER BY snr))::real AS median_snr,
      count(DISTINCT tx_grid) FILTER (WHERE tx_grid IS NOT NULL)::integer
        AS unique_grids_tx,
      count(DISTINCT rx_grid) FILTER (WHERE rx_grid IS NOT NULL)::integer
        AS unique_grids_rx
    FROM spot_base
    GROUP BY band
  ),
  mode_counts AS (
    SELECT band, jsonb_object_agg(mode, count) AS counts
    FROM (
      SELECT band, mode, count(*)::integer AS count
      FROM spot_base WHERE mode IS NOT NULL GROUP BY band, mode
    ) grouped
    GROUP BY band
  ),
  source_counts AS (
    SELECT band, jsonb_object_agg(source, count) AS counts
    FROM (
      SELECT band, source, count(*)::integer AS count
      FROM spot_base GROUP BY band, source
    ) grouped
    GROUP BY band
  ),
  solar AS (
    SELECT kp_index, sfi, bz_gsm, bt, by_gsm, xray_flux, dst_index,
      proton_flux_10mev
    FROM public.solar_snapshots
    WHERE captured_at >= date_trunc('hour', hour_start)
      AND captured_at < date_trunc('hour', hour_start) + interval '1 hour'
    ORDER BY captured_at DESC
    LIMIT 1
  ),
  ins AS (
    INSERT INTO public.band_hourly_stats (
      hour_utc, band, spot_count, unique_tx, unique_rx,
      avg_snr, min_snr, max_snr, median_snr,
      mode_counts, source_counts, unique_grids_tx, unique_grids_rx,
      kp_index, sfi, bz_gsm, bt, by_gsm, xray_flux, dst_index,
      proton_flux_10mev
    )
    SELECT
      date_trunc('hour', hour_start), core.band, core.spot_count,
      core.unique_tx, core.unique_rx, core.avg_snr, core.min_snr,
      core.max_snr, core.median_snr,
      coalesce(mode_counts.counts, '{}'::jsonb),
      coalesce(source_counts.counts, '{}'::jsonb),
      core.unique_grids_tx, core.unique_grids_rx,
      solar.kp_index, solar.sfi, solar.bz_gsm, solar.bt, solar.by_gsm,
      solar.xray_flux, solar.dst_index, solar.proton_flux_10mev
    FROM core
    LEFT JOIN mode_counts USING (band)
    LEFT JOIN source_counts USING (band)
    LEFT JOIN solar ON true
    ON CONFLICT (hour_utc, band) DO UPDATE SET
      spot_count = excluded.spot_count,
      unique_tx = excluded.unique_tx,
      unique_rx = excluded.unique_rx,
      avg_snr = excluded.avg_snr,
      min_snr = excluded.min_snr,
      max_snr = excluded.max_snr,
      median_snr = excluded.median_snr,
      mode_counts = excluded.mode_counts,
      source_counts = excluded.source_counts,
      unique_grids_tx = excluded.unique_grids_tx,
      unique_grids_rx = excluded.unique_grids_rx,
      kp_index = excluded.kp_index,
      sfi = excluded.sfi,
      bz_gsm = excluded.bz_gsm,
      bt = excluded.bt,
      by_gsm = excluded.by_gsm,
      xray_flux = excluded.xray_flux,
      dst_index = excluded.dst_index,
      proton_flux_10mev = excluded.proton_flux_10mev
    RETURNING 1
  )
  SELECT count(*)::integer FROM ins;
$$;

CREATE OR REPLACE FUNCTION public.drop_sealed_propagation_hot_partition(
  p_dataset text,
  p_range_start timestamptz,
  p_now timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  cutover public.propagation_hot_store_cutovers%ROWTYPE;
  partition_record public.propagation_hot_partitions%ROWTYPE;
  archive_dataset public.propagation_archive_datasets%ROWTYPE;
  manifest public.propagation_archive_manifests%ROWTYPE;
  inventory public.propagation_archive_reconciliations%ROWTYPE;
  parent_relation text;
  child_rows bigint;
BEGIN
  IF p_now IS NULL OR p_range_start IS NULL THEN
    RAISE EXCEPTION 'partition retirement time is required';
  END IF;
  SELECT * INTO cutover
  FROM public.propagation_hot_store_cutovers
  WHERE dataset = p_dataset
  FOR UPDATE;
  IF NOT FOUND OR cutover.mode <> 'partitioned' THEN
    RAISE EXCEPTION 'partition retirement requires authoritative partitioned mode';
  END IF;
  SELECT * INTO partition_record
  FROM public.propagation_hot_partitions
  WHERE dataset = p_dataset AND range_start = p_range_start
    AND state = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'active hot partition not found'; END IF;
  SELECT * INTO archive_dataset
  FROM public.propagation_archive_datasets WHERE dataset = p_dataset;
  IF partition_record.range_end > p_now - archive_dataset.hot_retention THEN
    RAISE EXCEPTION 'hot partition is still inside retention';
  END IF;

  SELECT * INTO manifest
  FROM public.propagation_archive_manifests
  WHERE dataset = p_dataset
    AND range_start = partition_record.range_start
    AND range_end = partition_record.range_end
    AND status IN ('sealed', 'restored')
    AND sealed_at IS NOT NULL
    AND cardinality(quality_flags) = 0
  ORDER BY sealed_at DESC
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'an exact sealed manifest is required before partition retirement';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.propagation_archive_restore_receipts
    WHERE manifest_id = manifest.id AND passed
  ) THEN
    RAISE EXCEPTION 'a passing restore receipt is required before partition retirement';
  END IF;
  SELECT * INTO inventory
  FROM public.propagation_archive_reconciliations
  ORDER BY reconciled_at DESC LIMIT 1;
  IF NOT FOUND OR NOT inventory.passed
    OR inventory.reconciled_at < manifest.sealed_at
    OR inventory.reconciled_at < p_now - interval '36 hours'
  THEN
    RAISE EXCEPTION 'a fresh passing object inventory is required before partition retirement';
  END IF;

  EXECUTE format('SELECT count(*) FROM %s', partition_record.child_relation)
  INTO child_rows;
  IF child_rows <> manifest.row_count THEN
    RAISE EXCEPTION
      'partition rows do not reconcile with manifest: expected %, found %',
      manifest.row_count, child_rows;
  END IF;
  parent_relation := CASE p_dataset
    WHEN 'spot_history_v1' THEN 'public.spot_history_partitioned_v1'
    WHEN 'wspr_observations_v1' THEN 'public.wspr_observations_partitioned_v1'
    ELSE null
  END;
  IF parent_relation IS NULL THEN
    RAISE EXCEPTION 'unsupported partition retirement dataset';
  END IF;

  EXECUTE format(
    'ALTER TABLE %s DETACH PARTITION %s',
    parent_relation, partition_record.child_relation
  );
  UPDATE public.propagation_hot_partitions
  SET state = 'detached', manifest_id = manifest.id, retired_at = now()
  WHERE id = partition_record.id;
  EXECUTE format('DROP TABLE %s', partition_record.child_relation);
  UPDATE public.propagation_hot_partitions
  SET state = 'dropped' WHERE id = partition_record.id;
  UPDATE public.propagation_archive_manifests
  SET pruned_rows = row_count, pruned_at = now(), updated_at = now()
  WHERE id = manifest.id;
  INSERT INTO public.propagation_archive_lifecycle_audit (
    manifest_id, dataset, action, prior_status, next_status, details
  ) VALUES (
    manifest.id, p_dataset, 'partition_dropped', manifest.status,
    manifest.status,
    jsonb_build_object(
      'child_relation', partition_record.child_relation,
      'range_start', partition_record.range_start,
      'range_end', partition_record.range_end,
      'rows', child_rows,
      'object_inventory_id', inventory.id
    )
  );
  RETURN jsonb_build_object(
    'status', 'dropped', 'dataset', p_dataset,
    'child_relation', partition_record.child_relation,
    'manifest_id', manifest.id, 'rows', child_rows
  );
END;
$$;

REVOKE ALL ON FUNCTION public.drop_sealed_propagation_hot_partition(
  text, timestamptz, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.drop_sealed_propagation_hot_partition(
  text, timestamptz, timestamptz
) TO service_role;

COMMENT ON FUNCTION public.drop_sealed_propagation_hot_partition(
  text, timestamptz, timestamptz
) IS
  'Detach and drop exactly one out-of-retention native partition only after sealed archive, restore, inventory, and row-count gates pass.';
