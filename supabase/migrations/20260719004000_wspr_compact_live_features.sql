-- Versioned compact PostgreSQL-array WSPR feature store (Phase 4).
--
-- The array candidate is implemented as a shadow because it preserves one
-- indexed lookup per transmitting grid and band. It cannot become the reader
-- or writer until a representative receipt compares row, PostgreSQL-array,
-- and Parquet/cache candidates and an exact H-1/H-2/H-3/H-24 dual-read gate
-- passes. All controls default to the row-form legacy store.

CREATE TABLE public.wspr_compact_benchmark_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  range_start timestamptz NOT NULL,
  range_end timestamptz NOT NULL,
  source_cells bigint NOT NULL CHECK (source_cells > 0),
  lookup_groups integer NOT NULL CHECK (lookup_groups > 0),
  representative boolean NOT NULL DEFAULT false,
  selected_candidate text NOT NULL CHECK (
    selected_candidate IN ('postgres_arrays_v1', 'parquet_cache_v1')
  ),
  exact_cell_parity boolean NOT NULL,
  exact_lag_response_parity boolean NOT NULL,
  railway_concurrency integer NOT NULL CHECK (railway_concurrency > 0),
  passed boolean NOT NULL,
  row_form_metrics jsonb NOT NULL,
  postgres_array_metrics jsonb NOT NULL,
  parquet_cache_metrics jsonb NOT NULL,
  failure_behavior jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by text NOT NULL DEFAULT current_user,
  CHECK (range_end > range_start),
  CHECK (range_end - range_start <= interval '48 hours'),
  CHECK (NOT passed OR (
    exact_cell_parity AND exact_lag_response_parity
    AND jsonb_typeof(row_form_metrics) = 'object'
    AND jsonb_typeof(postgres_array_metrics) = 'object'
    AND jsonb_typeof(parquet_cache_metrics) = 'object'
    AND jsonb_typeof(failure_behavior) = 'object'
  ))
);

CREATE TABLE public.wspr_compact_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  range_start timestamptz NOT NULL,
  range_end timestamptz NOT NULL,
  row_cells bigint NOT NULL CHECK (row_cells >= 0),
  compact_cells bigint NOT NULL CHECK (compact_cells >= 0),
  compact_groups bigint NOT NULL CHECK (compact_groups >= 0),
  exact_cell_parity boolean NOT NULL,
  passed boolean NOT NULL,
  checks jsonb NOT NULL,
  reconciled_at timestamptz NOT NULL DEFAULT now(),
  CHECK (range_end > range_start),
  CHECK (jsonb_typeof(checks) = 'object'),
  CHECK (NOT passed OR exact_cell_parity)
);

CREATE TABLE public.wspr_compact_reader_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_id uuid NOT NULL
    REFERENCES public.wspr_compact_reconciliations(id),
  request_count integer NOT NULL CHECK (request_count >= 100),
  concurrent_clients integer NOT NULL CHECK (concurrent_clients > 0),
  exact_response_parity boolean NOT NULL,
  cold_p95_ms double precision NOT NULL CHECK (cold_p95_ms >= 0),
  warm_p95_ms double precision NOT NULL CHECK (warm_p95_ms >= 0),
  passed boolean NOT NULL,
  details jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by text NOT NULL DEFAULT current_user,
  CHECK (jsonb_typeof(details) = 'object'),
  CHECK (NOT passed OR exact_response_parity)
);

CREATE TABLE public.wspr_compact_feature_controls (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  mode text NOT NULL DEFAULT 'legacy' CHECK (mode IN (
    'legacy', 'dual_write', 'shadow_read', 'compact'
  )),
  schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  benchmark_receipt_id uuid REFERENCES public.wspr_compact_benchmark_receipts(id),
  reconciliation_id uuid REFERENCES public.wspr_compact_reconciliations(id),
  reader_receipt_id uuid REFERENCES public.wspr_compact_reader_receipts(id),
  backfill_complete boolean NOT NULL DEFAULT false,
  row_form_retirement_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL DEFAULT current_user,
  reason text NOT NULL DEFAULT 'initial fail-closed row-form mode'
    CHECK (length(reason) BETWEEN 1 AND 1000),
  CHECK (NOT row_form_retirement_enabled OR mode = 'compact')
);
INSERT INTO public.wspr_compact_feature_controls(singleton)
VALUES (true) ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE public.wspr_compact_cutover_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  prior_mode text,
  next_mode text NOT NULL,
  benchmark_receipt_id uuid,
  reconciliation_id uuid,
  reader_receipt_id uuid,
  reason text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by text NOT NULL DEFAULT current_user
);

CREATE TABLE public.wspr_compact_write_failures (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  target_hour timestamptz NOT NULL,
  band text NOT NULL,
  tx_grid4 text NOT NULL,
  provider text NOT NULL,
  transform_version text NOT NULL,
  available_at timestamptz NOT NULL,
  postgres_error_code text,
  error_message text NOT NULL,
  attempts integer NOT NULL DEFAULT 1 CHECK (attempts > 0),
  first_failed_at timestamptz NOT NULL DEFAULT now(),
  last_failed_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  UNIQUE (
    target_hour, band, tx_grid4, provider, transform_version, available_at
  )
);

CREATE TABLE public.wspr_path_hourly_compact_v1 (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  target_hour timestamptz NOT NULL,
  band text NOT NULL CHECK (band IN (
    '160m', '80m', '60m', '40m', '30m',
    '20m', '17m', '15m', '12m', '10m'
  )),
  tx_grid4 text NOT NULL CHECK (tx_grid4 ~ '^[A-R]{2}[0-9]{2}$'),
  provider text NOT NULL CHECK (provider ~ '^[a-z0-9][a-z0-9_.:-]{0,63}$'),
  transform_version text NOT NULL CHECK (length(transform_version) BETWEEN 1 AND 128),
  available_at timestamptz NOT NULL,
  source_watermark timestamptz NOT NULL,
  rx_grid4s text[] NOT NULL,
  success_rates double precision[] NOT NULL,
  successes double precision[] NOT NULL,
  opportunities double precision[] NOT NULL,
  sampled_rows integer[] NOT NULL,
  positive_rows integer[] NOT NULL,
  cell_quality_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (available_at >= target_hour + interval '1 hour'),
  CHECK (source_watermark <= target_hour + interval '1 hour'),
  CHECK (source_watermark <= available_at),
  CHECK (cardinality(rx_grid4s) > 0),
  CHECK (cardinality(rx_grid4s) = cardinality(success_rates)),
  CHECK (cardinality(rx_grid4s) = cardinality(successes)),
  CHECK (cardinality(rx_grid4s) = cardinality(opportunities)),
  CHECK (cardinality(rx_grid4s) = cardinality(sampled_rows)),
  CHECK (cardinality(rx_grid4s) = cardinality(positive_rows)),
  CHECK (jsonb_typeof(cell_quality_flags) = 'array'),
  CHECK (jsonb_array_length(cell_quality_flags) = cardinality(rx_grid4s))
) PARTITION BY RANGE (target_hour);

CREATE UNIQUE INDEX wspr_path_compact_pk
  ON public.wspr_path_hourly_compact_v1(target_hour, id);
CREATE UNIQUE INDEX wspr_path_compact_lookup_key
  ON public.wspr_path_hourly_compact_v1(
    target_hour, band, tx_grid4, provider, transform_version, available_at
  );
CREATE INDEX wspr_path_compact_lookup_idx
  ON public.wspr_path_hourly_compact_v1(
    tx_grid4, band, target_hour DESC, available_at DESC
  );

CREATE TABLE public.wspr_compact_partitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_relation text NOT NULL UNIQUE,
  range_start timestamptz NOT NULL,
  range_end timestamptz NOT NULL,
  state text NOT NULL DEFAULT 'active' CHECK (state IN (
    'active', 'detached', 'dropped'
  )),
  manifest_id uuid REFERENCES public.propagation_archive_manifests(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz,
  UNIQUE (range_start, range_end),
  CHECK (range_end = range_start + interval '1 hour')
);

CREATE OR REPLACE FUNCTION public.validate_wspr_compact_feature_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  index_value integer;
  prior_grid text;
  flags_value jsonb;
BEGIN
  FOR index_value IN 1..cardinality(NEW.rx_grid4s) LOOP
    IF NEW.rx_grid4s[index_value] !~ '^[A-R]{2}[0-9]{2}$'
      OR NEW.rx_grid4s[index_value] = NEW.tx_grid4
      OR (prior_grid IS NOT NULL AND prior_grid >= NEW.rx_grid4s[index_value])
    THEN
      RAISE EXCEPTION 'compact receiving grids must be valid, unique, and sorted';
    END IF;
    IF NEW.successes[index_value] < 0
      OR NEW.opportunities[index_value] <= 0
      OR NEW.successes[index_value] > NEW.opportunities[index_value]
      OR NEW.success_rates[index_value] < 0
      OR NEW.success_rates[index_value] > 1
      OR abs(
        NEW.success_rates[index_value]
        - NEW.successes[index_value] / NEW.opportunities[index_value]
      ) > 1e-12
      OR NEW.sampled_rows[index_value] <= 0
      OR NEW.positive_rows[index_value] < 0
      OR NEW.positive_rows[index_value] > NEW.sampled_rows[index_value]
    THEN
      RAISE EXCEPTION 'compact WSPR cell violates the row-form numeric contract';
    END IF;
    flags_value := NEW.cell_quality_flags -> (index_value - 1);
    IF jsonb_typeof(flags_value) <> 'array' OR EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(flags_value) AS flag(value)
      WHERE value !~ '^[a-z0-9][a-z0-9_.:-]{0,127}$'
    ) THEN
      RAISE EXCEPTION 'compact WSPR cell quality flags are invalid';
    END IF;
    prior_grid := NEW.rx_grid4s[index_value];
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER wspr_path_compact_v1_validate
BEFORE INSERT OR UPDATE ON public.wspr_path_hourly_compact_v1
FOR EACH ROW EXECUTE FUNCTION public.validate_wspr_compact_feature_v1();

CREATE OR REPLACE FUNCTION public.ensure_wspr_compact_partitions(
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
  child_name text;
  created_count integer := 0;
BEGIN
  IF p_range_start IS NULL OR p_range_end IS NULL
    OR p_range_start <> date_trunc('hour', p_range_start)
    OR p_range_end <> date_trunc('hour', p_range_end)
    OR p_range_end <= p_range_start
    OR p_range_end - p_range_start > interval '48 hours'
  THEN
    RAISE EXCEPTION 'compact feature partitions require a bounded aligned range';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('wspr-compact-partitions-v1', 0));
  cursor_time := p_range_start;
  WHILE cursor_time < p_range_end LOOP
    child_name := 'wspr_path_compact_p'
      || to_char(cursor_time AT TIME ZONE 'UTC', 'YYYYMMDDHH24');
    IF to_regclass('public.' || child_name) IS NULL THEN
      EXECUTE format(
        'CREATE TABLE public.%I PARTITION OF public.wspr_path_hourly_compact_v1 FOR VALUES FROM (%L) TO (%L)',
        child_name, cursor_time, cursor_time + interval '1 hour'
      );
      created_count := created_count + 1;
    END IF;
    INSERT INTO public.wspr_compact_partitions(
      child_relation, range_start, range_end
    ) VALUES (
      'public.' || child_name, cursor_time, cursor_time + interval '1 hour'
    ) ON CONFLICT (range_start, range_end) DO UPDATE SET
      child_relation = excluded.child_relation,
      state = 'active', retired_at = null;
    cursor_time := cursor_time + interval '1 hour';
  END LOOP;
  RETURN created_count;
END;
$$;

SELECT public.ensure_wspr_compact_partitions(
  date_trunc('hour', now()) - interval '30 hours',
  date_trunc('hour', now()) + interval '2 hours'
);

CREATE OR REPLACE FUNCTION public.ingest_wspr_feature_rows(p_rows jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  control_mode text;
  inserted_rows bigint;
BEGIN
  IF jsonb_typeof(p_rows) <> 'array'
    OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 10000
  THEN
    RAISE EXCEPTION 'WSPR feature batch must contain 1 to 10000 rows';
  END IF;
  SELECT mode INTO control_mode
  FROM public.wspr_compact_feature_controls WHERE singleton;
  IF control_mode = 'compact' THEN
    RETURN 0;
  END IF;
  INSERT INTO public.wspr_path_hourly_features (
    target_hour, band, tx_grid4, rx_grid4, successes, opportunities,
    success_rate, sampled_rows, positive_rows, available_at,
    source_watermark, provider, transform_version, quality_flags
  )
  SELECT
    row.target_hour, row.band, row.tx_grid4, row.rx_grid4, row.successes,
    row.opportunities, row.success_rate, row.sampled_rows, row.positive_rows,
    row.available_at, row.source_watermark, row.provider,
    row.transform_version, coalesce(row.quality_flags, '{}'::text[])
  FROM jsonb_to_recordset(p_rows) AS row(
    target_hour timestamptz, band text, tx_grid4 text, rx_grid4 text,
    successes double precision, opportunities double precision,
    success_rate double precision, sampled_rows integer,
    positive_rows integer, available_at timestamptz,
    source_watermark timestamptz, provider text, transform_version text,
    quality_flags text[]
  )
  ON CONFLICT (
    target_hour, band, tx_grid4, rx_grid4,
    provider, transform_version, available_at
  ) DO UPDATE SET
    successes = excluded.successes,
    opportunities = excluded.opportunities,
    success_rate = excluded.success_rate,
    sampled_rows = excluded.sampled_rows,
    positive_rows = excluded.positive_rows,
    source_watermark = excluded.source_watermark,
    quality_flags = excluded.quality_flags;
  GET DIAGNOSTICS inserted_rows = ROW_COUNT;
  RETURN inserted_rows;
END;
$$;

CREATE OR REPLACE FUNCTION public.ingest_wspr_compact_feature_rows(p_rows jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  control_mode text;
  min_hour timestamptz;
  max_hour timestamptz;
  inserted_rows bigint;
BEGIN
  IF jsonb_typeof(p_rows) <> 'array'
    OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 1000
  THEN
    RAISE EXCEPTION 'compact feature batch must contain 1 to 1000 groups';
  END IF;
  SELECT mode INTO control_mode
  FROM public.wspr_compact_feature_controls WHERE singleton;
  IF control_mode = 'legacy' THEN RETURN 0; END IF;
  SELECT min(row.target_hour), max(row.target_hour)
  INTO min_hour, max_hour
  FROM jsonb_to_recordset(p_rows) AS row(target_hour timestamptz);
  PERFORM public.ensure_wspr_compact_partitions(
    date_trunc('hour', min_hour), date_trunc('hour', max_hour) + interval '1 hour'
  );
  BEGIN
    INSERT INTO public.wspr_path_hourly_compact_v1 (
      target_hour, band, tx_grid4, provider, transform_version,
      available_at, source_watermark, rx_grid4s, success_rates,
      successes, opportunities, sampled_rows, positive_rows,
      cell_quality_flags
    )
    SELECT
      row.target_hour, row.band, row.tx_grid4, row.provider,
      row.transform_version, row.available_at, row.source_watermark,
      row.rx_grid4s, row.success_rates, row.successes, row.opportunities,
      row.sampled_rows, row.positive_rows,
      coalesce(row.cell_quality_flags, '[]'::jsonb)
    FROM jsonb_to_recordset(p_rows) AS row(
      target_hour timestamptz, band text, tx_grid4 text, provider text,
      transform_version text, available_at timestamptz,
      source_watermark timestamptz, rx_grid4s text[],
      success_rates double precision[], successes double precision[],
      opportunities double precision[], sampled_rows integer[],
      positive_rows integer[], cell_quality_flags jsonb
    )
    ON CONFLICT (
      target_hour, band, tx_grid4, provider, transform_version, available_at
    ) DO UPDATE SET
      source_watermark = excluded.source_watermark,
      rx_grid4s = excluded.rx_grid4s,
      success_rates = excluded.success_rates,
      successes = excluded.successes,
      opportunities = excluded.opportunities,
      sampled_rows = excluded.sampled_rows,
      positive_rows = excluded.positive_rows,
      cell_quality_flags = excluded.cell_quality_flags;
    GET DIAGNOSTICS inserted_rows = ROW_COUNT;
    UPDATE public.wspr_compact_write_failures AS failure
    SET resolved_at = now()
    WHERE resolved_at IS NULL AND EXISTS (
      SELECT 1 FROM jsonb_to_recordset(p_rows) AS row(
        target_hour timestamptz, band text, tx_grid4 text, provider text,
        transform_version text, available_at timestamptz
      )
      WHERE row.target_hour = failure.target_hour
        AND row.band = failure.band AND row.tx_grid4 = failure.tx_grid4
        AND row.provider = failure.provider
        AND row.transform_version = failure.transform_version
        AND row.available_at = failure.available_at
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.wspr_compact_write_failures (
      target_hour, band, tx_grid4, provider, transform_version,
      available_at, postgres_error_code, error_message
    )
    SELECT row.target_hour, row.band, row.tx_grid4, row.provider,
      row.transform_version, row.available_at, SQLSTATE, SQLERRM
    FROM jsonb_to_recordset(p_rows) AS row(
      target_hour timestamptz, band text, tx_grid4 text, provider text,
      transform_version text, available_at timestamptz
    )
    ON CONFLICT (
      target_hour, band, tx_grid4, provider, transform_version, available_at
    ) DO UPDATE SET
      postgres_error_code = excluded.postgres_error_code,
      error_message = excluded.error_message,
      attempts = public.wspr_compact_write_failures.attempts + 1,
      last_failed_at = now(), resolved_at = null;
    IF control_mode IN ('shadow_read', 'compact') THEN RAISE; END IF;
    RETURN 0;
  END;
  RETURN inserted_rows;
END;
$$;

CREATE OR REPLACE FUNCTION public.backfill_wspr_compact_feature_groups(
  p_range_start timestamptz,
  p_range_end timestamptz,
  p_after jsonb DEFAULT '{}'::jsonb,
  p_batch_groups integer DEFAULT 1000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE result jsonb;
BEGIN
  IF p_range_start IS NULL OR p_range_end IS NULL
    OR p_range_end <= p_range_start
    OR p_range_end - p_range_start > interval '48 hours'
    OR p_batch_groups NOT BETWEEN 1 AND 5000
    OR jsonb_typeof(p_after) <> 'object'
  THEN
    RAISE EXCEPTION 'invalid bounded compact backfill request';
  END IF;
  PERFORM public.ensure_wspr_compact_partitions(
    date_trunc('hour', p_range_start),
    date_trunc('hour', p_range_end - interval '1 microsecond') + interval '1 hour'
  );
  WITH group_keys AS MATERIALIZED (
    SELECT DISTINCT target_hour, band, tx_grid4, provider,
      transform_version, available_at
    FROM public.wspr_path_hourly_features
    WHERE target_hour >= p_range_start AND target_hour < p_range_end
      AND (
        p_after = '{}'::jsonb
        OR (target_hour, band, tx_grid4, provider, transform_version, available_at)
          > (
            (p_after ->> 'target_hour')::timestamptz,
            p_after ->> 'band', p_after ->> 'tx_grid4',
            p_after ->> 'provider', p_after ->> 'transform_version',
            (p_after ->> 'available_at')::timestamptz
          )
      )
    ORDER BY target_hour, band, tx_grid4, provider,
      transform_version, available_at
    LIMIT p_batch_groups
  ), compact_rows AS MATERIALIZED (
    SELECT feature.target_hour, feature.band, feature.tx_grid4,
      feature.provider, feature.transform_version, feature.available_at,
      max(feature.source_watermark) AS source_watermark,
      array_agg(feature.rx_grid4 ORDER BY feature.rx_grid4) AS rx_grid4s,
      array_agg(feature.success_rate ORDER BY feature.rx_grid4) AS success_rates,
      array_agg(feature.successes ORDER BY feature.rx_grid4) AS successes,
      array_agg(feature.opportunities ORDER BY feature.rx_grid4) AS opportunities,
      array_agg(feature.sampled_rows ORDER BY feature.rx_grid4) AS sampled_rows,
      array_agg(feature.positive_rows ORDER BY feature.rx_grid4) AS positive_rows,
      jsonb_agg(to_jsonb(feature.quality_flags) ORDER BY feature.rx_grid4)
        AS cell_quality_flags
    FROM public.wspr_path_hourly_features AS feature
    JOIN group_keys USING (
      target_hour, band, tx_grid4, provider, transform_version, available_at
    )
    GROUP BY feature.target_hour, feature.band, feature.tx_grid4,
      feature.provider, feature.transform_version, feature.available_at
  ), inserted AS (
    INSERT INTO public.wspr_path_hourly_compact_v1 (
      target_hour, band, tx_grid4, provider, transform_version,
      available_at, source_watermark, rx_grid4s, success_rates,
      successes, opportunities, sampled_rows, positive_rows,
      cell_quality_flags
    )
    SELECT target_hour, band, tx_grid4, provider, transform_version,
      available_at, source_watermark, rx_grid4s, success_rates,
      successes, opportunities, sampled_rows, positive_rows,
      cell_quality_flags
    FROM compact_rows
    ON CONFLICT (
      target_hour, band, tx_grid4, provider, transform_version, available_at
    ) DO UPDATE SET
      source_watermark = excluded.source_watermark,
      rx_grid4s = excluded.rx_grid4s,
      success_rates = excluded.success_rates,
      successes = excluded.successes,
      opportunities = excluded.opportunities,
      sampled_rows = excluded.sampled_rows,
      positive_rows = excluded.positive_rows,
      cell_quality_flags = excluded.cell_quality_flags
    RETURNING 1
  )
  SELECT jsonb_build_object(
    'groups', (SELECT count(*) FROM group_keys),
    'groups_written', (SELECT count(*) FROM inserted),
    'source_cells', coalesce((
      SELECT sum(cardinality(rx_grid4s)) FROM compact_rows
    ), 0),
    'next', coalesce((
      SELECT jsonb_build_object(
        'target_hour', target_hour, 'band', band, 'tx_grid4', tx_grid4,
        'provider', provider, 'transform_version', transform_version,
        'available_at', available_at
      )
      FROM group_keys
      ORDER BY target_hour DESC, band DESC, tx_grid4 DESC, provider DESC,
        transform_version DESC, available_at DESC
      LIMIT 1
    ), p_after),
    'complete', (SELECT count(*) FROM group_keys) < p_batch_groups
  ) INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_wspr_compact_features(
  p_range_start timestamptz,
  p_range_end timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  row_cells bigint;
  compact_cells bigint;
  compact_groups bigint;
  exact_parity boolean;
  receipt_id uuid;
BEGIN
  IF p_range_start IS NULL OR p_range_end IS NULL
    OR p_range_end <= p_range_start
    OR p_range_end - p_range_start > interval '48 hours'
  THEN
    RAISE EXCEPTION 'invalid compact reconciliation range';
  END IF;
  SELECT count(*) INTO row_cells
  FROM public.wspr_path_hourly_features
  WHERE target_hour >= p_range_start AND target_hour < p_range_end;
  SELECT coalesce(sum(cardinality(rx_grid4s)), 0), count(*)
  INTO compact_cells, compact_groups
  FROM public.wspr_path_hourly_compact_v1
  WHERE target_hour >= p_range_start AND target_hour < p_range_end;

  WITH row_form AS (
    SELECT target_hour, band, tx_grid4, rx_grid4, provider,
      transform_version, available_at, source_watermark,
      successes, opportunities, success_rate, sampled_rows, positive_rows,
      to_jsonb(quality_flags) AS quality_flags
    FROM public.wspr_path_hourly_features
    WHERE target_hour >= p_range_start AND target_hour < p_range_end
  ), compact_form AS (
    SELECT compact.target_hour, compact.band, compact.tx_grid4,
      compact.rx_grid4s[cell.index] AS rx_grid4, compact.provider,
      compact.transform_version, compact.available_at,
      compact.source_watermark,
      compact.successes[cell.index] AS successes,
      compact.opportunities[cell.index] AS opportunities,
      compact.success_rates[cell.index] AS success_rate,
      compact.sampled_rows[cell.index] AS sampled_rows,
      compact.positive_rows[cell.index] AS positive_rows,
      compact.cell_quality_flags -> (cell.index - 1) AS quality_flags
    FROM public.wspr_path_hourly_compact_v1 AS compact
    CROSS JOIN LATERAL generate_subscripts(compact.rx_grid4s, 1) AS cell(index)
    WHERE compact.target_hour >= p_range_start
      AND compact.target_hour < p_range_end
  )
  SELECT NOT EXISTS (
    (SELECT * FROM row_form EXCEPT SELECT * FROM compact_form)
    UNION ALL
    (SELECT * FROM compact_form EXCEPT SELECT * FROM row_form)
  ) INTO exact_parity;

  INSERT INTO public.wspr_compact_reconciliations (
    range_start, range_end, row_cells, compact_cells, compact_groups,
    exact_cell_parity, passed, checks
  ) VALUES (
    p_range_start, p_range_end, row_cells, compact_cells, compact_groups,
    exact_parity, row_cells = compact_cells AND exact_parity,
    jsonb_build_object(
      'row_cells_match', row_cells = compact_cells,
      'exact_cell_parity', exact_parity,
      'unresolved_write_failures', (
        SELECT count(*) FROM public.wspr_compact_write_failures
        WHERE resolved_at IS NULL AND target_hour >= p_range_start
          AND target_hour < p_range_end
      )
    )
  ) RETURNING id INTO receipt_id;
  IF row_cells = compact_cells AND exact_parity AND NOT EXISTS (
    SELECT 1 FROM public.wspr_compact_write_failures
    WHERE resolved_at IS NULL AND target_hour >= p_range_start
      AND target_hour < p_range_end
  ) THEN
    UPDATE public.wspr_compact_feature_controls
    SET reconciliation_id = receipt_id, backfill_complete = true,
      updated_at = now(), updated_by = current_user
    WHERE singleton;
  END IF;
  RETURN receipt_id;
END;
$$;

ALTER TABLE public.wspr_path_hourly_compact_v1 ENABLE ROW LEVEL SECURITY;
CREATE POLICY wspr_path_compact_service
  ON public.wspr_path_hourly_compact_v1 FOR ALL TO service_role
  USING (true) WITH CHECK (true);

ALTER TABLE public.wspr_compact_benchmark_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wspr_compact_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wspr_compact_reader_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wspr_compact_feature_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wspr_compact_cutover_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wspr_compact_write_failures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wspr_compact_partitions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.wspr_path_hourly_compact_v1,
  public.wspr_compact_benchmark_receipts,
  public.wspr_compact_reconciliations,
  public.wspr_compact_reader_receipts,
  public.wspr_compact_feature_controls,
  public.wspr_compact_cutover_audit,
  public.wspr_compact_write_failures,
  public.wspr_compact_partitions
FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wspr_path_hourly_compact_v1
  TO service_role;
GRANT SELECT, INSERT ON public.wspr_compact_benchmark_receipts,
  public.wspr_compact_reconciliations,
  public.wspr_compact_reader_receipts,
  public.wspr_compact_cutover_audit TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.wspr_compact_feature_controls,
  public.wspr_compact_write_failures,
  public.wspr_compact_partitions TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.wspr_compact_cutover_audit_id_seq,
  public.wspr_compact_write_failures_id_seq TO service_role;

REVOKE ALL ON FUNCTION public.ensure_wspr_compact_partitions(timestamptz, timestamptz),
  public.ingest_wspr_feature_rows(jsonb),
  public.ingest_wspr_compact_feature_rows(jsonb),
  public.backfill_wspr_compact_feature_groups(timestamptz, timestamptz, jsonb, integer),
  public.reconcile_wspr_compact_features(timestamptz, timestamptz)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_wspr_compact_partitions(timestamptz, timestamptz),
  public.ingest_wspr_feature_rows(jsonb),
  public.ingest_wspr_compact_feature_rows(jsonb),
  public.backfill_wspr_compact_feature_groups(timestamptz, timestamptz, jsonb, integer),
  public.reconcile_wspr_compact_features(timestamptz, timestamptz)
TO service_role;

COMMENT ON TABLE public.wspr_path_hourly_compact_v1 IS
  'Hourly partitioned versioned PostgreSQL-array WSPR feature candidate; service-only and fail-closed behind dual-read controls.';
