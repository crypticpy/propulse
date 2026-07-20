-- Propagation archive foundation and fail-closed retention controls.
--
-- Historical deletion remains disabled after this migration. Operators must
-- archive and restore a fixture for a dataset, record the restore gate, and
-- explicitly enable both the dataset and global pruning controls before any
-- source row can be removed.

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) VALUES (
  'propagation-archives',
  'propagation-archives',
  false,
  null,
  ARRAY[
    'application/octet-stream',
    'application/vnd.apache.parquet',
    'application/json',
    'text/plain'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  allowed_mime_types = excluded.allowed_mime_types;

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
      object_path !~ '(^|/)\.\.(/|$)'
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

CREATE OR REPLACE FUNCTION public.set_propagation_archive_controls(
  p_archive_enabled boolean,
  p_pruning_enabled boolean,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  prior jsonb;
BEGIN
  IF p_reason IS NULL OR length(p_reason) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'control change reason is required';
  END IF;
  IF p_pruning_enabled AND EXISTS (
    SELECT 1
    FROM public.propagation_archive_datasets
    WHERE dataset IN (
      'spot_history_v1', 'wspr_observations_v1', 'solar_snapshots_v1',
      'path_hourly_stats_v1', 'forecast_payloads_v1'
    )
      AND restore_gate_passed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'all five Phase 1 dataset restore gates must pass before pruning';
  END IF;
  SELECT to_jsonb(control) INTO prior
  FROM public.propagation_archive_controls AS control
  WHERE singleton
  FOR UPDATE;
  UPDATE public.propagation_archive_controls
  SET archive_enabled = p_archive_enabled,
      pruning_enabled = p_pruning_enabled,
      updated_at = now(), updated_by = current_user, reason = p_reason
  WHERE singleton;
  INSERT INTO public.propagation_archive_lifecycle_audit (
    dataset, action, details
  ) VALUES (
    'global', 'control_changed',
    jsonb_build_object(
      'prior', prior,
      'archive_enabled', p_archive_enabled,
      'pruning_enabled', p_pruning_enabled,
      'reason', p_reason
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_propagation_archive_dataset_controls(
  p_dataset text,
  p_archive_enabled boolean,
  p_prune_enabled boolean,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  prior public.propagation_archive_datasets%ROWTYPE;
  cutover_mode text;
  row_form_retirement_enabled boolean;
BEGIN
  IF p_reason IS NULL OR length(p_reason) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'dataset control change reason is required';
  END IF;
  SELECT * INTO prior
  FROM public.propagation_archive_datasets
  WHERE dataset = p_dataset
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'archive dataset not found'; END IF;
  IF p_prune_enabled AND NOT p_archive_enabled THEN
    RAISE EXCEPTION 'pruning cannot be enabled while archive export is disabled';
  END IF;
  IF p_prune_enabled AND NOT prior.prune_supported THEN
    RAISE EXCEPTION 'dataset requires a specialized non-delete lifecycle';
  END IF;
  IF p_prune_enabled AND prior.restore_gate_passed_at IS NULL THEN
    RAISE EXCEPTION 'dataset restore gate has not passed';
  END IF;
  IF p_prune_enabled
    AND p_dataset IN ('spot_history_v1', 'wspr_observations_v1')
    AND to_regclass('public.propagation_hot_store_cutovers') IS NOT NULL
  THEN
    EXECUTE
      'SELECT mode FROM public.propagation_hot_store_cutovers WHERE dataset = $1'
      INTO cutover_mode USING p_dataset;
    IF cutover_mode IS DISTINCT FROM 'legacy' THEN
      RAISE EXCEPTION
        'row pruning is disabled during partition cutover; use sealed partition retirement';
    END IF;
  END IF;
  IF p_prune_enabled
    AND p_dataset = 'wspr_path_features_v1'
    AND to_regclass('public.wspr_compact_feature_controls') IS NOT NULL
  THEN
    EXECUTE
      'SELECT row_form_retirement_enabled FROM public.wspr_compact_feature_controls WHERE singleton'
      INTO row_form_retirement_enabled;
    IF NOT coalesce(row_form_retirement_enabled, false) THEN
      RAISE EXCEPTION
        'row-form WSPR pruning requires authoritative compact mode and a sealed restore gate';
    END IF;
  END IF;
  UPDATE public.propagation_archive_datasets
  SET archive_enabled = p_archive_enabled,
      prune_enabled = p_prune_enabled,
      updated_at = now()
  WHERE dataset = p_dataset;
  INSERT INTO public.propagation_archive_lifecycle_audit (
    dataset, action, details
  ) VALUES (
    p_dataset, 'control_changed',
    jsonb_build_object(
      'prior_archive_enabled', prior.archive_enabled,
      'prior_prune_enabled', prior.prune_enabled,
      'archive_enabled', p_archive_enabled,
      'prune_enabled', p_prune_enabled,
      'reason', p_reason
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.prune_propagation_archive_manifest(
  p_manifest_id uuid,
  p_batch_size integer DEFAULT 10000,
  p_now timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  manifest public.propagation_archive_manifests%ROWTYPE;
  dataset public.propagation_archive_datasets%ROWTYPE;
  controls public.propagation_archive_controls%ROWTYPE;
  relation_name text;
  time_name text;
  key_name text;
  deleted_rows bigint := 0;
  remaining_rows bigint := 0;
  source_rows_before bigint := 0;
  reconciliation public.propagation_archive_reconciliations%ROWTYPE;
  started_at timestamptz := clock_timestamp();
  duration_ms integer := 0;
  cutover_mode text;
  row_form_retirement_enabled boolean;
BEGIN
  IF p_batch_size < 1 OR p_batch_size > 50000 OR p_now IS NULL THEN
    RAISE EXCEPTION 'invalid archive prune request';
  END IF;
  SELECT * INTO controls
  FROM public.propagation_archive_controls WHERE singleton;
  SELECT * INTO manifest
  FROM public.propagation_archive_manifests
  WHERE id = p_manifest_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'archive manifest not found'; END IF;
  SELECT * INTO dataset
  FROM public.propagation_archive_datasets
  WHERE propagation_archive_datasets.dataset = manifest.dataset;

  IF NOT controls.pruning_enabled OR NOT dataset.prune_enabled THEN
    RAISE EXCEPTION 'archive pruning is disabled';
  END IF;
  IF manifest.dataset IN ('spot_history_v1', 'wspr_observations_v1')
    AND to_regclass('public.propagation_hot_store_cutovers') IS NOT NULL
  THEN
    EXECUTE
      'SELECT mode FROM public.propagation_hot_store_cutovers WHERE dataset = $1'
      INTO cutover_mode USING manifest.dataset;
    IF cutover_mode IS DISTINCT FROM 'legacy' THEN
      RAISE EXCEPTION
        'row pruning is disabled during partition cutover; use sealed partition retirement';
    END IF;
  END IF;
  IF manifest.dataset = 'wspr_path_features_v1'
    AND to_regclass('public.wspr_compact_feature_controls') IS NOT NULL
  THEN
    EXECUTE
      'SELECT row_form_retirement_enabled FROM public.wspr_compact_feature_controls WHERE singleton'
      INTO row_form_retirement_enabled;
    IF NOT coalesce(row_form_retirement_enabled, false) THEN
      RAISE EXCEPTION
        'row-form WSPR pruning requires authoritative compact mode and a sealed restore gate';
    END IF;
  END IF;
  IF manifest.status NOT IN ('sealed', 'restored') OR manifest.sealed_at IS NULL THEN
    RAISE EXCEPTION 'only sealed archive ranges may be pruned';
  END IF;
  IF cardinality(manifest.quality_flags) > 0 THEN
    RAISE EXCEPTION 'archive with quality flags may not be pruned';
  END IF;
  IF controls.restore_gate_required AND dataset.restore_gate_passed_at IS NULL THEN
    RAISE EXCEPTION 'dataset restore gate has not passed';
  END IF;
  IF manifest.range_end > p_now - dataset.hot_retention THEN
    RAISE EXCEPTION 'archive range is still inside hot retention';
  END IF;
  IF NOT dataset.prune_supported THEN
    RAISE EXCEPTION 'dataset requires a specialized non-delete lifecycle';
  END IF;
  SELECT * INTO reconciliation
  FROM public.propagation_archive_reconciliations
  ORDER BY reconciled_at DESC
  LIMIT 1;
  IF NOT FOUND
    OR NOT reconciliation.passed
    OR reconciliation.reconciled_at < manifest.sealed_at
    OR reconciliation.reconciled_at < p_now - interval '36 hours'
  THEN
    RAISE EXCEPTION
      'a fresh passing object inventory reconciliation after manifest sealing is required';
  END IF;

  CASE manifest.dataset
    WHEN 'spot_history_v1' THEN
      relation_name := 'public.spot_history'; time_name := 'spotted_at'; key_name := 'id';
    WHEN 'wspr_observations_v1' THEN
      relation_name := 'public.wspr_observations_rolling'; time_name := 'received_at'; key_name := 'id';
    WHEN 'wspr_path_features_v1' THEN
      relation_name := 'public.wspr_path_hourly_features'; time_name := 'target_hour'; key_name := 'id';
    WHEN 'path_hourly_stats_v1' THEN
      relation_name := 'public.path_hourly_stats'; time_name := 'hour_utc'; key_name := 'id';
    WHEN 'solar_snapshots_v1' THEN
      relation_name := 'public.solar_snapshots'; time_name := 'captured_at'; key_name := 'id';
    WHEN 'forecast_values_v1' THEN
      relation_name := 'public.space_weather_forecast_values'; time_name := 'valid_at'; key_name := 'id';
    ELSE
      RAISE EXCEPTION 'dataset does not support row pruning: %', manifest.dataset;
  END CASE;

  EXECUTE format(
    'SELECT count(*) FROM %1$s WHERE %2$I >= $1 AND %2$I < $2',
    relation_name, time_name
  ) INTO source_rows_before USING manifest.range_start, manifest.range_end;
  IF source_rows_before <> manifest.row_count - manifest.pruned_rows THEN
    RAISE EXCEPTION
      'source rows no longer reconcile with sealed manifest: expected %, found %',
      manifest.row_count - manifest.pruned_rows, source_rows_before;
  END IF;

  EXECUTE format(
    'WITH doomed AS (
       SELECT %1$I FROM %2$s
       WHERE %3$I >= $1 AND %3$I < $2
       ORDER BY %3$I, %1$I
       LIMIT $3
       FOR UPDATE SKIP LOCKED
     )
     DELETE FROM %2$s AS source
     USING doomed
     WHERE source.%1$I = doomed.%1$I',
    key_name, relation_name, time_name
  ) USING manifest.range_start, manifest.range_end, p_batch_size;
  GET DIAGNOSTICS deleted_rows = ROW_COUNT;

  EXECUTE format(
    'SELECT count(*) FROM %1$s WHERE %2$I >= $1 AND %2$I < $2',
    relation_name, time_name
  ) INTO remaining_rows USING manifest.range_start, manifest.range_end;

  UPDATE public.propagation_archive_manifests
  SET pruned_rows = pruned_rows + deleted_rows,
      pruned_at = CASE WHEN remaining_rows = 0 THEN now() ELSE pruned_at END,
      updated_at = now()
  WHERE id = p_manifest_id;
  duration_ms := greatest(
    0,
    round(extract(epoch FROM clock_timestamp() - started_at) * 1000)::integer
  );
  INSERT INTO public.propagation_archive_lifecycle_audit (
    manifest_id, dataset, action, prior_status, next_status, details
  ) VALUES (
    p_manifest_id, manifest.dataset, 'prune_batch', manifest.status,
    manifest.status,
    jsonb_build_object(
      'deleted_rows', deleted_rows,
      'remaining_rows', remaining_rows,
      'remaining_eligible_estimate', remaining_rows,
      'batch_size', p_batch_size,
      'duration_ms', duration_ms,
      'postgres_error_code', null
    )
  );

  RETURN jsonb_build_object(
    'manifest_id', p_manifest_id,
    'dataset', manifest.dataset,
    'deleted_rows', deleted_rows,
    'remaining_rows', remaining_rows,
    'remaining_eligible_estimate', remaining_rows,
    'duration_ms', duration_ms,
    'complete', remaining_rows = 0
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.run_propagation_retention_maintenance(
  p_archive_pruning_enabled boolean,
  p_batch_size integer DEFAULT 10000,
  p_now timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  controls public.propagation_archive_controls%ROWTYPE;
  candidate uuid;
  archived_result jsonb := null;
  cache_deleted bigint := 0;
  health_deleted bigint := 0;
  tle_deleted bigint := 0;
  research_result jsonb := '{}'::jsonb;
BEGIN
  IF NOT p_archive_pruning_enabled THEN
    RAISE EXCEPTION 'ARCHIVE_PRUNING_ENABLED is false';
  END IF;
  IF p_batch_size < 1 OR p_batch_size > 50000 OR p_now IS NULL THEN
    RAISE EXCEPTION 'invalid retention maintenance request';
  END IF;
  SELECT * INTO controls
  FROM public.propagation_archive_controls WHERE singleton;
  IF NOT controls.pruning_enabled THEN
    RAISE EXCEPTION 'database archive pruning control is false';
  END IF;

  SELECT manifest.id INTO candidate
  FROM public.propagation_archive_manifests AS manifest
  JOIN public.propagation_archive_datasets AS dataset USING (dataset)
  WHERE dataset.prune_enabled
    AND dataset.prune_supported
    AND manifest.status IN ('sealed', 'restored')
    AND manifest.sealed_at IS NOT NULL
    AND cardinality(manifest.quality_flags) = 0
    AND manifest.range_end <= p_now - dataset.hot_retention
    AND (NOT controls.restore_gate_required OR dataset.restore_gate_passed_at IS NOT NULL)
  ORDER BY manifest.range_end, manifest.dataset
  LIMIT 1;
  IF candidate IS NOT NULL THEN
    archived_result := public.prune_propagation_archive_manifest(
      candidate, p_batch_size, p_now
    );
  END IF;

  WITH doomed AS (
    SELECT id FROM public.propagation_surface_cache
    WHERE expires_at <= p_now
    ORDER BY expires_at, id
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.propagation_surface_cache AS cache
  USING doomed WHERE cache.id = doomed.id;
  GET DIAGNOSTICS cache_deleted = ROW_COUNT;

  WITH doomed AS (
    SELECT id FROM public.collector_health
    WHERE reported_at < p_now - interval '7 days'
    ORDER BY reported_at, id
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.collector_health AS health
  USING doomed WHERE health.id = doomed.id;
  GET DIAGNOSTICS health_deleted = ROW_COUNT;

  WITH doomed AS (
    SELECT id FROM public.satellite_tle
    WHERE collected_at < p_now - interval '7 days'
    ORDER BY collected_at, id
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.satellite_tle AS tle
  USING doomed WHERE tle.id = doomed.id;
  GET DIAGNOSTICS tle_deleted = ROW_COUNT;

  SELECT to_jsonb(result) INTO research_result
  FROM public.prune_expired_propagation_research_data(p_now, 1000) AS result;

  RETURN jsonb_build_object(
    'archived', archived_result,
    'expired_surface_cache_deleted', cache_deleted,
    'collector_health_deleted', health_deleted,
    'satellite_tle_deleted', tle_deleted,
    'consent_aware_research', coalesce(research_result, '{}'::jsonb)
  );
END;
$$;

-- Replace the legacy unbounded WSPR delete with a fail-closed compatibility
-- function. A caller can only drain rows already covered by a sealed manifest.
CREATE OR REPLACE FUNCTION public.prune_wspr_observations(
  older_than interval DEFAULT interval '30 hours'
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  candidate uuid;
  result jsonb;
BEGIN
  IF older_than < interval '27 hours' THEN
    RAISE EXCEPTION 'WSPR rolling retention cannot be shorter than 27 hours';
  END IF;
  SELECT manifest.id INTO candidate
  FROM public.propagation_archive_manifests AS manifest
  JOIN public.propagation_archive_datasets AS dataset USING (dataset)
  JOIN public.propagation_archive_controls AS controls ON controls.singleton
  WHERE manifest.dataset = 'wspr_observations_v1'
    AND manifest.status IN ('sealed', 'restored')
    AND manifest.sealed_at IS NOT NULL
    AND cardinality(manifest.quality_flags) = 0
    AND manifest.range_end <= now() - older_than
    AND controls.pruning_enabled
    AND dataset.prune_enabled
    AND (NOT controls.restore_gate_required OR dataset.restore_gate_passed_at IS NOT NULL)
  ORDER BY manifest.range_end
  LIMIT 1;
  IF candidate IS NULL THEN RETURN 0; END IF;
  result := public.prune_propagation_archive_manifest(candidate, 10000, now());
  RETURN coalesce((result->>'deleted_rows')::bigint, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.capture_propagation_storage_report(
  p_include_exact_rates boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  report_id uuid;
  dataset record;
  relation_oid regclass;
  relation_stats jsonb := '{}'::jsonb;
  item jsonb;
  oldest_at timestamptz;
  newest_at timestamptz;
  seven_day_rows bigint;
  cron_jobs jsonb := '[]'::jsonb;
BEGIN
  FOR dataset IN
    SELECT * FROM public.propagation_archive_datasets ORDER BY dataset
  LOOP
    relation_oid := to_regclass(dataset.source_relation);
    IF relation_oid IS NULL THEN CONTINUE; END IF;
    EXECUTE format(
      'SELECT min(%1$I), max(%1$I) FROM %2$s',
      dataset.time_column, dataset.source_relation
    ) INTO oldest_at, newest_at;
    seven_day_rows := null;
    IF p_include_exact_rates THEN
      EXECUTE format(
        'SELECT count(*) FROM %1$s WHERE %2$I >= now() - interval ''7 days''',
        dataset.source_relation, dataset.time_column
      ) INTO seven_day_rows;
    END IF;
    SELECT jsonb_build_object(
      'relation', dataset.source_relation,
      'data_bytes', pg_relation_size(relation_oid),
      'toast_bytes', CASE
        WHEN class.reltoastrelid = 0 THEN 0
        ELSE pg_total_relation_size(class.reltoastrelid)
      END,
      'index_bytes', pg_indexes_size(relation_oid),
      'total_bytes', pg_total_relation_size(relation_oid),
      'estimated_rows', coalesce(stats.n_live_tup, 0),
      'dead_tuples', coalesce(stats.n_dead_tup, 0),
      'modified_since_analyze', coalesce(stats.n_mod_since_analyze, 0),
      'last_autovacuum', stats.last_autovacuum,
      'last_autoanalyze', stats.last_autoanalyze,
      'autovacuum_age_seconds', CASE
        WHEN stats.last_autovacuum IS NULL THEN null
        ELSE extract(epoch FROM now() - stats.last_autovacuum)
      END,
      'oldest_at', oldest_at,
      'newest_at', newest_at,
      'exact_rows_last_7_days', seven_day_rows
    ) INTO item
    FROM pg_stat_all_tables AS stats
    JOIN pg_class AS class ON class.oid = stats.relid
    WHERE stats.relid = relation_oid;
    relation_stats := relation_stats || jsonb_build_object(dataset.dataset, item);
  END LOOP;

  IF to_regclass('cron.job') IS NOT NULL THEN
    EXECUTE 'SELECT coalesce(jsonb_agg(to_jsonb(job) ORDER BY jobid), ''[]''::jsonb) FROM cron.job AS job'
    INTO cron_jobs;
  END IF;

  INSERT INTO public.propagation_storage_reports (
    database_bytes, include_exact_rates, relations, database_cron,
    notes
  ) VALUES (
    pg_database_size(current_database()),
    p_include_exact_rates,
    relation_stats,
    cron_jobs,
    jsonb_build_object(
      'provisioned_disk_bytes', null,
      'provisioned_disk_note', 'capture from the Supabase usage dashboard',
      'exact_table_sizes', true,
      'planner_row_estimates', true
    )
  ) RETURNING id INTO report_id;
  RETURN report_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_propagation_retention_inventory()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  cron_jobs jsonb := '[]'::jsonb;
  result jsonb;
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    EXECUTE 'SELECT coalesce(jsonb_agg(to_jsonb(job) ORDER BY jobid), ''[]''::jsonb) FROM cron.job AS job'
    INTO cron_jobs;
  END IF;
  SELECT jsonb_build_object(
    'controls', (SELECT to_jsonb(control) - 'singleton' FROM public.propagation_archive_controls AS control WHERE singleton),
    'datasets', (SELECT coalesce(jsonb_agg(to_jsonb(dataset) ORDER BY dataset.dataset), '[]'::jsonb) FROM public.propagation_archive_datasets AS dataset),
    'database_cron', cron_jobs,
    'known_application_jobs', jsonb_build_array(
      jsonb_build_object('service', 'collector', 'job', 'prune', 'entrypoint', 'collector/src/aggregator/prune.ts'),
      jsonb_build_object('service', 'archive-worker', 'job', 'archive', 'entrypoint', 'archive-worker/propagation_archive/cli.py'),
      jsonb_build_object('service', 'archive-worker', 'job', 'restore-drill', 'entrypoint', 'archive-worker/propagation_archive/cli.py'),
      jsonb_build_object('service', 'archive-worker', 'job', 'inventory-reconciliation', 'entrypoint', 'archive-worker/propagation_archive/cli.py'),
      jsonb_build_object('service', 'archive-worker', 'job', 'storage-cost-report', 'entrypoint', 'archive-worker/propagation_archive/cli.py'),
      jsonb_build_object('service', 'vercel', 'job', 'research-retention', 'entrypoint', 'api/propagation/research-retention.ts')
    ),
    'known_deletion_functions', jsonb_build_array(
      'public.prune_propagation_archive_manifest(uuid,integer,timestamptz)',
      'public.run_propagation_retention_maintenance(boolean,integer,timestamptz)',
      'public.prune_wspr_observations(interval)',
      'public.prune_expired_propagation_research_data(timestamptz,integer)',
      'public.run_propagation_forecast_payload_compaction(boolean,integer,timestamptz)'
    )
  ) INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_propagation_archive_reconciliation(
  p_manifest_count bigint,
  p_storage_object_count bigint,
  p_missing_paths text[],
  p_orphan_paths text[],
  p_size_mismatches jsonb,
  p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  reconciliation_id uuid;
  passed boolean;
BEGIN
  IF p_manifest_count < 0 OR p_storage_object_count < 0
    OR cardinality(coalesce(p_missing_paths, '{}'::text[])) > 10000
    OR cardinality(coalesce(p_orphan_paths, '{}'::text[])) > 10000
    OR jsonb_typeof(coalesce(p_size_mismatches, '[]'::jsonb)) <> 'array'
  THEN
    RAISE EXCEPTION 'invalid archive reconciliation';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM unnest(
      coalesce(p_missing_paths, '{}'::text[])
      || coalesce(p_orphan_paths, '{}'::text[])
    ) AS path(value)
    WHERE value ~ '[@[:space:]]' OR value ~ '(^|/)\.\.(/|$)'
  ) THEN
    RAISE EXCEPTION 'archive reconciliation contains an unsafe path';
  END IF;

  INSERT INTO public.propagation_archive_reconciliations (
    manifest_count, storage_object_count, missing_paths, orphan_paths,
    size_mismatches, details
  ) VALUES (
    p_manifest_count, p_storage_object_count,
    coalesce(p_missing_paths, '{}'::text[]),
    coalesce(p_orphan_paths, '{}'::text[]),
    coalesce(p_size_mismatches, '[]'::jsonb),
    coalesce(p_details, '{}'::jsonb)
  ) RETURNING id, propagation_archive_reconciliations.passed
    INTO reconciliation_id, passed;

  INSERT INTO public.propagation_archive_lifecycle_audit (
    dataset, action, details
  ) VALUES (
    'global', 'inventory_reconciled',
    jsonb_build_object('reconciliation_id', reconciliation_id, 'passed', passed)
  );
  RETURN reconciliation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_propagation_archive_health(
  p_now timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH dataset_health AS (
    SELECT
      dataset.dataset,
      dataset.archive_enabled,
      dataset.prune_enabled,
      dataset.hot_retention,
      dataset.restore_gate_passed_at,
      CASE dataset.dataset
        WHEN 'spot_history_v1' THEN (SELECT min(spotted_at) FROM public.spot_history)
        WHEN 'wspr_observations_v1' THEN (SELECT min(received_at) FROM public.wspr_observations_rolling)
        WHEN 'wspr_path_features_v1' THEN (SELECT min(target_hour) FROM public.wspr_path_hourly_features)
        WHEN 'path_hourly_stats_v1' THEN (SELECT min(hour_utc) FROM public.path_hourly_stats)
        WHEN 'solar_snapshots_v1' THEN (SELECT min(captured_at) FROM public.solar_snapshots)
        WHEN 'forecast_payloads_v1' THEN (SELECT min(issued_at) FROM public.space_weather_forecast_payloads)
        WHEN 'forecast_values_v1' THEN (SELECT min(valid_at) FROM public.space_weather_forecast_values)
      END AS oldest_hot_time,
      CASE dataset.partition_granularity
        WHEN 'hour' THEN CASE
          WHEN p_now < date_trunc('hour', p_now) + interval '20 minutes'
            THEN date_trunc('hour', p_now) - interval '1 hour'
          ELSE date_trunc('hour', p_now)
        END
        WHEN 'day' THEN date_trunc('day', p_now)
        WHEN 'month' THEN date_trunc('month', p_now)
      END AS expected_closed_end,
      max(manifest.range_end) FILTER (
        WHERE manifest.status IN ('sealed', 'restored')
      ) AS latest_sealed_end,
      count(manifest.id) FILTER (
        WHERE manifest.status IN ('uploading', 'verified')
      ) AS unsealed_count,
      min(manifest.created_at) FILTER (
        WHERE manifest.status IN ('uploading', 'verified')
      ) AS oldest_unsealed_at,
      count(manifest.id) FILTER (
        WHERE manifest.status = 'failed'
          AND manifest.updated_at >= p_now - interval '24 hours'
      ) AS failures_24h,
      coalesce(sum(manifest.object_bytes) FILTER (
        WHERE manifest.status IN ('sealed', 'restored')
      ), 0) AS sealed_object_bytes,
      coalesce(sum(manifest.uncompressed_bytes) FILTER (
        WHERE manifest.status IN ('sealed', 'restored')
      ), 0) AS sealed_uncompressed_bytes,
      coalesce(sum(manifest.row_count) FILTER (
        WHERE manifest.sealed_at >= p_now - interval '24 hours'
      ), 0) AS archived_rows_24h,
      coalesce(sum(manifest.object_bytes) FILTER (
        WHERE manifest.sealed_at >= p_now - interval '24 hours'
      ), 0) AS archived_object_bytes_24h,
      coalesce((
        SELECT sum((audit.details->>'deleted_rows')::bigint)
        FROM public.propagation_archive_lifecycle_audit AS audit
        WHERE audit.dataset = dataset.dataset
          AND audit.action = 'prune_batch'
          AND audit.created_at >= p_now - interval '24 hours'
      ), 0) AS deleted_rows_24h
    FROM public.propagation_archive_datasets AS dataset
    LEFT JOIN public.propagation_archive_manifests AS manifest USING (dataset)
    GROUP BY dataset.dataset, dataset.archive_enabled, dataset.prune_enabled,
             dataset.hot_retention, dataset.restore_gate_passed_at,
             dataset.partition_granularity
  ), latest_reconciliation AS (
    SELECT reconciliation.*
    FROM public.propagation_archive_reconciliations AS reconciliation
    ORDER BY reconciled_at DESC
    LIMIT 1
  ), alerts AS (
    SELECT dataset, 'critical' AS severity, 'archive_lag' AS signal
    FROM dataset_health
    WHERE archive_enabled AND latest_sealed_end IS NOT NULL
      AND expected_closed_end - latest_sealed_end > interval '24 hours'
    UNION ALL
    SELECT dataset, 'critical', 'archive_lag'
    FROM dataset_health
    WHERE archive_enabled AND latest_sealed_end IS NULL
      AND oldest_hot_time IS NOT NULL AND oldest_hot_time < expected_closed_end
    UNION ALL
    SELECT dataset, 'warning', 'archive_lag'
    FROM dataset_health
    WHERE archive_enabled AND latest_sealed_end IS NOT NULL
      AND expected_closed_end - latest_sealed_end > interval '6 hours'
      AND expected_closed_end - latest_sealed_end <= interval '24 hours'
    UNION ALL
    SELECT dataset, 'critical', 'unsealed_upload_age'
    FROM dataset_health
    WHERE oldest_unsealed_at IS NOT NULL
      AND p_now - oldest_unsealed_at > interval '6 hours'
    UNION ALL
    SELECT dataset, 'warning', 'unsealed_upload_age'
    FROM dataset_health
    WHERE oldest_unsealed_at IS NOT NULL
      AND p_now - oldest_unsealed_at > interval '2 hours'
      AND p_now - oldest_unsealed_at <= interval '6 hours'
    UNION ALL
    SELECT dataset, 'critical', 'verification_failures'
    FROM dataset_health WHERE failures_24h >= 3
    UNION ALL
    SELECT dataset, 'warning', 'verification_failures'
    FROM dataset_health WHERE failures_24h BETWEEN 1 AND 2
    UNION ALL
    SELECT dataset, 'critical', 'restore_drill_age'
    FROM dataset_health
    WHERE archive_enabled AND (
      restore_gate_passed_at IS NULL
      OR p_now - restore_gate_passed_at > interval '45 days'
    )
    UNION ALL
    SELECT dataset, 'warning', 'restore_drill_age'
    FROM dataset_health
    WHERE archive_enabled AND restore_gate_passed_at IS NOT NULL
      AND p_now - restore_gate_passed_at > interval '35 days'
      AND p_now - restore_gate_passed_at <= interval '45 days'
    UNION ALL
    SELECT dataset, 'critical', 'retention_prune_lag'
    FROM dataset_health
    WHERE prune_enabled AND oldest_hot_time IS NOT NULL
      AND (p_now - hot_retention) - oldest_hot_time > interval '48 hours'
    UNION ALL
    SELECT dataset, 'warning', 'retention_prune_lag'
    FROM dataset_health
    WHERE prune_enabled AND oldest_hot_time IS NOT NULL
      AND (p_now - hot_retention) - oldest_hot_time > interval '12 hours'
      AND (p_now - hot_retention) - oldest_hot_time <= interval '48 hours'
    UNION ALL
    SELECT dataset, 'critical', 'hot_history'
    FROM dataset_health
    WHERE dataset = 'wspr_observations_v1' AND archive_enabled
      AND oldest_hot_time IS NOT NULL
      AND p_now - oldest_hot_time > interval '48 hours'
    UNION ALL
    SELECT dataset, 'warning', 'hot_history'
    FROM dataset_health
    WHERE dataset = 'wspr_observations_v1' AND archive_enabled
      AND oldest_hot_time IS NOT NULL
      AND p_now - oldest_hot_time > interval '33 hours'
      AND p_now - oldest_hot_time <= interval '48 hours'
    UNION ALL
    SELECT dataset, 'critical', 'hot_history'
    FROM dataset_health
    WHERE dataset = 'spot_history_v1' AND archive_enabled
      AND oldest_hot_time IS NOT NULL
      AND p_now - oldest_hot_time > interval '72 hours'
    UNION ALL
    SELECT dataset, 'warning', 'hot_history'
    FROM dataset_health
    WHERE dataset = 'spot_history_v1' AND archive_enabled
      AND oldest_hot_time IS NOT NULL
      AND p_now - oldest_hot_time > interval '60 hours'
      AND p_now - oldest_hot_time <= interval '72 hours'
    UNION ALL
    SELECT 'global', 'critical', 'inventory_reconciliation'
    FROM latest_reconciliation
    WHERE NOT passed OR p_now - reconciled_at > interval '48 hours'
    UNION ALL
    SELECT 'global', 'warning', 'inventory_reconciliation'
    FROM latest_reconciliation
    WHERE passed AND p_now - reconciled_at > interval '36 hours'
      AND p_now - reconciled_at <= interval '48 hours'
    UNION ALL
    SELECT 'global', 'critical', 'inventory_reconciliation'
    WHERE NOT EXISTS (SELECT 1 FROM latest_reconciliation)
      AND EXISTS (
        SELECT 1 FROM public.propagation_archive_controls
        WHERE singleton AND archive_enabled
      )
  )
  SELECT jsonb_build_object(
    'generated_at', p_now,
    'controls', (
      SELECT to_jsonb(control) - 'singleton'
      FROM public.propagation_archive_controls AS control WHERE singleton
    ),
    'datasets', (
      SELECT coalesce(jsonb_agg(
        to_jsonb(dataset_health) || jsonb_build_object(
          'compression_ratio', CASE
            WHEN sealed_object_bytes > 0
              THEN round(sealed_uncompressed_bytes::numeric / sealed_object_bytes, 4)
            ELSE null
          END,
          'archive_throughput_bytes_per_second_24h',
            round(archived_object_bytes_24h::numeric / 86400, 4)
        )
        ORDER BY dataset
      ), '[]'::jsonb)
      FROM dataset_health
    ),
    'object_bytes_by_lifecycle', (
      SELECT coalesce(jsonb_object_agg(lifecycle_class, object_bytes), '{}'::jsonb)
      FROM (
        SELECT lifecycle_class, sum(object_bytes) AS object_bytes
        FROM public.propagation_archive_manifests
        WHERE status IN ('sealed', 'restored')
        GROUP BY lifecycle_class
      ) AS lifecycle
    ),
    'latest_reconciliation', (
      SELECT to_jsonb(reconciliation)
      FROM latest_reconciliation AS reconciliation
    ),
    'latest_storage_report', (
      SELECT to_jsonb(report)
      FROM public.propagation_storage_reports AS report
      ORDER BY captured_at DESC LIMIT 1
    ),
    'alerts', (
      SELECT coalesce(jsonb_agg(to_jsonb(alerts) ORDER BY severity, dataset, signal), '[]'::jsonb)
      FROM alerts
    )
  );
$$;

ALTER TABLE public.propagation_archive_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.propagation_archive_datasets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.propagation_archive_manifests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.propagation_archive_lifecycle_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.propagation_archive_restore_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.propagation_storage_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.propagation_archive_reconciliations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.propagation_archive_controls FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.propagation_archive_datasets FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.propagation_archive_manifests FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.propagation_archive_lifecycle_audit FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.propagation_archive_restore_receipts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.propagation_storage_reports FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.propagation_archive_reconciliations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.propagation_archive_controls TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.propagation_archive_datasets TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.propagation_archive_manifests TO service_role;
GRANT SELECT, INSERT ON public.propagation_archive_lifecycle_audit TO service_role;
GRANT SELECT, INSERT ON public.propagation_archive_restore_receipts TO service_role;
GRANT SELECT, INSERT ON public.propagation_storage_reports TO service_role;
GRANT SELECT, INSERT ON public.propagation_archive_reconciliations TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.propagation_archive_lifecycle_audit_id_seq TO service_role;

REVOKE ALL ON FUNCTION public.register_propagation_archive_manifest(
  text, integer, timestamptz, timestamptz, text, bigint, timestamptz,
  timestamptz, jsonb, text, bigint, bigint, text, text[], text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.verify_propagation_archive_manifest(uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.seal_propagation_archive_manifest(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_propagation_archive_manifest(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_propagation_archive_restore(
  uuid, text, bigint, text, boolean, boolean, boolean, boolean, jsonb, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_propagation_archive_controls(boolean, boolean, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_propagation_archive_dataset_controls(text, boolean, boolean, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prune_propagation_archive_manifest(uuid, integer, timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.run_propagation_retention_maintenance(boolean, integer, timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.capture_propagation_storage_report(boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_propagation_retention_inventory()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_propagation_archive_reconciliation(
  bigint, bigint, text[], text[], jsonb, jsonb
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_propagation_archive_health(timestamptz)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.register_propagation_archive_manifest(
  text, integer, timestamptz, timestamptz, text, bigint, timestamptz,
  timestamptz, jsonb, text, bigint, bigint, text, text[], text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_propagation_archive_manifest(uuid, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.seal_propagation_archive_manifest(uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_propagation_archive_manifest(uuid, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.record_propagation_archive_restore(
  uuid, text, bigint, text, boolean, boolean, boolean, boolean, jsonb, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_propagation_archive_controls(boolean, boolean, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.set_propagation_archive_dataset_controls(text, boolean, boolean, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.prune_propagation_archive_manifest(uuid, integer, timestamptz)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.run_propagation_retention_maintenance(boolean, integer, timestamptz)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.capture_propagation_storage_report(boolean)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.get_propagation_retention_inventory()
  TO service_role;
GRANT EXECUTE ON FUNCTION public.record_propagation_archive_reconciliation(
  bigint, bigint, text[], text[], jsonb, jsonb
) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_propagation_archive_health(timestamptz)
  TO service_role;

COMMENT ON TABLE public.propagation_archive_manifests IS
  'Service-role-only immutable archive evidence. Source deletion requires a sealed manifest and a passing dataset restore gate.';
COMMENT ON TABLE public.propagation_archive_restore_receipts IS
  'Isolated restore-drill evidence; a passing receipt unlocks only the named dataset gate.';
COMMENT ON FUNCTION public.prune_propagation_archive_manifest(uuid, integer, timestamptz) IS
  'Deletes one indexed, bounded batch wholly covered by a sealed archive; fails closed on every missing gate.';
