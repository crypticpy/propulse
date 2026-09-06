-- #297 / #306 (NowCast N3 retrain, "A7" serving contract): per-band-hour
-- quantile normalisation of path_recency_hourly.recency_rate.
--
-- Migrations are never auto-applied to this project's Supabase instance —
-- someone must run this by hand. Every statement below is written to be
-- safe to re-run.
--
-- ─── Why a quantile, not the raw rate ──────────────────────────────────────
--
-- recency_rate (see 20260906210000_path_recency_v2.sql) is a per-receiving
-- -field inverse-breadth weight: rows exist only for heard pairs, so
-- recency_rate is always 1/exposure. Its magnitude is not comparable in
-- level to the WSPR-trained feature the A6 model was built on, and the
-- docs/reports/path-recency-v2-coverage.md acceptance run confirmed the raw
-- rate is not directly interpretable as an opening probability either.
--
-- The N3 retrain (contract `archive-v4-features-v2`) instead trains on a
-- PER-BAND-HOUR QUANTILE of recency_rate:
--
--   percent_rank() OVER (PARTITION BY band, hour_utc ORDER BY recency_rate)
--
-- computed over the heard-pair rows of that (band, hour_utc,
-- transform_version). This column stores that value so the served feature
-- is bit-identical to what the retrain saw, rather than a live
-- recomputation drifting from the training-time statistic. It is the value
-- production serves to models trained under archive-v4-features-v2; models
-- trained under archive-v4-features-v1 keep reading recency_rate unchanged.
--
-- ─── recency_quantile column ───────────────────────────────────────────────

ALTER TABLE public.path_recency_hourly
  ADD COLUMN IF NOT EXISTS recency_quantile double precision
    CHECK (recency_quantile IS NULL OR (recency_quantile >= 0 AND recency_quantile <= 1));

COMMENT ON COLUMN public.path_recency_hourly.recency_quantile IS
  'percent_rank() OVER (PARTITION BY band, hour_utc ORDER BY recency_rate) computed over the heard-pair rows of that hour and transform_version. Null until (re)computed by compute_path_recency_hourly for this row''s hour. This is the value served to models trained under the archive-v4-features-v2 core feature contract; archive-v4-features-v1 models keep reading recency_rate.';

-- ─── compute_path_recency_hourly(hour, transform_version) ─────────────────
-- Identical to the 20260906210000 body — same DELETE+INSERT idempotent
-- recompute, same pairs/receiver_exposure statistic — except the INSERT now
-- also populates recency_quantile. The window function is written as
-- PARTITION BY band ORDER BY recency_rate because p_hour is already fixed
-- for the whole function call (v_hour is a scalar, not a grouping column),
-- so "partition by band, ordered within the hour" and "partition by band
-- and hour_utc" are the same partition here.

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
  ), rated AS (
    SELECT
      pairs.band,
      pairs.tx_field,
      pairs.rx_field,
      1 AS heard,
      receiver_exposure.exposure,
      1::double precision / receiver_exposure.exposure AS recency_rate,
      CASE WHEN pairs.digital_spots > 0 THEN 1 ELSE 0 END AS digital_heard,
      receiver_exposure.digital_exposure,
      pairs.spots,
      receiver_exposure.rx_spots
    FROM pairs
    JOIN receiver_exposure
      ON receiver_exposure.band = pairs.band
     AND receiver_exposure.rx_field = pairs.rx_field
  ), quantiled AS (
    SELECT
      rated.*,
      percent_rank() OVER (
        PARTITION BY rated.band ORDER BY rated.recency_rate
      ) AS recency_quantile
    FROM rated
  )
  INSERT INTO public.path_recency_hourly (
    hour_utc, band, tx_field, rx_field, heard, exposure, recency_rate,
    transform_version, source_watermark, available_at,
    digital_heard, digital_exposure, spots, rx_spots, recency_quantile
  )
  SELECT
    v_hour,
    quantiled.band,
    quantiled.tx_field,
    quantiled.rx_field,
    quantiled.heard,
    quantiled.exposure,
    quantiled.recency_rate,
    p_transform_version,
    v_hour + interval '1 hour',
    now(),
    quantiled.digital_heard,
    quantiled.digital_exposure,
    quantiled.spots,
    quantiled.rx_spots,
    quantiled.recency_quantile
  FROM quantiled;

  GET DIAGNOSTICS v_written = ROW_COUNT;
  RETURN v_written;
END;
$$;

COMMENT ON FUNCTION public.compute_path_recency_hourly(timestamptz, text) IS
  'Service-role-only idempotent recompute of one settled hour of path_recency_hourly from path_hourly_stats. Network-recency statistic, not a WSPR opportunity rate. Also populates recency_quantile, the per-band-hour percent_rank() of recency_rate served to archive-v4-features-v2 models.';

REVOKE EXECUTE ON FUNCTION public.compute_path_recency_hourly(timestamptz, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compute_path_recency_hourly(timestamptz, text)
  TO service_role;

-- ─── lookup_path_recency_lags(..., p_statistic) ────────────────────────────
-- Adds a 7th parameter, p_statistic ('rate' | 'quantile', default 'rate'
-- so the pre-#306 6-argument call keeps behaving exactly as before). Since
-- PostgREST resolves RPC overloads by argument name and a DEFAULT on a
-- CREATE OR REPLACE with a changed signature creates a second overload
-- rather than replacing the first, the old 6-parameter function is dropped
-- before the 7-parameter one is created.
--
-- For p_statistic = 'quantile': path_success_prevN reads
-- coalesce(recency_quantile, 0), and a lag counts as available only when
-- the row exists, was readable by issue time, AND recency_quantile is not
-- null — an hour that was computed before this migration (recency_quantile
-- still null) reads as UNAVAILABLE, never as a fake quantile of 0. Re-running
-- `node scripts/backfill-path-recency.mjs` recomputes every hour via
-- compute_path_recency_hourly (delete+insert), which backfills the column.
--
-- For p_statistic = 'rate' (the default), behaviour is byte-for-byte
-- unchanged from 20260906210000.

DROP FUNCTION IF EXISTS public.lookup_path_recency_lags(
  timestamptz, text, text, text[], text, text
);

CREATE OR REPLACE FUNCTION public.lookup_path_recency_lags(
  p_issue_time timestamptz,
  p_band text,
  p_origin_field text,
  p_target_fields text[],
  p_transform_version text,
  p_provider text,
  p_statistic text DEFAULT 'rate'
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
  IF p_statistic NOT IN ('rate', 'quantile') THEN
    RAISE EXCEPTION 'invalid statistic: must be rate or quantile';
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
      CASE
        WHEN p_statistic = 'quantile' THEN recency.recency_quantile
        ELSE recency.recency_rate
      END AS rate,
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
     AND (
       CASE
         WHEN p_statistic = 'quantile' THEN recency.recency_quantile
         ELSE recency.recency_rate
       END
     ) IS NOT NULL
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
  timestamptz, text, text, text[], text, text, text
) IS
  'Service-role-only causal H-1/H-2/H-3/H-24 field-grain recency lookup, one row per requested target field. p_statistic selects recency_rate (default, archive-v4-features-v1) or recency_quantile (archive-v4-features-v2); a lag is available only when its row exists, was readable by issue time, and the selected statistic column is not null. Network-recency statistic, not a WSPR opportunity rate.';

REVOKE EXECUTE ON FUNCTION public.lookup_path_recency_lags(
  timestamptz, text, text, text[], text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_path_recency_lags(
  timestamptz, text, text, text[], text, text, text
) TO service_role;

-- New/changed RPC signatures are reachable through PostgREST only after its
-- schema cache is reloaded; without this the first call after applying this
-- migration returns PGRST202.
NOTIFY pgrst, 'reload schema';
