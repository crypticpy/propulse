CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS dblink;

-- The archive foundation is copied verbatim below from migration
-- 20260719000000 through record_propagation_archive_restore. The disposable
-- harness cannot load that non-spot filename; keeping the production function
-- bodies here exercises lifecycle interactions rather than fixture stubs.

CREATE TABLE IF NOT EXISTS public.propagation_archive_controls (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  archive_enabled boolean NOT NULL DEFAULT false,
  pruning_enabled boolean NOT NULL DEFAULT false,
  restore_gate_required boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL DEFAULT current_user,
  reason text NOT NULL DEFAULT 'initial fail-closed state'
    CHECK (length(reason) BETWEEN 1 AND 1000)
);

INSERT INTO public.propagation_archive_controls (singleton)
VALUES (true)
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.propagation_archive_datasets (
  dataset text PRIMARY KEY
    CHECK (dataset ~ '^[a-z][a-z0-9_]{2,63}_v[0-9]+$'),
  source_relation text NOT NULL,
  time_column text NOT NULL CHECK (time_column ~ '^[a-z_][a-z0-9_]*$'),
  key_column text NOT NULL CHECK (key_column ~ '^[a-z_][a-z0-9_]*$'),
  schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version > 0),
  time_basis text NOT NULL CHECK (time_basis IN ('event', 'receipt', 'issue', 'capture')),
  partition_granularity text NOT NULL CHECK (partition_granularity IN ('hour', 'day', 'month')),
  hot_retention interval NOT NULL CHECK (hot_retention >= interval '27 hours'),
  prune_supported boolean NOT NULL DEFAULT true,
  archive_enabled boolean NOT NULL DEFAULT false,
  prune_enabled boolean NOT NULL DEFAULT false,
  restore_gate_passed_at timestamptz,
  restore_gate_manifest_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (dataset = 'spot_history_v1'
      AND source_relation = 'public.spot_history'
      AND time_column = 'spotted_at' AND key_column = 'id')
    OR (dataset = 'wspr_observations_v1'
      AND source_relation = 'public.wspr_observations_rolling'
      AND time_column = 'received_at' AND key_column = 'id')
    OR (dataset = 'wspr_path_features_v1'
      AND source_relation = 'public.wspr_path_hourly_features'
      AND time_column = 'target_hour' AND key_column = 'id')
    OR (dataset = 'path_hourly_stats_v1'
      AND source_relation = 'public.path_hourly_stats'
      AND time_column = 'hour_utc' AND key_column = 'id')
    OR (dataset = 'solar_snapshots_v1'
      AND source_relation = 'public.solar_snapshots'
      AND time_column = 'captured_at' AND key_column = 'id')
    OR (dataset = 'forecast_payloads_v1'
      AND source_relation = 'public.space_weather_forecast_payloads'
      AND time_column = 'issued_at' AND key_column = 'payload_sha256')
    OR (dataset = 'forecast_values_v1'
      AND source_relation = 'public.space_weather_forecast_values'
      AND time_column = 'valid_at' AND key_column = 'id')
  )
);

INSERT INTO public.propagation_archive_datasets (
  dataset, source_relation, time_column, key_column, time_basis,
  partition_granularity, hot_retention, prune_supported, schema_version
) VALUES
  ('spot_history_v1', 'public.spot_history', 'spotted_at', 'id', 'event', 'day', interval '48 hours', true, 1),
  ('wspr_observations_v1', 'public.wspr_observations_rolling', 'received_at', 'id', 'receipt', 'hour', interval '30 hours', true, 1),
  ('wspr_path_features_v1', 'public.wspr_path_hourly_features', 'target_hour', 'id', 'event', 'hour', interval '30 hours', true, 1),
  ('path_hourly_stats_v1', 'public.path_hourly_stats', 'hour_utc', 'id', 'event', 'month', interval '120 days', true, 1),
  ('solar_snapshots_v1', 'public.solar_snapshots', 'captured_at', 'id', 'capture', 'month', interval '120 days', true, 1),
  ('forecast_payloads_v1', 'public.space_weather_forecast_payloads', 'issued_at', 'payload_sha256', 'issue', 'month', interval '120 days', false, 1),
  ('forecast_values_v1', 'public.space_weather_forecast_values', 'valid_at', 'id', 'issue', 'month', interval '120 days', true, 1)
ON CONFLICT (dataset) DO UPDATE SET
  source_relation = excluded.source_relation,
  time_column = excluded.time_column,
  key_column = excluded.key_column,
  time_basis = excluded.time_basis,
  partition_granularity = excluded.partition_granularity,
  hot_retention = excluded.hot_retention,
  prune_supported = excluded.prune_supported,
  schema_version = excluded.schema_version,
  updated_at = now();

CREATE TABLE IF NOT EXISTS public.propagation_archive_manifests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset text NOT NULL REFERENCES public.propagation_archive_datasets(dataset),
  schema_version integer NOT NULL CHECK (schema_version > 0),
  range_start timestamptz NOT NULL,
  range_end timestamptz NOT NULL,
  time_basis text NOT NULL CHECK (time_basis IN ('event', 'receipt', 'issue', 'capture')),
  object_bucket text NOT NULL DEFAULT 'propagation-archives'
    CHECK (object_bucket = 'propagation-archives'),
  object_path text NOT NULL
    CHECK (
      object_path !~ '(^|/)[.][.](/|$)'
      AND object_path !~ '[@[:space:]]'
      AND length(object_path) BETWEEN 10 AND 1024
    ),
  row_count bigint NOT NULL CHECK (row_count >= 0),
  min_source_time timestamptz,
  max_source_time timestamptz,
  source_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  uncompressed_bytes bigint NOT NULL CHECK (uncompressed_bytes >= 0),
  object_bytes bigint NOT NULL CHECK (object_bytes > 0),
  exporter_commit text NOT NULL CHECK (exporter_commit ~ '^[0-9a-f]{40}$'),
  quality_flags text[] NOT NULL DEFAULT '{}',
  lifecycle_class text NOT NULL DEFAULT 'ordinary'
    CHECK (lifecycle_class IN ('ordinary', 'research_locked', 'publication_hold')),
  status text NOT NULL DEFAULT 'uploading'
    CHECK (status IN ('uploading', 'verified', 'sealed', 'restored', 'failed')),
  verification jsonb NOT NULL DEFAULT '{}'::jsonb,
  verified_at timestamptz,
  sealed_at timestamptz,
  pruned_rows bigint NOT NULL DEFAULT 0 CHECK (
    pruned_rows >= 0 AND pruned_rows <= row_count
  ),
  pruned_at timestamptz,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (range_end > range_start),
  CHECK (
    (row_count = 0 AND min_source_time IS NULL AND max_source_time IS NULL)
    OR (row_count > 0 AND min_source_time IS NOT NULL AND max_source_time IS NOT NULL)
  ),
  CHECK (min_source_time IS NULL OR min_source_time >= range_start),
  CHECK (max_source_time IS NULL OR max_source_time < range_end),
  CHECK (max_source_time IS NULL OR min_source_time <= max_source_time),
  CHECK (verified_at IS NULL OR status IN ('verified', 'sealed', 'restored')),
  CHECK (sealed_at IS NULL OR status IN ('sealed', 'restored')),
  UNIQUE (dataset, schema_version, range_start, range_end),
  UNIQUE (object_bucket, object_path)
);

ALTER TABLE public.propagation_archive_datasets
  DROP CONSTRAINT IF EXISTS propagation_archive_datasets_restore_manifest_fkey;
ALTER TABLE public.propagation_archive_datasets
  ADD CONSTRAINT propagation_archive_datasets_restore_manifest_fkey
  FOREIGN KEY (restore_gate_manifest_id)
  REFERENCES public.propagation_archive_manifests(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS propagation_archive_manifest_status_idx
  ON public.propagation_archive_manifests(status, dataset, range_end);
CREATE INDEX IF NOT EXISTS propagation_archive_manifest_lifecycle_idx
  ON public.propagation_archive_manifests(lifecycle_class, range_end);

CREATE TABLE IF NOT EXISTS public.propagation_archive_lifecycle_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  manifest_id uuid REFERENCES public.propagation_archive_manifests(id) ON DELETE SET NULL,
  dataset text NOT NULL,
  action text NOT NULL CHECK (action IN (
    'registered', 'verified', 'sealed', 'failed', 'restored',
    'prune_batch', 'object_delete_requested', 'object_deleted',
    'lifecycle_changed', 'control_changed', 'inventory_reconciled'
  )),
  prior_status text,
  next_status text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor text NOT NULL DEFAULT current_user,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS propagation_archive_audit_manifest_idx
  ON public.propagation_archive_lifecycle_audit(manifest_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.propagation_archive_restore_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manifest_id uuid NOT NULL REFERENCES public.propagation_archive_manifests(id),
  validation_target text NOT NULL CHECK (length(validation_target) BETWEEN 1 AND 200),
  restored_rows bigint NOT NULL CHECK (restored_rows >= 0),
  restored_sha256 text NOT NULL CHECK (restored_sha256 ~ '^[0-9a-f]{64}$'),
  schema_verified boolean NOT NULL,
  counts_verified boolean NOT NULL,
  aggregates_verified boolean NOT NULL,
  read_verified boolean NOT NULL,
  passed boolean GENERATED ALWAYS AS (
    schema_verified AND counts_verified AND aggregates_verified AND read_verified
  ) STORED,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  signature text CHECK (signature IS NULL OR signature ~ '^[0-9a-f]{64}$'),
  restored_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS propagation_archive_restore_manifest_idx
  ON public.propagation_archive_restore_receipts(manifest_id, restored_at DESC);

CREATE TABLE IF NOT EXISTS public.propagation_storage_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  captured_at timestamptz NOT NULL DEFAULT now(),
  database_bytes bigint NOT NULL CHECK (database_bytes >= 0),
  include_exact_rates boolean NOT NULL,
  relations jsonb NOT NULL,
  database_cron jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.propagation_archive_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manifest_count bigint NOT NULL CHECK (manifest_count >= 0),
  storage_object_count bigint NOT NULL CHECK (storage_object_count >= 0),
  missing_paths text[] NOT NULL DEFAULT '{}',
  orphan_paths text[] NOT NULL DEFAULT '{}',
  size_mismatches jsonb NOT NULL DEFAULT '[]'::jsonb,
  passed boolean GENERATED ALWAYS AS (
    cardinality(missing_paths) = 0
    AND cardinality(orphan_paths) = 0
    AND jsonb_array_length(size_mismatches) = 0
  ) STORED,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  reconciled_at timestamptz NOT NULL DEFAULT now(),
  CHECK (cardinality(missing_paths) <= 10000),
  CHECK (cardinality(orphan_paths) <= 10000)
);

CREATE OR REPLACE FUNCTION public.register_propagation_archive_manifest(
  p_dataset text,
  p_schema_version integer,
  p_range_start timestamptz,
  p_range_end timestamptz,
  p_object_path text,
  p_row_count bigint,
  p_min_source_time timestamptz,
  p_max_source_time timestamptz,
  p_source_counts jsonb,
  p_content_sha256 text,
  p_uncompressed_bytes bigint,
  p_object_bytes bigint,
  p_exporter_commit text,
  p_quality_flags text[] DEFAULT '{}',
  p_lifecycle_class text DEFAULT 'ordinary'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  manifest_id uuid;
  registered_dataset public.propagation_archive_datasets%ROWTYPE;
  existing public.propagation_archive_manifests%ROWTYPE;
BEGIN
  SELECT * INTO registered_dataset
  FROM public.propagation_archive_datasets
  WHERE dataset = p_dataset AND archive_enabled;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'archive dataset is unknown or disabled: %', p_dataset;
  END IF;
  IF p_schema_version <> registered_dataset.schema_version THEN
    RAISE EXCEPTION 'archive schema version is not registered: %', p_schema_version;
  END IF;
  IF NOT (
    (registered_dataset.partition_granularity = 'hour'
      AND p_range_start = date_trunc('hour', p_range_start)
      AND p_range_end = p_range_start + interval '1 hour')
    OR (registered_dataset.partition_granularity = 'day'
      AND p_range_start = date_trunc('day', p_range_start)
      AND p_range_end = p_range_start + interval '1 day')
    OR (registered_dataset.partition_granularity = 'month'
      AND p_range_start = date_trunc('month', p_range_start)
      AND p_range_end = p_range_start + interval '1 month')
  ) THEN
    RAISE EXCEPTION 'archive range is not one aligned registered partition';
  END IF;

  SELECT * INTO existing
  FROM public.propagation_archive_manifests
  WHERE dataset = p_dataset
    AND schema_version = p_schema_version
    AND range_start = p_range_start
    AND range_end = p_range_end
  FOR UPDATE;

  IF FOUND THEN
    IF existing.content_sha256 <> p_content_sha256
      OR existing.object_path <> p_object_path
      OR existing.row_count <> p_row_count
    THEN
      RAISE EXCEPTION 'archive retry differs from existing manifest %', existing.id;
    END IF;
    RETURN existing.id;
  END IF;

  INSERT INTO public.propagation_archive_manifests (
    dataset, schema_version, range_start, range_end, time_basis,
    object_path, row_count, min_source_time, max_source_time, source_counts,
    content_sha256, uncompressed_bytes, object_bytes, exporter_commit,
    quality_flags, lifecycle_class, status
  ) VALUES (
    p_dataset, p_schema_version, p_range_start, p_range_end, registered_dataset.time_basis,
    p_object_path, p_row_count, p_min_source_time, p_max_source_time,
    coalesce(p_source_counts, '{}'::jsonb), p_content_sha256,
    p_uncompressed_bytes, p_object_bytes, p_exporter_commit,
    coalesce(p_quality_flags, '{}'::text[]), p_lifecycle_class, 'uploading'
  )
  RETURNING id INTO manifest_id;

  INSERT INTO public.propagation_archive_lifecycle_audit (
    manifest_id, dataset, action, next_status
  ) VALUES (manifest_id, p_dataset, 'registered', 'uploading');
  RETURN manifest_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_propagation_archive_manifest(
  p_manifest_id uuid,
  p_verification jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  manifest public.propagation_archive_manifests%ROWTYPE;
BEGIN
  SELECT * INTO manifest
  FROM public.propagation_archive_manifests
  WHERE id = p_manifest_id
  FOR UPDATE;
  IF NOT FOUND OR manifest.status NOT IN ('uploading', 'failed', 'verified') THEN
    RAISE EXCEPTION 'manifest is not eligible for verification';
  END IF;
  IF NOT (
    coalesce((p_verification->>'remote_size_verified')::boolean, false)
    AND coalesce((p_verification->>'remote_sha256_verified')::boolean, false)
    AND coalesce((p_verification->>'parquet_read_verified')::boolean, false)
    AND coalesce((p_verification->>'row_count_verified')::boolean, false)
    AND coalesce((p_verification->>'source_bounds_verified')::boolean, false)
    AND coalesce((p_verification->>'aggregate_reconciliation_verified')::boolean, false)
    AND coalesce((p_verification->>'watermark_coverage_verified')::boolean, false)
  ) THEN
    RAISE EXCEPTION 'archive verification is incomplete';
  END IF;

  UPDATE public.propagation_archive_manifests
  SET status = 'verified', verification = p_verification,
      verified_at = now(), failure_reason = null, updated_at = now()
  WHERE id = p_manifest_id;
  INSERT INTO public.propagation_archive_lifecycle_audit (
    manifest_id, dataset, action, prior_status, next_status, details
  ) VALUES (
    p_manifest_id, manifest.dataset, 'verified', manifest.status,
    'verified', p_verification
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.seal_propagation_archive_manifest(
  p_manifest_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  manifest public.propagation_archive_manifests%ROWTYPE;
BEGIN
  SELECT * INTO manifest
  FROM public.propagation_archive_manifests
  WHERE id = p_manifest_id
  FOR UPDATE;
  IF NOT FOUND OR manifest.status <> 'verified' OR manifest.verified_at IS NULL THEN
    RAISE EXCEPTION 'only a verified manifest can be sealed';
  END IF;
  IF cardinality(manifest.quality_flags) > 0 THEN
    RAISE EXCEPTION 'manifest quality flags must be resolved before sealing';
  END IF;

  UPDATE public.propagation_archive_manifests
  SET status = 'sealed', sealed_at = now(), updated_at = now()
  WHERE id = p_manifest_id;
  INSERT INTO public.propagation_archive_lifecycle_audit (
    manifest_id, dataset, action, prior_status, next_status
  ) VALUES (p_manifest_id, manifest.dataset, 'sealed', 'verified', 'sealed');
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_propagation_archive_manifest(
  p_manifest_id uuid,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  manifest public.propagation_archive_manifests%ROWTYPE;
BEGIN
  IF p_reason IS NULL OR length(p_reason) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION 'archive failure reason is required';
  END IF;
  SELECT * INTO manifest
  FROM public.propagation_archive_manifests
  WHERE id = p_manifest_id
  FOR UPDATE;
  IF NOT FOUND OR manifest.status IN ('sealed', 'restored') THEN
    RAISE EXCEPTION 'sealed archive cannot be marked failed';
  END IF;
  UPDATE public.propagation_archive_manifests
  SET status = 'failed', failure_reason = p_reason, updated_at = now()
  WHERE id = p_manifest_id;
  INSERT INTO public.propagation_archive_lifecycle_audit (
    manifest_id, dataset, action, prior_status, next_status, details
  ) VALUES (
    p_manifest_id, manifest.dataset, 'failed', manifest.status, 'failed',
    jsonb_build_object('reason', p_reason)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_propagation_archive_restore(
  p_manifest_id uuid,
  p_validation_target text,
  p_restored_rows bigint,
  p_restored_sha256 text,
  p_schema_verified boolean,
  p_counts_verified boolean,
  p_aggregates_verified boolean,
  p_read_verified boolean,
  p_details jsonb DEFAULT '{}'::jsonb,
  p_signature text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  manifest public.propagation_archive_manifests%ROWTYPE;
  receipt_id uuid;
  passed boolean;
BEGIN
  SELECT * INTO manifest
  FROM public.propagation_archive_manifests
  WHERE id = p_manifest_id
  FOR UPDATE;
  IF NOT FOUND OR manifest.status NOT IN ('sealed', 'restored') THEN
    RAISE EXCEPTION 'restore requires a sealed manifest';
  END IF;
  IF p_restored_rows <> manifest.row_count
    OR p_restored_sha256 <> manifest.content_sha256
  THEN
    RAISE EXCEPTION 'restore receipt does not reconcile with manifest';
  END IF;
  passed := p_schema_verified AND p_counts_verified
    AND p_aggregates_verified AND p_read_verified;

  INSERT INTO public.propagation_archive_restore_receipts (
    manifest_id, validation_target, restored_rows, restored_sha256,
    schema_verified, counts_verified, aggregates_verified, read_verified,
    details, signature
  ) VALUES (
    p_manifest_id, p_validation_target, p_restored_rows, p_restored_sha256,
    p_schema_verified, p_counts_verified, p_aggregates_verified,
    p_read_verified, coalesce(p_details, '{}'::jsonb), p_signature
  ) RETURNING id INTO receipt_id;

  IF passed THEN
    UPDATE public.propagation_archive_datasets
    SET restore_gate_passed_at = now(), restore_gate_manifest_id = p_manifest_id,
        updated_at = now()
    WHERE dataset = manifest.dataset;
  END IF;
  INSERT INTO public.propagation_archive_lifecycle_audit (
    manifest_id, dataset, action, prior_status, next_status, details
  ) VALUES (
    p_manifest_id, manifest.dataset, 'restored', manifest.status,
    manifest.status, jsonb_build_object('receipt_id', receipt_id, 'passed', passed)
  );
  RETURN receipt_id;
END;
$$;
CREATE TABLE public.propagation_archive_replica_receipts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), manifest_id uuid NOT NULL REFERENCES public.propagation_archive_manifests(id),
 target_label text NOT NULL, replica_locator_sha256 text NOT NULL, content_sha256 text NOT NULL,
 object_bytes bigint NOT NULL, read_verified boolean NOT NULL, signature text NOT NULL,
 details jsonb NOT NULL DEFAULT '{}'::jsonb, verified_at timestamptz NOT NULL DEFAULT now()
);
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

-- Genuine legacy restore proof predating source-coverage activation. The
-- coverage migration must invalidate this gate for path_hourly_stats_v1.
UPDATE public.propagation_archive_datasets
SET archive_enabled = true
WHERE dataset = 'path_hourly_stats_v1';
DO $$
DECLARE m uuid;
BEGIN
 m := public.register_propagation_archive_manifest(
  'path_hourly_stats_v1',1,'2026-04-01','2026-05-01',
  'path/month=2026-04/legacy-gate.parquet',0,NULL,NULL,'{}',repeat('9',64),0,1,repeat('a',40)
 );
 PERFORM public.verify_propagation_archive_manifest(m,jsonb_build_object(
  'remote_size_verified',true,'remote_sha256_verified',true,'parquet_read_verified',true,
  'row_count_verified',true,'source_bounds_verified',true,
  'aggregate_reconciliation_verified',true,'watermark_coverage_verified',true));
 PERFORM public.seal_propagation_archive_manifest(m);
 PERFORM public.record_propagation_archive_restore(
  m,'legacy-fixture',0,repeat('9',64),true,true,true,true
 );
 IF (SELECT restore_gate_manifest_id FROM public.propagation_archive_datasets
     WHERE dataset='path_hourly_stats_v1') IS DISTINCT FROM m THEN
  RAISE EXCEPTION 'legacy restore gate fixture was not established';
 END IF;
END $$;
