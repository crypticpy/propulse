-- path-recency-coverage — #297 (NowCast N2) acceptance evidence.
--
-- Read-only. Run once the 53-day backfill has finished:
--   psql "$DATABASE_URL" -f scripts/sql/path-recency-coverage.sql
--
-- Fill the numbers into docs/reports/path-recency-v2-coverage.md.
--
-- Section 2 is the load-bearing gate: of every (band, hour, active field
-- pair) the model could have asked about, what fraction had a readable
-- lag-1 row. "Active field pair" = a pair with >=1 spot in
-- path_hourly_stats that hour, i.e. exactly the lookups that matter.
-- Target: >= 70%.
--
-- These rows are a NETWORK-RECENCY statistic over PSK Reporter / RBN spots,
-- never a WSPR opportunity rate.

\set transform_version 'psk-rbn-field-recency-v2'
\set since '2026-07-16T00:00:00+00'

\echo '== 1. rows per band x UTC hour-of-day x continent of rx_field =='

SELECT
  recency.band,
  extract(hour FROM recency.hour_utc)::int AS utc_hour,
  coalesce(public.continent_for_field(recency.rx_field), 'unknown') AS rx_continent,
  count(*) AS rows,
  count(DISTINCT recency.hour_utc) AS hours_covered,
  round(avg(recency.exposure)::numeric, 2) AS avg_exposure,
  round(avg(recency.recency_rate)::numeric, 5) AS avg_recency_rate
FROM public.path_recency_hourly AS recency
WHERE recency.transform_version = :'transform_version'
  AND recency.hour_utc >= :'since'
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3;

\echo '== 2. ACCEPTANCE: lag-1 availability over active field pairs =='

WITH active AS (
  SELECT DISTINCT stats.hour_utc, stats.band, stats.tx_field, stats.rx_field
  FROM public.path_hourly_stats AS stats
  WHERE stats.hour_utc >= (:'since'::timestamptz + interval '1 hour')
    AND stats.band IN (
      '160m', '80m', '60m', '40m', '30m',
      '20m', '17m', '15m', '12m', '10m'
    )
    AND stats.tx_field ~ '^[A-R]{2}$'
    AND stats.rx_field ~ '^[A-R]{2}$'
), resolved AS (
  SELECT
    active.band,
    (recency.hour_utc IS NOT NULL) AS lag1_available
  FROM active
  LEFT JOIN public.path_recency_hourly AS recency
    ON recency.hour_utc = active.hour_utc - interval '1 hour'
   AND recency.band = active.band
   AND recency.tx_field = active.tx_field
   AND recency.rx_field = active.rx_field
   AND recency.transform_version = :'transform_version'
)
SELECT
  coalesce(resolved.band, 'ALL BANDS') AS band,
  count(*) AS lookups,
  count(*) FILTER (WHERE resolved.lag1_available) AS lag1_available,
  round(
    100.0 * count(*) FILTER (WHERE resolved.lag1_available) / nullif(count(*), 0),
    2
  ) AS lag1_available_pct
FROM resolved
GROUP BY ROLLUP (resolved.band)
ORDER BY (resolved.band IS NULL), 1;

\echo '== 3. shape of the store (size, span, per-band rows) =='

SELECT
  pg_size_pretty(pg_total_relation_size('public.path_recency_hourly')) AS total_size,
  count(*) AS rows,
  count(DISTINCT hour_utc) AS hours,
  min(hour_utc) AS first_hour,
  max(hour_utc) AS last_hour
FROM public.path_recency_hourly
WHERE transform_version = :'transform_version';

SELECT
  band,
  count(*) AS rows,
  count(DISTINCT hour_utc) AS hours,
  round(count(*)::numeric / nullif(count(DISTINCT hour_utc), 0), 1) AS rows_per_hour
FROM public.path_recency_hourly
WHERE transform_version = :'transform_version'
GROUP BY band
ORDER BY rows DESC;

\echo '== 4. hours present in path_hourly_stats but missing from recency =='

SELECT stats.hour_utc, count(*) AS path_hourly_rows
FROM public.path_hourly_stats AS stats
WHERE stats.hour_utc >= :'since'
  AND stats.band IN (
    '160m', '80m', '60m', '40m', '30m',
    '20m', '17m', '15m', '12m', '10m'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.path_recency_hourly AS recency
    WHERE recency.hour_utc = stats.hour_utc
      AND recency.transform_version = :'transform_version'
  )
GROUP BY stats.hour_utc
ORDER BY stats.hour_utc
LIMIT 200;
