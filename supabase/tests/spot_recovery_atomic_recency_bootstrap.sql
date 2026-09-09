CREATE EXTENSION IF NOT EXISTS dblink;

CREATE TABLE public.collector_aggregation_gaps (
 aggregation text NOT NULL, start_hour timestamptz NOT NULL,
 end_hour timestamptz NOT NULL, recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reason text NOT NULL DEFAULT 'raw_expired', PRIMARY KEY(aggregation,start_hour)
);
REVOKE ALL ON public.collector_aggregation_gaps FROM PUBLIC,anon,authenticated;

CREATE TABLE public.path_hourly_stats (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, hour_utc timestamptz NOT NULL,
 band text NOT NULL, mode_class text NOT NULL, tx_field text NOT NULL, rx_field text NOT NULL,
 spot_count integer NOT NULL DEFAULT 0, unique_tx integer NOT NULL DEFAULT 0,
 unique_rx integer NOT NULL DEFAULT 0, avg_snr real, median_snr real,
 backfilled_count integer NOT NULL DEFAULT 0,
 UNIQUE(hour_utc,band,mode_class,tx_field,rx_field)
);

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

-- Keep aggregate gaps out of climatology samples and invalidate any baseline
-- computed before a newly recorded gap, without exposing the gap ledger.
CREATE OR REPLACE FUNCTION public.record_spot_aggregation_gap(
  p_aggregation text, p_start_hour timestamptz, p_end_hour timestamptz
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET timezone = 'UTC' AS $$
BEGIN
  IF p_aggregation IS NULL OR p_aggregation NOT IN ('band_hourly', 'path_hourly', 'region_hourly')
    OR p_start_hour IS NULL OR p_end_hour IS NULL
    OR NOT isfinite(p_start_hour) OR NOT isfinite(p_end_hour)
    OR p_start_hour <> date_trunc('hour', p_start_hour)
    OR p_end_hour <> date_trunc('hour', p_end_hour)
    OR p_end_hour < p_start_hour
    OR p_end_hour >= clock_timestamp() - interval '2 hours' THEN
    RAISE EXCEPTION 'invalid aggregation gap';
  END IF;
  -- Lock allocation: (584,5) serializes only gap/baseline ordering. The spot
  -- aggregation and retention workers use other keys in the 584 namespace.
  -- Serialize gap visibility with climatology rebuild snapshots. PL/pgSQL's
  -- following INSERT gets a fresh READ COMMITTED snapshot after this wait.
  PERFORM pg_advisory_xact_lock(584, 5);
  INSERT INTO public.collector_aggregation_gaps AS existing_gap
      (aggregation, start_hour, end_hour, recorded_at)
    VALUES (p_aggregation, p_start_hour, p_end_hour, clock_timestamp())
    ON CONFLICT (aggregation, start_hour) DO UPDATE
      SET end_hour = excluded.end_hour,
          recorded_at = clock_timestamp()
      WHERE excluded.end_hour > existing_gap.end_hour;
END;
$$;

REVOKE ALL ON FUNCTION public.record_spot_aggregation_gap(text,timestamptz,timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_spot_aggregation_gap(text,timestamptz,timestamptz)
  TO service_role;

CREATE TABLE public.recency_function_before AS
SELECT p.proowner, p.proacl, p.proconfig, p.proargdefaults::text AS proargdefaults, p.pronargdefaults
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='compute_path_recency_hourly'
  AND p.proargtypes='1184 25'::oidvector;
