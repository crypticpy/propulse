# Expert Feedback on Propulse System

**Date:** January 31, 2026
**Reviewers:** Final Completeness Agent, Principal Code Reviewer, Dr. Harold "Hal" Morrison (W1HAL - RF Engineer Expert)

---

## Executive Summary

Four comprehensive reviews were conducted on the Propulse ham radio toolset:

| Review                       | Grade | Key Finding                                      |
| ---------------------------- | ----- | ------------------------------------------------ |
| Completeness                 | READY | 2 minor issues (EventAlert TODO, 2D map spots)   |
| Code Quality                 | Good  | CORS/validation issues, RBN geolocation missing  |
| RF Engineering (Propagation) | B-    | Gray line, polar paths, TEP missing              |
| RF Engineering (Full System) | B-    | Needs rig control, logging, alerts for daily use |

---

## Top Priority Action Items

### 1. Fix A-Index Calculation

**Location:** `src/pages/SolarPulse.tsx:78`
**Issue:** Using `Math.round(currentKp * 4)` - this is technically incorrect
**Fix:** Use proper Kp-to-Ap conversion table (nonlinear relationship)

### 2. Add Bz Component to Solar Display

**Issue:** Bz (IMF Z-component) is critical for storm prediction but not fetched
**Add:**

- New API proxy: `api/solar/magnetometer.ts`
- New hook: `useMagnetometer()`
- Display in PrimaryMetrics

### 3. Add RBN Geolocation

**Location:** `src/lib/api/rbn.ts:44-61`
**Issue:** RBN spots missing coordinates → never render on globe
**Fix:** Add callsign prefix-to-location lookup or use continent for approximate coordinates

### 4. Implement Source Filtering

**Issue:** UI exists in DXSpotList but filter not applied in LiveSpotArcs
**Fix:** Connect dxStore.filters.sources to LiveSpotArcs component

### 5. Add Input Validation to API Proxies

**Files:** `api/spots/pskreporter.ts`, `api/spots/rbn.ts`
**Issues:**

- `limit` parameter unbounded (could be negative or very large)
- `grid` parameter not validated (should match Maidenhead format)

### 6. Fix CORS Wildcards

**Files:** All API proxies
**Issue:** Using `"Access-Control-Allow-Origin": "*"`
**Fix:** Use specific allowed origin from environment variable

### 7. Implement Logging Integration (IndexedDB)

**Issue:** No worked/needed status for DXers
**Solution:** Client-side log storage using IndexedDB with ADIF import capability

### 8. Implement Alert System (IndexedDB)

**Issue:** No notifications for rare DX
**Solution:** Client-side alert rules stored in IndexedDB with browser notifications

---

## RF Engineer Expert Review Highlights

### What Works Well

- D-layer absorption modeling is excellent
- S-unit conversions are correct (rare to see this right)
- NVIS implementation is well done
- Ionospheric calculations use proper physics

### Critical Gaps in Propagation Modeling

| Missing Feature                    | Impact                                                |
| ---------------------------------- | ----------------------------------------------------- |
| Gray line enhancement              | Major DX feature not modeled (+5-15 dB)               |
| Polar path auroral absorption      | 4 dB penalty woefully inadequate (should be 20-40 dB) |
| Trans-equatorial propagation (TEP) | Not implemented for 6m/10m                            |
| Sporadic E prediction              | Not modeled                                           |
| Winter anomaly                     | Seasonal model backwards for mid-latitudes            |

### SolarPulse Dashboard Issues

- A-index calculation incorrect (uses `Kp * 4` instead of conversion table)
- Missing Bz component - critical for storm prediction
- Missing X-ray flux, DRAP maps, proton flux values

### Workflow Gaps

- **No rig control (CAT)** - Can't tune to spotted frequency
- **No logging integration** - No worked/needed status
- **No alert system** - Must constantly watch screen
- **No VOACAP API integration** - Standard for serious predictions

### Expert's Verdict

> "Currently a visualization tool rather than an operating tool. Without rig control, logging, and alerts, it remains something I would glance at rather than operate with. The foundation is solid - now it needs practical integration features that turn theory into QSOs."

---

## Code Review Findings

### Critical Issues

1. **CORS Wildcard** - `Access-Control-Allow-Origin: "*"` in all API proxies
2. **No Input Validation** - limit parameter unbounded, grid not validated
3. **Memory Leak Risk** - useDXCluster recursive timeout pattern

### Incomplete Implementations

1. **RBN spots missing geolocation** - Never render on globe
2. **Source filtering not applied** - UI exists but filter ignored
3. **bands.ts monolith** - 1200+ lines, needs splitting

### Performance Concerns

1. DXSpotList needs virtualization for 50+ spots
2. Missing AbortController for cancellable fetch requests
3. Three.js bundle adds ~500KB

---

## Recommended Improvements

### High Priority (This Implementation)

1. Fix A-index calculation with proper conversion table
2. Add Bz component to solar display
3. Add RBN geolocation via prefix lookup
4. Implement source filtering in LiveSpotArcs
5. Add input validation to API proxies
6. Implement logging with IndexedDB
7. Implement alerts with IndexedDB

### Medium Priority (Future)

1. Gray line detection and enhancement modeling
2. Improved polar path modeling with geomagnetic coordinates
3. Sporadic E seasonal/diurnal probability model
4. Split bands.ts monolith into modules
5. Add virtualization to DXSpotList

### Future Consideration (When Hardware Available)

1. CAT/CI-V rig control integration
2. WSJT-X integration for FT8 SNR reports
3. CW skimmer integration

---

## Files Reference

### Files to Modify

- `src/pages/SolarPulse.tsx` - A-index calculation
- `src/lib/api/noaa.ts` - Add magnetometer fetch
- `src/lib/api/rbn.ts` - Add geolocation
- `src/hooks/useLiveSpots.ts` - Source filtering
- `src/components/map/LiveSpotArcs.tsx` - Apply source filter
- `api/spots/pskreporter.ts` - Input validation, CORS
- `api/spots/rbn.ts` - Input validation, CORS

### New Files to Create

- `api/solar/magnetometer.ts` - Bz data proxy
- `src/lib/db/index.ts` - IndexedDB initialization
- `src/lib/db/logStore.ts` - Log entry storage
- `src/lib/db/alertStore.ts` - Alert rules storage
- `src/hooks/useLogbook.ts` - Log access hook
- `src/hooks/useAlerts.ts` - Alert management hook
- `src/lib/data/prefixLocations.ts` - Callsign prefix to location mapping
