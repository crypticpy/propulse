-- Three-way mode_class classifier (cw / digital / phone) via a single
-- source of truth.
--
-- Today compute_path_hourly_stats only classifies 'cw' and 'digital'; every
-- phone spot (USB/LSB/SSB/etc) gets a NULL mode_class and is dropped by the
-- WHERE mode_class IS NOT NULL filter. Verified on the live DB 2026-09-06: in
-- the current 2-hour spot_history window the dropped rows were USB 436,
-- LSB 222, DIGITAL 190 (all dxcluster) plus 26 blank-mode rows; over the last
-- day the aggregate kept 379,518 digital and 6,166 cw spots and zero phone.
--
-- public.mode_class_of() (introduced in 20260830100000_band_health_ladder.sql
-- for the ladder) and compute_path_hourly_stats each kept their own inline
-- copy of this CASE, and the two had already drifted (mode_class_of covered
-- phone, compute_path_hourly_stats did not; neither covered DIGITAL/DIG/DIGI/
-- PSK/MFSK or DV/DSTAR/DMR/C4FM). This migration makes public.mode_class_of()
-- the ONE classifier: it widens the digital and phone lists, and both
-- compute_path_hourly_stats and compute_region_hourly_stats now call
-- NULLIF(public.mode_class_of(s.mode), 'unknown') instead of an inline CASE,
-- so the aggregates and the band-health ladder can never drift again.
-- ml/src/build_dataset_v4.py mirrors this same list for offline training
-- (DuckDB reads flat parquet, so it cannot call this function) and must be
-- kept in sync by hand whenever the mode vocabulary changes here.

CREATE OR REPLACE FUNCTION public.mode_class_of(mode text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  -- upper(): dxcluster feeds pass Mode through trim() only, so mixed-case
  -- values arrive here; without folding they'd all read "unknown".
  SELECT CASE
    WHEN upper(mode) = 'CW' THEN 'cw'
    WHEN upper(mode) IN ('FT8','FT4','FT2','JS8','VARAC','WSPR','RTTY',
                         'FREEDV','PKT','DATA','OLIVIA','JT65','JT9',
                         'MSK144','Q65','FST4','FST4W','DIGITAL','DIG',
                         'DIGI','PSK','PSK31','PSK63','MFSK') THEN 'digital'
    WHEN upper(mode) IN ('SSB','USB','LSB','FM','AM','PHONE','VOICE','DV',
                         'DSTAR','DMR','C4FM') THEN 'phone'
    ELSE 'unknown'
  END;
$$;

CREATE OR REPLACE FUNCTION public.compute_path_hourly_stats(
  hour_start timestamptz
)
RETURNS integer
LANGUAGE sql
SET statement_timeout = '120s'
AS $$
  WITH classified AS (
    SELECT
      NULLIF(public.mode_class_of(s.mode), 'unknown') AS mode_class,
      s.band,
      coalesce(
        CASE WHEN upper(left(s.tx_grid, 2)) ~ '^[A-R]{2}$'
             THEN upper(left(s.tx_grid, 2)) END,
        cf_tx.field
      ) AS tx_field,
      coalesce(
        CASE WHEN upper(left(s.rx_grid, 2)) ~ '^[A-R]{2}$'
             THEN upper(left(s.rx_grid, 2)) END,
        cf_rx.field
      ) AS rx_field,
      (s.tx_grid IS NULL AND cf_tx.field IS NOT NULL)
        OR (s.rx_grid IS NULL AND cf_rx.field IS NOT NULL) AS backfilled,
      s.tx_callsign,
      s.rx_callsign,
      s.snr
    FROM public.spot_history_live s
    LEFT JOIN public.callsign_fields cf_tx ON cf_tx.callsign = s.tx_callsign
    LEFT JOIN public.callsign_fields cf_rx ON cf_rx.callsign = s.rx_callsign
    WHERE s.spotted_at >= date_trunc('hour', hour_start)
      AND s.spotted_at < date_trunc('hour', hour_start) + interval '1 hour'
  ),
  ins AS (
    INSERT INTO public.path_hourly_stats
      (hour_utc, band, mode_class, tx_field, rx_field,
       spot_count, unique_tx, unique_rx, avg_snr, median_snr, backfilled_count)
    SELECT
      date_trunc('hour', hour_start),
      band,
      mode_class,
      tx_field,
      rx_field,
      count(*)::integer,
      count(DISTINCT tx_callsign)::integer,
      count(DISTINCT rx_callsign)::integer,
      round(avg(snr)::numeric, 1)::real,
      (percentile_cont(0.5) WITHIN GROUP (ORDER BY snr))::real,
      (count(*) FILTER (WHERE backfilled))::integer
    FROM classified
    WHERE mode_class IS NOT NULL
      AND tx_field IS NOT NULL
      AND rx_field IS NOT NULL
    GROUP BY band, mode_class, tx_field, rx_field
    ON CONFLICT (hour_utc, band, mode_class, tx_field, rx_field) DO UPDATE SET
      spot_count = excluded.spot_count,
      unique_tx = excluded.unique_tx,
      unique_rx = excluded.unique_rx,
      avg_snr = excluded.avg_snr,
      median_snr = excluded.median_snr,
      backfilled_count = excluded.backfilled_count
    RETURNING 1
  )
  SELECT count(*)::integer FROM ins;
$$;

REVOKE EXECUTE ON FUNCTION public.compute_path_hourly_stats(timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compute_path_hourly_stats(timestamptz)
  TO service_role;

-- Guard the column against future typos / unknown modes leaking through. No
-- prior CHECK existed (the table only ever saw 'cw'/'digital'), so this is
-- additive.
ALTER TABLE public.path_hourly_stats
  DROP CONSTRAINT IF EXISTS path_hourly_stats_mode_class_check;
ALTER TABLE public.path_hourly_stats
  ADD CONSTRAINT path_hourly_stats_mode_class_check
  CHECK (mode_class IN ('cw','digital','phone'));

-- ─── region_hourly_stats: additive per-mode-class breakdown ─────────────────
-- Mirrors band_hourly_stats.mode_counts (20260716010000_band_hourly_rpc.sql),
-- except keyed by mode_class rather than raw mode, and computed from the same
-- per-continent contribution rows compute_region_hourly_stats already builds.
-- Grain (hour_utc, band, continent) is unchanged.

ALTER TABLE public.region_hourly_stats
  ADD COLUMN IF NOT EXISTS mode_counts jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.compute_region_hourly_stats(
  hour_start timestamptz
)
RETURNS integer
LANGUAGE sql
SET statement_timeout = '120s'
AS $$
  WITH classified AS (
    SELECT
      s.id,
      s.band,
      NULLIF(public.mode_class_of(s.mode), 'unknown') AS mode_class,
      COALESCE(
        public.continent_for_latlon(s.tx_lat, s.tx_lon),
        public.continent_for_field(upper(left(s.tx_grid, 2))),
        CASE WHEN s.source = 'dxcluster'
              AND s.continent IN ('NA','SA','EU','AF','AS','OC','AN')
             THEN s.continent END,
        public.continent_for_field(cf_tx.field)
      ) AS tx_cont,
      COALESCE(
        public.continent_for_latlon(s.rx_lat, s.rx_lon),
        public.continent_for_field(upper(left(s.rx_grid, 2))),
        public.continent_for_field(cf_rx.field)
      ) AS rx_cont
    FROM public.spot_history s
    LEFT JOIN public.callsign_fields cf_tx ON cf_tx.callsign = s.tx_callsign
    LEFT JOIN public.callsign_fields cf_rx ON cf_rx.callsign = s.rx_callsign
    WHERE s.spotted_at >= date_trunc('hour', hour_start)
      AND s.spotted_at <  date_trunc('hour', hour_start) + interval '1 hour'
  ),
  contribs AS (
    SELECT DISTINCT id, band, mode_class, cont
    FROM (
      SELECT id, band, mode_class, tx_cont AS cont FROM classified
      UNION ALL
      SELECT id, band, mode_class, rx_cont FROM classified
    ) u
    WHERE cont IS NOT NULL
  ),
  totals AS (
    SELECT band, cont, count(*)::integer AS spot_count
    FROM contribs
    GROUP BY band, cont
  ),
  mode_counts AS (
    SELECT band, cont, jsonb_object_agg(mode_class, cnt) AS counts
    FROM (
      SELECT band, cont, mode_class, count(*)::integer AS cnt
      FROM contribs
      WHERE mode_class IS NOT NULL
      GROUP BY band, cont, mode_class
    ) grouped
    GROUP BY band, cont
  ),
  ins AS (
    INSERT INTO public.region_hourly_stats
      (hour_utc, band, continent, spot_count, mode_counts)
    SELECT
      date_trunc('hour', hour_start),
      totals.band,
      totals.cont,
      totals.spot_count,
      coalesce(mode_counts.counts, '{}'::jsonb)
    FROM totals
    LEFT JOIN mode_counts USING (band, cont)
    ON CONFLICT (hour_utc, band, continent) DO UPDATE SET
      spot_count = excluded.spot_count,
      mode_counts = excluded.mode_counts
    RETURNING 1
  )
  SELECT count(*)::integer FROM ins;
$$;

REVOKE ALL ON FUNCTION public.compute_region_hourly_stats(timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compute_region_hourly_stats(timestamptz)
  TO service_role;
