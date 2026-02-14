# Solar Data Quality & Sources Improvement Plan

## Overview

10 improvements to solar weather data quality, sources, and presentation.

## Current State

- 5 NOAA SWPC endpoints polled every 5 min by Railway collector → `solar_snapshots` table
- Frontend fetches same data via Vercel Edge Functions (does NOT use collector's Supabase data)
- Metrics tracked: Kp, SFI, Bz/By/Bt, solar wind speed, sunspot number
- Alert system: 9 alert types, only 4 actually fire (geomagnetic, IMF, flare probability, greyline)

## Feature 1: GOES X-ray Flux (1–8 Å)

**Source**: `https://services.swpc.noaa.gov/json/goes/primary/xrays-6-hour.json`
**What**: Real-time 1-min X-ray flux for flare detection. Crossing 1e-5 W/m² = M-class, 1e-4 = X-class.
**Implementation**:

- New edge function: `api/solar/xray.ts` (5-min cache)
- New column in `solar_snapshots`: `xray_flux real`
- New collector source in `solar.ts`
- New hook: add `useXrayFlux()` to `useSolarData.ts`
- Wire into `useSolarAlerts.ts` → fires RADIO_BLACKOUT alerts (currently dead code)
- New NOAA fetch function in `noaa.ts`

## Feature 2: GOES Proton Flux (≥10 MeV)

**Source**: `https://services.swpc.noaa.gov/json/goes/primary/integral-protons-1-day.json`
**What**: Actual particle counts instead of probabilities. Enables `evaluateProtonAlert()` dead code.
**Implementation**:

- New edge function: `api/solar/protons.ts` (5-min cache)
- New column: `proton_flux_10mev real`
- Collector addition
- Hook: `useProtonFlux()` in `useSolarData.ts`
- Wire `evaluateProtonAlert()` in `useSolarAlerts.ts` with real data

## Feature 3: Dst Index (Kyoto WDC)

**Source**: `https://wdc.kugi.kyoto-u.ac.jp/dst_realtime/presentmonth/index.html` (parse) or NOAA Dst proxy
**Alternative**: `https://services.swpc.noaa.gov/products/kyoto-dst.json`
**What**: Ring current depression — best single number for storm magnitude. Hourly resolution.
**Implementation**:

- New edge function: `api/solar/dst.ts` (30-min cache)
- New column: `dst_index real`
- Display in SolarDashboard alongside Kp
- Alert: Dst < -100 nT = WARNING, < -200 nT = CRITICAL

## Feature 4: Solar Wind Density + Dynamic Pressure

**Source**: Same RTSW wind endpoint we already poll — field `proton_density`
**What**: Enables dynamic pressure calculation: P = ½ρv² (nPa). Key magnetopause driver.
**Implementation**:

- New column: `solar_wind_density real`
- Extract from existing `rtsw_wind_1m.json` response (already fetched, just need new field)
- Compute pressure client-side: `pressure = 1.6726e-6 * density * speed²`
- Display in solar dashboard

## Feature 5: Use Collector Supabase Data on Frontend

**What**: Frontend queries `solar_snapshots` table instead of hitting NOAA via edge functions.
**Benefits**: Eliminates NOAA rate-limit risk, enables historical trend charts, data already exists.
**Implementation**:

- New Supabase query functions in `src/lib/api/solarFromSupabase.ts`
- Feature flag: `useSupabaseSolar` in settingsStore (default true)
- Fallback to edge functions if Supabase unavailable
- Historical chart: last 24h, 7d, 30d views using stored data
- Keep edge functions as fallback path

## Feature 6: DRAP (D-Region Absorption Prediction) Map

**Source**: `https://services.swpc.noaa.gov/json/drap_global_frequencies.json`
**What**: Global HF absorption map in dB. Shows where HF is blacked out.
**Implementation**:

- New edge function: `api/solar/drap.ts` (15-min cache)
- New hook: `useDRAPData()`
- New 3D globe layer: `DRAPOverlay.tsx` — heatmap on globe surface
- Add to `layers` in mapStore: `drap: boolean`
- Add to LayersPopover Propagation category

## Feature 7: CME Arrival Prediction (NASA DONKI)

**Source**: `https://api.nasa.gov/DONKI/CMEAnalysis?mostAccurateOnly=true&api_key=DEMO_KEY`
**What**: CME analysis with estimated Earth arrival times. "CME expected in ~36 hours".
**Implementation**:

- New edge function: `api/solar/cme.ts` (1-hour cache)
- New type: `CMEPrediction { id, startTime, arrivalTime, speed, halfAngle, isMostAccurate }`
- New hook: `useCMEPredictions()`
- New alert type: add `CME_INCOMING` to AlertType union
- Display countdown in solar dashboard: "CME arrives in ~X hours"

## Feature 8: Multi-Point Magnetometer Comparison

**Source**: Additional ground magnetometer stations (Tromsø, Kakioka, Honolulu)
**What**: Cross-validation catches single-station glitches. Our edge function already has fallback.
**Implementation**:

- Aggregate Bz readings from 2-3 sources
- Show disagreement indicator: if sources diverge > 5 nT, flag data quality issue
- Edge function `magnetometer.ts` already has fallback — extend to weighted average
- UI: quality confidence badge on magnetometer reading

## Feature 9: Historical Solar Cycle Overlay

**Source**: Existing `sunspot_number` data + hardcoded cycle 23/24 reference data
**What**: Overlay current cycle 25 against previous cycles on a chart.
**Implementation**:

- Hardcode cycle 23 (1996-2008) and 24 (2008-2019) monthly SSN reference data
- New component: `SolarCycleChart.tsx` in solar dashboard
- X-axis: months from cycle start, Y-axis: SSN
- Three lines: Cycle 23 (gray), Cycle 24 (gray dashed), Cycle 25 (cyan, current)
- Show current position with marker

## Feature 10: SFI Trend Prediction (7-day Forecast)

**Source**: `https://services.swpc.noaa.gov/json/f107_cm_flux_forecast.json`
**What**: SWPC publishes 3-day and 27-day SFI forecast.
**Implementation**:

- New edge function: `api/solar/flux-forecast.ts` (4-hour cache)
- New hook: `useSolarFluxForecast()`
- Display trend arrow + forecast values in solar dashboard
- "SFI expected to rise to 180 by Thursday" messaging

## Implementation Phases

### Phase S1: Database + Types + Edge Functions

- Migration: add columns (xray_flux, proton_flux_10mev, dst_index, solar_wind_density)
- New edge functions (6): xray, protons, dst, drap, cme, flux-forecast
- Type extensions: new AlertType values, new solar data types
- Collector extensions: new NOAA endpoints

### Phase S2: Hooks + Store

- New fetch functions in noaa.ts
- New hooks in useSolarData.ts
- Supabase query path (Feature 5)
- Wire alerts (X-ray → RADIO_BLACKOUT, Proton → PROTON_EVENT)

### Phase S3: UI + Visualization

- Solar Cycle Chart (Feature 9)
- SFI Forecast display (Feature 10)
- DRAP globe overlay (Feature 6)
- CME countdown display (Feature 7)
- Multi-magnetometer confidence badge (Feature 8)
- Dynamic pressure display (Feature 4)
- Dst Index display (Feature 3)
