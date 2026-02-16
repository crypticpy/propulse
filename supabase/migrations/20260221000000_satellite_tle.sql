-- =============================================================================
-- Propulse: Satellite TLE Cache
-- Created: 2026-02-21
-- Description: Stores satellite TLE data fetched by the collector from
--              Celestrak, indexed by NORAD ID and group. Enables offline
--              resilience and staleness tracking for the satellite tracker.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.satellite_tle (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  norad_id        integer NOT NULL,
  satellite_name  text NOT NULL,
  tle_line1       text NOT NULL,
  tle_line2       text NOT NULL,
  tle_group       text NOT NULL,
  tle_epoch       timestamptz NOT NULL,
  collected_at    timestamptz NOT NULL DEFAULT now(),

  UNIQUE (norad_id, tle_group)
);

-- Fast lookups by group (primary query pattern from edge function)
CREATE INDEX IF NOT EXISTS satellite_tle_group_idx
  ON public.satellite_tle (tle_group);

-- Time-based queries for staleness checks
CREATE INDEX IF NOT EXISTS satellite_tle_collected_at_idx
  ON public.satellite_tle (collected_at DESC);

-- RLS: public read, service role write (matches other collector tables)
ALTER TABLE public.satellite_tle ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access"
  ON public.satellite_tle FOR SELECT
  USING (true);
