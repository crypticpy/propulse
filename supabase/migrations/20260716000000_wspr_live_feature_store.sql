-- Server-authoritative WSPR rolling observations and V4.2 path-lag features.
-- This schema is intentionally separate from path_hourly_stats: those cells
-- mix other networks at grid2 resolution and are not valid model inputs.

CREATE TABLE IF NOT EXISTS public.wspr_observations_rolling (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source text NOT NULL CHECK (source ~ '^[a-z0-9][a-z0-9_.:-]{0,63}$'),
  source_id text CHECK (source_id IS NULL OR length(source_id) <= 256),
  observation_key_sha256 text NOT NULL UNIQUE
    CHECK (observation_key_sha256 ~ '^[0-9a-f]{64}$'),
  event_time timestamptz NOT NULL,
  received_at timestamptz NOT NULL,
  slot_epoch bigint NOT NULL CHECK (slot_epoch > 0),
  target_hour timestamptz NOT NULL,
  band text NOT NULL CHECK (band IN (
    '160m', '80m', '60m', '40m', '30m',
    '20m', '17m', '15m', '12m', '10m'
  )),
  tx_call text NOT NULL CHECK (length(tx_call) BETWEEN 3 AND 32),
  tx_grid4 text NOT NULL CHECK (tx_grid4 ~ '^[A-R]{2}[0-9]{2}$'),
  rx_call text NOT NULL CHECK (length(rx_call) BETWEEN 3 AND 32),
  rx_grid4 text NOT NULL CHECK (rx_grid4 ~ '^[A-R]{2}[0-9]{2}$'),
  power_bin_dbm smallint NOT NULL CHECK (power_bin_dbm BETWEEN -60 AND 80),
  snr_db real NOT NULL CHECK (snr_db BETWEEN -80 AND 40),
  mode text NOT NULL DEFAULT 'WSPR' CHECK (mode = 'WSPR'),
  ingest_version text NOT NULL CHECK (length(ingest_version) BETWEEN 1 AND 128),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, source_id)
);

CREATE INDEX IF NOT EXISTS wspr_observations_slot_band_idx
  ON public.wspr_observations_rolling(slot_epoch, band);
CREATE INDEX IF NOT EXISTS wspr_observations_receipt_idx
  ON public.wspr_observations_rolling(received_at);

CREATE TABLE IF NOT EXISTS public.wspr_path_hourly_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_hour timestamptz NOT NULL,
  band text NOT NULL CHECK (band IN (
    '160m', '80m', '60m', '40m', '30m',
    '20m', '17m', '15m', '12m', '10m'
  )),
  tx_grid4 text NOT NULL CHECK (tx_grid4 ~ '^[A-R]{2}[0-9]{2}$'),
  rx_grid4 text NOT NULL CHECK (rx_grid4 ~ '^[A-R]{2}[0-9]{2}$'),
  successes double precision NOT NULL CHECK (successes >= 0),
  opportunities double precision NOT NULL CHECK (opportunities > 0),
  success_rate double precision NOT NULL CHECK (success_rate BETWEEN 0 AND 1),
  sampled_rows integer NOT NULL CHECK (sampled_rows > 0),
  positive_rows integer NOT NULL CHECK (
    positive_rows >= 0 AND positive_rows <= sampled_rows
  ),
  available_at timestamptz NOT NULL,
  source_watermark timestamptz NOT NULL,
  provider text NOT NULL CHECK (provider ~ '^[a-z0-9][a-z0-9_.:-]{0,63}$'),
  transform_version text NOT NULL,
  quality_flags text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (tx_grid4 <> rx_grid4),
  CHECK (successes <= opportunities),
  CHECK (abs(success_rate - successes / opportunities) <= 1e-12),
  CHECK (available_at >= target_hour + interval '1 hour'),
  CHECK (source_watermark <= target_hour + interval '1 hour'),
  CHECK (source_watermark <= available_at),
  UNIQUE (
    target_hour, band, tx_grid4, rx_grid4,
    provider, transform_version, available_at
  )
);

CREATE INDEX IF NOT EXISTS wspr_path_features_lookup_idx
  ON public.wspr_path_hourly_features
    (tx_grid4, band, target_hour DESC, rx_grid4, available_at DESC);
CREATE INDEX IF NOT EXISTS wspr_path_features_available_idx
  ON public.wspr_path_hourly_features(available_at DESC);

CREATE TABLE IF NOT EXISTS public.wspr_feature_watermarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_hour timestamptz NOT NULL,
  band text NOT NULL CHECK (band IN (
    '160m', '80m', '60m', '40m', '30m',
    '20m', '17m', '15m', '12m', '10m'
  )),
  provider text NOT NULL CHECK (provider ~ '^[a-z0-9][a-z0-9_.:-]{0,63}$'),
  transform_version text NOT NULL,
  status text NOT NULL CHECK (status IN ('complete', 'degraded', 'failed')),
  source_watermark timestamptz NOT NULL,
  available_at timestamptz NOT NULL,
  observation_count bigint NOT NULL CHECK (observation_count >= 0),
  feature_cell_count bigint NOT NULL CHECK (feature_cell_count >= 0),
  quality_flags text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (available_at >= target_hour + interval '1 hour'),
  CHECK (status <> 'complete' OR source_watermark = target_hour + interval '1 hour'),
  CHECK (source_watermark <= target_hour + interval '1 hour'),
  CHECK (source_watermark <= available_at),
  UNIQUE (target_hour, band, provider, transform_version, available_at)
);

CREATE INDEX IF NOT EXISTS wspr_feature_watermark_lookup_idx
  ON public.wspr_feature_watermarks
    (band, target_hour DESC, provider, transform_version, available_at DESC);

ALTER TABLE public.wspr_observations_rolling ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wspr_path_hourly_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wspr_feature_watermarks ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.wspr_observations_rolling FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.wspr_path_hourly_features FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.wspr_feature_watermarks FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wspr_observations_rolling TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wspr_path_hourly_features TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wspr_feature_watermarks TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.wspr_observations_rolling_id_seq TO service_role;

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
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
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
  IF p_origin_grid4 IS NULL OR p_origin_grid4 !~ '^[A-R]{2}[0-9]{2}$' THEN
    RAISE EXCEPTION 'invalid origin grid';
  END IF;
  IF coalesce(array_length(p_target_grids, 1), 0) NOT BETWEEN 1 AND 4096 THEN
    RAISE EXCEPTION 'target count must be between 1 and 4096';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(p_target_grids) AS target(value)
    WHERE value !~ '^[A-R]{2}[0-9]{2}$'
  ) THEN
    RAISE EXCEPTION 'invalid target grid';
  END IF;

  RETURN QUERY
  WITH targets AS (
    SELECT DISTINCT value AS grid4
    FROM unnest(p_target_grids) AS target(value)
  ), watermark1 AS (
    SELECT watermark.*
    FROM public.wspr_feature_watermarks AS watermark
    WHERE watermark.target_hour = date_trunc('hour', p_issue_time) - interval '1 hour'
      AND watermark.band = p_band
      AND watermark.provider = p_provider
      AND watermark.transform_version = p_transform_version
      AND watermark.status = 'complete'
      AND watermark.available_at <= p_issue_time
      AND cardinality(watermark.quality_flags) = 0
    ORDER BY watermark.available_at DESC
    LIMIT 1
  ), watermark2 AS (
    SELECT watermark.*
    FROM public.wspr_feature_watermarks AS watermark
    WHERE watermark.target_hour = date_trunc('hour', p_issue_time) - interval '2 hours'
      AND watermark.band = p_band
      AND watermark.provider = p_provider
      AND watermark.transform_version = p_transform_version
      AND watermark.status = 'complete'
      AND watermark.available_at <= p_issue_time
      AND cardinality(watermark.quality_flags) = 0
    ORDER BY watermark.available_at DESC
    LIMIT 1
  ), watermark3 AS (
    SELECT watermark.*
    FROM public.wspr_feature_watermarks AS watermark
    WHERE watermark.target_hour = date_trunc('hour', p_issue_time) - interval '3 hours'
      AND watermark.band = p_band
      AND watermark.provider = p_provider
      AND watermark.transform_version = p_transform_version
      AND watermark.status = 'complete'
      AND watermark.available_at <= p_issue_time
      AND cardinality(watermark.quality_flags) = 0
    ORDER BY watermark.available_at DESC
    LIMIT 1
  ), watermark24 AS (
    SELECT watermark.*
    FROM public.wspr_feature_watermarks AS watermark
    WHERE watermark.target_hour = date_trunc('hour', p_issue_time) - interval '24 hours'
      AND watermark.band = p_band
      AND watermark.provider = p_provider
      AND watermark.transform_version = p_transform_version
      AND watermark.status = 'complete'
      AND watermark.available_at <= p_issue_time
      AND cardinality(watermark.quality_flags) = 0
    ORDER BY watermark.available_at DESC
    LIMIT 1
  )
  SELECT
    targets.grid4,
    coalesce(prev1.success_rate, 0::double precision),
    coalesce(prev2.success_rate, 0::double precision),
    coalesce(prev3.success_rate, 0::double precision),
    coalesce(prev24.success_rate, 0::double precision),
    (CASE WHEN prev1.id IS NULL THEN 0 ELSE 1 END)::smallint,
    (CASE WHEN prev2.id IS NULL THEN 0 ELSE 1 END)::smallint,
    (CASE WHEN prev3.id IS NULL THEN 0 ELSE 1 END)::smallint,
    (CASE WHEN prev24.id IS NULL THEN 0 ELSE 1 END)::smallint,
    watermark1.source_watermark,
    greatest(
      watermark1.available_at,
      watermark2.available_at,
      watermark3.available_at,
      watermark24.available_at
    ),
    watermark1.provider,
    watermark1.transform_version,
    watermark1.quality_flags
      || watermark2.quality_flags
      || watermark3.quality_flags
      || watermark24.quality_flags
      || coalesce(prev1.quality_flags, '{}'::text[])
      || coalesce(prev2.quality_flags, '{}'::text[])
      || coalesce(prev3.quality_flags, '{}'::text[])
      || coalesce(prev24.quality_flags, '{}'::text[])
  FROM targets
  CROSS JOIN watermark1
  CROSS JOIN watermark2
  CROSS JOIN watermark3
  CROSS JOIN watermark24
  LEFT JOIN LATERAL (
    SELECT feature.*
    FROM public.wspr_path_hourly_features AS feature
    WHERE feature.target_hour = date_trunc('hour', p_issue_time) - interval '1 hour'
      AND feature.band = p_band
      AND feature.tx_grid4 = p_origin_grid4
      AND feature.rx_grid4 = targets.grid4
      AND feature.provider = p_provider
      AND feature.transform_version = p_transform_version
      AND feature.available_at = watermark1.available_at
    LIMIT 1
  ) AS prev1 ON true
  LEFT JOIN LATERAL (
    SELECT feature.*
    FROM public.wspr_path_hourly_features AS feature
    WHERE feature.target_hour = date_trunc('hour', p_issue_time) - interval '2 hours'
      AND feature.band = p_band
      AND feature.tx_grid4 = p_origin_grid4
      AND feature.rx_grid4 = targets.grid4
      AND feature.provider = p_provider
      AND feature.transform_version = p_transform_version
      AND feature.available_at = watermark2.available_at
    LIMIT 1
  ) AS prev2 ON true
  LEFT JOIN LATERAL (
    SELECT feature.*
    FROM public.wspr_path_hourly_features AS feature
    WHERE feature.target_hour = date_trunc('hour', p_issue_time) - interval '3 hours'
      AND feature.band = p_band
      AND feature.tx_grid4 = p_origin_grid4
      AND feature.rx_grid4 = targets.grid4
      AND feature.provider = p_provider
      AND feature.transform_version = p_transform_version
      AND feature.available_at = watermark3.available_at
    LIMIT 1
  ) AS prev3 ON true
  LEFT JOIN LATERAL (
    SELECT feature.*
    FROM public.wspr_path_hourly_features AS feature
    WHERE feature.target_hour = date_trunc('hour', p_issue_time) - interval '24 hours'
      AND feature.band = p_band
      AND feature.tx_grid4 = p_origin_grid4
      AND feature.rx_grid4 = targets.grid4
      AND feature.provider = p_provider
      AND feature.transform_version = p_transform_version
      AND feature.available_at = watermark24.available_at
    LIMIT 1
  ) AS prev24 ON true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.lookup_wspr_path_lags(
  timestamptz, text, text, text[], text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_wspr_path_lags(
  timestamptz, text, text, text[], text, text
) TO service_role;

CREATE OR REPLACE FUNCTION public.prune_wspr_observations(
  older_than interval DEFAULT interval '30 hours'
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  deleted_rows bigint;
BEGIN
  IF older_than < interval '27 hours' THEN
    RAISE EXCEPTION 'WSPR rolling retention cannot be shorter than 27 hours';
  END IF;
  DELETE FROM public.wspr_observations_rolling
  WHERE received_at < now() - older_than;
  GET DIAGNOSTICS deleted_rows = ROW_COUNT;
  RETURN deleted_rows;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prune_wspr_observations(interval)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_wspr_observations(interval)
  TO service_role;

COMMENT ON TABLE public.wspr_observations_rolling IS
  'Private rolling authorized WSPR observations with event and receipt time; never exposed through public RLS.';
COMMENT ON TABLE public.wspr_path_hourly_features IS
  'Identity-free exposure-aware WSPR grid4 path cells produced by the frozen DuckDB transform; sparse direct export is disabled.';
COMMENT ON FUNCTION public.lookup_wspr_path_lags(
  timestamptz, text, text, text[], text, text
) IS
  'Service-role-only causal H-1/H-2/H-3/H-24 lookup. Returns no rows unless all four band watermarks are complete before issue time.';
