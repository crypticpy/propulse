-- path-recency-handcheck — #297 (NowCast N2) hand-check gate.
--
-- Read-only. Recomputes (heard, exposure, recency_rate) for ONE hour and ONE
-- field pair straight from path_hourly_stats and prints it next to the row
-- compute_path_recency_hourly actually stored. The two must match exactly.
--
--   psql "$DATABASE_URL" \
--     -v hour='2026-08-20T14:00:00+00' -v band=20m -v tx=EM -v rx=IO \
--     -f scripts/sql/path-recency-handcheck.sql
--
-- Defaults below apply when a variable is not passed with -v.

\if :{?hour}
\else
\set hour '2026-08-20T14:00:00+00'
\endif
\if :{?band}
\else
\set band '20m'
\endif
\if :{?tx}
\else
\set tx 'EM'
\endif
\if :{?rx}
\else
\set rx 'IO'
\endif
\if :{?transform_version}
\else
\set transform_version 'psk-rbn-field-recency-v2'
\endif

\echo '== hand-computed from path_hourly_stats vs stored path_recency_hourly =='

WITH pairs AS (
  SELECT
    stats.tx_field,
    sum(stats.spot_count)::int AS spots,
    coalesce(
      (sum(stats.spot_count) FILTER (WHERE stats.mode_class = 'digital')),
      0
    )::int AS digital_spots
  FROM public.path_hourly_stats AS stats
  WHERE stats.hour_utc = date_trunc('hour', :'hour'::timestamptz)
    AND stats.band = :'band'
    AND stats.rx_field = :'rx'
    AND stats.tx_field ~ '^[A-R]{2}$'
    AND stats.rx_field ~ '^[A-R]{2}$'
  GROUP BY stats.tx_field
), hand AS (
  SELECT
    (count(*) FILTER (WHERE pairs.tx_field = :'tx'))::int AS heard,
    count(*)::int AS exposure,
    (count(*) FILTER (WHERE pairs.tx_field = :'tx'))::double precision
      / nullif(count(*), 0) AS recency_rate,
    (count(*) FILTER (WHERE pairs.digital_spots > 0))::int AS digital_exposure,
    (sum(pairs.spots) FILTER (WHERE pairs.tx_field = :'tx'))::int AS pair_spots,
    sum(pairs.spots)::bigint AS rx_spots
  FROM pairs
)
SELECT
  'hand-computed' AS source,
  hand.heard,
  hand.exposure,
  hand.recency_rate,
  hand.digital_exposure,
  hand.pair_spots,
  hand.rx_spots
FROM hand
UNION ALL
SELECT
  'stored',
  recency.heard,
  recency.exposure,
  recency.recency_rate,
  recency.digital_exposure,
  recency.spots,
  recency.rx_spots
FROM public.path_recency_hourly AS recency
WHERE recency.hour_utc = date_trunc('hour', :'hour'::timestamptz)
  AND recency.band = :'band'
  AND recency.tx_field = :'tx'
  AND recency.rx_field = :'rx'
  AND recency.transform_version = :'transform_version';

\echo '== the raw path_hourly_stats cells behind the pair =='

SELECT stats.mode_class, stats.spot_count, stats.unique_tx, stats.unique_rx
FROM public.path_hourly_stats AS stats
WHERE stats.hour_utc = date_trunc('hour', :'hour'::timestamptz)
  AND stats.band = :'band'
  AND stats.tx_field = :'tx'
  AND stats.rx_field = :'rx'
ORDER BY stats.mode_class;

-- #306 (N3 retrain): recency_quantile is
-- percent_rank() OVER (PARTITION BY band, hour_utc ORDER BY recency_rate),
-- computed over every heard-pair row of that (band, hour_utc,
-- transform_version) by compute_path_recency_hourly
-- (supabase/migrations/20260906230000_path_recency_quantile.sql). Recompute
-- it here straight from the stored recency_rate column of every row in the
-- same partition and diff against the stored recency_quantile; max_abs_diff
-- must be 0 (or NULL when unpopulated_rows == rows_checked, i.e. this hour
-- predates the migration backfill).

\echo '== recency_quantile hand-check for :band @ :hour (max abs diff) =='

WITH stored_rows AS (
  SELECT
    recency.tx_field,
    recency.rx_field,
    recency.recency_rate,
    recency.recency_quantile
  FROM public.path_recency_hourly AS recency
  WHERE recency.hour_utc = date_trunc('hour', :'hour'::timestamptz)
    AND recency.band = :'band'
    AND recency.transform_version = :'transform_version'
), hand_quantiled AS (
  SELECT
    stored_rows.tx_field,
    stored_rows.rx_field,
    stored_rows.recency_quantile AS stored_quantile,
    percent_rank() OVER (
      PARTITION BY :'band' ORDER BY stored_rows.recency_rate
    ) AS hand_quantile
  FROM stored_rows
)
SELECT
  count(*) AS rows_checked,
  count(*) FILTER (WHERE hand_quantiled.stored_quantile IS NULL)
    AS unpopulated_rows,
  max(abs(hand_quantiled.stored_quantile - hand_quantiled.hand_quantile))
    AS max_abs_diff
FROM hand_quantiled;
