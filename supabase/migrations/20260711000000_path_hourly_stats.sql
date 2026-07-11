-- =============================================================================
-- PATH-LEVEL HOURLY AGGREGATES (ML training flywheel)
-- =============================================================================
-- One row per (hour, band, mode_class, tx_field, rx_field) — the exact cell
-- shape the path_open / SNR models train on (see ml/README.md). Raw spots
-- prune after RETENTION_SPOTS days; these aggregates are never pruned, so
-- training data accrues from the moment the collector restarts.
--
-- mode_class matches ml/src/build_dataset_v4.py exactly:
--   'cw'      = CW (RBN skimmers)
--   'digital' = FT8/FT4/etc (PSKReporter monitors)
--   SSB/AM/FM excluded — near-invisible in spot networks; the product derives
--   SSB from digital-open + SNR margin.
--
-- RBN spots (~85% of volume, all CW) carry no grids. callsign_fields maps
-- callsign → dominant 2-char Maidenhead field, learned from grid-bearing
-- spots; in the ML run this recovered 112.5M otherwise-unusable spots.

CREATE TABLE IF NOT EXISTS public.path_hourly_stats (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  hour_utc        timestamptz NOT NULL,
  band            text NOT NULL,
  mode_class      text NOT NULL,
  tx_field        text NOT NULL,  -- 2-char Maidenhead field, e.g. 'FN'
  rx_field        text NOT NULL,

  spot_count      integer NOT NULL DEFAULT 0,
  unique_tx       integer NOT NULL DEFAULT 0,
  unique_rx       integer NOT NULL DEFAULT 0,
  avg_snr         real,
  median_snr      real,

  -- Spots whose tx or rx field came from the callsign_fields backfill map
  -- rather than a grid on the spot itself. Data-quality signal.
  backfilled_count integer NOT NULL DEFAULT 0,

  UNIQUE (hour_utc, band, mode_class, tx_field, rx_field)
);

CREATE INDEX IF NOT EXISTS path_hourly_stats_hour_idx
  ON public.path_hourly_stats (hour_utc DESC);

-- Serving lookups: "activity from/near my field right now"
CREATE INDEX IF NOT EXISTS path_hourly_stats_tx_field_idx
  ON public.path_hourly_stats (tx_field, band, hour_utc DESC);

-- =============================================================================
-- CALLSIGN → FIELD BACKFILL MAP
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.callsign_fields (
  callsign        text PRIMARY KEY,
  field           text NOT NULL,
  sightings       integer NOT NULL,
  share           real NOT NULL,     -- fraction of sightings in this field
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- RLS: anyone can read, only service role can write (matches collector tables)
-- =============================================================================

ALTER TABLE public.path_hourly_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access" ON public.path_hourly_stats FOR SELECT USING (true);
CREATE POLICY "Service role insert" ON public.path_hourly_stats FOR INSERT WITH CHECK (false);

ALTER TABLE public.callsign_fields ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access" ON public.callsign_fields FOR SELECT USING (true);
CREATE POLICY "Service role insert" ON public.callsign_fields FOR INSERT WITH CHECK (false);

-- =============================================================================
-- refresh_callsign_fields(lookback)
-- =============================================================================
-- Upserts the dominant field per callsign from grid-bearing spots in the
-- lookback window. Thresholds (share >= 0.8, sightings >= 5) prevent noisy
-- 1-day windows from flipping fields for portable/rover operators; entries
-- persist even when a callsign goes quiet, so the map accretes over time.
-- The collector calls this once per UTC day with the default 1-day window.
-- After a long collector outage, seed manually with a wider window:
--   SELECT public.refresh_callsign_fields('30 days');

CREATE OR REPLACE FUNCTION public.refresh_callsign_fields(
  lookback interval DEFAULT '1 day'
)
RETURNS integer
LANGUAGE sql
SET statement_timeout = '300s'
AS $$
  WITH sightings AS (
    SELECT tx_callsign AS callsign, upper(left(tx_grid, 2)) AS field, count(*) AS n
    FROM public.spot_history
    WHERE spotted_at >= now() - lookback
      AND upper(left(tx_grid, 2)) ~ '^[A-R]{2}$'
    GROUP BY 1, 2
    UNION ALL
    SELECT rx_callsign, upper(left(rx_grid, 2)), count(*)
    FROM public.spot_history
    WHERE spotted_at >= now() - lookback
      AND upper(left(rx_grid, 2)) ~ '^[A-R]{2}$'
    GROUP BY 1, 2
  ),
  per_call AS (
    SELECT callsign, field, sum(n) AS n,
           sum(sum(n)) OVER (PARTITION BY callsign) AS total
    FROM sightings
    GROUP BY 1, 2
  ),
  dominant AS (
    SELECT DISTINCT ON (callsign)
           callsign, field, n::integer AS sightings, (n / total)::real AS share
    FROM per_call
    ORDER BY callsign, n DESC
  ),
  ins AS (
    INSERT INTO public.callsign_fields (callsign, field, sightings, share, updated_at)
    SELECT callsign, field, sightings, share, now()
    FROM dominant
    WHERE share >= 0.8 AND sightings >= 5
    ON CONFLICT (callsign) DO UPDATE SET
      field = excluded.field,
      sightings = excluded.sightings,
      share = excluded.share,
      updated_at = excluded.updated_at
    RETURNING 1
  )
  SELECT count(*)::integer FROM ins;
$$;

-- =============================================================================
-- compute_path_hourly_stats(hour_start)
-- =============================================================================
-- Aggregates one hour of spot_history into path_hourly_stats entirely inside
-- Postgres (~1M spots -> ~6K path cells; far too much to ship over PostgREST).
-- Grid fields are validated A-R; missing grids backfill from callsign_fields
-- via pure equi-joins (mixed-condition join clauses degrade some planners to
-- nested loops). Idempotent per hour via upsert. Returns rows written.

CREATE OR REPLACE FUNCTION public.compute_path_hourly_stats(
  hour_start timestamptz
)
RETURNS integer
LANGUAGE sql
SET statement_timeout = '120s'
AS $$
  WITH classified AS (
    SELECT
      CASE
        WHEN s.mode = 'CW' THEN 'cw'
        WHEN s.mode IN ('FT8','FT4','FT2','JS8','VARAC','WSPR','RTTY','FREEDV',
                        'PKT','DATA','OLIVIA','JT65','JT9','MSK144','Q65',
                        'FST4','FST4W') THEN 'digital'
      END AS mode_class,
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
    FROM public.spot_history s
    LEFT JOIN public.callsign_fields cf_tx ON cf_tx.callsign = s.tx_callsign
    LEFT JOIN public.callsign_fields cf_rx ON cf_rx.callsign = s.rx_callsign
    WHERE s.spotted_at >= date_trunc('hour', hour_start)
      AND s.spotted_at <  date_trunc('hour', hour_start) + interval '1 hour'
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

-- Both functions write tables and are exposed at /rpc by PostgREST —
-- restrict execution to the collector's service role.
REVOKE EXECUTE ON FUNCTION public.refresh_callsign_fields(interval) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.compute_path_hourly_stats(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_callsign_fields(interval) TO service_role;
GRANT EXECUTE ON FUNCTION public.compute_path_hourly_stats(timestamptz) TO service_role;
