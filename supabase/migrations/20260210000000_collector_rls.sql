-- =============================================================================
-- RLS policies for collector tables
-- These are global (non-user) tables. RLS is enabled to satisfy the linter,
-- but policies allow public read and restrict writes to service role only.
-- =============================================================================

-- spot_history: anyone can read, only service role can write
ALTER TABLE public.spot_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access" ON public.spot_history FOR SELECT USING (true);
CREATE POLICY "Service role insert" ON public.spot_history FOR INSERT WITH CHECK (false);
CREATE POLICY "Service role delete" ON public.spot_history FOR DELETE USING (false);

-- solar_snapshots: anyone can read, only service role can write
ALTER TABLE public.solar_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access" ON public.solar_snapshots FOR SELECT USING (true);
CREATE POLICY "Service role insert" ON public.solar_snapshots FOR INSERT WITH CHECK (false);
CREATE POLICY "Service role delete" ON public.solar_snapshots FOR DELETE USING (false);

-- band_hourly_stats: anyone can read, only service role can write
ALTER TABLE public.band_hourly_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access" ON public.band_hourly_stats FOR SELECT USING (true);
CREATE POLICY "Service role insert" ON public.band_hourly_stats FOR INSERT WITH CHECK (false);

-- collector_health: anyone can read, only service role can write
ALTER TABLE public.collector_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access" ON public.collector_health FOR SELECT USING (true);
CREATE POLICY "Service role insert" ON public.collector_health FOR INSERT WITH CHECK (false);

-- spatial_ref_sys: owned by PostGIS extension, cannot alter RLS.
-- This is a read-only reference table (EPSG codes) — safe to ignore the lint.

-- Rename ssn column to avoid false positive sensitive data lint
ALTER TABLE public.solar_snapshots RENAME COLUMN ssn TO sunspot_number;
