-- BH1: Activity Index (global scope) — climatology snapshot table + live
-- count RPC. See docs/plans/DEV-PLAN-BAND-HEALTH.md §5/§6.
--
-- Two population rules from the plan:
--   * The Activity Index numerator is the trailing 60-min RAW row count from
--     spot_history — the same count(*) population as band_hourly_stats'
--     spot_count, which the climatology percentiles are built from.
--   * The 20-min observation count is cross-source DEDUPLICATED on
--     (tx_callsign, rx_callsign, band, 5-min bucket) — groundwork for the
--     BH2 ladder's verified bar, whose thresholds are absolute counts.

-- ─── Climatology snapshot ───────────────────────────────────────────────────
-- One row per band × UTC hour-of-day (≤ 11 × 24 rows), recomputed daily by
-- the collector from band_hourly_stats so clients never scan history.

CREATE TABLE IF NOT EXISTS public.band_activity_climatology (
  band          text NOT NULL,
  hour_of_day   smallint NOT NULL CHECK (hour_of_day BETWEEN 0 AND 23),
  p25           real NOT NULL,
  p50           real NOT NULL,
  p75           real NOT NULL,
  p95           real NOT NULL,
  sample_count  integer NOT NULL,
  computed_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (band, hour_of_day)
);

COMMENT ON TABLE public.band_activity_climatology IS
  'Per band × UTC hour-of-day spot-count percentiles (BH1 Activity Index baseline). Recomputed daily by the collector from band_hourly_stats.';

ALTER TABLE public.band_activity_climatology ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access" ON public.band_activity_climatology
  FOR SELECT USING (true);
CREATE POLICY "Service role write" ON public.band_activity_climatology
  FOR INSERT WITH CHECK (false);

GRANT SELECT ON public.band_activity_climatology TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.band_activity_climatology
  TO service_role;

-- ─── Daily recompute (collector-invoked, service role only) ─────────────────

CREATE OR REPLACE FUNCTION public.compute_band_activity_climatology(
  baseline_days integer DEFAULT 90
)
RETURNS integer
LANGUAGE sql
SET statement_timeout = '120s'
AS $$
  -- Densify before ranking: band_hourly_stats has no row for a band that
  -- was silent during an aggregated hour, so sampling only existing rows
  -- would condition the percentiles on the band already being active and
  -- inflate every threshold. Rebuild the full band × hour timeline over the
  -- hours the aggregator actually ran (an hour absent for ALL bands means
  -- the collector was down, not that every band was silent) and fill the
  -- gaps with zero — the same rule as the F2 eval harness's densifyTruth.
  WITH window_rows AS (
    SELECT band, hour_utc, spot_count
    FROM public.band_hourly_stats
    WHERE hour_utc >= now() - make_interval(days => GREATEST(baseline_days, 1))
  ),
  hours AS (
    SELECT DISTINCT hour_utc FROM window_rows
  ),
  bands AS (
    SELECT DISTINCT band FROM window_rows
  ),
  samples AS (
    SELECT
      b.band,
      EXTRACT(hour FROM h.hour_utc)::smallint AS hour_of_day,
      COALESCE(w.spot_count, 0) AS spot_count
    FROM hours h
    CROSS JOIN bands b
    LEFT JOIN window_rows w
      ON w.hour_utc = h.hour_utc
     AND w.band = b.band
  ),
  pct AS (
    SELECT
      band,
      hour_of_day,
      percentile_cont(0.25) WITHIN GROUP (ORDER BY spot_count)::real AS p25,
      percentile_cont(0.50) WITHIN GROUP (ORDER BY spot_count)::real AS p50,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY spot_count)::real AS p75,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY spot_count)::real AS p95,
      count(*)::integer AS sample_count
    FROM samples
    GROUP BY band, hour_of_day
  ),
  upserted AS (
    INSERT INTO public.band_activity_climatology AS c
      (band, hour_of_day, p25, p50, p75, p95, sample_count, computed_at)
    SELECT band, hour_of_day, p25, p50, p75, p95, sample_count, now()
    FROM pct
    ON CONFLICT (band, hour_of_day) DO UPDATE SET
      p25 = excluded.p25,
      p50 = excluded.p50,
      p75 = excluded.p75,
      p95 = excluded.p95,
      sample_count = excluded.sample_count,
      computed_at = excluded.computed_at
    RETURNING 1
  )
  SELECT count(*)::integer FROM upserted;
$$;

REVOKE ALL ON FUNCTION public.compute_band_activity_climatology(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compute_band_activity_climatology(integer)
  TO service_role;

-- ─── Live counts (read by the band-activity edge function via anon) ─────────
-- spot_history is a ~2-h public-read sliding window with a (band, spotted_at)
-- index, so these scans are small and fast.

CREATE OR REPLACE FUNCTION public.band_activity_counts()
RETURNS TABLE (
  band              text,
  count_60m         integer,
  obs_20m           integer,
  reporters_20m     integer,
  count_10m_recent  integer,
  count_10m_prior   integer,
  source_counts_60m jsonb,
  p25               real,
  p50               real,
  p75               real,
  p95               real,
  sample_count      integer
)
LANGUAGE sql
STABLE
SET statement_timeout = '5s'
AS $$
  WITH recent AS (
    SELECT band, source, tx_callsign, rx_callsign, spotted_at
    FROM public.spot_history
    WHERE spotted_at >= now() - interval '60 minutes'
      AND spotted_at <= now()
  ),
  known_bands AS (
    SELECT DISTINCT band FROM public.band_activity_climatology
    UNION
    SELECT DISTINCT band FROM recent
  ),
  base AS (
    SELECT
      r.band,
      count(*)::integer AS count_60m,
      count(*) FILTER (
        WHERE r.spotted_at >= now() - interval '10 minutes'
      )::integer AS count_10m_recent,
      count(*) FILTER (
        WHERE r.spotted_at >= now() - interval '20 minutes'
          AND r.spotted_at <  now() - interval '10 minutes'
      )::integer AS count_10m_prior,
      count(DISTINCT r.rx_callsign) FILTER (
        WHERE r.spotted_at >= now() - interval '20 minutes'
      )::integer AS reporters_20m
    FROM recent r
    GROUP BY r.band
  ),
  -- Cross-source observation identity: the same station pair in the same
  -- 5-min bucket counts once no matter how many feeds carried it.
  dedup AS (
    SELECT o.band, count(*)::integer AS obs_20m
    FROM (
      SELECT DISTINCT
        band,
        tx_callsign,
        rx_callsign,
        floor(extract(epoch FROM spotted_at) / 300)::bigint AS bucket
      FROM recent
      WHERE spotted_at >= now() - interval '20 minutes'
    ) o
    GROUP BY o.band
  ),
  sources AS (
    SELECT s.band, jsonb_object_agg(s.source, s.n) AS source_counts_60m
    FROM (
      SELECT band, source, count(*)::integer AS n
      FROM recent
      GROUP BY band, source
    ) s
    GROUP BY s.band
  )
  SELECT
    kb.band,
    COALESCE(b.count_60m, 0),
    COALESCE(d.obs_20m, 0),
    COALESCE(b.reporters_20m, 0),
    COALESCE(b.count_10m_recent, 0),
    COALESCE(b.count_10m_prior, 0),
    COALESCE(s.source_counts_60m, '{}'::jsonb),
    c.p25,
    c.p50,
    c.p75,
    c.p95,
    c.sample_count
  FROM known_bands kb
  LEFT JOIN base b USING (band)
  LEFT JOIN dedup d USING (band)
  LEFT JOIN sources s USING (band)
  LEFT JOIN public.band_activity_climatology c
    ON c.band = kb.band
   AND c.hour_of_day = EXTRACT(hour FROM now())::smallint
  ORDER BY kb.band;
$$;

GRANT EXECUTE ON FUNCTION public.band_activity_counts()
  TO anon, authenticated, service_role;
