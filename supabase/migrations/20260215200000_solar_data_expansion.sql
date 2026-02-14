-- =============================================================================
-- Propulse: Solar Data Expansion
-- Created: 2026-02-15
-- Description: Add new solar data columns to solar_snapshots for expanded
--              space weather monitoring (X-ray flux, proton flux, Dst, density).
-- =============================================================================

-- X-ray flux from GOES primary sensor (W/m²)
ALTER TABLE public.solar_snapshots ADD COLUMN IF NOT EXISTS xray_flux real;

-- Integral proton flux >= 10 MeV from GOES (pfu)
ALTER TABLE public.solar_snapshots ADD COLUMN IF NOT EXISTS proton_flux_10mev real;

-- Dst index from Kyoto/NOAA (nT, negative during storms)
ALTER TABLE public.solar_snapshots ADD COLUMN IF NOT EXISTS dst_index real;

-- Solar wind proton density from RTSW (particles/cm³)
ALTER TABLE public.solar_snapshots ADD COLUMN IF NOT EXISTS solar_wind_density real;
