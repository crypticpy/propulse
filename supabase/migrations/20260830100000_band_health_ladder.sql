-- BH2: verified-state ladder + dual scopes (DEV-PLAN-BAND-HEALTH §3/§4/§6).
--
-- Adds:
--   * continent classifiers (approximate lat/lon boxes; Maidenhead-field
--     wrapper) so Regional scope needs no spot_history schema change —
--     continents are derived at query time. spot_history.continent is
--     cluster-tx-only and stays untouched (never filter on it directly).
--   * region_hourly_stats + climatology: the scoped hourly aggregate that
--     gives Regional the same baseline band_hourly_stats gives Global.
--   * verdict_states / verdict_events: the canonical server-side ladder's
--     serving surface and append-only pre-outcome log (§6, log-don't-
--     reconstruct). Events are pruned to 13 months by the collector.
--   * live count RPCs for every scope: band_activity_counts gains a
--     mode-class breakdown; region_activity_counts serves Regional;
--     band_pair_counts serves the client-computed DX ladder.
--
-- Observation identity everywhere (§3): one observation = one deduplicated
-- (tx_callsign, rx_callsign, band, 5-min bucket) tuple; reporters = distinct
-- rx callsigns. Ladder thresholds are absolute counts, so the dedup MUST
-- happen here, server-side, identically for every scope.

-- ─── Mode class ─────────────────────────────────────────────────────────────
-- Same CW/digital split as compute_path_hourly_stats (which keeps its own
-- inline CASE and NULL-filters phone); this variant labels the rest so the
-- ladder can show what carries an opening.

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
                         'MSK144','Q65','FST4','FST4W') THEN 'digital'
    WHEN upper(mode) IN ('SSB','USB','LSB','FM','AM','PHONE') THEN 'phone'
    ELSE 'unknown'
  END;
$$;

-- ─── Continent classifiers ──────────────────────────────────────────────────
-- Approximate box classifier over the seven ham continents. Deliberately
-- coarse: a Regional numerator only needs the right continent for the vast
-- majority of spots, and known misses sit on borders (Panama→SA, Turkey→EU,
-- Israel→AF). Hawaii and the east-of-dateline Pacific classify OC before
-- the Americas box, matching DXCC.

CREATE OR REPLACE FUNCTION public.continent_for_latlon(
  lat double precision,
  lon double precision
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN lat IS NULL OR lon IS NULL THEN NULL
    WHEN lat < -90 OR lat > 90 OR lon < -180 OR lon > 180 THEN NULL
    WHEN lat < -60 THEN 'AN'
    -- Pacific east of the dateline (Hawaii, Polynesia) before the Americas
    WHEN lon < -140 AND lat < 30 THEN 'OC'
    -- The Americas: split SA off below 13°N east of 82°W (Trinidad,
    -- Venezuela → SA; Central America and the Caribbean → NA)
    WHEN lon >= -170 AND lon < -30 THEN
      CASE WHEN lat < 13 AND lon >= -82 THEN 'SA' ELSE 'NA' END
    WHEN lon <= -140 THEN 'NA'  -- far-west Aleutians
    -- Oceania proper
    WHEN lon >= 110 AND lat < 10 THEN 'OC'
    WHEN lon >= 150 AND lat < 25 THEN 'OC'
    -- Europe / Africa / Asia by the usual rough lines
    WHEN lon >= -30 AND lon < 45 AND lat >= 36 THEN 'EU'
    WHEN lon >= 45 AND lon < 60 AND lat >= 50 THEN 'EU'  -- Russia west of Urals
    WHEN lon >= -30 AND lon < 35 AND lat < 36 THEN 'AF'
    WHEN lon >= 35 AND lon < 52 AND lat < 12 THEN 'AF'   -- Horn + Madagascar
    WHEN lon >= 25 THEN 'AS'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.continent_for_field(field text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN field ~ '^[A-R]{2}$' THEN public.continent_for_latlon(
      (ascii(substr(field, 2, 1)) - 65) * 10 - 90 + 5,
      (ascii(substr(field, 1, 1)) - 65) * 20 - 180 + 10
    )
  END;
$$;

GRANT EXECUTE ON FUNCTION public.mode_class_of(text),
  public.continent_for_latlon(double precision, double precision),
  public.continent_for_field(text)
  TO anon, authenticated, service_role;

-- ─── Regional hourly aggregate ──────────────────────────────────────────────
-- One row per (hour, band, continent). A spot contributes to BOTH endpoint
-- continents (once each; once total when they match); rows where neither
-- endpoint resolves are excluded from numerator AND baseline (§4).

CREATE TABLE IF NOT EXISTS public.region_hourly_stats (
  hour_utc    timestamptz NOT NULL,
  band        text NOT NULL,
  continent   text NOT NULL
    CHECK (continent IN ('NA','SA','EU','AF','AS','OC','AN')),
  spot_count  integer NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hour_utc, band, continent)
);

CREATE INDEX IF NOT EXISTS region_hourly_stats_hour_idx
  ON public.region_hourly_stats (hour_utc DESC);

COMMENT ON TABLE public.region_hourly_stats IS
  'Hourly per-continent spot counts (BH2 Regional baseline). A spot counts toward each resolved endpoint continent; unresolvable rows are excluded entirely.';

ALTER TABLE public.region_hourly_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access" ON public.region_hourly_stats
  FOR SELECT USING (true);
CREATE POLICY "Service role write" ON public.region_hourly_stats
  FOR INSERT WITH CHECK (false);

GRANT SELECT ON public.region_hourly_stats TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.region_hourly_stats
  TO service_role;

-- Let the region aggregator use the shared watermark table. Both the CHECK
-- constraint AND the recording RPC's own whitelist must admit the new name —
-- the RPC raises 'invalid aggregation' before the constraint is ever tested.
ALTER TABLE public.collector_aggregation_watermarks
  DROP CONSTRAINT collector_aggregation_watermarks_aggregation_check;
ALTER TABLE public.collector_aggregation_watermarks
  ADD CONSTRAINT collector_aggregation_watermarks_aggregation_check
  CHECK (aggregation IN ('band_hourly', 'path_hourly', 'region_hourly'));

CREATE OR REPLACE FUNCTION public.record_collector_aggregation_watermark(
  p_aggregation text,
  p_hour_utc timestamptz,
  p_rows integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_aggregation NOT IN ('band_hourly', 'path_hourly', 'region_hourly') THEN
    RAISE EXCEPTION 'invalid aggregation';
  END IF;

  INSERT INTO public.collector_aggregation_watermarks AS current_watermark (
    aggregation, hour_utc, rows_written, available_at, updated_at
  ) VALUES (
    p_aggregation,
    date_trunc('hour', p_hour_utc),
    greatest(coalesce(p_rows, 0), 0),
    now(),
    now()
  )
  ON CONFLICT (aggregation) DO UPDATE SET
    hour_utc = excluded.hour_utc,
    rows_written = excluded.rows_written,
    available_at = excluded.available_at,
    updated_at = excluded.updated_at
  WHERE excluded.hour_utc >= current_watermark.hour_utc;
END;
$$;

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
    SELECT DISTINCT id, band, cont
    FROM (
      SELECT id, band, tx_cont AS cont FROM classified
      UNION ALL
      SELECT id, band, rx_cont FROM classified
    ) u
    WHERE cont IS NOT NULL
  ),
  ins AS (
    INSERT INTO public.region_hourly_stats (hour_utc, band, continent, spot_count)
    SELECT date_trunc('hour', hour_start), band, cont, count(*)::integer
    FROM contribs
    GROUP BY band, cont
    ON CONFLICT (hour_utc, band, continent) DO UPDATE SET
      spot_count = excluded.spot_count
    RETURNING 1
  )
  SELECT count(*)::integer FROM ins;
$$;

REVOKE ALL ON FUNCTION public.compute_region_hourly_stats(timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compute_region_hourly_stats(timestamptz)
  TO service_role;

-- ─── Regional climatology ───────────────────────────────────────────────────
-- Same densify rule as compute_band_activity_climatology: rebuild the full
-- band × continent × hour timeline over hours the aggregator ran and
-- zero-fill, so percentiles aren't conditioned on the cell being active.
-- Regional runs counts-only in the UI until cells reach 14 samples.

CREATE TABLE IF NOT EXISTS public.region_activity_climatology (
  band          text NOT NULL,
  continent     text NOT NULL
    CHECK (continent IN ('NA','SA','EU','AF','AS','OC','AN')),
  hour_of_day   smallint NOT NULL CHECK (hour_of_day BETWEEN 0 AND 23),
  p25           real NOT NULL,
  p50           real NOT NULL,
  p75           real NOT NULL,
  p95           real NOT NULL,
  sample_count  integer NOT NULL,
  computed_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (band, continent, hour_of_day)
);

ALTER TABLE public.region_activity_climatology ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access" ON public.region_activity_climatology
  FOR SELECT USING (true);
CREATE POLICY "Service role write" ON public.region_activity_climatology
  FOR INSERT WITH CHECK (false);

GRANT SELECT ON public.region_activity_climatology TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.region_activity_climatology
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

-- ─── Canonical ladder state + pre-outcome event log (§6) ────────────────────
-- The collector evaluates the ladder every tick for the deterministic
-- scopes (global per band; regional per band × continent), upserts the
-- stable state here, and appends every transition and surprise onset to
-- verdict_events BEFORE any outcome is known. Client-side ladders are
-- UI-only and never the scored record.

CREATE TABLE IF NOT EXISTS public.verdict_states (
  band            text NOT NULL,
  scope_type      text NOT NULL CHECK (scope_type IN ('global', 'regional')),
  scope_key       text NOT NULL DEFAULT '',  -- '' global, continent code regional
  state           text NOT NULL
    CHECK (state IN ('closed','forecast','stirring','verified','hot')),
  stable_since    timestamptz NOT NULL,
  candidate       text
    CHECK (candidate IS NULL
           OR candidate IN ('closed','forecast','stirring','verified','hot')),
  candidate_since timestamptz,
  surprise        boolean NOT NULL DEFAULT false,
  -- When the current contiguous stirring-or-better run began (provenance:
  -- "verified open since 14:05"); null while closed/forecast.
  opened_at       timestamptz,
  -- Last raw evaluation: obs/reporters/trend/physics + source and
  -- mode-class mixes, for the why popover.
  inputs          jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (band, scope_type, scope_key)
);

ALTER TABLE public.verdict_states ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access" ON public.verdict_states
  FOR SELECT USING (true);
CREATE POLICY "Service role write" ON public.verdict_states
  FOR INSERT WITH CHECK (false);

GRANT SELECT ON public.verdict_states TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.verdict_states TO service_role;

CREATE TABLE IF NOT EXISTS public.verdict_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ts          timestamptz NOT NULL DEFAULT now(),
  band        text NOT NULL,
  scope_type  text NOT NULL CHECK (scope_type IN ('global', 'regional')),
  scope_key   text NOT NULL DEFAULT '',
  event_type  text NOT NULL CHECK (event_type IN ('transition', 'surprise')),
  from_state  text,
  to_state    text,
  inputs      jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK (event_type <> 'transition'
         OR (from_state IS NOT NULL AND to_state IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS verdict_events_ts_idx
  ON public.verdict_events (ts DESC);
CREATE INDEX IF NOT EXISTS verdict_events_scope_idx
  ON public.verdict_events (band, scope_type, scope_key, ts DESC);

COMMENT ON TABLE public.verdict_events IS
  'Append-only ladder transitions + surprise onsets, written pre-outcome (BH2 §6). Pruned to 13 months by the collector prune task.';

ALTER TABLE public.verdict_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access" ON public.verdict_events
  FOR SELECT USING (true);
CREATE POLICY "Service role write" ON public.verdict_events
  FOR INSERT WITH CHECK (false);

GRANT SELECT ON public.verdict_events TO anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.verdict_events TO service_role;

-- ─── Global live counts: add the mode-class breakdown ───────────────────────
-- Return-type change requires DROP; body is BH1's with one extra CTE.
-- mode_obs_20m dedups within each mode class, so its values can sum
-- slightly above obs_20m when feeds disagree about a pair's mode.

DROP FUNCTION IF EXISTS public.band_activity_counts();

CREATE FUNCTION public.band_activity_counts()
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
  ORDER BY kb.band;
$$;

GRANT EXECUTE ON FUNCTION public.band_activity_counts()
  TO anon, authenticated, service_role;

-- ─── Regional live counts ───────────────────────────────────────────────────
-- Same shape as band_activity_counts, keyed by continent, densified over
-- known (band, continent) cells so quiet scopes still return zero rows —
-- the collector ladder needs zeros to walk a scope back down.

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
  ORDER BY k.cont, k.band;
$$;

GRANT EXECUTE ON FUNCTION public.region_activity_counts(text)
  TO anon, authenticated, service_role;

-- ─── DX pair live counts (client-computed DX ladder) ────────────────────────
-- Counts spots between two Maidenhead fields in BOTH directions. Invalid
-- fields return an empty set. Densified over known bands so the client
-- ladder sees explicit zeros.

CREATE OR REPLACE FUNCTION public.band_pair_counts(
  p_tx_field text,
  p_rx_field text
)
RETURNS TABLE (
  band              text,
  count_60m         integer,
  obs_20m           integer,
  reporters_20m     integer,
  count_10m_recent  integer,
  count_10m_prior   integer,
  mode_obs_20m      jsonb
)
LANGUAGE sql
STABLE
SET statement_timeout = '5s'
AS $$
  WITH args AS (
    SELECT upper(p_tx_field) AS fa, upper(p_rx_field) AS fb
    WHERE upper(p_tx_field) ~ '^[A-R]{2}$'
      AND upper(p_rx_field) ~ '^[A-R]{2}$'
  ),
  pathrows AS (
    SELECT s.band, s.mode, s.tx_callsign, s.rx_callsign, s.spotted_at
    FROM public.spot_history s
    LEFT JOIN public.callsign_fields cf_tx ON cf_tx.callsign = s.tx_callsign
    LEFT JOIN public.callsign_fields cf_rx ON cf_rx.callsign = s.rx_callsign
    CROSS JOIN args a
    WHERE s.spotted_at >= now() - interval '60 minutes'
      AND s.spotted_at <= now()
      AND (
        (COALESCE(
           CASE WHEN upper(left(s.tx_grid, 2)) ~ '^[A-R]{2}$'
                THEN upper(left(s.tx_grid, 2)) END,
           cf_tx.field) = a.fa
         AND COALESCE(
           CASE WHEN upper(left(s.rx_grid, 2)) ~ '^[A-R]{2}$'
                THEN upper(left(s.rx_grid, 2)) END,
           cf_rx.field) = a.fb)
        OR
        (COALESCE(
           CASE WHEN upper(left(s.tx_grid, 2)) ~ '^[A-R]{2}$'
                THEN upper(left(s.tx_grid, 2)) END,
           cf_tx.field) = a.fb
         AND COALESCE(
           CASE WHEN upper(left(s.rx_grid, 2)) ~ '^[A-R]{2}$'
                THEN upper(left(s.rx_grid, 2)) END,
           cf_rx.field) = a.fa)
      )
  ),
  known_bands AS (
    SELECT DISTINCT c.band FROM public.band_activity_climatology c
    CROSS JOIN args
    UNION
    SELECT DISTINCT band FROM pathrows
  ),
  base AS (
    SELECT
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
    FROM pathrows
    GROUP BY band
  ),
  dedup AS (
    SELECT o.band, count(*)::integer AS obs_20m
    FROM (
      SELECT DISTINCT band, tx_callsign, rx_callsign,
        floor(extract(epoch FROM spotted_at) / 300)::bigint AS bucket
      FROM pathrows
      WHERE spotted_at >= now() - interval '20 minutes'
    ) o
    GROUP BY o.band
  ),
  modes AS (
    SELECT g.band, jsonb_object_agg(g.mode_class, g.n) AS mode_obs_20m
    FROM (
      SELECT m.band, m.mode_class, count(*)::integer AS n
      FROM (
        SELECT DISTINCT band,
          public.mode_class_of(mode) AS mode_class,
          tx_callsign, rx_callsign,
          floor(extract(epoch FROM spotted_at) / 300)::bigint AS bucket
        FROM pathrows
        WHERE spotted_at >= now() - interval '20 minutes'
      ) m
      GROUP BY m.band, m.mode_class
    ) g
    GROUP BY g.band
  )
  SELECT
    kb.band,
    COALESCE(b.count_60m, 0),
    COALESCE(d.obs_20m, 0),
    COALESCE(b.reporters_20m, 0),
    COALESCE(b.count_10m_recent, 0),
    COALESCE(b.count_10m_prior, 0),
    COALESCE(m.mode_obs_20m, '{}'::jsonb)
  FROM known_bands kb
  LEFT JOIN base b USING (band)
  LEFT JOIN dedup d USING (band)
  LEFT JOIN modes m USING (band)
  ORDER BY kb.band;
$$;

GRANT EXECUTE ON FUNCTION public.band_pair_counts(text, text)
  TO anon, authenticated, service_role;
