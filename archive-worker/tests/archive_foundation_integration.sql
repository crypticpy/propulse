\set ON_ERROR_STOP on
BEGIN;

DO $$
BEGIN
  ASSERT NOT (SELECT archive_enabled FROM public.propagation_archive_controls WHERE singleton);
  ASSERT NOT (SELECT pruning_enabled FROM public.propagation_archive_controls WHERE singleton);
  ASSERT (SELECT restore_gate_required FROM public.propagation_archive_controls WHERE singleton);
  ASSERT (SELECT public = false FROM storage.buckets WHERE id = 'propagation-archives');
  ASSERT NOT has_function_privilege(
    'anon',
    'public.prune_propagation_archive_manifest(uuid,integer,timestamptz)',
    'EXECUTE'
  );
  ASSERT has_function_privilege(
    'service_role',
    'public.prune_propagation_archive_manifest(uuid,integer,timestamptz)',
    'EXECUTE'
  );
  ASSERT NOT has_function_privilege(
    'anon', 'public.prune_wspr_observations(interval)', 'EXECUTE'
  );
  ASSERT has_function_privilege(
    'service_role', 'public.prune_wspr_observations(interval)', 'EXECUTE'
  );
END;
$$;

DO $$
BEGIN
  BEGIN
    PERFORM public.set_propagation_archive_controls(true, true, 'must fail');
    RAISE EXCEPTION 'pruning enabled without restore fixtures';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'all five Phase 1 dataset restore gates%' THEN RAISE; END IF;
  END;
END;
$$;

SELECT public.set_propagation_archive_controls(
  true, false, 'integration archive export only'
);
SELECT public.set_propagation_archive_dataset_controls(
  'spot_history_v1', true, false, 'integration fixture'
);

DO $$
BEGIN
  BEGIN
    PERFORM public.register_propagation_archive_manifest(
      'spot_history_v1', 2,
      '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z',
      'spot_history_v1/schema=2/invalid.parquet.zst',
      0, null, null, '{}', repeat('8', 64), 0, 1, repeat('b', 40)
    );
    RAISE EXCEPTION 'unknown archive schema version accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'archive schema version is not registered%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.register_propagation_archive_manifest(
      'spot_history_v1', 1,
      '2026-01-01T00:00:00Z', '2026-01-01T01:00:00Z',
      'spot_history_v1/schema=1/invalid.parquet.zst',
      0, null, null, '{}', repeat('8', 64), 0, 1, repeat('b', 40)
    );
    RAISE EXCEPTION 'unaligned archive range accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'archive range is not one aligned%' THEN RAISE; END IF;
  END;
END;
$$;

INSERT INTO public.spot_history (
  source, spotted_at, tx_callsign, rx_callsign, frequency_khz, band, mode
) VALUES (
  'pskreporter', '2026-01-01T01:00:00Z', 'FIXTURE1', 'FIXTURE2',
  14074, '20m', 'FT8'
);

SELECT public.register_propagation_archive_manifest(
  'spot_history_v1', 1,
  '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z',
  'spot_history_v1/schema=1/year=2026/month=01/day=01/part-' || repeat('a', 64) || '.parquet.zst',
  1, '2026-01-01T01:00:00Z', '2026-01-01T01:00:00Z',
  '{"pskreporter":1}', repeat('a', 64), 100, 50, repeat('b', 40)
) AS spot_manifest_id \gset

DO $$
BEGIN
  BEGIN
    PERFORM public.verify_propagation_archive_manifest(
      (SELECT id FROM public.propagation_archive_manifests
       WHERE dataset = 'spot_history_v1'),
      '{"remote_size_verified":true}'
    );
    RAISE EXCEPTION 'incomplete verification accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'archive verification is incomplete' THEN RAISE; END IF;
  END;
END;
$$;

SELECT public.verify_propagation_archive_manifest(
  :'spot_manifest_id',
  '{
    "remote_size_verified": true,
    "remote_sha256_verified": true,
    "parquet_read_verified": true,
    "row_count_verified": true,
    "source_bounds_verified": true,
    "aggregate_reconciliation_verified": true,
    "watermark_coverage_verified": true
  }'
);
SELECT public.seal_propagation_archive_manifest(:'spot_manifest_id');
SELECT public.record_propagation_archive_restore(
  :'spot_manifest_id', 'integration-validation', 1, repeat('a', 64),
  true, true, true, true, '{"fixture":true}'
);
SELECT public.set_propagation_archive_dataset_controls(
  'spot_history_v1', true, true, 'spot restore gate passed'
);

INSERT INTO public.space_weather_forecast_payloads (
  payload_sha256, source, product, issued_at, ingested_at,
  parser_version, source_url, raw_payload, created_at
) VALUES (
  repeat('9', 64), 'noaa', '45-day', '2025-01-15T00:00:00Z',
  '2025-01-15T00:01:00Z', 'integration-v1',
  'https://example.invalid/integration', '{"fixture":true}',
  '2025-01-15T00:01:00Z'
);

DO $$
DECLARE
  exact_bytes bytea := convert_to('{"exact": true}\n', 'UTF8');
  exact_hash text;
BEGIN
  exact_hash := encode(extensions.digest(exact_bytes, 'sha256'), 'hex');
  INSERT INTO public.space_weather_forecast_payloads (
    payload_sha256, source, product, issued_at, ingested_at,
    parser_version, source_url, raw_payload, created_at,
    source_object_bucket, source_object_path, source_object_sha256,
    source_object_bytes, source_object_verified_at
  ) VALUES (
    exact_hash, 'noaa', 'byte-envelope-fixture', '2026-01-01T00:00:00Z',
    '2026-01-01T00:01:00Z', 'forecast-v2-integration',
    'https://example.invalid/byte-envelope',
    jsonb_build_object(
      'content_type', 'application/json',
      'encoding', 'base64',
      'body_base64', encode(exact_bytes, 'base64')
    ),
    '2026-01-01T00:01:00Z',
    'propagation-archives',
    'forecast_payload_bytes_v1/schema=1/year=2026/month=01/day=01/payload-'
      || exact_hash || '.bin',
    exact_hash, octet_length(exact_bytes), '2026-01-01T00:01:00Z'
  );
  BEGIN
    INSERT INTO public.space_weather_forecast_payloads (
      payload_sha256, source, product, issued_at, ingested_at,
      parser_version, source_url, raw_payload, created_at
    ) VALUES (
      repeat('8', 64), 'noaa', 'invalid-byte-envelope',
      '2026-01-02T00:00:00Z', '2026-01-02T00:01:00Z',
      'integration-v1', 'https://example.invalid/invalid-byte-envelope',
      jsonb_build_object(
        'content_type', 'application/json',
        'encoding', 'base64',
        'body_base64', encode(exact_bytes, 'base64')
      ),
      '2026-01-02T00:01:00Z'
    );
    RAISE EXCEPTION 'mismatched forecast payload SHA-256 accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'forecast payload SHA-256 does not match preserved bytes' THEN
      RAISE;
    END IF;
  END;
  DELETE FROM public.space_weather_forecast_payloads
  WHERE payload_sha256 = exact_hash;
END;
$$;

DO $$
DECLARE
  item record;
  manifest_id uuid;
  marker text;
  range_end timestamptz;
  fixture_rows bigint;
  fixture_time timestamptz;
  fixture_counts jsonb;
BEGIN
  FOR item IN
    SELECT * FROM (VALUES
      ('wspr_observations_v1', 'c'),
      ('solar_snapshots_v1', 'd'),
      ('path_hourly_stats_v1', 'e'),
      ('forecast_payloads_v1', 'f')
    ) AS fixtures(dataset, marker)
  LOOP
    PERFORM public.set_propagation_archive_dataset_controls(
      item.dataset, true, false, 'integration fixture'
    );
    marker := repeat(item.marker, 64);
    range_end := CASE
      WHEN item.dataset = 'wspr_observations_v1'
        THEN '2025-01-01T01:00:00Z'::timestamptz
      ELSE '2025-02-01T00:00:00Z'::timestamptz
    END;
    fixture_rows := CASE WHEN item.dataset = 'forecast_payloads_v1' THEN 1 ELSE 0 END;
    fixture_time := CASE WHEN item.dataset = 'forecast_payloads_v1'
      THEN '2025-01-15T00:00:00Z'::timestamptz ELSE null END;
    fixture_counts := CASE WHEN item.dataset = 'forecast_payloads_v1'
      THEN '{"45-day":1}'::jsonb ELSE '{}'::jsonb END;
    manifest_id := public.register_propagation_archive_manifest(
      item.dataset, 1,
      '2025-01-01T00:00:00Z', range_end,
      item.dataset || '/schema=1/year=2025/month=01/part-' || marker || '.parquet.zst',
      fixture_rows, fixture_time, fixture_time, fixture_counts,
      marker, 100, 50, repeat('b', 40)
    );
    PERFORM public.verify_propagation_archive_manifest(
      manifest_id,
      '{
        "remote_size_verified": true,
        "remote_sha256_verified": true,
        "parquet_read_verified": true,
        "row_count_verified": true,
        "source_bounds_verified": true,
        "aggregate_reconciliation_verified": true,
        "watermark_coverage_verified": true
      }'
    );
    PERFORM public.seal_propagation_archive_manifest(manifest_id);
    PERFORM public.record_propagation_archive_restore(
      manifest_id, 'integration-validation', fixture_rows, marker,
      true, true, true, true, '{"fixture":true}'
    );
  END LOOP;
END;
$$;

DO $$
DECLARE
  archived_hash constant text := repeat('7', 64);
BEGIN
  INSERT INTO public.space_weather_forecast_payloads (
    payload_sha256, source, product, issued_at, ingested_at,
    parser_version, source_url, raw_payload, created_at,
    archive_manifest_id, archive_object_bucket, archive_object_path,
    raw_payload_bytes, raw_payload_archived_at,
    source_object_bucket, source_object_path, source_object_sha256,
    source_object_bytes, source_object_verified_at
  ) VALUES (
    archived_hash, 'noaa', 'archived-v2-trigger-fixture',
    '2025-01-16T00:00:00Z', '2025-01-16T00:01:00Z',
    'forecast-v2-integration', 'https://example.invalid/archived-v2', null,
    '2025-01-16T00:01:00Z',
    (SELECT id FROM public.propagation_archive_manifests
     WHERE dataset = 'forecast_payloads_v1' LIMIT 1),
    'propagation-archives', 'forecast_payloads_v1/archived-v2.parquet.zst',
    128, '2026-07-19T00:00:00Z',
    'propagation-archives',
    'forecast_payload_bytes_v1/payload-' || archived_hash || '.bin',
    archived_hash, 128, '2026-07-19T00:00:00Z'
  );
  ASSERT (SELECT raw_payload IS NULL
          FROM public.space_weather_forecast_payloads
          WHERE payload_sha256 = archived_hash);
  DELETE FROM public.space_weather_forecast_payloads
  WHERE payload_sha256 = archived_hash;
END;
$$;

SELECT public.set_propagation_archive_controls(
  true, true, 'all five integration restore fixtures passed'
);

DO $$
BEGIN
  BEGIN
    PERFORM public.prune_propagation_archive_manifest(
      (SELECT id FROM public.propagation_archive_manifests
       WHERE dataset = 'spot_history_v1'),
      100, '2026-07-19T00:00:00Z'
    );
    RAISE EXCEPTION 'pruning accepted a manifest absent from object reconciliation';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'a fresh passing object inventory reconciliation%' THEN RAISE; END IF;
  END;
END;
$$;

SELECT public.record_propagation_archive_reconciliation(
  5, 5, ARRAY[]::text[], ARRAY[]::text[], '[]'::jsonb,
  '{"fixture":true}'::jsonb
);

SELECT public.set_propagation_archive_lifecycle_class(
  :'spot_manifest_id', 'research_locked', 'integration research hold',
  'hold:integration-window'
);
DO $$
BEGIN
  ASSERT jsonb_array_length(
    public.get_propagation_archive_replica_health(now())->'alerts'
  ) = 1;
  BEGIN
    PERFORM public.set_propagation_archive_lifecycle_class(
      (SELECT id FROM public.propagation_archive_manifests
       WHERE dataset = 'spot_history_v1'),
      'ordinary', 'invalid release', 'hold:not-a-release'
    );
    RAISE EXCEPTION 'locked evidence released without release reference';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'locked evidence release requires a release reference' THEN RAISE; END IF;
  END;
END;
$$;
SELECT public.record_propagation_archive_replica(
  :'spot_manifest_id', 'integration-dr-copy', repeat('6', 64),
  repeat('a', 64), 50, true, repeat('7', 64), '{"fixture":true}'
);
DO $$
BEGIN
  ASSERT jsonb_array_length(
    public.get_propagation_archive_replica_health(now())->'alerts'
  ) = 0;
END;
$$;
SELECT public.set_propagation_archive_lifecycle_class(
  :'spot_manifest_id', 'ordinary', 'integration hold released',
  'release:integration-window'
);

SELECT public.set_propagation_forecast_compaction(
  true, 'integration forecast archive and restore gates passed'
);
SELECT public.run_propagation_forecast_payload_compaction(
  true, 100, '2026-07-19T00:00:00Z'
) AS forecast_compaction_result;
DO $$
BEGIN
  ASSERT (
    SELECT raw_payload IS NULL
      AND archive_manifest_id IS NOT NULL
      AND archive_object_bucket = 'propagation-archives'
      AND raw_payload_bytes > 0
      AND raw_payload_archived_at IS NOT NULL
    FROM public.space_weather_forecast_payloads
    WHERE payload_sha256 = repeat('9', 64)
  );
  ASSERT NOT has_column_privilege(
    'anon', 'public.space_weather_forecast_payloads', 'raw_payload', 'SELECT'
  );
END;
$$;

-- A late row inside an already sealed range must stop deletion.
INSERT INTO public.spot_history (
  source, spotted_at, tx_callsign, rx_callsign, frequency_khz, band, mode
) VALUES (
  'pskreporter', '2026-01-01T02:00:00Z', 'LATEFIX1', 'LATEFIX2',
  14075, '20m', 'FT8'
);

DO $$
BEGIN
  BEGIN
    PERFORM public.prune_propagation_archive_manifest(
      (SELECT id FROM public.propagation_archive_manifests
       WHERE dataset = 'spot_history_v1'),
      100, '2026-07-19T00:00:00Z'
    );
    RAISE EXCEPTION 'late source row was deleted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'source rows no longer reconcile with sealed manifest%' THEN RAISE; END IF;
  END;
END;
$$;

DELETE FROM public.spot_history WHERE tx_callsign = 'LATEFIX1';
SELECT public.prune_propagation_archive_manifest(
  :'spot_manifest_id', 100, '2026-07-19T00:00:00Z'
) AS prune_result;

DO $$
BEGIN
  ASSERT (SELECT pruned_rows = row_count AND pruned_at IS NOT NULL
          FROM public.propagation_archive_manifests
          WHERE dataset = 'spot_history_v1');
  ASSERT (SELECT count(*) = 0 FROM public.spot_history
          WHERE spotted_at >= '2026-01-01T00:00:00Z'
            AND spotted_at < '2026-01-02T00:00:00Z');
END;
$$;

ROLLBACK;
