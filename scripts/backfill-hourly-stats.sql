-- Backfill band_hourly_stats with accurate counts from spot_history.
-- The aggregator was capped at 1000 rows due to PostgREST default limit.
-- This script re-aggregates all data from Feb 10 2026 onward using proper
-- SQL aggregation (no row limits) and upserts to overwrite the bad data.
--
-- Run once after deploying the paginated aggregator fix.
-- Safe to re-run (idempotent via ON CONFLICT ... DO UPDATE).

SET statement_timeout = '600s';

WITH spot_agg AS (
  SELECT
    date_trunc('hour', spotted_at) AS hour_utc,
    band,
    count(*)::integer AS spot_count,
    count(DISTINCT tx_callsign)::integer AS unique_tx,
    count(DISTINCT rx_callsign)::integer AS unique_rx,
    round(avg(snr)::numeric, 1)::real AS avg_snr,
    min(snr)::smallint AS min_snr,
    max(snr)::smallint AS max_snr,
    (percentile_cont(0.5) WITHIN GROUP (ORDER BY snr))::real AS median_snr,
    count(DISTINCT tx_grid) FILTER (WHERE tx_grid IS NOT NULL)::integer AS unique_grids_tx,
    count(DISTINCT rx_grid) FILTER (WHERE rx_grid IS NOT NULL)::integer AS unique_grids_rx
  FROM spot_history
  WHERE spotted_at >= '2026-02-10T00:00:00Z'
    AND spotted_at < date_trunc('hour', now())
  GROUP BY date_trunc('hour', spotted_at), band
),
mode_agg AS (
  SELECT
    spotted_hour AS hour_utc,
    band,
    jsonb_object_agg(mode, cnt) AS mode_counts
  FROM (
    SELECT
      date_trunc('hour', spotted_at) AS spotted_hour,
      band,
      mode,
      count(*)::integer AS cnt
    FROM spot_history
    WHERE spotted_at >= '2026-02-10T00:00:00Z'
      AND spotted_at < date_trunc('hour', now())
      AND mode IS NOT NULL
    GROUP BY date_trunc('hour', spotted_at), band, mode
  ) sub
  GROUP BY spotted_hour, band
),
source_agg AS (
  SELECT
    spotted_hour AS hour_utc,
    band,
    jsonb_object_agg(source, cnt) AS source_counts
  FROM (
    SELECT
      date_trunc('hour', spotted_at) AS spotted_hour,
      band,
      source,
      count(*)::integer AS cnt
    FROM spot_history
    WHERE spotted_at >= '2026-02-10T00:00:00Z'
      AND spotted_at < date_trunc('hour', now())
    GROUP BY date_trunc('hour', spotted_at), band, source
  ) sub
  GROUP BY spotted_hour, band
),
solar_hourly AS (
  SELECT DISTINCT ON (date_trunc('hour', captured_at))
    date_trunc('hour', captured_at) AS hour_utc,
    kp_index,
    sfi,
    bz_gsm,
    bt
  FROM solar_snapshots
  WHERE captured_at >= '2026-02-10T00:00:00Z'
  ORDER BY date_trunc('hour', captured_at), captured_at DESC
)
INSERT INTO band_hourly_stats (
  hour_utc, band, spot_count, unique_tx, unique_rx,
  avg_snr, min_snr, max_snr, median_snr,
  mode_counts, source_counts,
  unique_grids_tx, unique_grids_rx,
  kp_index, sfi, bz_gsm, bt
)
SELECT
  s.hour_utc,
  s.band,
  s.spot_count,
  s.unique_tx,
  s.unique_rx,
  s.avg_snr,
  s.min_snr,
  s.max_snr,
  s.median_snr,
  COALESCE(m.mode_counts, '{}'::jsonb),
  COALESCE(sc.source_counts, '{}'::jsonb),
  s.unique_grids_tx,
  s.unique_grids_rx,
  sol.kp_index,
  sol.sfi,
  sol.bz_gsm,
  sol.bt
FROM spot_agg s
LEFT JOIN mode_agg m ON m.hour_utc = s.hour_utc AND m.band = s.band
LEFT JOIN source_agg sc ON sc.hour_utc = s.hour_utc AND sc.band = s.band
LEFT JOIN solar_hourly sol ON sol.hour_utc = s.hour_utc
ON CONFLICT (hour_utc, band) DO UPDATE SET
  spot_count = EXCLUDED.spot_count,
  unique_tx = EXCLUDED.unique_tx,
  unique_rx = EXCLUDED.unique_rx,
  avg_snr = EXCLUDED.avg_snr,
  min_snr = EXCLUDED.min_snr,
  max_snr = EXCLUDED.max_snr,
  median_snr = EXCLUDED.median_snr,
  mode_counts = EXCLUDED.mode_counts,
  source_counts = EXCLUDED.source_counts,
  unique_grids_tx = EXCLUDED.unique_grids_tx,
  unique_grids_rx = EXCLUDED.unique_grids_rx,
  kp_index = EXCLUDED.kp_index,
  sfi = EXCLUDED.sfi,
  bz_gsm = EXCLUDED.bz_gsm,
  bt = EXCLUDED.bt;
