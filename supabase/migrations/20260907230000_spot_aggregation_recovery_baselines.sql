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
  INSERT INTO public.collector_aggregation_gaps AS existing_gap
      (aggregation, start_hour, end_hour)
    VALUES (p_aggregation, p_start_hour, p_end_hour)
    ON CONFLICT (aggregation, start_hour) DO UPDATE
      SET end_hour = excluded.end_hour,
          recorded_at = now()
      WHERE excluded.end_hour > existing_gap.end_hour;
END;
$$;

REVOKE ALL ON FUNCTION public.record_spot_aggregation_gap(text,timestamptz,timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_spot_aggregation_gap(text,timestamptz,timestamptz)
  TO service_role;

CREATE OR REPLACE FUNCTION public.spot_aggregation_baseline_current(
  p_aggregation text,
  p_computed_at timestamptz
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(p_aggregation IN ('band_hourly', 'region_hourly')
    AND p_computed_at IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.collector_aggregation_gaps g
      WHERE g.aggregation = p_aggregation
        AND g.recorded_at > p_computed_at
    ), false);
$$;

REVOKE ALL ON FUNCTION public.spot_aggregation_baseline_current(text,timestamptz)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.spot_aggregation_baseline_current(text,timestamptz)
  TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.spot_aggregation_hour_readable(
  p_aggregation text,
  p_hour timestamptz
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(p_aggregation IN ('band_hourly', 'region_hourly')
    AND p_hour IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.collector_aggregation_gaps g
      WHERE g.aggregation = p_aggregation
        AND p_hour BETWEEN g.start_hour AND g.end_hour
    ), false);
$$;

REVOKE ALL ON FUNCTION public.spot_aggregation_hour_readable(text,timestamptz)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.spot_aggregation_hour_readable(text,timestamptz)
  TO anon, authenticated, service_role;

CREATE VIEW public.band_hourly_stats_readable
WITH (security_invoker = true)
AS
SELECT *
FROM public.band_hourly_stats
WHERE public.spot_aggregation_hour_readable('band_hourly', hour_utc);

GRANT SELECT ON public.band_hourly_stats_readable
  TO anon, authenticated, service_role;

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
      AND NOT EXISTS (
        SELECT 1 FROM public.collector_aggregation_gaps g
        WHERE g.aggregation = 'band_hourly'
          AND public.band_hourly_stats.hour_utc BETWEEN g.start_hour AND g.end_hour
      )
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

CREATE OR REPLACE FUNCTION public.compute_region_activity_climatology(
  baseline_days integer DEFAULT 90
)
RETURNS integer
LANGUAGE sql
SET statement_timeout = '120s'
AS $$
  WITH window_rows AS (
    SELECT band, continent, hour_utc, spot_count
    FROM public.region_hourly_stats
    WHERE hour_utc >= now() - make_interval(days => GREATEST(baseline_days, 1))
      AND NOT EXISTS (
        SELECT 1 FROM public.collector_aggregation_gaps g
        WHERE g.aggregation = 'region_hourly'
          AND public.region_hourly_stats.hour_utc BETWEEN g.start_hour AND g.end_hour
      )
  ),
  hours AS (
    SELECT DISTINCT hour_utc FROM window_rows
  ),
  cells AS (
    SELECT DISTINCT band, continent FROM window_rows
  ),
  samples AS (
    SELECT
      c.band,
      c.continent,
      EXTRACT(hour FROM h.hour_utc)::smallint AS hour_of_day,
      COALESCE(w.spot_count, 0) AS spot_count
    FROM hours h
    CROSS JOIN cells c
    LEFT JOIN window_rows w
      ON w.hour_utc = h.hour_utc
     AND w.band = c.band
     AND w.continent = c.continent
  ),
  pct AS (
    SELECT
      band,
      continent,
      hour_of_day,
      percentile_cont(0.25) WITHIN GROUP (ORDER BY spot_count)::real AS p25,
      percentile_cont(0.50) WITHIN GROUP (ORDER BY spot_count)::real AS p50,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY spot_count)::real AS p75,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY spot_count)::real AS p95,
      count(*)::integer AS sample_count
    FROM samples
    GROUP BY band, continent, hour_of_day
  ),
  upserted AS (
    INSERT INTO public.region_activity_climatology AS c
      (band, continent, hour_of_day, p25, p50, p75, p95, sample_count, computed_at)
    SELECT band, continent, hour_of_day, p25, p50, p75, p95, sample_count, now()
    FROM pct
    ON CONFLICT (band, continent, hour_of_day) DO UPDATE SET
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

REVOKE ALL ON FUNCTION public.compute_region_activity_climatology(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compute_region_activity_climatology(integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.band_activity_counts()
RETURNS TABLE (
  band              text,
  count_60m         integer,
  obs_20m           integer,
  reporters_20m     integer,
  count_10m_recent  integer,
  count_10m_prior   integer,
  source_counts_60m jsonb,
  mode_obs_20m      jsonb,
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
    SELECT band, source, mode, tx_callsign, rx_callsign, spotted_at
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
  modes AS (
    SELECT g.band, jsonb_object_agg(g.mode_class, g.n) AS mode_obs_20m
    FROM (
      SELECT m.band, m.mode_class, count(*)::integer AS n
      FROM (
        SELECT DISTINCT
          band,
          public.mode_class_of(mode) AS mode_class,
          tx_callsign,
          rx_callsign,
          floor(extract(epoch FROM spotted_at) / 300)::bigint AS bucket
        FROM recent
        WHERE spotted_at >= now() - interval '20 minutes'
      ) m
      GROUP BY m.band, m.mode_class
    ) g
    GROUP BY g.band
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
    COALESCE(m.mode_obs_20m, '{}'::jsonb),
    c.p25,
    c.p50,
    c.p75,
    c.p95,
    c.sample_count
  FROM known_bands kb
  LEFT JOIN base b USING (band)
  LEFT JOIN dedup d USING (band)
  LEFT JOIN modes m USING (band)
  LEFT JOIN sources s USING (band)
  LEFT JOIN public.band_activity_climatology c
    ON c.band = kb.band
   AND c.hour_of_day = EXTRACT(hour FROM now())::smallint
   AND public.spot_aggregation_baseline_current('band_hourly', c.computed_at)
  ORDER BY kb.band;
$$;

GRANT EXECUTE ON FUNCTION public.band_activity_counts()
  TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.region_activity_counts(
  target_continent text DEFAULT NULL
)
RETURNS TABLE (
  continent         text,
  band              text,
  count_60m         integer,
  obs_20m           integer,
  reporters_20m     integer,
  count_10m_recent  integer,
  count_10m_prior   integer,
  source_counts_60m jsonb,
  mode_obs_20m      jsonb,
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
  WITH classified AS (
    SELECT
      s.id,
      s.band,
      s.source,
      s.mode,
      s.tx_callsign,
      s.rx_callsign,
      s.spotted_at,
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
    WHERE s.spotted_at >= now() - interval '60 minutes'
      AND s.spotted_at <= now()
  ),
  contribs AS (
    SELECT DISTINCT id, cont, band, source, mode,
           tx_callsign, rx_callsign, spotted_at
    FROM (
      SELECT id, tx_cont AS cont, band, source, mode,
             tx_callsign, rx_callsign, spotted_at
      FROM classified
      UNION ALL
      SELECT id, rx_cont, band, source, mode,
             tx_callsign, rx_callsign, spotted_at
      FROM classified
    ) u
    WHERE cont IS NOT NULL
      AND (target_continent IS NULL OR cont = target_continent)
  ),
  known AS (
    SELECT c.band, c.continent AS cont
    FROM public.region_activity_climatology c
    WHERE target_continent IS NULL OR c.continent = target_continent
    UNION
    SELECT DISTINCT band, cont FROM contribs
  ),
  base AS (
    SELECT
      cont,
      band,
      count(*)::integer AS count_60m,
      count(*) FILTER (
        WHERE spotted_at >= now() - interval '10 minutes'
      )::integer AS count_10m_recent,
      count(*) FILTER (
        WHERE spotted_at >= now() - interval '20 minutes'
          AND spotted_at <  now() - interval '10 minutes'
      )::integer AS count_10m_prior,
      count(DISTINCT rx_callsign) FILTER (
        WHERE spotted_at >= now() - interval '20 minutes'
      )::integer AS reporters_20m
    FROM contribs
    GROUP BY cont, band
  ),
  dedup AS (
    SELECT o.cont, o.band, count(*)::integer AS obs_20m
    FROM (
      SELECT DISTINCT cont, band, tx_callsign, rx_callsign,
        floor(extract(epoch FROM spotted_at) / 300)::bigint AS bucket
      FROM contribs
      WHERE spotted_at >= now() - interval '20 minutes'
    ) o
    GROUP BY o.cont, o.band
  ),
  modes AS (
    SELECT g.cont, g.band, jsonb_object_agg(g.mode_class, g.n) AS mode_obs_20m
    FROM (
      SELECT m.cont, m.band, m.mode_class, count(*)::integer AS n
      FROM (
        SELECT DISTINCT cont, band,
          public.mode_class_of(mode) AS mode_class,
          tx_callsign, rx_callsign,
          floor(extract(epoch FROM spotted_at) / 300)::bigint AS bucket
        FROM contribs
        WHERE spotted_at >= now() - interval '20 minutes'
      ) m
      GROUP BY m.cont, m.band, m.mode_class
    ) g
    GROUP BY g.cont, g.band
  ),
  sources AS (
    SELECT s.cont, s.band, jsonb_object_agg(s.source, s.n) AS source_counts_60m
    FROM (
      SELECT cont, band, source, count(*)::integer AS n
      FROM contribs
      GROUP BY cont, band, source
    ) s
    GROUP BY s.cont, s.band
  )
  SELECT
    k.cont,
    k.band,
    COALESCE(b.count_60m, 0),
    COALESCE(d.obs_20m, 0),
    COALESCE(b.reporters_20m, 0),
    COALESCE(b.count_10m_recent, 0),
    COALESCE(b.count_10m_prior, 0),
    COALESCE(s.source_counts_60m, '{}'::jsonb),
    COALESCE(m.mode_obs_20m, '{}'::jsonb),
    c.p25,
    c.p50,
    c.p75,
    c.p95,
    c.sample_count
  FROM known k
  LEFT JOIN base b ON b.cont = k.cont AND b.band = k.band
  LEFT JOIN dedup d ON d.cont = k.cont AND d.band = k.band
  LEFT JOIN modes m ON m.cont = k.cont AND m.band = k.band
  LEFT JOIN sources s ON s.cont = k.cont AND s.band = k.band
  LEFT JOIN public.region_activity_climatology c
    ON c.band = k.band
   AND c.continent = k.cont
   AND c.hour_of_day = EXTRACT(hour FROM now())::smallint
   AND public.spot_aggregation_baseline_current('region_hourly', c.computed_at)
  ORDER BY k.cont, k.band;
$$;

GRANT EXECUTE ON FUNCTION public.region_activity_counts(text)
  TO anon, authenticated, service_role;
