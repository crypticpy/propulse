-- Bind monthly archive lifecycle transitions to the source coverage evidence
-- that existed while the object was produced. Existing archive functions stay
-- callable; triggers make coverage-bearing datasets fail closed.

ALTER TABLE public.propagation_archive_datasets
  ADD COLUMN coverage_contract text;

ALTER TABLE public.propagation_archive_manifests
  ADD COLUMN coverage_evidence jsonb;

UPDATE public.propagation_archive_datasets
SET coverage_contract = 'spot-known-gaps-v1', updated_at = now()
WHERE dataset = 'path_hourly_stats_v1';

CREATE FUNCTION public.spot_archive_path_gap_snapshot_range(
  p_range_start timestamptz,
  p_range_end timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
SET timezone = 'UTC'
AS $$
DECLARE
  ranges jsonb;
BEGIN
  IF p_range_start IS NULL OR p_range_end IS NULL
    OR NOT isfinite(p_range_start) OR NOT isfinite(p_range_end)
    OR p_range_start <> date_trunc('hour', p_range_start)
    OR p_range_end <> date_trunc('hour', p_range_end)
    OR p_range_end <= p_range_start
    OR p_range_end > p_range_start + interval '32 days'
    OR p_range_end > clock_timestamp()
  THEN
    RAISE EXCEPTION 'archive coverage range must be a closed aligned interval of at most 32 days';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'start_hour', to_char(g.start_hour, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'end_hour', to_char(g.end_hour, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'recorded_at', to_char(g.recorded_at, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'reason', g.reason
  ) ORDER BY g.start_hour), '[]'::jsonb)
  INTO ranges
  FROM (
    SELECT start_hour, end_hour, recorded_at, reason
    FROM public.collector_aggregation_gaps
    WHERE aggregation = 'path_hourly'
      AND start_hour < p_range_end
      AND end_hour >= p_range_start
    ORDER BY start_hour
    LIMIT 1001
  ) AS g;

  IF jsonb_array_length(ranges) > 1000 THEN
    RAISE EXCEPTION 'archive coverage range exceeds bounded gap limit';
  END IF;

  RETURN jsonb_build_object(
    'version', 1,
    'scope', 'known-gaps-only',
    'range_start', to_char(p_range_start, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'range_end', to_char(p_range_end, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'gaps', ranges
  );
END;
$$;

CREATE FUNCTION public.register_propagation_archive_manifest_with_coverage(
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
  p_coverage_evidence jsonb,
  p_quality_flags text[] DEFAULT '{}',
  p_lifecycle_class text DEFAULT 'ordinary'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  manifest_id uuid;
  manifest_status text;
  current_evidence jsonb;
BEGIN
  manifest_id := public.register_propagation_archive_manifest(
    p_dataset, p_schema_version, p_range_start, p_range_end, p_object_path,
    p_row_count, p_min_source_time, p_max_source_time, p_source_counts,
    p_content_sha256, p_uncompressed_bytes, p_object_bytes, p_exporter_commit,
    p_quality_flags, p_lifecycle_class
  );

  SELECT status INTO STRICT manifest_status
  FROM public.propagation_archive_manifests
  WHERE id = manifest_id
  FOR UPDATE;

  IF manifest_status IN ('uploading', 'failed') THEN
    UPDATE public.propagation_archive_manifests
    SET coverage_evidence = p_coverage_evidence, updated_at = now()
    WHERE id = manifest_id;
  ELSE
    current_evidence := public.reconcile_propagation_archive_coverage(manifest_id);
    IF current_evidence IS NULL
      OR p_coverage_evidence IS DISTINCT FROM current_evidence
    THEN
      RAISE EXCEPTION 'archive retry coverage evidence differs from verified manifest';
    END IF;
  END IF;
  RETURN manifest_id;
END;
$$;

CREATE FUNCTION public.reconcile_propagation_archive_coverage(
  p_manifest_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  manifest public.propagation_archive_manifests%ROWTYPE;
  coverage_contract text;
  current_evidence jsonb;
BEGIN
  SELECT * INTO manifest
  FROM public.propagation_archive_manifests
  WHERE id = p_manifest_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'archive manifest not found';
  END IF;
  SELECT datasets.coverage_contract INTO coverage_contract
  FROM public.propagation_archive_datasets AS datasets
  WHERE datasets.dataset = manifest.dataset;
  IF coverage_contract IS NULL THEN
    RETURN NULL;
  ELSIF coverage_contract <> 'spot-known-gaps-v1' THEN
    RAISE EXCEPTION 'unknown archive coverage contract: %', coverage_contract;
  END IF;
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'archive coverage reconciliation requires read committed isolation';
  END IF;
  PERFORM pg_advisory_xact_lock_shared(584, 5);
  current_evidence := public.spot_archive_path_gap_snapshot_range(
    manifest.range_start, manifest.range_end
  );
  IF manifest.coverage_evidence IS DISTINCT FROM current_evidence THEN
    RAISE EXCEPTION 'archive coverage evidence does not match current source coverage';
  END IF;
  RETURN current_evidence;
END;
$$;

CREATE FUNCTION public.validate_propagation_archive_manifest_coverage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  coverage_contract text;
  current_evidence jsonb;
  guarded_transition boolean;
BEGIN
  -- Once lifecycle proof exists, neither coverage nor the partition identity
  -- can be relabeled by changing the row to a dataset with no contract.
  IF TG_OP = 'UPDATE' AND (
    OLD.status IN ('verified', 'sealed', 'restored')
    OR OLD.verified_at IS NOT NULL OR OLD.sealed_at IS NOT NULL
    OR OLD.pruned_rows > 0
  ) THEN
    IF NEW.coverage_evidence IS DISTINCT FROM OLD.coverage_evidence THEN
      RAISE EXCEPTION 'verified archive coverage evidence is immutable';
    END IF;
    IF NEW.dataset IS DISTINCT FROM OLD.dataset
      OR NEW.schema_version IS DISTINCT FROM OLD.schema_version
      OR NEW.range_start IS DISTINCT FROM OLD.range_start
      OR NEW.range_end IS DISTINCT FROM OLD.range_end
    THEN
      RAISE EXCEPTION 'verified archive coverage identity is immutable';
    END IF;
  END IF;

  SELECT datasets.coverage_contract INTO coverage_contract
  FROM public.propagation_archive_datasets AS datasets
  WHERE datasets.dataset = NEW.dataset;

  IF coverage_contract IS NULL THEN
    RETURN NEW;
  ELSIF coverage_contract <> 'spot-known-gaps-v1' THEN
    RAISE EXCEPTION 'unknown archive coverage contract: %', coverage_contract;
  END IF;
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'archive coverage transition requires read committed isolation';
  END IF;

  guarded_transition := NEW.status IN ('verified', 'sealed', 'restored')
    OR (TG_OP = 'UPDATE' AND NEW.pruned_rows > OLD.pruned_rows);
  IF NOT guarded_transition THEN
    RETURN NEW;
  END IF;

  -- The UPDATE already owns the manifest row lock. Take the shared coverage
  -- lock second so gap writers cannot change evidence through this transition.
  PERFORM pg_advisory_xact_lock_shared(584, 5);
  current_evidence := public.spot_archive_path_gap_snapshot_range(
    NEW.range_start, NEW.range_end
  );
  IF NEW.coverage_evidence IS NULL
    OR NEW.coverage_evidence IS DISTINCT FROM current_evidence
    OR NEW.verification->'coverage_metadata_verified' IS DISTINCT FROM 'true'::jsonb
    OR NEW.verification->'coverage_evidence' IS DISTINCT FROM NEW.coverage_evidence
  THEN
    RAISE EXCEPTION 'archive coverage verification is missing or stale';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_propagation_archive_manifest_coverage
BEFORE INSERT OR UPDATE ON public.propagation_archive_manifests
FOR EACH ROW
EXECUTE FUNCTION public.validate_propagation_archive_manifest_coverage();

CREATE FUNCTION public.validate_propagation_archive_restore_coverage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  manifest public.propagation_archive_manifests%ROWTYPE;
  coverage_contract text;
  current_evidence jsonb;
BEGIN
  IF NOT (NEW.schema_verified AND NEW.counts_verified
    AND NEW.aggregates_verified AND NEW.read_verified)
  THEN
    RETURN NEW;
  END IF;
  SELECT * INTO manifest
  FROM public.propagation_archive_manifests
  WHERE id = NEW.manifest_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'archive manifest not found';
  END IF;

  SELECT datasets.coverage_contract INTO coverage_contract
  FROM public.propagation_archive_datasets AS datasets
  WHERE datasets.dataset = manifest.dataset;
  IF coverage_contract IS NULL THEN
    RETURN NEW;
  ELSIF coverage_contract <> 'spot-known-gaps-v1' THEN
    RAISE EXCEPTION 'unknown archive coverage contract: %', coverage_contract;
  END IF;
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'archive restore coverage requires read committed isolation';
  END IF;

  PERFORM pg_advisory_xact_lock_shared(584, 5);
  current_evidence := public.spot_archive_path_gap_snapshot_range(
    manifest.range_start, manifest.range_end
  );
  IF manifest.coverage_evidence IS NULL
    OR manifest.coverage_evidence IS DISTINCT FROM current_evidence
    OR NEW.details->'checks'->'coverage_metadata_verified' IS DISTINCT FROM 'true'::jsonb
    OR NEW.details->'checks'->'coverage_evidence' IS DISTINCT FROM manifest.coverage_evidence
  THEN
    RAISE EXCEPTION 'restore coverage evidence is missing or stale';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_propagation_archive_restore_coverage
BEFORE INSERT ON public.propagation_archive_restore_receipts
FOR EACH ROW
EXECUTE FUNCTION public.validate_propagation_archive_restore_coverage();

CREATE FUNCTION public.validate_propagation_archive_replica_coverage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  manifest public.propagation_archive_manifests%ROWTYPE;
  coverage_contract text;
  current_evidence jsonb;
BEGIN
  IF NOT coalesce(NEW.read_verified, false) THEN
    RETURN NEW;
  END IF;
  SELECT * INTO manifest
  FROM public.propagation_archive_manifests
  WHERE id = NEW.manifest_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'archive manifest not found';
  END IF;

  SELECT datasets.coverage_contract INTO coverage_contract
  FROM public.propagation_archive_datasets AS datasets
  WHERE datasets.dataset = manifest.dataset;
  IF coverage_contract IS NULL THEN
    RETURN NEW;
  ELSIF coverage_contract <> 'spot-known-gaps-v1' THEN
    RAISE EXCEPTION 'unknown archive coverage contract: %', coverage_contract;
  END IF;
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'archive replica coverage requires read committed isolation';
  END IF;

  PERFORM pg_advisory_xact_lock_shared(584, 5);
  current_evidence := public.spot_archive_path_gap_snapshot_range(
    manifest.range_start, manifest.range_end
  );
  IF manifest.coverage_evidence IS NULL
    OR manifest.coverage_evidence IS DISTINCT FROM current_evidence
    OR NEW.details->'checks'->'coverage_metadata_verified' IS DISTINCT FROM 'true'::jsonb
    OR NEW.details->'checks'->'coverage_evidence' IS DISTINCT FROM manifest.coverage_evidence
  THEN
    RAISE EXCEPTION 'replica coverage evidence is missing or stale';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_propagation_archive_replica_coverage
BEFORE INSERT ON public.propagation_archive_replica_receipts
FOR EACH ROW
EXECUTE FUNCTION public.validate_propagation_archive_replica_coverage();

REVOKE ALL ON FUNCTION public.spot_archive_path_gap_snapshot_range(timestamptz,timestamptz),
  public.register_propagation_archive_manifest_with_coverage(text,integer,timestamptz,timestamptz,text,bigint,timestamptz,timestamptz,jsonb,text,bigint,bigint,text,jsonb,text[],text),
  public.reconcile_propagation_archive_coverage(uuid),
  public.validate_propagation_archive_manifest_coverage(),
  public.validate_propagation_archive_restore_coverage(),
  public.validate_propagation_archive_replica_coverage()
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.spot_archive_path_gap_snapshot_range(timestamptz,timestamptz),
  public.register_propagation_archive_manifest_with_coverage(text,integer,timestamptz,timestamptz,text,bigint,timestamptz,timestamptz,jsonb,text,bigint,bigint,text,jsonb,text[],text),
  public.reconcile_propagation_archive_coverage(uuid)
TO service_role;

NOTIFY pgrst, 'reload schema';
