\set ON_ERROR_STOP on

BEGIN;

CREATE FUNCTION pg_temp.assert_true(p_condition boolean, p_message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT coalesce(p_condition, false) THEN
    RAISE EXCEPTION 'integration assertion failed: %', p_message;
  END IF;
END;
$$;

SELECT pg_temp.assert_true(
  (SELECT bool_and(mode = 'legacy')
   FROM public.propagation_hot_store_cutovers),
  'partitioned hot stores must default to legacy'
);
SELECT pg_temp.assert_true(
  (SELECT mode = 'legacy' FROM public.wspr_compact_feature_controls),
  'compact WSPR must default to row form'
);
SELECT pg_temp.assert_true(
  (SELECT bool_and(relkind = 'p')
   FROM pg_class
   WHERE oid IN (
     'public.spot_history_partitioned_v1'::regclass,
     'public.wspr_observations_partitioned_v1'::regclass,
     'public.wspr_path_hourly_compact_v1'::regclass
   )),
  'all hot-store replacements must be native partitioned tables'
);
SELECT pg_temp.assert_true(
  NOT has_table_privilege('anon', 'public.propagation_hot_store_cutovers', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'public.wspr_compact_feature_controls', 'SELECT'),
  'cutover controls must remain service-only'
);
SELECT pg_temp.assert_true(
  has_table_privilege('anon', 'public.spot_history_live', 'SELECT')
    AND NOT has_table_privilege('anon', 'public.wspr_observations_live', 'SELECT'),
  'only the public spot reader may be anonymous'
);

INSERT INTO public.spot_history (
  source, spotted_at, tx_callsign, tx_grid, rx_callsign,
  frequency_khz, band, mode
)
SELECT
  'pskreporter', now() - interval '1 minute', 'SHARE80',
  CASE WHEN sample <= 8 THEN 'FN20' ELSE 'EM10' END,
  'SHARERX' || sample, 14074, '20m', 'FT8'
FROM generate_series(1, 10) AS series(sample);
SELECT public.refresh_callsign_fields(interval '1 day');
SELECT pg_temp.assert_true(
  (SELECT field = 'FN' AND sightings = 8 AND abs(share - 0.8) < 0.0001
   FROM public.callsign_fields WHERE callsign = 'SHARE80'),
  'callsign dominance must preserve fractional 80 percent shares'
);
DELETE FROM public.callsign_fields WHERE callsign = 'SHARE80';
DELETE FROM public.spot_history WHERE tx_callsign = 'SHARE80';

DO $$
DECLARE
  benchmark_id uuid;
  reconciliation_id uuid;
  reader_id uuid;
  transition_rejected boolean := false;
  result jsonb;
BEGIN
  PERFORM public.ingest_spot_history_rows(jsonb_build_array(jsonb_build_object(
    'source', 'pskreporter', 'spotted_at', '2026-07-19 10:00Z',
    'tx_callsign', 'CUTOVER1', 'tx_grid', 'FN20',
    'rx_callsign', 'READER1', 'rx_grid', 'EM10',
    'frequency_khz', 14074, 'band', '20m', 'mode', 'FT8', 'snr', -10
  )));
  PERFORM pg_temp.assert_true(
    (SELECT count(*) = 1 FROM public.spot_history
     WHERE tx_callsign = 'CUTOVER1')
      AND (SELECT count(*) = 0 FROM public.spot_history_partitioned_v1
           WHERE tx_callsign = 'CUTOVER1'),
    'legacy spot writes must not reach the shadow before dual write'
  );
  BEGIN
    PERFORM public.set_propagation_hot_store_cutover(
      'spot_history_v1', 'dual_write', null, 'must fail closed'
    );
  EXCEPTION WHEN OTHERS THEN
    transition_rejected := true;
  END;
  PERFORM pg_temp.assert_true(
    transition_rejected,
    'dual write must reject a missing representative benchmark'
  );

  benchmark_id := public.record_propagation_hot_store_benchmark(
    'spot_history_v1', 'native_range_partition_spot_v1',
    '2026-07-19 00:00Z', '2026-07-20 00:00Z', 2, true, true,
    '{"insert_p95_ms":1,"aggregate_p95_ms":1,"api_p95_ms":1,"archive_p95_ms":1,"drop_ms":1,"wal_bytes":1}'
  );
  PERFORM public.set_propagation_hot_store_cutover(
    'spot_history_v1', 'dual_write', benchmark_id, 'integration dual write'
  );
  PERFORM public.ingest_spot_history_rows(jsonb_build_array(jsonb_build_object(
    'source', 'rbn', 'spotted_at', '2026-07-19 11:00Z',
    'tx_callsign', 'CUTOVER2', 'tx_grid', 'IO91',
    'rx_callsign', 'READER2', 'rx_grid', 'JN18',
    'frequency_khz', 7025, 'band', '40m', 'mode', 'CW', 'snr', 7
  )));
  PERFORM pg_temp.assert_true(
    (SELECT count(*) = 1 FROM public.spot_history_partitioned_v1
     WHERE tx_callsign = 'CUTOVER2'),
    'dual spot write must reach the partitioned shadow'
  );
  result := public.backfill_propagation_hot_store_batch(
    'spot_history_v1', '2026-07-19 00:00Z', '2026-07-20 00:00Z',
    '1900-01-01 00:00Z', 0, 100
  );
  PERFORM pg_temp.assert_true(
    (result ->> 'complete')::boolean,
    'bounded spot backfill must complete for the fixture range'
  );
  reconciliation_id := public.reconcile_propagation_hot_store(
    'spot_history_v1', '2026-07-19 00:00Z', '2026-07-20 00:00Z'
  );
  reader_id := public.record_propagation_hot_store_reader_parity(
    'spot_history_v1', reconciliation_id, 25, true, true,
    '{"suite":"partition-compact-integration"}'
  );
  PERFORM pg_temp.assert_true(reader_id IS NOT NULL, 'spot reader receipt is required');
  PERFORM public.set_propagation_hot_store_cutover(
    'spot_history_v1', 'shadow_read', null, 'integration shadow read'
  );
  PERFORM pg_temp.assert_true(
    (SELECT count(*) = 2 FROM public.spot_history_live
     WHERE tx_callsign LIKE 'CUTOVER%'),
    'shadow spot view must preserve exact rows'
  );
  PERFORM public.set_propagation_hot_store_cutover(
    'spot_history_v1', 'partitioned', null, 'integration writer cutover'
  );
  PERFORM public.ingest_spot_history_rows(jsonb_build_array(jsonb_build_object(
    'source', 'dxcluster', 'spotted_at', '2026-08-23 12:00Z',
    'tx_callsign', 'CUTOVER3', 'tx_grid', 'PM95',
    'rx_callsign', 'READER3', 'rx_grid', 'QF56',
    'frequency_khz', 21025, 'band', '15m', 'mode', 'CW'
  )));
  PERFORM pg_temp.assert_true(
    (SELECT count(*) = 0 FROM public.spot_history
     WHERE tx_callsign = 'CUTOVER3')
      AND (SELECT count(*) = 1 FROM public.spot_history_partitioned_v1
           WHERE tx_callsign = 'CUTOVER3'),
    'authoritative spot writer must stop writing the legacy table'
  );
  PERFORM public.set_propagation_hot_store_cutover(
    'spot_history_v1', 'legacy', null, 'integration rollback'
  );
  PERFORM pg_temp.assert_true(
    (SELECT count(*) = 0 FROM public.spot_history_live
     WHERE tx_callsign = 'CUTOVER3'),
    'spot rollback must immediately restore the legacy reader'
  );
END;
$$;

DO $$
DECLARE
  benchmark_id uuid;
  reconciliation_id uuid;
  reader_id uuid;
  result jsonb;
BEGIN
  PERFORM public.ingest_wspr_observation_rows(jsonb_build_array(jsonb_build_object(
    'source', 'wsprnet', 'source_id', 'cutover-observation-1',
    'observation_key_sha256', repeat('1', 64),
    'event_time', '2026-07-19 10:02Z', 'received_at', '2026-07-19 10:03Z',
    'slot_epoch', 1001, 'target_hour', '2026-07-19 10:00Z',
    'band', '20m', 'tx_call', 'WSPR01', 'tx_grid4', 'FN20',
    'rx_call', 'WSPR02', 'rx_grid4', 'EM10', 'power_bin_dbm', 30,
    'snr_db', -12, 'mode', 'WSPR', 'ingest_version', 'integration-v1'
  )));
  benchmark_id := public.record_propagation_hot_store_benchmark(
    'wspr_observations_v1', 'native_range_partition_wspr_v1',
    '2026-07-19 10:00Z', '2026-07-19 13:00Z', 2, true, true,
    '{"insert_p95_ms":1,"aggregate_p95_ms":1,"api_p95_ms":1,"archive_p95_ms":1,"drop_ms":1,"wal_bytes":1}'
  );
  PERFORM public.set_propagation_hot_store_cutover(
    'wspr_observations_v1', 'dual_write', benchmark_id, 'integration dual write'
  );
  PERFORM public.ingest_wspr_observation_rows(jsonb_build_array(jsonb_build_object(
    'source', 'wsprnet', 'source_id', 'cutover-observation-2',
    'observation_key_sha256', repeat('2', 64),
    'event_time', '2026-07-19 11:02Z', 'received_at', '2026-07-19 11:03Z',
    'slot_epoch', 1002, 'target_hour', '2026-07-19 11:00Z',
    'band', '20m', 'tx_call', 'WSPR03', 'tx_grid4', 'IO91',
    'rx_call', 'WSPR04', 'rx_grid4', 'JN18', 'power_bin_dbm', 30,
    'snr_db', -9, 'mode', 'WSPR', 'ingest_version', 'integration-v1'
  )));
  result := public.backfill_propagation_hot_store_batch(
    'wspr_observations_v1', '2026-07-19 10:00Z', '2026-07-19 13:00Z',
    '1900-01-01 00:00Z', 0, 100
  );
  PERFORM pg_temp.assert_true(
    (result ->> 'complete')::boolean,
    'bounded WSPR observation backfill must complete'
  );
  reconciliation_id := public.reconcile_propagation_hot_store(
    'wspr_observations_v1', '2026-07-19 10:00Z', '2026-07-19 13:00Z'
  );
  reader_id := public.record_propagation_hot_store_reader_parity(
    'wspr_observations_v1', reconciliation_id, 25, true, true,
    '{"suite":"partition-compact-integration"}'
  );
  PERFORM public.set_propagation_hot_store_cutover(
    'wspr_observations_v1', 'shadow_read', null, 'integration shadow read'
  );
  PERFORM public.set_propagation_hot_store_cutover(
    'wspr_observations_v1', 'partitioned', null, 'integration writer cutover'
  );
  PERFORM public.ingest_wspr_observation_rows(jsonb_build_array(jsonb_build_object(
    'source', 'wsprnet', 'source_id', 'cutover-observation-3',
    'observation_key_sha256', repeat('3', 64),
    'event_time', '2026-08-23 12:02Z', 'received_at', '2026-08-23 12:03Z',
    'slot_epoch', 1003, 'target_hour', '2026-08-23 12:00Z',
    'band', '20m', 'tx_call', 'WSPR05', 'tx_grid4', 'PM95',
    'rx_call', 'WSPR06', 'rx_grid4', 'QF56', 'power_bin_dbm', 30,
    'snr_db', -7, 'mode', 'WSPR', 'ingest_version', 'integration-v1'
  )));
  PERFORM public.ingest_wspr_observation_rows(jsonb_build_array(jsonb_build_object(
    'source', 'wsprnet', 'source_id', 'cutover-observation-3',
    'observation_key_sha256', repeat('3', 64),
    'event_time', '2026-08-23 12:02Z', 'received_at', '2026-08-23 12:03Z',
    'slot_epoch', 1003, 'target_hour', '2026-08-23 12:00Z',
    'band', '20m', 'tx_call', 'WSPR05', 'tx_grid4', 'PM95',
    'rx_call', 'WSPR06', 'rx_grid4', 'QF56', 'power_bin_dbm', 30,
    'snr_db', -7, 'mode', 'WSPR', 'ingest_version', 'integration-v1'
  )));
  PERFORM pg_temp.assert_true(
    (SELECT count(*) = 0 FROM public.wspr_observations_rolling
     WHERE source_id = 'cutover-observation-3')
      AND (SELECT count(*) = 1 FROM public.wspr_observations_partitioned_v1
           WHERE source_id = 'cutover-observation-3')
      AND (SELECT count(*) = 1 FROM public.wspr_observation_keys_v1
           WHERE source_id = 'cutover-observation-3'),
    'authoritative WSPR writer must preserve global dedup without legacy writes'
  );
  PERFORM public.ingest_wspr_observation_rows(jsonb_build_array(
    jsonb_build_object(
      'source', 'wsprnet', 'observation_key_sha256', repeat('4', 64),
      'event_time', '2026-08-23 12:04Z', 'received_at', '2026-08-23 12:05Z',
      'slot_epoch', 1004, 'target_hour', '2026-08-23 12:00Z',
      'band', '20m', 'tx_call', 'WSPR07', 'tx_grid4', 'FN20',
      'rx_call', 'WSPR08', 'rx_grid4', 'EM10', 'power_bin_dbm', 30,
      'snr_db', -8, 'mode', 'WSPR', 'ingest_version', 'integration-v1'
    ),
    jsonb_build_object(
      'source', 'wsprnet', 'observation_key_sha256', repeat('5', 64),
      'event_time', '2026-08-23 12:06Z', 'received_at', '2026-08-23 12:07Z',
      'slot_epoch', 1005, 'target_hour', '2026-08-23 12:00Z',
      'band', '20m', 'tx_call', 'WSPR09', 'tx_grid4', 'IO91',
      'rx_call', 'WSPR10', 'rx_grid4', 'JN18', 'power_bin_dbm', 30,
      'snr_db', -6, 'mode', 'WSPR', 'ingest_version', 'integration-v1'
    )
  ));
  PERFORM pg_temp.assert_true(
    (SELECT count(*) = 2 FROM public.wspr_observation_keys_v1
     WHERE source = 'wsprnet' AND source_id IS NULL
       AND observation_key_sha256 IN (repeat('4', 64), repeat('5', 64))),
    'missing provider IDs must not collapse distinct WSPR observations'
  );
  PERFORM public.set_propagation_hot_store_cutover(
    'wspr_observations_v1', 'legacy', null, 'integration rollback'
  );
END;
$$;

DO $$
DECLARE
  issue_time constant timestamptz := '2026-07-19 18:00Z';
  benchmark_id uuid;
  reconciliation_id uuid;
  reader_id uuid;
  comparison jsonb;
  corrupt_rejected boolean := false;
  lag integer;
BEGIN
  FOREACH lag IN ARRAY ARRAY[1, 2, 3, 24] LOOP
    INSERT INTO public.wspr_feature_watermarks (
      target_hour, band, provider, transform_version, status,
      source_watermark, available_at, observation_count,
      feature_cell_count, quality_flags
    ) VALUES (
      issue_time - make_interval(hours => lag), '20m', 'integration',
      'integration-v1', 'complete',
      issue_time - make_interval(hours => lag - 1),
      issue_time - make_interval(hours => lag - 1), 10, 2, '{}'
    );
    INSERT INTO public.wspr_path_hourly_features (
      target_hour, band, tx_grid4, rx_grid4, successes, opportunities,
      success_rate, sampled_rows, positive_rows, available_at,
      source_watermark, provider, transform_version, quality_flags
    ) VALUES
      (issue_time - make_interval(hours => lag), '20m', 'FN20', 'EM10',
       lag, 100, lag / 100.0, 10, 1,
       issue_time - make_interval(hours => lag - 1),
       issue_time - make_interval(hours => lag - 1),
       'integration', 'integration-v1', '{}'),
      (issue_time - make_interval(hours => lag), '20m', 'FN20', 'IO91',
       lag + 1, 100, (lag + 1) / 100.0, 10, 1,
       issue_time - make_interval(hours => lag - 1),
       issue_time - make_interval(hours => lag - 1),
       'integration', 'integration-v1', '{}');
  END LOOP;

  PERFORM public.backfill_wspr_compact_feature_groups(
    issue_time - interval '24 hours', issue_time, '{}'::jsonb, 100
  );
  reconciliation_id := public.reconcile_wspr_compact_features(
    issue_time - interval '24 hours', issue_time
  );
  benchmark_id := public.record_wspr_compact_benchmark(
    issue_time - interval '24 hours', issue_time,
    100000, 25, true, 'postgres_arrays_v1', true, true, 4,
    '{"lookup_p50_ms":1,"lookup_p95_ms":2,"bytes_per_path":100}',
    '{"lookup_p50_ms":1,"lookup_p95_ms":2,"bytes_per_path":50,"build_ms":5}',
    '{"cold_p95_ms":3,"warm_p95_ms":1,"bytes_per_path":40,"build_ms":5,"object_requests":1}',
    '{"missing_object":true,"corrupt_hash":true,"stale_watermark":true,"cache_miss":true}'
  );
  PERFORM public.set_wspr_compact_feature_mode(
    'dual_write', benchmark_id, 'integration dual read'
  );
  FOR lag IN 1..100 LOOP
    PERFORM * FROM public.lookup_wspr_path_lags(
      issue_time, '20m', 'FN20', ARRAY['IO91', 'EM10'],
      'integration-v1', 'integration'
    );
  END LOOP;
  SELECT public.compare_wspr_path_lag_readers(
    issue_time, '20m', 'FN20', ARRAY['IO91', 'EM10'],
    'integration-v1', 'integration'
  ) INTO comparison;
  PERFORM pg_temp.assert_true(
    (comparison ->> 'matched')::boolean
      AND (comparison ->> 'legacy_rows')::integer = 2
      AND (comparison ->> 'compact_rows')::integer = 2,
    'compact WSPR reader must exactly preserve ordered lag responses'
  );
  reader_id := public.record_wspr_compact_reader_gate(
    reconciliation_id, 100, 4, 3, 1,
    '{"suite":"partition-compact-integration"}'
  );
  PERFORM pg_temp.assert_true(reader_id IS NOT NULL, 'compact reader receipt is required');
  PERFORM public.set_wspr_compact_feature_mode(
    'shadow_read', null, 'integration shadow reader'
  );
  PERFORM * FROM public.lookup_wspr_path_lags(
    issue_time, '20m', 'FN20', ARRAY['IO91', 'EM10'],
    'integration-v1', 'integration'
  );
  PERFORM public.set_wspr_compact_feature_mode(
    'compact', null, 'integration compact authority'
  );
  PERFORM pg_temp.assert_true(
    public.ingest_wspr_feature_rows(jsonb_build_array(jsonb_build_object(
      'target_hour', issue_time - interval '1 hour', 'band', '20m',
      'tx_grid4', 'FN20', 'rx_grid4', 'JN18', 'successes', 1,
      'opportunities', 10, 'success_rate', 0.1, 'sampled_rows', 1,
      'positive_rows', 1, 'available_at', issue_time,
      'source_watermark', issue_time, 'provider', 'integration',
      'transform_version', 'integration-v1', 'quality_flags', '[]'::jsonb
    ))) = 0,
    'compact authority must stop row-form feature writes'
  );
  BEGIN
    UPDATE public.wspr_path_hourly_compact_v1
    SET rx_grid4s = ARRAY['IO91', 'EM10']
    WHERE target_hour = issue_time - interval '1 hour'
      AND tx_grid4 = 'FN20' AND provider = 'integration';
  EXCEPTION WHEN OTHERS THEN
    corrupt_rejected := true;
  END;
  PERFORM pg_temp.assert_true(
    corrupt_rejected,
    'compact storage must reject unsorted or misaligned cells'
  );
  PERFORM public.set_wspr_compact_feature_mode(
    'legacy', null, 'integration rollback'
  );
  PERFORM pg_temp.assert_true(
    NOT (SELECT row_form_retirement_enabled
         FROM public.wspr_compact_feature_controls),
    'compact rollback must disable row-form retirement'
  );
END;
$$;

ROLLBACK;

\echo 'partition and compact integration: passed'
