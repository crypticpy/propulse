-- Forecast raw-payload compaction after verified archive and restore.
-- Every control remains disabled by default; this migration deletes no data.

ALTER TABLE public.propagation_archive_manifests
  ADD COLUMN IF NOT EXISTS source_compacted_rows bigint NOT NULL DEFAULT 0;
ALTER TABLE public.propagation_archive_manifests
  DROP CONSTRAINT IF EXISTS propagation_archive_manifest_compacted_rows_check;
ALTER TABLE public.propagation_archive_manifests
  ADD CONSTRAINT propagation_archive_manifest_compacted_rows_check CHECK (
    source_compacted_rows >= 0 AND source_compacted_rows <= row_count
  );

ALTER TABLE public.propagation_archive_lifecycle_audit
  DROP CONSTRAINT IF EXISTS propagation_archive_lifecycle_audit_action_check;
ALTER TABLE public.propagation_archive_lifecycle_audit
  ADD CONSTRAINT propagation_archive_lifecycle_audit_action_check CHECK (action IN (
    'registered', 'verified', 'sealed', 'failed', 'restored',
    'prune_batch', 'source_compacted', 'object_delete_requested',
    'object_deleted', 'lifecycle_changed', 'control_changed',
    'inventory_reconciled', 'partition_dropped'
  ));

ALTER TABLE public.space_weather_forecast_payloads
  ADD COLUMN IF NOT EXISTS archive_manifest_id uuid
    REFERENCES public.propagation_archive_manifests(id),
  ADD COLUMN IF NOT EXISTS archive_object_bucket text,
  ADD COLUMN IF NOT EXISTS archive_object_path text,
  ADD COLUMN IF NOT EXISTS raw_payload_bytes bigint,
  ADD COLUMN IF NOT EXISTS raw_payload_archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_object_bucket text,
  ADD COLUMN IF NOT EXISTS source_object_path text,
  ADD COLUMN IF NOT EXISTS source_object_sha256 text,
  ADD COLUMN IF NOT EXISTS source_object_bytes bigint,
  ADD COLUMN IF NOT EXISTS source_object_verified_at timestamptz;

ALTER TABLE public.space_weather_forecast_payloads
  ADD CONSTRAINT forecast_payload_source_object_check CHECK (
    (
      source_object_bucket IS NULL
      AND source_object_path IS NULL
      AND source_object_sha256 IS NULL
      AND source_object_bytes IS NULL
      AND source_object_verified_at IS NULL
    ) OR (
      source_object_bucket = 'propagation-archives'
      AND source_object_path IS NOT NULL
      AND source_object_path !~ '(^|/)\.\.(/|$)'
      AND source_object_path !~ '[@[:space:]]'
      AND source_object_path LIKE '%' || payload_sha256 || '%'
      AND source_object_sha256 = payload_sha256
      AND source_object_bytes > 0
      AND source_object_verified_at IS NOT NULL
    )
  );

ALTER TABLE public.space_weather_forecast_payloads
  ALTER COLUMN raw_payload DROP NOT NULL;
ALTER TABLE public.space_weather_forecast_payloads
  DROP CONSTRAINT IF EXISTS forecast_payload_archive_state_check;
ALTER TABLE public.space_weather_forecast_payloads
  ADD CONSTRAINT forecast_payload_archive_state_check CHECK (
    (
      raw_payload IS NOT NULL
      AND archive_manifest_id IS NULL
      AND archive_object_bucket IS NULL
      AND archive_object_path IS NULL
      AND raw_payload_bytes IS NULL
      AND raw_payload_archived_at IS NULL
    )
    OR
    (
      raw_payload IS NULL
      AND archive_manifest_id IS NOT NULL
      AND archive_object_bucket = 'propagation-archives'
      AND archive_object_path IS NOT NULL
      AND archive_object_path !~ '(^|/)\.\.(/|$)'
      AND archive_object_path !~ '[@[:space:]]'
      AND raw_payload_bytes IS NOT NULL AND raw_payload_bytes > 0
      AND raw_payload_archived_at IS NOT NULL
    )
  );
CREATE INDEX IF NOT EXISTS forecast_payload_archive_manifest_idx
  ON public.space_weather_forecast_payloads(archive_manifest_id)
  WHERE archive_manifest_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_propagation_forecast_payload_bytes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  payload_bytes bytea;
BEGIN
  IF NEW.raw_payload IS NULL OR NOT (NEW.raw_payload ? 'encoding') THEN
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

CREATE TRIGGER propagation_forecast_payload_bytes_guard
BEFORE INSERT OR UPDATE OF payload_sha256, raw_payload
ON public.space_weather_forecast_payloads
FOR EACH ROW EXECUTE FUNCTION public.validate_propagation_forecast_payload_bytes();

-- The existing table-level SELECT grant exposed raw JSON. Preserve a stable,
-- safe metadata surface and keep archive locators and bytes service-role-only.
REVOKE SELECT ON public.space_weather_forecast_payloads FROM anon, authenticated;
GRANT SELECT (
  payload_sha256, source, product, issued_at, ingested_at,
  parser_version, source_url, created_at, raw_payload_archived_at
) ON public.space_weather_forecast_payloads TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.space_weather_forecast_payloads TO service_role;

CREATE OR REPLACE VIEW public.space_weather_forecast_payload_metadata
WITH (security_invoker = true)
AS
SELECT
  payload_sha256, source, product, issued_at, ingested_at,
  parser_version, source_url, created_at,
  raw_payload_archived_at IS NOT NULL AS raw_payload_archived,
  source_object_verified_at IS NOT NULL AS source_object_verified
FROM public.space_weather_forecast_payloads;
GRANT SELECT ON public.space_weather_forecast_payload_metadata TO anon, authenticated;

CREATE TABLE IF NOT EXISTS public.propagation_archive_lifecycle_controls (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  forecast_payload_compaction_enabled boolean NOT NULL DEFAULT false,
  object_deletion_enabled boolean NOT NULL DEFAULT false,
  deterministic_sample_spec_version text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL DEFAULT current_user,
  reason text NOT NULL DEFAULT 'initial fail-closed state'
    CHECK (length(reason) BETWEEN 1 AND 1000),
  CHECK (NOT object_deletion_enabled),
  CHECK (
    deterministic_sample_spec_version IS NULL
    OR deterministic_sample_spec_version ~ '^[a-z0-9][a-z0-9_.:-]{0,127}$'
  )
);
INSERT INTO public.propagation_archive_lifecycle_controls(singleton)
VALUES (true)
ON CONFLICT (singleton) DO NOTHING;

ALTER TABLE public.propagation_archive_manifests
  ADD COLUMN IF NOT EXISTS hold_reference text;

CREATE OR REPLACE FUNCTION public.enforce_propagation_archive_hold_reference()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.lifecycle_class IN ('research_locked', 'publication_hold')
    AND (NEW.hold_reference IS NULL OR NEW.hold_reference NOT LIKE 'hold:%')
  THEN
    RAISE EXCEPTION 'locked evidence requires an audited hold reference';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS propagation_archive_hold_reference_guard
  ON public.propagation_archive_manifests;
CREATE TRIGGER propagation_archive_hold_reference_guard
BEFORE INSERT OR UPDATE OF lifecycle_class, hold_reference
ON public.propagation_archive_manifests
FOR EACH ROW EXECUTE FUNCTION public.enforce_propagation_archive_hold_reference();

CREATE TABLE IF NOT EXISTS public.propagation_archive_replica_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manifest_id uuid NOT NULL REFERENCES public.propagation_archive_manifests(id),
  target_label text NOT NULL CHECK (
    target_label ~ '^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,199}$'
  ),
  replica_locator_sha256 text NOT NULL CHECK (
    replica_locator_sha256 ~ '^[0-9a-f]{64}$'
  ),
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  object_bytes bigint NOT NULL CHECK (object_bytes > 0),
  read_verified boolean NOT NULL,
  signature text NOT NULL CHECK (signature ~ '^[0-9a-f]{64}$'),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  verified_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS propagation_archive_replica_manifest_idx
  ON public.propagation_archive_replica_receipts(manifest_id, verified_at DESC);

CREATE OR REPLACE FUNCTION public.set_propagation_archive_lifecycle_class(
  p_manifest_id uuid,
  p_lifecycle_class text,
  p_reason text,
  p_hold_or_release_reference text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  manifest public.propagation_archive_manifests%ROWTYPE;
BEGIN
  IF p_lifecycle_class NOT IN ('ordinary', 'research_locked', 'publication_hold')
    OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 1000
    OR p_hold_or_release_reference IS NULL
    OR p_hold_or_release_reference !~ '^[a-zA-Z0-9][a-zA-Z0-9_.:/-]{0,255}$'
  THEN
    RAISE EXCEPTION 'invalid archive lifecycle transition';
  END IF;
  SELECT * INTO manifest FROM public.propagation_archive_manifests
  WHERE id = p_manifest_id FOR UPDATE;
  IF NOT FOUND OR manifest.status NOT IN ('sealed', 'restored') THEN
    RAISE EXCEPTION 'archive lifecycle transition requires a sealed manifest';
  END IF;
  IF manifest.lifecycle_class IN ('research_locked', 'publication_hold')
    AND p_lifecycle_class = 'ordinary'
    AND p_hold_or_release_reference NOT LIKE 'release:%'
  THEN
    RAISE EXCEPTION 'locked evidence release requires a release reference';
  END IF;
  IF p_lifecycle_class IN ('research_locked', 'publication_hold')
    AND p_hold_or_release_reference NOT LIKE 'hold:%'
  THEN
    RAISE EXCEPTION 'locked evidence requires a hold reference';
  END IF;
  UPDATE public.propagation_archive_manifests
  SET lifecycle_class = p_lifecycle_class,
      hold_reference = p_hold_or_release_reference,
      updated_at = now()
  WHERE id = manifest.id;
  INSERT INTO public.propagation_archive_lifecycle_audit(
    manifest_id, dataset, action, prior_status, next_status, details
  ) VALUES (
    manifest.id, manifest.dataset, 'lifecycle_changed',
    manifest.lifecycle_class, p_lifecycle_class,
    jsonb_build_object(
      'reason', btrim(p_reason),
      'hold_or_release_reference', p_hold_or_release_reference
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_propagation_archive_replica(
  p_manifest_id uuid,
  p_target_label text,
  p_replica_locator_sha256 text,
  p_content_sha256 text,
  p_object_bytes bigint,
  p_read_verified boolean,
  p_signature text,
  p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  manifest public.propagation_archive_manifests%ROWTYPE;
  receipt_id uuid;
BEGIN
  SELECT * INTO manifest FROM public.propagation_archive_manifests
  WHERE id = p_manifest_id FOR UPDATE;
  IF NOT FOUND OR manifest.status NOT IN ('sealed', 'restored')
    OR manifest.lifecycle_class NOT IN ('research_locked', 'publication_hold')
  THEN
    RAISE EXCEPTION 'replica receipt requires sealed locked evidence';
  END IF;
  IF p_content_sha256 IS DISTINCT FROM manifest.content_sha256
    OR p_object_bytes IS DISTINCT FROM manifest.object_bytes
    OR NOT coalesce(p_read_verified, false)
  THEN
    RAISE EXCEPTION 'replica bytes do not reconcile with manifest';
  END IF;
  INSERT INTO public.propagation_archive_replica_receipts(
    manifest_id, target_label, replica_locator_sha256, content_sha256,
    object_bytes, read_verified, signature, details
  ) VALUES (
    manifest.id, p_target_label, p_replica_locator_sha256, p_content_sha256,
    p_object_bytes, p_read_verified, p_signature, coalesce(p_details, '{}'::jsonb)
  ) RETURNING id INTO receipt_id;
  RETURN receipt_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_propagation_archive_replica_health(
  p_now timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT jsonb_build_object(
    'generated_at', p_now,
    'locked_manifests', count(*),
    'missing_replica_receipts', count(*) FILTER (WHERE replica.verified_at IS NULL),
    'alerts', coalesce(jsonb_agg(
      jsonb_build_object(
        'dataset', manifest.dataset,
        'manifest_id', manifest.id,
        'severity', 'critical',
        'signal', 'locked_replica_missing'
      )
    ) FILTER (WHERE replica.verified_at IS NULL), '[]'::jsonb)
  )
  FROM public.propagation_archive_manifests AS manifest
  LEFT JOIN LATERAL (
    SELECT receipt.verified_at
    FROM public.propagation_archive_replica_receipts AS receipt
    WHERE receipt.manifest_id = manifest.id
    ORDER BY receipt.verified_at DESC LIMIT 1
  ) AS replica ON true
  WHERE manifest.status IN ('sealed', 'restored')
    AND manifest.lifecycle_class IN ('research_locked', 'publication_hold');
$$;

CREATE OR REPLACE FUNCTION public.set_propagation_forecast_compaction(
  p_enabled boolean,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  controls public.propagation_archive_controls%ROWTYPE;
  dataset public.propagation_archive_datasets%ROWTYPE;
  reconciliation public.propagation_archive_reconciliations%ROWTYPE;
BEGIN
  IF p_enabled IS NULL OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'forecast compaction reason is required';
  END IF;
  SELECT * INTO controls FROM public.propagation_archive_controls WHERE singleton;
  SELECT * INTO dataset FROM public.propagation_archive_datasets
  WHERE propagation_archive_datasets.dataset = 'forecast_payloads_v1';
  SELECT * INTO reconciliation FROM public.propagation_archive_reconciliations
  ORDER BY reconciled_at DESC LIMIT 1;
  IF p_enabled AND (
    NOT controls.archive_enabled OR NOT controls.pruning_enabled
    OR NOT dataset.archive_enabled OR dataset.restore_gate_passed_at IS NULL
    OR reconciliation.id IS NULL OR NOT reconciliation.passed
    OR reconciliation.reconciled_at < now() - interval '36 hours'
  ) THEN
    RAISE EXCEPTION 'forecast compaction archive, restore, pruning, and inventory gates have not passed';
  END IF;
  UPDATE public.propagation_archive_lifecycle_controls
  SET forecast_payload_compaction_enabled = p_enabled,
      updated_at = now(), updated_by = current_user, reason = btrim(p_reason)
  WHERE singleton;
  INSERT INTO public.propagation_archive_lifecycle_audit(dataset, action, details)
  VALUES (
    'forecast_payloads_v1', 'control_changed',
    jsonb_build_object(
      'forecast_payload_compaction_enabled', p_enabled,
      'reason', btrim(p_reason)
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.compact_propagation_forecast_payload_manifest(
  p_manifest_id uuid,
  p_archive_forecast_compaction_enabled boolean,
  p_batch_size integer DEFAULT 1000,
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
  lifecycle public.propagation_archive_lifecycle_controls%ROWTYPE;
  reconciliation public.propagation_archive_reconciliations%ROWTYPE;
  source_rows bigint := 0;
  conflicting_rows bigint := 0;
  compacted_rows bigint := 0;
  remaining_rows bigint := 0;
  started_at timestamptz := clock_timestamp();
  duration_ms integer := 0;
BEGIN
  IF NOT coalesce(p_archive_forecast_compaction_enabled, false) THEN
    RAISE EXCEPTION 'ARCHIVE_FORECAST_COMPACTION_ENABLED is false';
  END IF;
  IF p_batch_size < 1 OR p_batch_size > 10000 OR p_now IS NULL THEN
    RAISE EXCEPTION 'invalid forecast compaction request';
  END IF;
  SELECT * INTO controls FROM public.propagation_archive_controls WHERE singleton;
  SELECT * INTO lifecycle FROM public.propagation_archive_lifecycle_controls WHERE singleton;
  SELECT * INTO manifest FROM public.propagation_archive_manifests
  WHERE id = p_manifest_id FOR UPDATE;
  IF NOT FOUND OR manifest.dataset <> 'forecast_payloads_v1' THEN
    RAISE EXCEPTION 'forecast payload manifest not found';
  END IF;
  SELECT * INTO dataset FROM public.propagation_archive_datasets
  WHERE propagation_archive_datasets.dataset = manifest.dataset;
  IF NOT controls.archive_enabled OR NOT controls.pruning_enabled
    OR NOT lifecycle.forecast_payload_compaction_enabled
    OR NOT dataset.archive_enabled OR dataset.restore_gate_passed_at IS NULL
  THEN
    RAISE EXCEPTION 'forecast payload compaction is disabled';
  END IF;
  IF manifest.status NOT IN ('sealed', 'restored') OR manifest.sealed_at IS NULL
    OR cardinality(manifest.quality_flags) > 0 THEN
    RAISE EXCEPTION 'forecast payload compaction requires a sealed clean manifest';
  END IF;
  SELECT * INTO reconciliation FROM public.propagation_archive_reconciliations
  ORDER BY reconciled_at DESC LIMIT 1;
  IF NOT FOUND OR NOT reconciliation.passed
    OR reconciliation.reconciled_at < manifest.sealed_at
    OR reconciliation.reconciled_at < p_now - interval '36 hours'
  THEN
    RAISE EXCEPTION 'a fresh passing object inventory reconciliation after manifest sealing is required';
  END IF;

  SELECT count(*) INTO source_rows
  FROM public.space_weather_forecast_payloads AS payload
  WHERE payload.issued_at >= manifest.range_start
    AND payload.issued_at < manifest.range_end;
  IF source_rows <> manifest.row_count THEN
    RAISE EXCEPTION
      'forecast source rows no longer reconcile with sealed manifest: expected %, found %',
      manifest.row_count, source_rows;
  END IF;
  SELECT count(*) INTO conflicting_rows
  FROM public.space_weather_forecast_payloads AS payload
  WHERE payload.issued_at >= manifest.range_start
    AND payload.issued_at < manifest.range_end
    AND payload.raw_payload IS NULL
    AND payload.archive_manifest_id IS DISTINCT FROM manifest.id;
  IF conflicting_rows > 0 THEN
    RAISE EXCEPTION 'forecast payload range contains a conflicting archive locator';
  END IF;

  WITH doomed AS (
    SELECT payload_sha256
    FROM public.space_weather_forecast_payloads
    WHERE issued_at >= manifest.range_start AND issued_at < manifest.range_end
      AND raw_payload IS NOT NULL
    ORDER BY issued_at, payload_sha256
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.space_weather_forecast_payloads AS payload
  SET raw_payload_bytes = CASE
        WHEN payload.raw_payload ->> 'encoding' = 'base64'
          AND payload.raw_payload ? 'body_base64'
        THEN octet_length(decode(payload.raw_payload ->> 'body_base64', 'base64'))
        ELSE octet_length(payload.raw_payload::text)
      END,
      raw_payload = NULL,
      archive_manifest_id = manifest.id,
      archive_object_bucket = manifest.object_bucket,
      archive_object_path = manifest.object_path,
      raw_payload_archived_at = p_now
  FROM doomed
  WHERE payload.payload_sha256 = doomed.payload_sha256;
  GET DIAGNOSTICS compacted_rows = ROW_COUNT;

  SELECT count(*) INTO remaining_rows
  FROM public.space_weather_forecast_payloads AS payload
  WHERE payload.issued_at >= manifest.range_start
    AND payload.issued_at < manifest.range_end
    AND payload.raw_payload IS NOT NULL;
  UPDATE public.propagation_archive_manifests
  SET source_compacted_rows = source_compacted_rows + compacted_rows,
      updated_at = now()
  WHERE id = manifest.id;
  duration_ms := greatest(
    0,
    round(extract(epoch FROM clock_timestamp() - started_at) * 1000)::integer
  );
  INSERT INTO public.propagation_archive_lifecycle_audit(
    manifest_id, dataset, action, prior_status, next_status, details
  ) VALUES (
    manifest.id, manifest.dataset, 'source_compacted', manifest.status,
    manifest.status,
    jsonb_build_object(
      'compacted_rows', compacted_rows,
      'remaining_rows', remaining_rows,
      'batch_size', p_batch_size,
      'duration_ms', duration_ms,
      'raw_bytes_retained_in_private_object', true
    )
  );
  RETURN jsonb_build_object(
    'manifest_id', manifest.id,
    'compacted_rows', compacted_rows,
    'remaining_rows', remaining_rows,
    'duration_ms', duration_ms,
    'complete', remaining_rows = 0
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.run_propagation_forecast_payload_compaction(
  p_archive_forecast_compaction_enabled boolean,
  p_batch_size integer DEFAULT 1000,
  p_now timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  candidate uuid;
BEGIN
  IF NOT coalesce(p_archive_forecast_compaction_enabled, false) THEN
    RAISE EXCEPTION 'ARCHIVE_FORECAST_COMPACTION_ENABLED is false';
  END IF;
  SELECT manifest.id INTO candidate
  FROM public.propagation_archive_manifests AS manifest
  WHERE manifest.dataset = 'forecast_payloads_v1'
    AND manifest.status IN ('sealed', 'restored')
    AND manifest.sealed_at IS NOT NULL
    AND cardinality(manifest.quality_flags) = 0
    AND manifest.source_compacted_rows < manifest.row_count
  ORDER BY manifest.range_end
  LIMIT 1
  FOR UPDATE SKIP LOCKED;
  IF candidate IS NULL THEN
    RETURN jsonb_build_object('status', 'idle');
  END IF;
  RETURN public.compact_propagation_forecast_payload_manifest(
    candidate, true, p_batch_size, p_now
  );
END;
$$;

ALTER TABLE public.propagation_archive_lifecycle_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.propagation_archive_replica_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.propagation_archive_lifecycle_controls
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.propagation_archive_replica_receipts
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.propagation_archive_lifecycle_controls TO service_role;
GRANT SELECT, INSERT ON public.propagation_archive_replica_receipts TO service_role;

REVOKE ALL ON FUNCTION public.set_propagation_forecast_compaction(boolean, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.compact_propagation_forecast_payload_manifest(
  uuid, boolean, integer, timestamptz
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.run_propagation_forecast_payload_compaction(
  boolean, integer, timestamptz
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_propagation_archive_lifecycle_class(
  uuid, text, text, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_propagation_archive_replica(
  uuid, text, text, text, bigint, boolean, text, jsonb
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_propagation_archive_replica_health(timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_propagation_forecast_compaction(boolean, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.compact_propagation_forecast_payload_manifest(
  uuid, boolean, integer, timestamptz
) TO service_role;
GRANT EXECUTE ON FUNCTION public.run_propagation_forecast_payload_compaction(
  boolean, integer, timestamptz
) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_propagation_archive_lifecycle_class(
  uuid, text, text, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_propagation_archive_replica(
  uuid, text, text, text, bigint, boolean, text, jsonb
) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_propagation_archive_replica_health(timestamptz)
  TO service_role;

COMMENT ON FUNCTION public.compact_propagation_forecast_payload_manifest(
  uuid, boolean, integer, timestamptz
) IS 'Clears bounded raw forecast JSON only after sealed archive, restore, controls, exact source count, and fresh object inventory gates pass.';
