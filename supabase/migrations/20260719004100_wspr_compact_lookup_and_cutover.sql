-- Stable causal lookup contract, identity-free dual-read telemetry, and
-- fail-closed compact-feature cutover controls.

ALTER FUNCTION public.lookup_wspr_path_lags(
  timestamptz, text, text, text[], text, text
) RENAME TO lookup_wspr_path_lags_legacy;

CREATE OR REPLACE FUNCTION public.jsonb_text_array(p_value jsonb)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT coalesce(array_agg(value ORDER BY ordinal), '{}'::text[])
  FROM jsonb_array_elements_text(coalesce(p_value, '[]'::jsonb))
    WITH ORDINALITY AS item(value, ordinal);
$$;

CREATE OR REPLACE FUNCTION public.lookup_wspr_path_lags_compact_v1(
  p_issue_time timestamptz,
  p_band text,
  p_origin_grid4 text,
  p_target_grids text[],
  p_transform_version text,
  p_provider text
)
RETURNS TABLE (
  target_grid4 text,
  path_success_prev1 double precision,
  path_success_prev2 double precision,
  path_success_prev3 double precision,
  path_success_prev24 double precision,
  path_prev1_available smallint,
  path_prev2_available smallint,
  path_prev3_available smallint,
  path_prev24_available smallint,
  source_watermark timestamptz,
  available_at timestamptz,
  provider text,
  transform_version text,
  quality_flags text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_issue_time IS NULL THEN RAISE EXCEPTION 'issue time is required'; END IF;
  IF p_band NOT IN (
    '160m', '80m', '60m', '40m', '30m',
    '20m', '17m', '15m', '12m', '10m'
  ) THEN RAISE EXCEPTION 'unsupported HF band'; END IF;
  IF p_origin_grid4 IS NULL OR p_origin_grid4 !~ '^[A-R]{2}[0-9]{2}$' THEN
    RAISE EXCEPTION 'invalid origin grid';
  END IF;
  IF coalesce(array_length(p_target_grids, 1), 0) NOT BETWEEN 1 AND 4096 THEN
    RAISE EXCEPTION 'target count must be between 1 and 4096';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(p_target_grids) AS target(value)
    WHERE value !~ '^[A-R]{2}[0-9]{2}$'
  ) THEN RAISE EXCEPTION 'invalid target grid'; END IF;

  RETURN QUERY
  WITH targets AS (
    SELECT DISTINCT value AS grid4 FROM unnest(p_target_grids) AS target(value)
  ), lag_values(lag_hours) AS (
    VALUES (1), (2), (3), (24)
  ), watermarks AS (
    SELECT lag.lag_hours, selected.*
    FROM lag_values AS lag
    CROSS JOIN LATERAL (
      SELECT watermark.*
      FROM public.wspr_feature_watermarks AS watermark
      WHERE watermark.target_hour = date_trunc('hour', p_issue_time)
          - make_interval(hours => lag.lag_hours)
        AND watermark.band = p_band
        AND watermark.provider = p_provider
        AND watermark.transform_version = p_transform_version
        AND watermark.status = 'complete'
        AND watermark.available_at <= p_issue_time
        AND cardinality(watermark.quality_flags) = 0
      ORDER BY watermark.available_at DESC
      LIMIT 1
    ) AS selected
  ), complete_watermarks AS (
    SELECT count(*) = 4 AS passed FROM watermarks
  ), expanded AS (
    SELECT target.grid4, watermark.lag_hours,
      watermark.source_watermark,
      watermark.available_at AS watermark_available_at,
      compact.success_rates,
      compact.cell_quality_flags,
      array_position(compact.rx_grid4s, target.grid4) AS cell_index
    FROM targets AS target
    CROSS JOIN watermarks AS watermark
    CROSS JOIN complete_watermarks AS gate
    LEFT JOIN public.wspr_path_hourly_compact_v1 AS compact
      ON compact.target_hour = watermark.target_hour
     AND compact.band = p_band
     AND compact.tx_grid4 = p_origin_grid4
     AND compact.provider = p_provider
     AND compact.transform_version = p_transform_version
     AND compact.available_at = watermark.available_at
    WHERE gate.passed
  ), pivoted AS (
    SELECT expanded.grid4,
      max(expanded.success_rates[expanded.cell_index])
        FILTER (WHERE expanded.lag_hours = 1)
        AS rate1,
      max(expanded.success_rates[expanded.cell_index])
        FILTER (WHERE expanded.lag_hours = 2)
        AS rate2,
      max(expanded.success_rates[expanded.cell_index])
        FILTER (WHERE expanded.lag_hours = 3)
        AS rate3,
      max(expanded.success_rates[expanded.cell_index])
        FILTER (WHERE expanded.lag_hours = 24)
        AS rate24,
      max(expanded.cell_index) FILTER (WHERE expanded.lag_hours = 1) AS index1,
      max(expanded.cell_index) FILTER (WHERE expanded.lag_hours = 2) AS index2,
      max(expanded.cell_index) FILTER (WHERE expanded.lag_hours = 3) AS index3,
      max(expanded.cell_index) FILTER (WHERE expanded.lag_hours = 24) AS index24,
      max(expanded.source_watermark)
        FILTER (WHERE expanded.lag_hours = 1) AS watermark1,
      max(expanded.watermark_available_at) AS latest_available,
      (array_agg(
        expanded.cell_quality_flags -> (expanded.cell_index - 1)
        ORDER BY expanded.lag_hours
      ) FILTER (
        WHERE expanded.lag_hours = 1 AND expanded.cell_index IS NOT NULL
      ))[1] AS flags1,
      (array_agg(
        expanded.cell_quality_flags -> (expanded.cell_index - 1)
        ORDER BY expanded.lag_hours
      ) FILTER (
        WHERE expanded.lag_hours = 2 AND expanded.cell_index IS NOT NULL
      ))[1] AS flags2,
      (array_agg(
        expanded.cell_quality_flags -> (expanded.cell_index - 1)
        ORDER BY expanded.lag_hours
      ) FILTER (
        WHERE expanded.lag_hours = 3 AND expanded.cell_index IS NOT NULL
      ))[1] AS flags3,
      (array_agg(
        expanded.cell_quality_flags -> (expanded.cell_index - 1)
        ORDER BY expanded.lag_hours
      ) FILTER (
        WHERE expanded.lag_hours = 24 AND expanded.cell_index IS NOT NULL
      ))[1] AS flags24
    FROM expanded
    GROUP BY expanded.grid4
  )
  SELECT pivoted.grid4,
    coalesce(rate1, 0::double precision),
    coalesce(rate2, 0::double precision),
    coalesce(rate3, 0::double precision),
    coalesce(rate24, 0::double precision),
    (CASE WHEN index1 IS NULL THEN 0 ELSE 1 END)::smallint,
    (CASE WHEN index2 IS NULL THEN 0 ELSE 1 END)::smallint,
    (CASE WHEN index3 IS NULL THEN 0 ELSE 1 END)::smallint,
    (CASE WHEN index24 IS NULL THEN 0 ELSE 1 END)::smallint,
    pivoted.watermark1,
    pivoted.latest_available,
    p_provider,
    p_transform_version,
    public.jsonb_text_array(pivoted.flags1)
      || public.jsonb_text_array(pivoted.flags2)
      || public.jsonb_text_array(pivoted.flags3)
      || public.jsonb_text_array(pivoted.flags24)
  FROM pivoted
  ORDER BY pivoted.grid4;
END;
$$;

CREATE OR REPLACE FUNCTION public.compare_wspr_path_lag_readers(
  p_issue_time timestamptz,
  p_band text,
  p_origin_grid4 text,
  p_target_grids text[],
  p_transform_version text,
  p_provider text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  legacy_result jsonb;
  compact_result jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(to_jsonb(row_value) ORDER BY target_grid4), '[]'::jsonb)
  INTO legacy_result
  FROM public.lookup_wspr_path_lags_legacy(
    p_issue_time, p_band, p_origin_grid4, p_target_grids,
    p_transform_version, p_provider
  ) AS row_value;
  SELECT coalesce(jsonb_agg(to_jsonb(row_value) ORDER BY target_grid4), '[]'::jsonb)
  INTO compact_result
  FROM public.lookup_wspr_path_lags_compact_v1(
    p_issue_time, p_band, p_origin_grid4, p_target_grids,
    p_transform_version, p_provider
  ) AS row_value;
  RETURN jsonb_build_object(
    'matched', legacy_result = compact_result,
    'legacy_rows', jsonb_array_length(legacy_result),
    'compact_rows', jsonb_array_length(compact_result),
    'legacy_response', legacy_result,
    'compact_response', compact_result
  );
END;
$$;

CREATE TABLE public.wspr_compact_parity_observations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  issue_hour timestamptz NOT NULL,
  band text NOT NULL,
  provider text NOT NULL,
  transform_version text NOT NULL,
  requested_targets integer NOT NULL CHECK (requested_targets BETWEEN 1 AND 4096),
  legacy_rows integer NOT NULL CHECK (legacy_rows >= 0),
  compact_rows integer NOT NULL CHECK (compact_rows >= 0),
  matched boolean NOT NULL,
  duration_ms integer NOT NULL CHECK (duration_ms >= 0),
  observed_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.lookup_wspr_path_lags(
  p_issue_time timestamptz,
  p_band text,
  p_origin_grid4 text,
  p_target_grids text[],
  p_transform_version text,
  p_provider text
)
RETURNS TABLE (
  target_grid4 text,
  path_success_prev1 double precision,
  path_success_prev2 double precision,
  path_success_prev3 double precision,
  path_success_prev24 double precision,
  path_prev1_available smallint,
  path_prev2_available smallint,
  path_prev3_available smallint,
  path_prev24_available smallint,
  source_watermark timestamptz,
  available_at timestamptz,
  provider text,
  transform_version text,
  quality_flags text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  control_mode text;
  comparison jsonb;
  started_at timestamptz := clock_timestamp();
BEGIN
  SELECT mode INTO control_mode
  FROM public.wspr_compact_feature_controls WHERE singleton;
  IF control_mode IN ('dual_write', 'shadow_read') THEN
    comparison := public.compare_wspr_path_lag_readers(
      p_issue_time, p_band, p_origin_grid4, p_target_grids,
      p_transform_version, p_provider
    );
    INSERT INTO public.wspr_compact_parity_observations (
      issue_hour, band, provider, transform_version, requested_targets,
      legacy_rows, compact_rows, matched, duration_ms
    ) VALUES (
      date_trunc('hour', p_issue_time), p_band, p_provider,
      p_transform_version, cardinality(p_target_grids),
      (comparison ->> 'legacy_rows')::integer,
      (comparison ->> 'compact_rows')::integer,
      (comparison ->> 'matched')::boolean,
      greatest(0, round(extract(epoch FROM clock_timestamp() - started_at) * 1000)::integer)
    );
  END IF;

  IF control_mode = 'compact'
    OR (control_mode = 'shadow_read' AND (comparison ->> 'matched')::boolean)
  THEN
    RETURN QUERY SELECT * FROM public.lookup_wspr_path_lags_compact_v1(
      p_issue_time, p_band, p_origin_grid4, p_target_grids,
      p_transform_version, p_provider
    );
  ELSE
    RETURN QUERY SELECT * FROM public.lookup_wspr_path_lags_legacy(
      p_issue_time, p_band, p_origin_grid4, p_target_grids,
      p_transform_version, p_provider
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_wspr_compact_benchmark(
  p_range_start timestamptz,
  p_range_end timestamptz,
  p_source_cells bigint,
  p_lookup_groups integer,
  p_representative boolean,
  p_selected_candidate text,
  p_exact_cell_parity boolean,
  p_exact_lag_response_parity boolean,
  p_railway_concurrency integer,
  p_row_form_metrics jsonb,
  p_postgres_array_metrics jsonb,
  p_parquet_cache_metrics jsonb,
  p_failure_behavior jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  receipt_id uuid;
  passed boolean;
BEGIN
  IF p_selected_candidate NOT IN ('postgres_arrays_v1', 'parquet_cache_v1')
    OR jsonb_typeof(p_row_form_metrics) <> 'object'
    OR jsonb_typeof(p_postgres_array_metrics) <> 'object'
    OR jsonb_typeof(p_parquet_cache_metrics) <> 'object'
    OR jsonb_typeof(p_failure_behavior) <> 'object'
    OR NOT (p_row_form_metrics ?& ARRAY['lookup_p50_ms', 'lookup_p95_ms', 'bytes_per_path'])
    OR NOT (p_postgres_array_metrics ?& ARRAY[
      'lookup_p50_ms', 'lookup_p95_ms', 'bytes_per_path', 'build_ms'
    ])
    OR NOT (p_parquet_cache_metrics ?& ARRAY[
      'cold_p95_ms', 'warm_p95_ms', 'bytes_per_path', 'build_ms', 'object_requests'
    ])
    OR NOT (p_failure_behavior ?& ARRAY[
      'missing_object', 'corrupt_hash', 'stale_watermark', 'cache_miss'
    ])
  THEN
    RAISE EXCEPTION 'WSPR compact benchmark receipt is incomplete';
  END IF;
  passed := p_exact_cell_parity AND p_exact_lag_response_parity
    AND (NOT p_representative OR (
      p_source_cells >= 100000 AND p_lookup_groups >= 25
      AND p_railway_concurrency >= 4
      AND (p_failure_behavior ->> 'missing_object')::boolean
      AND (p_failure_behavior ->> 'corrupt_hash')::boolean
      AND (p_failure_behavior ->> 'stale_watermark')::boolean
      AND (p_failure_behavior ->> 'cache_miss')::boolean
    ));
  INSERT INTO public.wspr_compact_benchmark_receipts (
    range_start, range_end, source_cells, lookup_groups, representative,
    selected_candidate, exact_cell_parity, exact_lag_response_parity,
    railway_concurrency, passed, row_form_metrics,
    postgres_array_metrics, parquet_cache_metrics, failure_behavior
  ) VALUES (
    p_range_start, p_range_end, p_source_cells, p_lookup_groups,
    p_representative, p_selected_candidate, p_exact_cell_parity,
    p_exact_lag_response_parity, p_railway_concurrency, passed,
    p_row_form_metrics, p_postgres_array_metrics, p_parquet_cache_metrics,
    p_failure_behavior
  ) RETURNING id INTO receipt_id;
  RETURN receipt_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_wspr_compact_reader_gate(
  p_reconciliation_id uuid,
  p_request_count integer,
  p_concurrent_clients integer,
  p_cold_p95_ms double precision,
  p_warm_p95_ms double precision,
  p_details jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  reconciliation_time timestamptz;
  parity_count bigint;
  mismatch_count bigint;
  receipt_id uuid;
BEGIN
  SELECT reconciled_at INTO reconciliation_time
  FROM public.wspr_compact_reconciliations
  WHERE id = p_reconciliation_id AND passed;
  IF reconciliation_time IS NULL THEN
    RAISE EXCEPTION 'a passing compact reconciliation is required';
  END IF;
  SELECT count(*), count(*) FILTER (WHERE NOT matched)
  INTO parity_count, mismatch_count
  FROM public.wspr_compact_parity_observations
  WHERE observed_at >= reconciliation_time;
  IF p_request_count < 100 OR p_request_count > parity_count
    OR mismatch_count > 0 OR p_concurrent_clients < 1
    OR p_cold_p95_ms < 0 OR p_warm_p95_ms < 0
    OR jsonb_typeof(p_details) <> 'object'
  THEN
    RAISE EXCEPTION 'compact reader gate lacks exact load/parity evidence';
  END IF;
  INSERT INTO public.wspr_compact_reader_receipts (
    reconciliation_id, request_count, concurrent_clients,
    exact_response_parity, cold_p95_ms, warm_p95_ms, passed, details
  ) VALUES (
    p_reconciliation_id, p_request_count, p_concurrent_clients,
    true, p_cold_p95_ms, p_warm_p95_ms, true, p_details
  ) RETURNING id INTO receipt_id;
  UPDATE public.wspr_compact_feature_controls
  SET reader_receipt_id = receipt_id,
    updated_at = now(), updated_by = current_user
  WHERE singleton;
  RETURN receipt_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_wspr_compact_feature_mode(
  p_mode text,
  p_benchmark_receipt_id uuid,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  control public.wspr_compact_feature_controls%ROWTYPE;
  benchmark_ok boolean;
  reconciliation_ok boolean;
  reader_ok boolean;
BEGIN
  IF p_reason IS NULL OR length(p_reason) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'compact cutover reason is required';
  END IF;
  IF p_mode NOT IN ('legacy', 'dual_write', 'shadow_read', 'compact') THEN
    RAISE EXCEPTION 'invalid compact feature mode';
  END IF;
  SELECT * INTO control FROM public.wspr_compact_feature_controls
  WHERE singleton FOR UPDATE;
  IF p_mode = 'dual_write' THEN
    SELECT passed AND representative
      AND selected_candidate = 'postgres_arrays_v1'
    INTO benchmark_ok
    FROM public.wspr_compact_benchmark_receipts
    WHERE id = p_benchmark_receipt_id;
    IF control.mode <> 'legacy' OR NOT coalesce(benchmark_ok, false) THEN
      RAISE EXCEPTION 'compact dual write requires a representative three-candidate benchmark';
    END IF;
  ELSIF p_mode = 'shadow_read' THEN
    SELECT passed INTO reconciliation_ok
    FROM public.wspr_compact_reconciliations
    WHERE id = control.reconciliation_id;
    SELECT passed INTO reader_ok
    FROM public.wspr_compact_reader_receipts
    WHERE id = control.reader_receipt_id;
    IF control.mode <> 'dual_write' OR NOT control.backfill_complete
      OR NOT coalesce(reconciliation_ok, false)
      OR NOT coalesce(reader_ok, false)
      OR EXISTS (
        SELECT 1 FROM public.wspr_compact_write_failures
        WHERE resolved_at IS NULL
      )
    THEN
      RAISE EXCEPTION 'compact shadow read requires backfill, parity, load, and clean writes';
    END IF;
  ELSIF p_mode = 'compact' THEN
    IF control.mode <> 'shadow_read'
      OR control.reconciliation_id IS NULL OR control.reader_receipt_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.wspr_compact_write_failures
        WHERE resolved_at IS NULL
      )
    THEN
      RAISE EXCEPTION 'compact writer requires a passing shadow-read stage';
    END IF;
  END IF;

  UPDATE public.wspr_compact_feature_controls
  SET mode = p_mode,
    benchmark_receipt_id = CASE WHEN p_mode = 'dual_write'
      THEN p_benchmark_receipt_id ELSE benchmark_receipt_id END,
    row_form_retirement_enabled = CASE WHEN p_mode = 'legacy'
      THEN false ELSE row_form_retirement_enabled END,
    updated_at = now(), updated_by = current_user, reason = p_reason
  WHERE singleton;
  INSERT INTO public.wspr_compact_cutover_audit (
    prior_mode, next_mode, benchmark_receipt_id,
    reconciliation_id, reader_receipt_id, reason
  ) VALUES (
    control.mode, p_mode,
    coalesce(p_benchmark_receipt_id, control.benchmark_receipt_id),
    control.reconciliation_id, control.reader_receipt_id, p_reason
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.enable_wspr_row_form_retirement(
  p_manifest_id uuid,
  p_reason text,
  p_now timestamptz DEFAULT now()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  control public.wspr_compact_feature_controls%ROWTYPE;
  manifest public.propagation_archive_manifests%ROWTYPE;
  inventory public.propagation_archive_reconciliations%ROWTYPE;
BEGIN
  IF p_reason IS NULL OR length(p_reason) NOT BETWEEN 1 AND 1000 OR p_now IS NULL THEN
    RAISE EXCEPTION 'row-form retirement reason and time are required';
  END IF;
  SELECT * INTO control FROM public.wspr_compact_feature_controls
  WHERE singleton FOR UPDATE;
  IF control.mode <> 'compact' OR control.reader_receipt_id IS NULL THEN
    RAISE EXCEPTION 'row-form retirement requires authoritative compact mode';
  END IF;
  SELECT * INTO manifest FROM public.propagation_archive_manifests
  WHERE id = p_manifest_id AND dataset = 'wspr_path_features_v1'
    AND status IN ('sealed', 'restored') AND sealed_at IS NOT NULL
    AND cardinality(quality_flags) = 0;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.propagation_archive_restore_receipts
    WHERE manifest_id = p_manifest_id AND passed
  ) THEN
    RAISE EXCEPTION 'sealed and restored row-form archive is required';
  END IF;
  SELECT * INTO inventory FROM public.propagation_archive_reconciliations
  ORDER BY reconciled_at DESC LIMIT 1;
  IF NOT FOUND OR NOT inventory.passed
    OR inventory.reconciled_at < manifest.sealed_at
    OR inventory.reconciled_at < p_now - interval '36 hours'
  THEN
    RAISE EXCEPTION 'fresh object inventory is required for row-form retirement';
  END IF;
  UPDATE public.wspr_compact_feature_controls
  SET row_form_retirement_enabled = true,
    updated_at = now(), updated_by = current_user, reason = p_reason
  WHERE singleton;
END;
$$;

-- Register the compact representation as its own versioned archive contract.
ALTER TABLE public.propagation_archive_datasets
  DROP CONSTRAINT propagation_archive_dataset_source_contract;
INSERT INTO public.propagation_archive_datasets (
  dataset, source_relation, time_column, key_column, time_basis,
  partition_granularity, hot_retention, prune_supported, schema_version
) VALUES (
  'wspr_path_features_compact_v1',
  'public.wspr_path_hourly_compact_v1',
  'target_hour', 'id', 'event', 'hour', interval '30 hours', false, 1
)
ON CONFLICT (dataset) DO UPDATE SET
  source_relation = excluded.source_relation,
  time_column = excluded.time_column,
  key_column = excluded.key_column,
  partition_granularity = excluded.partition_granularity,
  hot_retention = excluded.hot_retention,
  prune_supported = excluded.prune_supported,
  schema_version = excluded.schema_version,
  updated_at = now();
ALTER TABLE public.propagation_archive_datasets
  ADD CONSTRAINT propagation_archive_dataset_source_contract_v2 CHECK (
    (dataset = 'spot_history_v1'
      AND source_relation = 'public.spot_history_live'
      AND time_column = 'spotted_at' AND key_column = 'id')
    OR (dataset = 'wspr_observations_v1'
      AND source_relation = 'public.wspr_observations_live'
      AND time_column = 'received_at' AND key_column = 'id')
    OR (dataset = 'wspr_path_features_v1'
      AND source_relation = 'public.wspr_path_hourly_features'
      AND time_column = 'target_hour' AND key_column = 'id')
    OR (dataset = 'wspr_path_features_compact_v1'
      AND source_relation = 'public.wspr_path_hourly_compact_v1'
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
  );

ALTER TABLE public.wspr_compact_parity_observations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wspr_compact_parity_observations
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.wspr_compact_parity_observations TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.wspr_compact_parity_observations_id_seq
  TO service_role;

REVOKE ALL ON FUNCTION public.jsonb_text_array(jsonb),
  public.lookup_wspr_path_lags_legacy(timestamptz, text, text, text[], text, text),
  public.lookup_wspr_path_lags_compact_v1(timestamptz, text, text, text[], text, text),
  public.compare_wspr_path_lag_readers(timestamptz, text, text, text[], text, text),
  public.lookup_wspr_path_lags(timestamptz, text, text, text[], text, text),
  public.record_wspr_compact_benchmark(timestamptz, timestamptz, bigint, integer, boolean, text, boolean, boolean, integer, jsonb, jsonb, jsonb, jsonb),
  public.record_wspr_compact_reader_gate(uuid, integer, integer, double precision, double precision, jsonb),
  public.set_wspr_compact_feature_mode(text, uuid, text),
  public.enable_wspr_row_form_retirement(uuid, text, timestamptz)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.lookup_wspr_path_lags_legacy(timestamptz, text, text, text[], text, text),
  public.lookup_wspr_path_lags_compact_v1(timestamptz, text, text, text[], text, text),
  public.compare_wspr_path_lag_readers(timestamptz, text, text, text[], text, text),
  public.lookup_wspr_path_lags(timestamptz, text, text, text[], text, text),
  public.record_wspr_compact_benchmark(timestamptz, timestamptz, bigint, integer, boolean, text, boolean, boolean, integer, jsonb, jsonb, jsonb, jsonb),
  public.record_wspr_compact_reader_gate(uuid, integer, integer, double precision, double precision, jsonb),
  public.set_wspr_compact_feature_mode(text, uuid, text),
  public.enable_wspr_row_form_retirement(uuid, text, timestamptz)
TO service_role;
GRANT EXECUTE ON FUNCTION public.jsonb_text_array(jsonb) TO service_role;

COMMENT ON FUNCTION public.lookup_wspr_path_lags(
  timestamptz, text, text, text[], text, text
) IS
  'Stable causal WSPR contract. Dual/shadow modes compare complete ordered row and compact responses without retaining grid identities in telemetry.';
