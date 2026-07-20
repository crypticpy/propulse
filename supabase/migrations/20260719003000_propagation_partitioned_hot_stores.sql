-- Native partitioned hot-store replacements and reversible Phase 3 cutover.
--
-- All cutovers start in `legacy`. A representative benchmark receipt,
-- bounded backfill reconciliation, reader-parity receipt, and explicit state
-- transitions are required before a partitioned writer can become
-- authoritative. The legacy tables are not renamed or dropped here.

CREATE TABLE public.propagation_hot_store_benchmark_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset text NOT NULL CHECK (dataset IN (
    'spot_history_v1', 'wspr_observations_v1'
  )),
  candidate text NOT NULL CHECK (
    candidate ~ '^native_range_partition_(spot|wspr)_v[0-9]+$'
  ),
  range_start timestamptz NOT NULL,
  range_end timestamptz NOT NULL,
  source_rows bigint NOT NULL CHECK (source_rows > 0),
  representative boolean NOT NULL DEFAULT false,
  passed boolean NOT NULL DEFAULT false,
  metrics jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by text NOT NULL DEFAULT current_user,
  CHECK (range_end > range_start),
  CHECK (range_end - range_start <= interval '48 hours'),
  CHECK (jsonb_typeof(metrics) = 'object')
);

CREATE TABLE public.propagation_hot_store_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset text NOT NULL CHECK (dataset IN (
    'spot_history_v1', 'wspr_observations_v1'
  )),
  range_start timestamptz NOT NULL,
  range_end timestamptz NOT NULL,
  legacy_rows bigint NOT NULL CHECK (legacy_rows >= 0),
  partitioned_rows bigint NOT NULL CHECK (partitioned_rows >= 0),
  unresolved_shadow_writes bigint NOT NULL CHECK (unresolved_shadow_writes >= 0),
  passed boolean NOT NULL,
  checks jsonb NOT NULL,
  reconciled_at timestamptz NOT NULL DEFAULT now(),
  CHECK (range_end > range_start),
  CHECK (jsonb_typeof(checks) = 'object')
);

CREATE TABLE public.propagation_hot_store_reader_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset text NOT NULL CHECK (dataset IN (
    'spot_history_v1', 'wspr_observations_v1'
  )),
  reconciliation_id uuid NOT NULL
    REFERENCES public.propagation_hot_store_reconciliations(id),
  request_count integer NOT NULL CHECK (request_count >= 25),
  exact_row_parity boolean NOT NULL,
  aggregate_parity boolean NOT NULL,
  passed boolean NOT NULL,
  metrics jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by text NOT NULL DEFAULT current_user,
  CHECK (jsonb_typeof(metrics) = 'object'),
  CHECK (NOT passed OR (exact_row_parity AND aggregate_parity))
);

CREATE TABLE public.propagation_hot_store_cutovers (
  dataset text PRIMARY KEY CHECK (dataset IN (
    'spot_history_v1', 'wspr_observations_v1'
  )),
  mode text NOT NULL DEFAULT 'legacy' CHECK (mode IN (
    'legacy', 'dual_write', 'shadow_read', 'partitioned'
  )),
  benchmark_receipt_id uuid
    REFERENCES public.propagation_hot_store_benchmark_receipts(id),
  reconciliation_id uuid
    REFERENCES public.propagation_hot_store_reconciliations(id),
  reader_receipt_id uuid
    REFERENCES public.propagation_hot_store_reader_receipts(id),
  backfill_complete boolean NOT NULL DEFAULT false,
  dual_write_started_at timestamptz,
  reader_switched_at timestamptz,
  writer_switched_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL DEFAULT current_user,
  reason text NOT NULL DEFAULT 'initial fail-closed legacy mode'
    CHECK (length(reason) BETWEEN 1 AND 1000)
);

INSERT INTO public.propagation_hot_store_cutovers(dataset)
VALUES ('spot_history_v1'), ('wspr_observations_v1')
ON CONFLICT (dataset) DO NOTHING;

CREATE TABLE public.propagation_hot_store_cutover_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dataset text NOT NULL,
  prior_mode text,
  next_mode text NOT NULL,
  benchmark_receipt_id uuid,
  reconciliation_id uuid,
  reader_receipt_id uuid,
  reason text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by text NOT NULL DEFAULT current_user
);

CREATE TABLE public.propagation_hot_partitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset text NOT NULL CHECK (dataset IN (
    'spot_history_v1', 'wspr_observations_v1'
  )),
  child_relation text NOT NULL UNIQUE,
  range_start timestamptz NOT NULL,
  range_end timestamptz NOT NULL,
  state text NOT NULL DEFAULT 'active' CHECK (state IN (
    'active', 'detached', 'dropped'
  )),
  manifest_id uuid REFERENCES public.propagation_archive_manifests(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz,
  UNIQUE (dataset, range_start, range_end),
  CHECK (range_end > range_start),
  CHECK ((state = 'active' AND retired_at IS NULL) OR state <> 'active')
);

CREATE TABLE public.propagation_shadow_write_failures (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dataset text NOT NULL CHECK (dataset IN (
    'spot_history_v1', 'wspr_observations_v1'
  )),
  source_row_id bigint NOT NULL,
  source_time timestamptz NOT NULL,
  postgres_error_code text,
  error_message text NOT NULL,
  attempts integer NOT NULL DEFAULT 1 CHECK (attempts > 0),
  first_failed_at timestamptz NOT NULL DEFAULT now(),
  last_failed_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  UNIQUE (dataset, source_row_id, source_time)
);

-- LIKE copies the live row contract but intentionally does not copy global
-- primary/unique indexes or the legacy identity. Partitioned uniqueness must
-- include the partition key; authoritative IDs continue from the legacy
-- identity sequences during the reversible migration.
CREATE TABLE public.spot_history_partitioned_v1 (
  LIKE public.spot_history
    INCLUDING DEFAULTS INCLUDING GENERATED INCLUDING CONSTRAINTS
) PARTITION BY RANGE (spotted_at);

CREATE UNIQUE INDEX spot_history_partitioned_pk
  ON public.spot_history_partitioned_v1(spotted_at, id);
CREATE UNIQUE INDEX spot_history_partitioned_dedup_idx
  ON public.spot_history_partitioned_v1(
    source, tx_callsign, rx_callsign, frequency_khz, spotted_at
  );
CREATE INDEX spot_history_partitioned_time_idx
  ON public.spot_history_partitioned_v1(spotted_at DESC, id DESC);
CREATE INDEX spot_history_partitioned_band_time_idx
  ON public.spot_history_partitioned_v1(band, spotted_at DESC);
CREATE INDEX spot_history_partitioned_source_time_idx
  ON public.spot_history_partitioned_v1(source, spotted_at DESC);
CREATE INDEX spot_history_partitioned_tx_time_idx
  ON public.spot_history_partitioned_v1(tx_callsign, spotted_at DESC);

CREATE TABLE public.wspr_observations_partitioned_v1 (
  LIKE public.wspr_observations_rolling
    INCLUDING DEFAULTS INCLUDING GENERATED INCLUDING CONSTRAINTS
) PARTITION BY RANGE (received_at);

CREATE UNIQUE INDEX wspr_observations_partitioned_pk
  ON public.wspr_observations_partitioned_v1(received_at, id);
CREATE UNIQUE INDEX wspr_observations_partitioned_hash_idx
  ON public.wspr_observations_partitioned_v1(
    received_at, observation_key_sha256
  );
CREATE INDEX wspr_observations_partitioned_slot_band_idx
  ON public.wspr_observations_partitioned_v1(slot_epoch, band);
CREATE INDEX wspr_observations_partitioned_receipt_idx
  ON public.wspr_observations_partitioned_v1(received_at, id);
CREATE INDEX wspr_observations_partitioned_source_hour_idx
  ON public.wspr_observations_partitioned_v1(
    source, target_hour, band, id
  );

-- PostgreSQL cannot enforce a global unique key across time partitions unless
-- the partition key participates. This compact private ledger retains only
-- dedup keys and authoritative IDs so the cutover preserves the existing
-- observation-key and provider/source-id uniqueness contract.
CREATE TABLE public.wspr_observation_keys_v1 (
  id bigint PRIMARY KEY DEFAULT nextval(
    'public.wspr_observations_rolling_id_seq'::regclass
  ),
  observation_key_sha256 text NOT NULL UNIQUE
    CHECK (observation_key_sha256 ~ '^[0-9a-f]{64}$'),
  source text NOT NULL,
  source_id text,
  received_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (source, source_id)
);

CREATE OR REPLACE FUNCTION public.ensure_propagation_hot_partitions(
  p_dataset text,
  p_range_start timestamptz,
  p_range_end timestamptz
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  cursor_time timestamptz;
  next_time timestamptz;
  step interval;
  parent_name text;
  child_name text;
  created_count integer := 0;
BEGIN
  IF p_range_start IS NULL OR p_range_end IS NULL
    OR p_range_end <= p_range_start
    OR p_range_end - p_range_start > interval '32 days'
  THEN
    RAISE EXCEPTION 'invalid bounded hot-partition range';
  END IF;

  CASE p_dataset
    WHEN 'spot_history_v1' THEN
      IF p_range_start <> date_trunc('day', p_range_start)
        OR p_range_end <> date_trunc('day', p_range_end)
      THEN
        RAISE EXCEPTION 'spot partitions must use UTC day boundaries';
      END IF;
      step := interval '1 day';
      parent_name := 'spot_history_partitioned_v1';
    WHEN 'wspr_observations_v1' THEN
      IF p_range_start <> date_trunc('hour', p_range_start)
        OR p_range_end <> date_trunc('hour', p_range_end)
      THEN
        RAISE EXCEPTION 'WSPR partitions must use UTC hour boundaries';
      END IF;
      step := interval '1 hour';
      parent_name := 'wspr_observations_partitioned_v1';
    ELSE
      RAISE EXCEPTION 'unsupported partitioned hot-store dataset';
  END CASE;

  cursor_time := p_range_start;
  WHILE cursor_time < p_range_end LOOP
    next_time := cursor_time + step;
    child_name := CASE p_dataset
      WHEN 'spot_history_v1' THEN
        'spot_history_p' || to_char(cursor_time AT TIME ZONE 'UTC', 'YYYYMMDD')
      ELSE
        'wspr_observations_p' || to_char(
          cursor_time AT TIME ZONE 'UTC', 'YYYYMMDDHH24'
        )
    END;
    IF to_regclass('public.' || child_name) IS NULL THEN
      EXECUTE format(
        'CREATE TABLE public.%I PARTITION OF public.%I FOR VALUES FROM (%L) TO (%L)',
        child_name, parent_name, cursor_time, next_time
      );
      created_count := created_count + 1;
    END IF;
    INSERT INTO public.propagation_hot_partitions(
      dataset, child_relation, range_start, range_end
    ) VALUES (
      p_dataset, 'public.' || child_name, cursor_time, next_time
    )
    ON CONFLICT (dataset, range_start, range_end) DO UPDATE SET
      child_relation = excluded.child_relation,
      state = 'active',
      retired_at = null;
    cursor_time := next_time;
  END LOOP;
  RETURN created_count;
END;
$$;

-- Create only the current and next write partitions. Backfill creates its
-- own bounded historical partitions explicitly.
SELECT public.ensure_propagation_hot_partitions(
  'spot_history_v1', date_trunc('day', now()),
  date_trunc('day', now()) + interval '2 days'
);
SELECT public.ensure_propagation_hot_partitions(
  'wspr_observations_v1', date_trunc('hour', now()),
  date_trunc('hour', now()) + interval '2 hours'
);

CREATE OR REPLACE FUNCTION public.dual_write_spot_history_partitioned_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  cutover_mode text;
BEGIN
  SELECT mode INTO cutover_mode
  FROM public.propagation_hot_store_cutovers
  WHERE dataset = 'spot_history_v1';
  IF cutover_mode NOT IN ('dual_write', 'shadow_read') THEN
    RETURN NEW;
  END IF;
  BEGIN
    INSERT INTO public.spot_history_partitioned_v1 (
      id, source, spotted_at, ingested_at, tx_callsign, tx_grid, tx_lat,
      tx_lon, rx_callsign, rx_grid, rx_lat, rx_lon, frequency_khz, band,
      mode, snr, wpm, comment, dxcc, continent, available_at
    ) VALUES (
      NEW.id, NEW.source, NEW.spotted_at, NEW.ingested_at, NEW.tx_callsign,
      NEW.tx_grid, NEW.tx_lat, NEW.tx_lon, NEW.rx_callsign, NEW.rx_grid,
      NEW.rx_lat, NEW.rx_lon, NEW.frequency_khz, NEW.band, NEW.mode, NEW.snr,
      NEW.wpm, NEW.comment, NEW.dxcc, NEW.continent, NEW.available_at
    ) ON CONFLICT DO NOTHING;
    UPDATE public.propagation_shadow_write_failures
    SET resolved_at = now()
    WHERE dataset = 'spot_history_v1'
      AND source_row_id = NEW.id AND source_time = NEW.spotted_at
      AND resolved_at IS NULL;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.propagation_shadow_write_failures (
      dataset, source_row_id, source_time, postgres_error_code, error_message
    ) VALUES (
      'spot_history_v1', NEW.id, NEW.spotted_at, SQLSTATE, SQLERRM
    )
    ON CONFLICT (dataset, source_row_id, source_time) DO UPDATE SET
      postgres_error_code = excluded.postgres_error_code,
      error_message = excluded.error_message,
      attempts = public.propagation_shadow_write_failures.attempts + 1,
      last_failed_at = now(),
      resolved_at = null;
  END;
  RETURN NEW;
END;
$$;

CREATE TRIGGER spot_history_partitioned_dual_write
AFTER INSERT ON public.spot_history
FOR EACH ROW EXECUTE FUNCTION public.dual_write_spot_history_partitioned_v1();

CREATE OR REPLACE FUNCTION public.dual_write_wspr_observations_partitioned_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  cutover_mode text;
  dedup_id bigint;
BEGIN
  SELECT mode INTO cutover_mode
  FROM public.propagation_hot_store_cutovers
  WHERE dataset = 'wspr_observations_v1';
  IF cutover_mode NOT IN ('dual_write', 'shadow_read') THEN
    RETURN NEW;
  END IF;
  BEGIN
    INSERT INTO public.wspr_observation_keys_v1 (
      id, observation_key_sha256, source, source_id, received_at
    ) VALUES (
      NEW.id, NEW.observation_key_sha256, NEW.source, NEW.source_id,
      NEW.received_at
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO dedup_id;
    IF dedup_id IS NULL THEN
      SELECT id INTO dedup_id
      FROM public.wspr_observation_keys_v1
      WHERE observation_key_sha256 = NEW.observation_key_sha256
         OR (source = NEW.source AND source_id IS NOT DISTINCT FROM NEW.source_id)
      ORDER BY id
      LIMIT 1;
    END IF;
    IF dedup_id IS DISTINCT FROM NEW.id THEN
      RAISE EXCEPTION 'partitioned WSPR dedup ID does not match legacy ID';
    END IF;
    INSERT INTO public.wspr_observations_partitioned_v1 (
      id, source, source_id, observation_key_sha256, event_time, received_at,
      slot_epoch, target_hour, band, tx_call, tx_grid4, rx_call, rx_grid4,
      power_bin_dbm, snr_db, mode, ingest_version, created_at
    ) VALUES (
      NEW.id, NEW.source, NEW.source_id, NEW.observation_key_sha256,
      NEW.event_time, NEW.received_at, NEW.slot_epoch, NEW.target_hour,
      NEW.band, NEW.tx_call, NEW.tx_grid4, NEW.rx_call, NEW.rx_grid4,
      NEW.power_bin_dbm, NEW.snr_db, NEW.mode, NEW.ingest_version,
      NEW.created_at
    ) ON CONFLICT DO NOTHING;
    UPDATE public.propagation_shadow_write_failures
    SET resolved_at = now()
    WHERE dataset = 'wspr_observations_v1'
      AND source_row_id = NEW.id AND source_time = NEW.received_at
      AND resolved_at IS NULL;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.propagation_shadow_write_failures (
      dataset, source_row_id, source_time, postgres_error_code, error_message
    ) VALUES (
      'wspr_observations_v1', NEW.id, NEW.received_at, SQLSTATE, SQLERRM
    )
    ON CONFLICT (dataset, source_row_id, source_time) DO UPDATE SET
      postgres_error_code = excluded.postgres_error_code,
      error_message = excluded.error_message,
      attempts = public.propagation_shadow_write_failures.attempts + 1,
      last_failed_at = now(),
      resolved_at = null;
  END;
  RETURN NEW;
END;
$$;

CREATE TRIGGER wspr_observations_partitioned_dual_write
AFTER INSERT ON public.wspr_observations_rolling
FOR EACH ROW EXECUTE FUNCTION public.dual_write_wspr_observations_partitioned_v1();

CREATE OR REPLACE FUNCTION public.ingest_spot_history_rows(p_rows jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  cutover_mode text;
  inserted_rows bigint;
BEGIN
  IF jsonb_typeof(p_rows) <> 'array'
    OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 500
  THEN
    RAISE EXCEPTION 'spot ingest batch must contain 1 to 500 rows';
  END IF;
  SELECT mode INTO cutover_mode
  FROM public.propagation_hot_store_cutovers
  WHERE dataset = 'spot_history_v1';

  IF cutover_mode = 'partitioned' THEN
    INSERT INTO public.spot_history_partitioned_v1 (
      id, source, spotted_at, ingested_at, tx_callsign, tx_grid, tx_lat,
      tx_lon, rx_callsign, rx_grid, rx_lat, rx_lon, frequency_khz, band,
      mode, snr, wpm, comment, dxcc, continent, available_at
    )
    SELECT
      nextval('public.spot_history_id_seq'::regclass), row.source,
      row.spotted_at, now(), row.tx_callsign, row.tx_grid, row.tx_lat,
      row.tx_lon, row.rx_callsign, row.rx_grid, row.rx_lat, row.rx_lon,
      row.frequency_khz, row.band, row.mode, row.snr, row.wpm, row.comment,
      row.dxcc, row.continent, now()
    FROM jsonb_to_recordset(p_rows) AS row(
      source text, spotted_at timestamptz, tx_callsign text, tx_grid text,
      tx_lat double precision, tx_lon double precision, rx_callsign text,
      rx_grid text, rx_lat double precision, rx_lon double precision,
      frequency_khz double precision, band text, mode text, snr smallint,
      wpm smallint, comment text, dxcc smallint, continent text
    )
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.spot_history (
      source, spotted_at, tx_callsign, tx_grid, tx_lat, tx_lon,
      rx_callsign, rx_grid, rx_lat, rx_lon, frequency_khz, band,
      mode, snr, wpm, comment, dxcc, continent
    )
    SELECT
      row.source, row.spotted_at, row.tx_callsign, row.tx_grid, row.tx_lat,
      row.tx_lon, row.rx_callsign, row.rx_grid, row.rx_lat, row.rx_lon,
      row.frequency_khz, row.band, row.mode, row.snr, row.wpm, row.comment,
      row.dxcc, row.continent
    FROM jsonb_to_recordset(p_rows) AS row(
      source text, spotted_at timestamptz, tx_callsign text, tx_grid text,
      tx_lat double precision, tx_lon double precision, rx_callsign text,
      rx_grid text, rx_lat double precision, rx_lon double precision,
      frequency_khz double precision, band text, mode text, snr smallint,
      wpm smallint, comment text, dxcc smallint, continent text
    )
    ON CONFLICT DO NOTHING;
  END IF;
  GET DIAGNOSTICS inserted_rows = ROW_COUNT;
  RETURN inserted_rows;
END;
$$;

CREATE OR REPLACE FUNCTION public.ingest_wspr_observation_rows(p_rows jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  cutover_mode text;
  item record;
  dedup_id bigint;
  inserted_rows bigint := 0;
BEGIN
  IF jsonb_typeof(p_rows) <> 'array'
    OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 1000
  THEN
    RAISE EXCEPTION 'WSPR ingest batch must contain 1 to 1000 rows';
  END IF;
  SELECT mode INTO cutover_mode
  FROM public.propagation_hot_store_cutovers
  WHERE dataset = 'wspr_observations_v1';

  IF cutover_mode <> 'partitioned' THEN
    INSERT INTO public.wspr_observations_rolling (
      source, source_id, observation_key_sha256, event_time, received_at,
      slot_epoch, target_hour, band, tx_call, tx_grid4, rx_call, rx_grid4,
      power_bin_dbm, snr_db, mode, ingest_version
    )
    SELECT
      row.source, row.source_id, row.observation_key_sha256, row.event_time,
      row.received_at, row.slot_epoch, row.target_hour, row.band, row.tx_call,
      row.tx_grid4, row.rx_call, row.rx_grid4, row.power_bin_dbm, row.snr_db,
      row.mode, row.ingest_version
    FROM jsonb_to_recordset(p_rows) AS row(
      source text, source_id text, observation_key_sha256 text,
      event_time timestamptz, received_at timestamptz, slot_epoch bigint,
      target_hour timestamptz, band text, tx_call text, tx_grid4 text,
      rx_call text, rx_grid4 text, power_bin_dbm smallint, snr_db real,
      mode text, ingest_version text
    )
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS inserted_rows = ROW_COUNT;
    RETURN inserted_rows;
  END IF;

  FOR item IN
    SELECT *
    FROM jsonb_to_recordset(p_rows) AS row(
      source text, source_id text, observation_key_sha256 text,
      event_time timestamptz, received_at timestamptz, slot_epoch bigint,
      target_hour timestamptz, band text, tx_call text, tx_grid4 text,
      rx_call text, rx_grid4 text, power_bin_dbm smallint, snr_db real,
      mode text, ingest_version text
    )
  LOOP
    dedup_id := null;
    INSERT INTO public.wspr_observation_keys_v1 (
      observation_key_sha256, source, source_id, received_at
    ) VALUES (
      item.observation_key_sha256, item.source, item.source_id,
      item.received_at
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO dedup_id;
    IF dedup_id IS NULL THEN CONTINUE; END IF;
    INSERT INTO public.wspr_observations_partitioned_v1 (
      id, source, source_id, observation_key_sha256, event_time, received_at,
      slot_epoch, target_hour, band, tx_call, tx_grid4, rx_call, rx_grid4,
      power_bin_dbm, snr_db, mode, ingest_version
    ) VALUES (
      dedup_id, item.source, item.source_id, item.observation_key_sha256,
      item.event_time, item.received_at, item.slot_epoch, item.target_hour,
      item.band, item.tx_call, item.tx_grid4, item.rx_call, item.rx_grid4,
      item.power_bin_dbm, item.snr_db, item.mode, item.ingest_version
    );
    inserted_rows := inserted_rows + 1;
  END LOOP;
  RETURN inserted_rows;
END;
$$;

CREATE OR REPLACE FUNCTION public.backfill_propagation_hot_store_batch(
  p_dataset text,
  p_range_start timestamptz,
  p_range_end timestamptz,
  p_after_time timestamptz,
  p_after_id bigint,
  p_batch_size integer DEFAULT 10000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  result jsonb;
  partition_start timestamptz;
  partition_end timestamptz;
BEGIN
  IF p_range_start IS NULL OR p_range_end IS NULL
    OR p_range_end <= p_range_start
    OR p_range_end - p_range_start > interval '32 days'
    OR p_after_time IS NULL OR p_after_id < 0
    OR p_batch_size NOT BETWEEN 1 AND 50000
  THEN
    RAISE EXCEPTION 'invalid bounded hot-store backfill request';
  END IF;

  IF p_dataset = 'spot_history_v1' THEN
    partition_start := date_trunc('day', p_range_start);
    partition_end := date_trunc('day', p_range_end - interval '1 microsecond')
      + interval '1 day';
    PERFORM public.ensure_propagation_hot_partitions(
      p_dataset, partition_start, partition_end
    );
    WITH batch AS MATERIALIZED (
      SELECT * FROM public.spot_history
      WHERE spotted_at >= p_range_start AND spotted_at < p_range_end
        AND (spotted_at, id) > (p_after_time, p_after_id)
      ORDER BY spotted_at, id
      LIMIT p_batch_size
    ), inserted AS (
      INSERT INTO public.spot_history_partitioned_v1 (
        id, source, spotted_at, ingested_at, tx_callsign, tx_grid, tx_lat,
        tx_lon, rx_callsign, rx_grid, rx_lat, rx_lon, frequency_khz, band,
        mode, snr, wpm, comment, dxcc, continent, available_at
      )
      SELECT id, source, spotted_at, ingested_at, tx_callsign, tx_grid, tx_lat,
        tx_lon, rx_callsign, rx_grid, rx_lat, rx_lon, frequency_khz, band,
        mode, snr, wpm, comment, dxcc, continent, available_at
      FROM batch
      ON CONFLICT DO NOTHING
      RETURNING 1
    )
    SELECT jsonb_build_object(
      'dataset', p_dataset,
      'source_rows', (SELECT count(*) FROM batch),
      'inserted_rows', (SELECT count(*) FROM inserted),
      'next_time', (SELECT spotted_at FROM batch ORDER BY spotted_at DESC, id DESC LIMIT 1),
      'next_id', (SELECT id FROM batch ORDER BY spotted_at DESC, id DESC LIMIT 1),
      'complete', (SELECT count(*) FROM batch) < p_batch_size
    ) INTO result;
  ELSIF p_dataset = 'wspr_observations_v1' THEN
    partition_start := date_trunc('hour', p_range_start);
    partition_end := date_trunc('hour', p_range_end - interval '1 microsecond')
      + interval '1 hour';
    PERFORM public.ensure_propagation_hot_partitions(
      p_dataset, partition_start, partition_end
    );
    WITH batch AS MATERIALIZED (
      SELECT * FROM public.wspr_observations_rolling
      WHERE received_at >= p_range_start AND received_at < p_range_end
        AND (received_at, id) > (p_after_time, p_after_id)
      ORDER BY received_at, id
      LIMIT p_batch_size
    ), keys_inserted AS (
      INSERT INTO public.wspr_observation_keys_v1 (
        id, observation_key_sha256, source, source_id, received_at
      )
      SELECT id, observation_key_sha256, source, source_id, received_at
      FROM batch
      ON CONFLICT DO NOTHING
      RETURNING 1
    ), inserted AS (
      INSERT INTO public.wspr_observations_partitioned_v1 (
        id, source, source_id, observation_key_sha256, event_time, received_at,
        slot_epoch, target_hour, band, tx_call, tx_grid4, rx_call, rx_grid4,
        power_bin_dbm, snr_db, mode, ingest_version, created_at
      )
      SELECT id, source, source_id, observation_key_sha256, event_time,
        received_at, slot_epoch, target_hour, band, tx_call, tx_grid4,
        rx_call, rx_grid4, power_bin_dbm, snr_db, mode, ingest_version,
        created_at
      FROM batch
      ON CONFLICT DO NOTHING
      RETURNING 1
    )
    SELECT jsonb_build_object(
      'dataset', p_dataset,
      'source_rows', (SELECT count(*) FROM batch),
      'dedup_keys_inserted', (SELECT count(*) FROM keys_inserted),
      'inserted_rows', (SELECT count(*) FROM inserted),
      'next_time', (SELECT received_at FROM batch ORDER BY received_at DESC, id DESC LIMIT 1),
      'next_id', (SELECT id FROM batch ORDER BY received_at DESC, id DESC LIMIT 1),
      'complete', (SELECT count(*) FROM batch) < p_batch_size
    ) INTO result;
  ELSE
    RAISE EXCEPTION 'unsupported partitioned hot-store dataset';
  END IF;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_propagation_hot_store(
  p_dataset text,
  p_range_start timestamptz,
  p_range_end timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  legacy_rows bigint;
  partitioned_rows bigint;
  unresolved bigint;
  legacy_min timestamptz;
  legacy_max timestamptz;
  partitioned_min timestamptz;
  partitioned_max timestamptz;
  legacy_sources jsonb;
  partitioned_sources jsonb;
  legacy_dedup bigint;
  partitioned_dedup bigint;
  passed boolean;
  receipt_id uuid;
BEGIN
  IF p_range_start IS NULL OR p_range_end IS NULL
    OR p_range_end <= p_range_start
    OR p_range_end - p_range_start > interval '32 days'
  THEN
    RAISE EXCEPTION 'invalid bounded hot-store reconciliation range';
  END IF;

  IF p_dataset = 'spot_history_v1' THEN
    SELECT count(*), min(spotted_at), max(spotted_at),
      count(DISTINCT (source, tx_callsign, rx_callsign, frequency_khz, spotted_at))
    INTO legacy_rows, legacy_min, legacy_max, legacy_dedup
    FROM public.spot_history
    WHERE spotted_at >= p_range_start AND spotted_at < p_range_end;
    SELECT count(*), min(spotted_at), max(spotted_at),
      count(DISTINCT (source, tx_callsign, rx_callsign, frequency_khz, spotted_at))
    INTO partitioned_rows, partitioned_min, partitioned_max, partitioned_dedup
    FROM public.spot_history_partitioned_v1
    WHERE spotted_at >= p_range_start AND spotted_at < p_range_end;
    SELECT coalesce(jsonb_object_agg(source, rows), '{}'::jsonb)
    INTO legacy_sources FROM (
      SELECT source, count(*) AS rows FROM public.spot_history
      WHERE spotted_at >= p_range_start AND spotted_at < p_range_end
      GROUP BY source ORDER BY source
    ) counts;
    SELECT coalesce(jsonb_object_agg(source, rows), '{}'::jsonb)
    INTO partitioned_sources FROM (
      SELECT source, count(*) AS rows FROM public.spot_history_partitioned_v1
      WHERE spotted_at >= p_range_start AND spotted_at < p_range_end
      GROUP BY source ORDER BY source
    ) counts;
  ELSIF p_dataset = 'wspr_observations_v1' THEN
    SELECT count(*), min(received_at), max(received_at),
      count(DISTINCT observation_key_sha256)
    INTO legacy_rows, legacy_min, legacy_max, legacy_dedup
    FROM public.wspr_observations_rolling
    WHERE received_at >= p_range_start AND received_at < p_range_end;
    SELECT count(*), min(received_at), max(received_at),
      count(DISTINCT observation_key_sha256)
    INTO partitioned_rows, partitioned_min, partitioned_max, partitioned_dedup
    FROM public.wspr_observations_partitioned_v1
    WHERE received_at >= p_range_start AND received_at < p_range_end;
    SELECT coalesce(jsonb_object_agg(source, rows), '{}'::jsonb)
    INTO legacy_sources FROM (
      SELECT source, count(*) AS rows FROM public.wspr_observations_rolling
      WHERE received_at >= p_range_start AND received_at < p_range_end
      GROUP BY source ORDER BY source
    ) counts;
    SELECT coalesce(jsonb_object_agg(source, rows), '{}'::jsonb)
    INTO partitioned_sources FROM (
      SELECT source, count(*) AS rows
      FROM public.wspr_observations_partitioned_v1
      WHERE received_at >= p_range_start AND received_at < p_range_end
      GROUP BY source ORDER BY source
    ) counts;
  ELSE
    RAISE EXCEPTION 'unsupported partitioned hot-store dataset';
  END IF;

  SELECT count(*) INTO unresolved
  FROM public.propagation_shadow_write_failures
  WHERE dataset = p_dataset AND resolved_at IS NULL
    AND source_time >= p_range_start AND source_time < p_range_end;
  passed := legacy_rows = partitioned_rows
    AND legacy_min IS NOT DISTINCT FROM partitioned_min
    AND legacy_max IS NOT DISTINCT FROM partitioned_max
    AND legacy_sources = partitioned_sources
    AND legacy_dedup = partitioned_dedup
    AND unresolved = 0;

  INSERT INTO public.propagation_hot_store_reconciliations (
    dataset, range_start, range_end, legacy_rows, partitioned_rows,
    unresolved_shadow_writes, passed, checks
  ) VALUES (
    p_dataset, p_range_start, p_range_end, legacy_rows, partitioned_rows,
    unresolved, passed,
    jsonb_build_object(
      'bounds_match', legacy_min IS NOT DISTINCT FROM partitioned_min
        AND legacy_max IS NOT DISTINCT FROM partitioned_max,
      'source_counts_match', legacy_sources = partitioned_sources,
      'dedup_keys_match', legacy_dedup = partitioned_dedup,
      'legacy_source_counts', legacy_sources,
      'partitioned_source_counts', partitioned_sources,
      'legacy_min_time', legacy_min,
      'legacy_max_time', legacy_max,
      'partitioned_min_time', partitioned_min,
      'partitioned_max_time', partitioned_max
    )
  ) RETURNING id INTO receipt_id;

  IF passed THEN
    UPDATE public.propagation_hot_store_cutovers
    SET reconciliation_id = receipt_id,
      backfill_complete = true,
      updated_at = now(), updated_by = current_user
    WHERE dataset = p_dataset;
  END IF;
  RETURN receipt_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_propagation_hot_store_benchmark(
  p_dataset text,
  p_candidate text,
  p_range_start timestamptz,
  p_range_end timestamptz,
  p_source_rows bigint,
  p_representative boolean,
  p_passed boolean,
  p_metrics jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE receipt_id uuid;
BEGIN
  IF jsonb_typeof(p_metrics) <> 'object'
    OR NOT (p_metrics ?& ARRAY[
      'insert_p95_ms', 'aggregate_p95_ms', 'api_p95_ms',
      'archive_p95_ms', 'drop_ms', 'wal_bytes'
    ])
  THEN
    RAISE EXCEPTION 'partition benchmark metrics are incomplete';
  END IF;
  IF p_representative AND (
    NOT p_passed
    OR jsonb_typeof(p_metrics -> 'insert_p95_ms') <> 'number'
    OR jsonb_typeof(p_metrics -> 'aggregate_p95_ms') <> 'number'
    OR jsonb_typeof(p_metrics -> 'api_p95_ms') <> 'number'
    OR jsonb_typeof(p_metrics -> 'archive_p95_ms') <> 'number'
    OR jsonb_typeof(p_metrics -> 'drop_ms') <> 'number'
    OR jsonb_typeof(p_metrics -> 'wal_bytes') <> 'number'
    OR (p_metrics ->> 'wal_bytes')::numeric <= 0
  ) THEN
    RAISE EXCEPTION 'representative partition benchmark requires passing measured metrics and WAL';
  END IF;
  INSERT INTO public.propagation_hot_store_benchmark_receipts (
    dataset, candidate, range_start, range_end, source_rows,
    representative, passed, metrics
  ) VALUES (
    p_dataset, p_candidate, p_range_start, p_range_end, p_source_rows,
    p_representative, p_passed, p_metrics
  ) RETURNING id INTO receipt_id;
  RETURN receipt_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_propagation_hot_store_reader_parity(
  p_dataset text,
  p_reconciliation_id uuid,
  p_request_count integer,
  p_exact_row_parity boolean,
  p_aggregate_parity boolean,
  p_metrics jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  receipt_id uuid;
  reconciliation_passed boolean;
BEGIN
  SELECT passed INTO reconciliation_passed
  FROM public.propagation_hot_store_reconciliations
  WHERE id = p_reconciliation_id AND dataset = p_dataset;
  IF NOT coalesce(reconciliation_passed, false) THEN
    RAISE EXCEPTION 'a passing matching reconciliation is required';
  END IF;
  IF p_request_count < 25 OR jsonb_typeof(p_metrics) <> 'object' THEN
    RAISE EXCEPTION 'reader parity receipt is incomplete';
  END IF;
  INSERT INTO public.propagation_hot_store_reader_receipts (
    dataset, reconciliation_id, request_count, exact_row_parity,
    aggregate_parity, passed, metrics
  ) VALUES (
    p_dataset, p_reconciliation_id, p_request_count, p_exact_row_parity,
    p_aggregate_parity, p_exact_row_parity AND p_aggregate_parity, p_metrics
  ) RETURNING id INTO receipt_id;
  IF p_exact_row_parity AND p_aggregate_parity THEN
    UPDATE public.propagation_hot_store_cutovers
    SET reader_receipt_id = receipt_id,
      updated_at = now(), updated_by = current_user
    WHERE dataset = p_dataset;
  END IF;
  RETURN receipt_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_propagation_hot_store_cutover(
  p_dataset text,
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
  current_control public.propagation_hot_store_cutovers%ROWTYPE;
  benchmark_ok boolean;
  reconciliation_ok boolean;
  reader_ok boolean;
BEGIN
  IF p_reason IS NULL OR length(p_reason) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'cutover reason is required';
  END IF;
  IF p_mode NOT IN ('legacy', 'dual_write', 'shadow_read', 'partitioned') THEN
    RAISE EXCEPTION 'invalid hot-store cutover mode';
  END IF;
  SELECT * INTO current_control
  FROM public.propagation_hot_store_cutovers
  WHERE dataset = p_dataset
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'hot-store dataset not found'; END IF;

  IF p_mode = 'dual_write' THEN
    SELECT passed AND representative AND dataset = p_dataset
    INTO benchmark_ok
    FROM public.propagation_hot_store_benchmark_receipts
    WHERE id = p_benchmark_receipt_id;
    IF current_control.mode <> 'legacy' OR NOT coalesce(benchmark_ok, false) THEN
      RAISE EXCEPTION 'dual write requires legacy mode and a passing representative benchmark';
    END IF;
  ELSIF p_mode = 'shadow_read' THEN
    SELECT passed INTO reconciliation_ok
    FROM public.propagation_hot_store_reconciliations
    WHERE id = current_control.reconciliation_id AND dataset = p_dataset;
    SELECT passed INTO reader_ok
    FROM public.propagation_hot_store_reader_receipts
    WHERE id = current_control.reader_receipt_id AND dataset = p_dataset;
    IF current_control.mode <> 'dual_write'
      OR NOT current_control.backfill_complete
      OR NOT coalesce(reconciliation_ok, false)
      OR NOT coalesce(reader_ok, false)
      OR EXISTS (
        SELECT 1 FROM public.propagation_shadow_write_failures
        WHERE dataset = p_dataset AND resolved_at IS NULL
      )
    THEN
      RAISE EXCEPTION 'shadow read requires reconciled backfill, reader parity, and no failed writes';
    END IF;
  ELSIF p_mode = 'partitioned' THEN
    IF current_control.mode <> 'shadow_read'
      OR current_control.reconciliation_id IS NULL
      OR current_control.reader_receipt_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.propagation_shadow_write_failures
        WHERE dataset = p_dataset AND resolved_at IS NULL
      )
    THEN
      RAISE EXCEPTION 'partitioned writer requires a passing shadow-read stage';
    END IF;
  END IF;

  UPDATE public.propagation_hot_store_cutovers
  SET mode = p_mode,
    benchmark_receipt_id = CASE
      WHEN p_mode = 'dual_write' THEN p_benchmark_receipt_id
      ELSE benchmark_receipt_id
    END,
    dual_write_started_at = CASE
      WHEN p_mode = 'dual_write' THEN now() ELSE dual_write_started_at END,
    reader_switched_at = CASE
      WHEN p_mode = 'shadow_read' THEN now() ELSE reader_switched_at END,
    writer_switched_at = CASE
      WHEN p_mode = 'partitioned' THEN now() ELSE writer_switched_at END,
    updated_at = now(), updated_by = current_user, reason = p_reason
  WHERE dataset = p_dataset;

  IF p_mode <> 'legacy' THEN
    UPDATE public.propagation_archive_datasets
    SET prune_enabled = false, updated_at = now()
    WHERE dataset = p_dataset;
  END IF;

  INSERT INTO public.propagation_hot_store_cutover_audit (
    dataset, prior_mode, next_mode, benchmark_receipt_id,
    reconciliation_id, reader_receipt_id, reason
  ) VALUES (
    p_dataset, current_control.mode, p_mode,
    coalesce(p_benchmark_receipt_id, current_control.benchmark_receipt_id),
    current_control.reconciliation_id, current_control.reader_receipt_id,
    p_reason
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.propagation_hot_store_reads_partitioned(
  p_dataset text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT coalesce((
    SELECT mode IN ('shadow_read', 'partitioned')
    FROM public.propagation_hot_store_cutovers
    WHERE dataset = p_dataset
  ), false);
$$;

CREATE OR REPLACE VIEW public.spot_history_live
WITH (security_invoker = true)
AS
SELECT legacy.*
FROM public.spot_history AS legacy
WHERE NOT public.propagation_hot_store_reads_partitioned('spot_history_v1')
UNION ALL
SELECT partitioned.*
FROM public.spot_history_partitioned_v1 AS partitioned
WHERE public.propagation_hot_store_reads_partitioned('spot_history_v1');

CREATE OR REPLACE VIEW public.wspr_observations_live
WITH (security_invoker = true)
AS
SELECT legacy.*
FROM public.wspr_observations_rolling AS legacy
WHERE NOT public.propagation_hot_store_reads_partitioned('wspr_observations_v1')
UNION ALL
SELECT partitioned.*
FROM public.wspr_observations_partitioned_v1 AS partitioned
WHERE public.propagation_hot_store_reads_partitioned('wspr_observations_v1');

ALTER TABLE public.propagation_archive_datasets
  DROP CONSTRAINT propagation_archive_datasets_check;
UPDATE public.propagation_archive_datasets
SET source_relation = CASE dataset
  WHEN 'spot_history_v1' THEN 'public.spot_history_live'
  WHEN 'wspr_observations_v1' THEN 'public.wspr_observations_live'
  ELSE source_relation
END,
updated_at = now()
WHERE dataset IN ('spot_history_v1', 'wspr_observations_v1');
ALTER TABLE public.propagation_archive_datasets
  ADD CONSTRAINT propagation_archive_dataset_source_contract CHECK (
    (dataset = 'spot_history_v1'
      AND source_relation = 'public.spot_history_live'
      AND time_column = 'spotted_at' AND key_column = 'id')
    OR (dataset = 'wspr_observations_v1'
      AND source_relation = 'public.wspr_observations_live'
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
  );

ALTER TABLE public.spot_history_partitioned_v1 ENABLE ROW LEVEL SECURITY;
CREATE POLICY spot_history_partitioned_public_read
  ON public.spot_history_partitioned_v1 FOR SELECT USING (true);
CREATE POLICY spot_history_partitioned_service_write
  ON public.spot_history_partitioned_v1 FOR ALL TO service_role
  USING (true) WITH CHECK (true);

ALTER TABLE public.wspr_observations_partitioned_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wspr_observation_keys_v1 ENABLE ROW LEVEL SECURITY;
CREATE POLICY wspr_observations_partitioned_service
  ON public.wspr_observations_partitioned_v1 FOR ALL TO service_role
  USING (true) WITH CHECK (true);
CREATE POLICY wspr_observation_keys_service
  ON public.wspr_observation_keys_v1 FOR ALL TO service_role
  USING (true) WITH CHECK (true);

ALTER TABLE public.propagation_hot_store_benchmark_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.propagation_hot_store_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.propagation_hot_store_reader_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.propagation_hot_store_cutovers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.propagation_hot_store_cutover_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.propagation_hot_partitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.propagation_shadow_write_failures ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.propagation_hot_store_benchmark_receipts,
  public.propagation_hot_store_reconciliations,
  public.propagation_hot_store_reader_receipts,
  public.propagation_hot_store_cutovers,
  public.propagation_hot_store_cutover_audit,
  public.propagation_hot_partitions,
  public.propagation_shadow_write_failures,
  public.wspr_observation_keys_v1
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.wspr_observations_live FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.propagation_hot_store_benchmark_receipts,
  public.propagation_hot_store_reconciliations,
  public.propagation_hot_store_reader_receipts,
  public.propagation_hot_store_cutover_audit
TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.propagation_hot_store_cutovers,
  public.propagation_hot_partitions,
  public.propagation_shadow_write_failures,
  public.wspr_observation_keys_v1
TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.spot_history_partitioned_v1,
  public.wspr_observations_partitioned_v1 TO service_role;
GRANT SELECT ON public.spot_history_partitioned_v1 TO anon, authenticated;
GRANT SELECT ON public.spot_history_live TO anon, authenticated, service_role;
GRANT SELECT ON public.wspr_observations_live TO service_role;
GRANT USAGE, SELECT ON SEQUENCE
  public.propagation_hot_store_cutover_audit_id_seq,
  public.propagation_shadow_write_failures_id_seq
TO service_role;

REVOKE ALL ON FUNCTION public.ensure_propagation_hot_partitions(text, timestamptz, timestamptz),
  public.propagation_hot_store_reads_partitioned(text),
  public.ingest_spot_history_rows(jsonb),
  public.ingest_wspr_observation_rows(jsonb),
  public.backfill_propagation_hot_store_batch(text, timestamptz, timestamptz, timestamptz, bigint, integer),
  public.reconcile_propagation_hot_store(text, timestamptz, timestamptz),
  public.record_propagation_hot_store_benchmark(text, text, timestamptz, timestamptz, bigint, boolean, boolean, jsonb),
  public.record_propagation_hot_store_reader_parity(text, uuid, integer, boolean, boolean, jsonb),
  public.set_propagation_hot_store_cutover(text, text, uuid, text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_propagation_hot_partitions(text, timestamptz, timestamptz),
  public.ingest_spot_history_rows(jsonb),
  public.ingest_wspr_observation_rows(jsonb),
  public.backfill_propagation_hot_store_batch(text, timestamptz, timestamptz, timestamptz, bigint, integer),
  public.reconcile_propagation_hot_store(text, timestamptz, timestamptz),
  public.record_propagation_hot_store_benchmark(text, text, timestamptz, timestamptz, bigint, boolean, boolean, jsonb),
  public.record_propagation_hot_store_reader_parity(text, uuid, integer, boolean, boolean, jsonb),
  public.set_propagation_hot_store_cutover(text, text, uuid, text)
TO service_role;
GRANT EXECUTE ON FUNCTION public.propagation_hot_store_reads_partitioned(text)
TO anon, authenticated, service_role;

COMMENT ON TABLE public.spot_history_partitioned_v1 IS
  'Daily native-range Phase 3 spot hot store; authoritative only after audited cutover.';
COMMENT ON TABLE public.wspr_observations_partitioned_v1 IS
  'Hourly native-range Phase 3 WSPR hot store; authoritative only after audited cutover.';
COMMENT ON VIEW public.spot_history_live IS
  'Stable reversible spot reader selected by the fail-closed cutover control.';
COMMENT ON VIEW public.wspr_observations_live IS
  'Stable private WSPR reader selected by the fail-closed cutover control.';
