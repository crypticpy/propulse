-- =============================================================================
-- Propulse: Spot History, Solar Snapshots & Band Hourly Stats
-- Created: 2026-02-09
-- Description: PostGIS-enabled spot collection tables, solar index snapshots,
--              and hourly band aggregates for ML training.
-- =============================================================================

-- Enable PostGIS for spatial indexing (future: geography columns + GIST indexes)
CREATE EXTENSION IF NOT EXISTS postgis;

-- =============================================================================
-- SECTION 1: SPOT HISTORY
-- =============================================================================
-- Raw HF spots from PSKReporter, RBN, DX Cluster.
-- Global data (not user-specific) — NO RLS.

CREATE TABLE IF NOT EXISTS public.spot_history (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source          text NOT NULL CHECK (source IN ('pskreporter', 'rbn', 'dxcluster')),
  spotted_at      timestamptz NOT NULL,
  ingested_at     timestamptz NOT NULL DEFAULT now(),

  -- Transmitter (DX station)
  tx_callsign     text NOT NULL,
  tx_grid         text,
  tx_lat          double precision,
  tx_lon          double precision,

  -- Receiver / Spotter
  rx_callsign     text NOT NULL,
  rx_grid         text,
  rx_lat          double precision,
  rx_lon          double precision,

  -- Signal
  frequency_khz   double precision NOT NULL,
  band            text NOT NULL,
  mode            text,
  snr             smallint,
  wpm             smallint,

  -- DX Cluster extras
  comment         text,
  dxcc            smallint,
  continent       text
);

-- Dedup: same source + tx + rx + freq + time = same spot
CREATE UNIQUE INDEX IF NOT EXISTS spot_history_dedup_idx
  ON public.spot_history (source, tx_callsign, rx_callsign, frequency_khz, spotted_at);

-- Time-range queries (most common pattern)
CREATE INDEX IF NOT EXISTS spot_history_spotted_at_idx
  ON public.spot_history (spotted_at DESC);

-- Band + time composite (aggregation, ML feature extraction)
CREATE INDEX IF NOT EXISTS spot_history_band_time_idx
  ON public.spot_history (band, spotted_at DESC);

-- Per-source monitoring
CREATE INDEX IF NOT EXISTS spot_history_source_time_idx
  ON public.spot_history (source, spotted_at DESC);

-- Callsign lookups
CREATE INDEX IF NOT EXISTS spot_history_tx_call_idx
  ON public.spot_history (tx_callsign, spotted_at DESC);

-- =============================================================================
-- SECTION 2: SOLAR SNAPSHOTS
-- =============================================================================
-- Solar indices captured every ~5 minutes by the collector.

CREATE TABLE IF NOT EXISTS public.solar_snapshots (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  captured_at     timestamptz NOT NULL DEFAULT now(),
  kp_index        real,
  sfi             real,
  bz_gsm          real,
  by_gsm          real,
  bt              real,
  solar_wind_speed real,
  ssn             real
);

CREATE UNIQUE INDEX IF NOT EXISTS solar_snapshots_time_idx
  ON public.solar_snapshots (captured_at);

-- =============================================================================
-- SECTION 3: BAND HOURLY STATS (ML TRAINING TABLE)
-- =============================================================================
-- Pre-computed aggregate: one row per band per hour.
-- Denormalized solar conditions for fast ML access without joins.

CREATE TABLE IF NOT EXISTS public.band_hourly_stats (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  hour_utc        timestamptz NOT NULL,
  band            text NOT NULL,

  -- Spot counts
  spot_count      integer NOT NULL DEFAULT 0,
  unique_tx       integer NOT NULL DEFAULT 0,
  unique_rx       integer NOT NULL DEFAULT 0,

  -- Signal quality
  avg_snr         real,
  min_snr         smallint,
  max_snr         smallint,
  median_snr      real,

  -- Breakdowns (JSONB)
  mode_counts     jsonb NOT NULL DEFAULT '{}',
  source_counts   jsonb NOT NULL DEFAULT '{}',

  -- Geographic spread
  unique_grids_tx integer NOT NULL DEFAULT 0,
  unique_grids_rx integer NOT NULL DEFAULT 0,

  -- Solar conditions at this hour (denormalized)
  kp_index        real,
  sfi             real,
  bz_gsm          real,
  bt              real,

  UNIQUE (hour_utc, band)
);

CREATE INDEX IF NOT EXISTS band_hourly_stats_hour_idx
  ON public.band_hourly_stats (hour_utc DESC);

CREATE INDEX IF NOT EXISTS band_hourly_stats_band_hour_idx
  ON public.band_hourly_stats (band, hour_utc DESC);

-- =============================================================================
-- SECTION 4: COLLECTOR HEALTH
-- =============================================================================
-- Heartbeat/status rows from the collector service.

CREATE TABLE IF NOT EXISTS public.collector_health (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reported_at     timestamptz NOT NULL DEFAULT now(),
  source          text NOT NULL,
  status          text NOT NULL CHECK (status IN ('ok', 'error', 'warning')),
  spots_ingested  integer DEFAULT 0,
  duration_ms     integer DEFAULT 0,
  error_message   text,
  metadata        jsonb
);

CREATE INDEX IF NOT EXISTS collector_health_time_idx
  ON public.collector_health (reported_at DESC);
