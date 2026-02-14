-- =============================================================================
-- Propulse: Denormalize Solar Features into band_hourly_stats for ML Training
-- Created: 2026-02-18
-- Description: The solar_snapshots table already has xray_flux, dst_index,
--              proton_flux_10mev, and by_gsm. This migration denormalizes
--              those columns into band_hourly_stats so the ML pipeline can
--              train without joins.
-- =============================================================================

-- IMF By component in GSM coordinates (nT)
-- Already collected in solar_snapshots but not previously passed through.
ALTER TABLE public.band_hourly_stats ADD COLUMN IF NOT EXISTS by_gsm real;

-- Denormalized X-ray flux from solar_snapshots (W/m²)
ALTER TABLE public.band_hourly_stats ADD COLUMN IF NOT EXISTS xray_flux real;

-- Denormalized Dst index from solar_snapshots (nT)
ALTER TABLE public.band_hourly_stats ADD COLUMN IF NOT EXISTS dst_index real;

-- Denormalized proton flux >= 10 MeV from solar_snapshots (pfu)
ALTER TABLE public.band_hourly_stats ADD COLUMN IF NOT EXISTS proton_flux_10mev real;
