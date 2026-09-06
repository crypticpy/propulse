-- #297 (NowCast N2): field-grain path recency features v2.
--
-- Migrations are never auto-applied to this project's Supabase instance —
-- someone must run this by hand. Every statement below is written to be
-- safe to re-run (IF NOT EXISTS / CREATE OR REPLACE).
--
-- ─── What this is, and what it is NOT ──────────────────────────────────────
--
-- The served XGBoost model's `nowcast` profile wants four recency features
-- (path_success_prev1/2/3/24) plus a per-lag availability flag. Those were
-- WSPR *opportunity success rates* at grid4 grain, served by
-- public.lookup_wspr_path_lags, which was dropped with the rest of the WSPR
-- live pipeline on 2026-07-21 (20260721110000_drop_wspr_live_pipeline.sql).
-- Nothing WSPR is being rebuilt here and nothing below reads a WSPR table.
--
-- The replacement source is our own PSK Reporter / RBN aggregate
-- public.path_hourly_stats, at 2-character Maidenhead FIELD grain — grid4
-- grain measured at 1.06 spots/cell/hour, too sparse to be a feature; field
-- grain gives ~5 spots/cell.
--
-- The statistic stored here is a NETWORK-RECENCY STATISTIC, NEVER A WSPR
-- OPPORTUNITY RATE. path_hourly_stats records positives only: it knows a
-- path was heard, never that it was tried and missed. So "did this field
-- pair show up in the spot network in hour H, relative to how broad that
-- receiving field's reach was in hour H" is the honest reading of
-- recency_rate. It is NOT "probability the path was open", it is NOT
-- comparable in level to the WSPR-trained feature, and the N3 retrain is
-- what makes the two commensurable (per-band-hour quantile normalisation).
-- Do not relabel these values as WSPR history anywhere.
--
-- ─── Denominator (decision D1, Option B, owner-confirmed) ─────────────────
--
-- For a (hour, band, rx_field):
--   exposure = number of DISTINCT tx fields heard by any receiver in that
--              rx_field on that band-hour. It stands in for "how many
--              transmitting fields a receiver sitting in rx_field could
--              plausibly have logged this hour" — the only exposure proxy
--              available from a positives-only feed.
--   heard    = 1 when this specific (tx_field -> rx_field) pair had >=1 spot
--              in that band-hour (any mode_class).
--   recency_rate = heard / exposure.
--
-- Consequence, stated plainly so nobody rediscovers it in a model post-mortem:
-- rows are only written for pairs that WERE heard, so heard is always 1 and
-- recency_rate is always 1/exposure — i.e. the magnitude is a per-rx_field
-- inverse-breadth weight, and the genuinely per-pair signal lives in the four
-- availability flags (was this pair present at H-1 / H-2 / H-3 / H-24). A
-- busy receiving field dilutes every path into it. If N3 finds that sign
-- unhelpful, the typed count columns already carry what is needed to derive
-- a spot-share rate (spots / rx_spots) or a digital-only rate WITHOUT a
-- second 53-day backfill: digital_heard, digital_exposure, spots, rx_spots.
-- (They are plain columns, not a jsonb blob: at ~70k rows/day the blob cost
-- ~100 bytes per row, twice the size of the source aggregate.)
--
-- Only the ten HF bands the model's band one-hot supports are aggregated;
-- 6m/2m/other rows in path_hourly_stats are skipped (they could never be
-- looked up, and the table is large enough already).

-- ─── path_recency_hourly ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.path_recency_hourly (
  hour_utc          timestamptz NOT NULL,
  band              text NOT NULL CHECK (band IN (
                      '160m', '80m', '60m', '40m', '30m',
                      '20m', '17m', '15m', '12m', '10m'
                    )),
  tx_field          text NOT NULL CHECK (tx_field ~ '^[A-R]{2}$'),
  rx_field          text NOT NULL CHECK (rx_field ~ '^[A-R]{2}$'),
  heard             integer NOT NULL CHECK (heard >= 0),
  exposure          integer NOT NULL CHECK (exposure >= 0),
  recency_rate      double precision CHECK (recency_rate BETWEEN 0 AND 1),
  transform_version text NOT NULL CHECK (length(transform_version) BETWEEN 1 AND 128),
  source_watermark  timestamptz NOT NULL,
  available_at      timestamptz NOT NULL,
  digital_heard     smallint NOT NULL CHECK (digital_heard IN (0, 1)),
  digital_exposure  integer NOT NULL CHECK (digital_exposure >= 0),
  spots             integer NOT NULL CHECK (spots >= 0),
  rx_spots          bigint NOT NULL CHECK (rx_spots >= 0),
  PRIMARY KEY (hour_utc, band, tx_field, rx_field, transform_version),
  CHECK (heard <= exposure),
  CHECK (digital_heard <= heard),
  CHECK (digital_exposure <= exposure),
  CHECK (spots <= rx_spots),
  -- recency_rate is null exactly when the denominator is empty
  CHECK ((exposure = 0) = (recency_rate IS NULL)),
  CHECK (
    recency_rate IS NULL
    OR abs(recency_rate - heard::double precision / exposure) <= 1e-12
  ),
  -- Causality, same discipline the dropped WSPR store enforced: the row
  -- covers the hour bucket, so its source data ends at hour_utc + 1h and it
  -- cannot become readable before that.
  CHECK (source_watermark <= hour_utc + interval '1 hour'),
  CHECK (available_at >= hour_utc + interval '1 hour'),
  CHECK (source_watermark <= available_at)
);

-- The primary key already leads with (hour_utc, band, tx_field), which is the
-- exact shape lookup_path_recency_lags probes. This second index serves the
-- other direction — "everything from this origin field on this band over
-- time" — used by the coverage/acceptance queries and by any future backfill
-- audit (mirrors path_hourly_stats_tx_field_idx).
CREATE INDEX IF NOT EXISTS path_recency_hourly_origin_idx
  ON public.path_recency_hourly (tx_field, band, hour_utc DESC);

COMMENT ON TABLE public.path_recency_hourly IS
  'Field-grain (2-char Maidenhead) hourly path recency derived from path_hourly_stats (PSK Reporter/RBN). A NETWORK-RECENCY STATISTIC, never a WSPR opportunity rate: the feed is positives-only, so recency_rate = heard/exposure measures presence relative to the receiving field''s reach, not probability of opening.';
COMMENT ON COLUMN public.path_recency_hourly.exposure IS
  'Distinct tx fields heard by any receiver in rx_field on this band-hour (decision D1 option B).';
COMMENT ON COLUMN public.path_recency_hourly.heard IS
  'One when this tx_field -> rx_field pair had at least one spot in the band-hour (any mode_class). Rows exist only for heard pairs, so this is always 1 today.';
COMMENT ON COLUMN public.path_recency_hourly.digital_exposure IS
  'digital_heard / digital_exposure repeat the statistic restricted to mode_class = digital. Kept so a digital-only rate can be derived without re-running the 53-day backfill.';
COMMENT ON COLUMN public.path_recency_hourly.rx_spots IS
  'spots / rx_spots are the raw pair and receiving-field spot counts. Kept so a spot-share rate can be derived without re-running the 53-day backfill.';

ALTER TABLE public.path_recency_hourly ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.path_recency_hourly FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.path_recency_hourly TO service_role;

-- ─── compute_path_recency_hourly(hour, transform_version) ─────────────────
-- Recomputes exactly one hour from path_hourly_stats. Idempotent: the hour's
-- rows for that transform_version are deleted and rewritten in one
-- transaction, so late spots that landed in path_hourly_stats after the
-- first pass are absorbed by simply calling it again. Returns rows written.

CREATE OR REPLACE FUNCTION public.compute_path_recency_hourly(
  p_hour timestamptz,
  p_transform_version text DEFAULT 'psk-rbn-field-recency-v2'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '120s'
AS $$
DECLARE
  v_hour timestamptz;
  v_written integer;
BEGIN
  IF p_hour IS NULL THEN
    RAISE EXCEPTION 'hour is required';
  END IF;
  IF p_transform_version IS NULL
    OR length(p_transform_version) NOT BETWEEN 1 AND 128 THEN
    RAISE EXCEPTION 'invalid transform version';
  END IF;

  v_hour := date_trunc('hour', p_hour);

  -- available_at must be >= hour_utc + 1h (see the table CHECK): refuse the
  -- in-progress hour instead of failing halfway through the insert.
  IF v_hour + interval '1 hour' > now() THEN
    RAISE EXCEPTION 'hour % is not complete yet', v_hour;
  END IF;

  DELETE FROM public.path_recency_hourly
  WHERE hour_utc = v_hour
    AND transform_version = p_transform_version;

  WITH pairs AS (
    SELECT
      stats.band,
      stats.tx_field,
      stats.rx_field,
      sum(stats.spot_count)::integer AS spots,
      coalesce(
        (sum(stats.spot_count) FILTER (WHERE stats.mode_class = 'digital')),
        0
      )::integer AS digital_spots
    FROM public.path_hourly_stats AS stats
    WHERE stats.hour_utc = v_hour
      AND stats.band IN (
        '160m', '80m', '60m', '40m', '30m',
        '20m', '17m', '15m', '12m', '10m'
      )
      AND stats.tx_field ~ '^[A-R]{2}$'
      AND stats.rx_field ~ '^[A-R]{2}$'
    GROUP BY stats.band, stats.tx_field, stats.rx_field
  ), receiver_exposure AS (
    -- One row per (band, rx_field): how many distinct tx fields anyone in
    -- rx_field heard this hour. `pairs` is already distinct per tx field,
    -- so count(*) is that distinct count.
    SELECT
      pairs.band,
      pairs.rx_field,
      count(*)::integer AS exposure,
      (count(*) FILTER (WHERE pairs.digital_spots > 0))::integer
        AS digital_exposure,
      sum(pairs.spots)::bigint AS rx_spots
    FROM pairs
    GROUP BY pairs.band, pairs.rx_field
  )
  INSERT INTO public.path_recency_hourly (
    hour_utc, band, tx_field, rx_field, heard, exposure, recency_rate,
    transform_version, source_watermark, available_at,
    digital_heard, digital_exposure, spots, rx_spots
  )
  SELECT
    v_hour,
    pairs.band,
    pairs.tx_field,
    pairs.rx_field,
    1,
    receiver_exposure.exposure,
    1::double precision / receiver_exposure.exposure,
    p_transform_version,
    v_hour + interval '1 hour',
    now(),
    CASE WHEN pairs.digital_spots > 0 THEN 1 ELSE 0 END,
    receiver_exposure.digital_exposure,
    pairs.spots,
    receiver_exposure.rx_spots
  FROM pairs
  JOIN receiver_exposure
    ON receiver_exposure.band = pairs.band
   AND receiver_exposure.rx_field = pairs.rx_field;

  GET DIAGNOSTICS v_written = ROW_COUNT;
  RETURN v_written;
END;
$$;

COMMENT ON FUNCTION public.compute_path_recency_hourly(timestamptz, text) IS
  'Service-role-only idempotent recompute of one settled hour of path_recency_hourly from path_hourly_stats. Network-recency statistic, not a WSPR opportunity rate.';

REVOKE EXECUTE ON FUNCTION public.compute_path_recency_hourly(timestamptz, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compute_path_recency_hourly(timestamptz, text)
  TO service_role;

-- ─── lookup_path_recency_lags(...) ────────────────────────────────────────
-- Causal H-1 / H-2 / H-3 / H-24 lookup for the inference service. Output
-- columns and semantics match the dropped public.lookup_wspr_path_lags one
-- for one, EXCEPT that the key column is `target_field` (2-char field)
-- rather than `target_grid4` — calling a field a grid4 would be a lie, and
-- ml/service/path_history.py does the grid4 <-> field mapping for callers.
--
-- Differences from the WSPR contract that are deliberate:
--   * There is no separate watermark table, so there is no all-or-nothing
--     "return zero rows unless all four band watermarks are complete" gate.
--     Availability is per lag, exactly as the four *_available flags model
--     it: a lag is available only when its row exists AND its available_at
--     is <= p_issue_time (the same causality rule the watermarks enforced).
--   * One row is always returned per requested target field, so the caller
--     can keep its "every requested target must come back" verification.
--   * quality_flags is always empty. The service fails a whole batch closed
--     on ANY flag, so per-cell diagnostics belong in the table's count
--     columns, not in this contract.
--   * The table has one producer (the collector), so no provider column is
--     stored; p_provider is echoed back for contract compatibility with the
--     service's provider-identity check.

CREATE OR REPLACE FUNCTION public.lookup_path_recency_lags(
  p_issue_time timestamptz,
  p_band text,
  p_origin_field text,
  p_target_fields text[],
  p_transform_version text,
  p_provider text
)
RETURNS TABLE (
  target_field text,
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
SET search_path = ''
AS $$
DECLARE
  v_hour timestamptz;
BEGIN
  IF p_issue_time IS NULL THEN
    RAISE EXCEPTION 'issue time is required';
  END IF;
  IF p_band NOT IN (
    '160m', '80m', '60m', '40m', '30m',
    '20m', '17m', '15m', '12m', '10m'
  ) THEN
    RAISE EXCEPTION 'unsupported HF band';
  END IF;
  IF p_origin_field IS NULL OR p_origin_field !~ '^[A-R]{2}$' THEN
    RAISE EXCEPTION 'invalid origin field';
  END IF;
  IF coalesce(array_length(p_target_fields, 1), 0) NOT BETWEEN 1 AND 4096 THEN
    RAISE EXCEPTION 'target count must be between 1 and 4096';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(p_target_fields) AS target(value)
    WHERE value !~ '^[A-R]{2}$'
  ) THEN
    RAISE EXCEPTION 'invalid target field';
  END IF;
  IF p_transform_version IS NULL
    OR length(p_transform_version) NOT BETWEEN 1 AND 128 THEN
    RAISE EXCEPTION 'invalid transform version';
  END IF;
  IF p_provider IS NULL OR p_provider !~ '^[a-z0-9][a-z0-9_.:-]{0,63}$' THEN
    RAISE EXCEPTION 'invalid provider identifier';
  END IF;

  v_hour := date_trunc('hour', p_issue_time);

  RETURN QUERY
  WITH targets AS (
    SELECT DISTINCT value AS field
    FROM unnest(p_target_fields) AS target(value)
  ), lag_values(lag_hours) AS (
    VALUES (1), (2), (3), (24)
  ), cells AS (
    SELECT
      targets.field,
      lag_values.lag_hours,
      recency.recency_rate AS rate,
      recency.source_watermark AS watermark,
      recency.available_at AS readable_at
    FROM targets
    CROSS JOIN lag_values
    LEFT JOIN public.path_recency_hourly AS recency
      ON recency.hour_utc = v_hour
           - make_interval(hours => lag_values.lag_hours)
     AND recency.band = p_band
     AND recency.tx_field = p_origin_field
     AND recency.rx_field = targets.field
     AND recency.transform_version = p_transform_version
     AND recency.available_at <= p_issue_time
     AND recency.recency_rate IS NOT NULL
  )
  SELECT
    cells.field,
    coalesce(
      max(cells.rate) FILTER (WHERE cells.lag_hours = 1),
      0::double precision
    ),
    coalesce(
      max(cells.rate) FILTER (WHERE cells.lag_hours = 2),
      0::double precision
    ),
    coalesce(
      max(cells.rate) FILTER (WHERE cells.lag_hours = 3),
      0::double precision
    ),
    coalesce(
      max(cells.rate) FILTER (WHERE cells.lag_hours = 24),
      0::double precision
    ),
    (CASE WHEN count(cells.rate) FILTER (WHERE cells.lag_hours = 1) > 0
          THEN 1 ELSE 0 END)::smallint,
    (CASE WHEN count(cells.rate) FILTER (WHERE cells.lag_hours = 2) > 0
          THEN 1 ELSE 0 END)::smallint,
    (CASE WHEN count(cells.rate) FILTER (WHERE cells.lag_hours = 3) > 0
          THEN 1 ELSE 0 END)::smallint,
    (CASE WHEN count(cells.rate) FILTER (WHERE cells.lag_hours = 24) > 0
          THEN 1 ELSE 0 END)::smallint,
    -- Newest coverage end among the lags that were actually readable. With
    -- nothing readable we report the H-24 bucket's coverage end, which makes
    -- the caller's freshness age ~23h and fails it closed to physics rather
    -- than dressing an empty answer up as current.
    coalesce(max(cells.watermark), v_hour - interval '23 hours'),
    coalesce(max(cells.readable_at), p_issue_time),
    p_provider,
    p_transform_version,
    '{}'::text[]
  FROM cells
  GROUP BY cells.field
  ORDER BY cells.field;
END;
$$;

COMMENT ON FUNCTION public.lookup_path_recency_lags(
  timestamptz, text, text, text[], text, text
) IS
  'Service-role-only causal H-1/H-2/H-3/H-24 field-grain recency lookup, one row per requested target field. Per-lag availability requires the row to exist and to have been readable by issue time. Network-recency statistic, not a WSPR opportunity rate.';

REVOKE EXECUTE ON FUNCTION public.lookup_path_recency_lags(
  timestamptz, text, text, text[], text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_path_recency_lags(
  timestamptz, text, text, text[], text, text
) TO service_role;

-- New RPCs are reachable through PostgREST only after its schema cache is
-- reloaded; without this the first backfill call returns PGRST202.
NOTIFY pgrst, 'reload schema';
