-- Follow-up hardening for the propagation retention/archive rollout.
-- This migration is intentionally forward-only so environments that already
-- recorded the initial rollout migrations receive the review fixes.

REVOKE ALL ON FUNCTION public.prune_wspr_observations(interval)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_wspr_observations(interval)
  TO service_role;

CREATE OR REPLACE FUNCTION public.validate_propagation_forecast_payload_bytes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  payload_bytes bytea;
BEGIN
  IF NEW.raw_payload IS NULL THEN
    IF NEW.parser_version LIKE 'forecast-v2-%' AND (
      NEW.archive_manifest_id IS NULL
      OR NEW.archive_object_bucket IS DISTINCT FROM 'propagation-archives'
      OR NEW.archive_object_path IS NULL
      OR NEW.raw_payload_bytes IS NULL
      OR NEW.raw_payload_bytes <= 0
      OR NEW.raw_payload_archived_at IS NULL
    ) THEN
      RAISE EXCEPTION 'compacted exact-byte forecast requires archive metadata';
    END IF;
    RETURN NEW;
  END IF;
  IF NOT (NEW.raw_payload ? 'encoding') THEN
    IF NEW.parser_version LIKE 'forecast-v2-%' THEN
      RAISE EXCEPTION 'exact-byte forecast parser requires a byte envelope';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.raw_payload ->> 'encoding' <> 'base64'
    OR coalesce(NEW.raw_payload ->> 'content_type', '') = ''
    OR NOT (NEW.raw_payload ? 'body_base64')
  THEN
    RAISE EXCEPTION 'forecast byte envelope is invalid';
  END IF;
  BEGIN
    payload_bytes := decode(NEW.raw_payload ->> 'body_base64', 'base64');
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'forecast byte envelope contains invalid base64';
  END;
  IF encode(extensions.digest(payload_bytes, 'sha256'), 'hex') <> NEW.payload_sha256 THEN
    RAISE EXCEPTION 'forecast payload SHA-256 does not match preserved bytes';
  END IF;
  IF NEW.parser_version LIKE 'forecast-v2-%' AND (
    NEW.source_object_bucket IS DISTINCT FROM 'propagation-archives'
    OR NEW.source_object_path IS NULL
    OR NEW.source_object_sha256 IS DISTINCT FROM NEW.payload_sha256
    OR NEW.source_object_bytes IS DISTINCT FROM octet_length(payload_bytes)
    OR NEW.source_object_verified_at IS NULL
  ) THEN
    RAISE EXCEPTION 'exact-byte forecast parser requires a verified private object';
  END IF;
  RETURN NEW;
END;
$$;

ALTER TABLE public.wspr_observation_keys_v1
  DROP CONSTRAINT IF EXISTS wspr_observation_keys_v1_source_source_id_key;
ALTER TABLE public.wspr_observation_keys_v1
  ADD CONSTRAINT wspr_observation_keys_v1_source_source_id_key
  UNIQUE (source, source_id);

CREATE OR REPLACE FUNCTION public.ensure_propagation_ingest_partitions(
  p_dataset text,
  p_rows jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  cutover_mode text;
  partition_time timestamptz;
BEGIN
  IF jsonb_typeof(p_rows) <> 'array' THEN
    RETURN;
  END IF;
  SELECT mode INTO cutover_mode
  FROM public.propagation_hot_store_cutovers
  WHERE dataset = p_dataset;
  IF cutover_mode NOT IN ('dual_write', 'shadow_read', 'partitioned') THEN
    RETURN;
  END IF;

  CASE p_dataset
    WHEN 'spot_history_v1' THEN
      FOR partition_time IN
        SELECT DISTINCT date_trunc('day', row.spotted_at)
        FROM jsonb_to_recordset(p_rows) AS row(spotted_at timestamptz)
        WHERE row.spotted_at IS NOT NULL
      LOOP
        PERFORM public.ensure_propagation_hot_partitions(
          p_dataset, partition_time, partition_time + interval '1 day'
        );
      END LOOP;
    WHEN 'wspr_observations_v1' THEN
      FOR partition_time IN
        SELECT DISTINCT date_trunc('hour', row.received_at)
        FROM jsonb_to_recordset(p_rows) AS row(received_at timestamptz)
        WHERE row.received_at IS NOT NULL
      LOOP
        PERFORM public.ensure_propagation_hot_partitions(
          p_dataset, partition_time, partition_time + interval '1 hour'
        );
      END LOOP;
    ELSE
      RAISE EXCEPTION 'unsupported partitioned hot-store dataset';
  END CASE;
END;
$$;

ALTER FUNCTION public.ingest_spot_history_rows(jsonb)
  RENAME TO ingest_spot_history_rows_without_partition_guard;
ALTER FUNCTION public.ingest_wspr_observation_rows(jsonb)
  RENAME TO ingest_wspr_observation_rows_without_partition_guard;

CREATE FUNCTION public.ingest_spot_history_rows(p_rows jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.ensure_propagation_ingest_partitions(
    'spot_history_v1', p_rows
  );
  RETURN public.ingest_spot_history_rows_without_partition_guard(p_rows);
END;
$$;

CREATE FUNCTION public.ingest_wspr_observation_rows(p_rows jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.ensure_propagation_ingest_partitions(
    'wspr_observations_v1', p_rows
  );
  RETURN public.ingest_wspr_observation_rows_without_partition_guard(p_rows);
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_propagation_ingest_partitions(text, jsonb),
  public.ingest_spot_history_rows_without_partition_guard(jsonb),
  public.ingest_wspr_observation_rows_without_partition_guard(jsonb),
  public.ingest_spot_history_rows(jsonb),
  public.ingest_wspr_observation_rows(jsonb)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ingest_spot_history_rows(jsonb),
  public.ingest_wspr_observation_rows(jsonb)
TO service_role;

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
           callsign, field, n::integer AS sightings,
           (n::real / total::real) AS share
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
  IF NOT FOUND THEN
    RAISE EXCEPTION 'archive dataset configuration not found for %', p_dataset;
  END IF;
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
