# Location-Aware Propagation Model

> **Status**: Planning
> **Created**: 2026-02-10
> **Depends on**: Spot Collector running on Railway (`propulse-collector`)
> **Target**: Implement when `band_hourly_stats` has 7-14 days of data (~late Feb 2026)

## Problem

The propagation engine is 100% analytical — ITU-R P.533 physics formulas (ionospheric layers,
ray tracing, D-layer absorption). It's deterministic: same solar inputs = same outputs, regardless
of what's actually happening on the air. Meanwhile, the collector is ingesting ~7-9M real spots/day
with TX/RX grid squares, SNR, mode, and band — data that could ground our predictions in reality.

Additionally, profile/location data syncs to Supabase (via `profileSync` → `saved_locations` table),
but there's no mechanism to serve location-specific propagation insights back to the user.

## Goal

When a user activates a location, pre-seed their propagation view with real-world band activity
data from the database — both recent observations and (eventually) trained model predictions.
This should work cross-browser: log in from any device, activate a location, get local insights.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     COLLECTOR (Railway)                  │
│                                                         │
│  PSKReporter ──┐                                        │
│  RBN ──────────┼──► spot_history ──► band_region_stats  │
│  DXCluster ────┘         │              (NEW)           │
│                          │                              │
│  NOAA ─────────────► solar_snapshots                    │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                     SUPABASE (Postgres)                  │
│                                                         │
│  spot_history ─────── raw spots (30-day retention)      │
│  solar_snapshots ──── solar indices (90-day retention)  │
│  band_hourly_stats ── global aggregates (forever)       │
│  band_region_stats ── geo-bucketed aggregates (NEW)     │
│  saved_locations ──── user operating locations          │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                     FRONTEND (React SPA)                │
│                                                         │
│  profileStore ─── user activates a location             │
│       │                                                 │
│       ▼                                                 │
│  useLocationBandActivity() ── queries band_region_stats │
│       │                       for active location grid  │
│       ▼                                                 │
│  BandActivityPanel ── shows real-world band data        │
│       +                alongside analytical predictions  │
│  Analytical engine ── existing ITU-R P.533 model        │
└─────────────────────────────────────────────────────────┘
```

---

## Level 1: Historical Overlay (First Implementation)

### What It Does

Show real-world band activity for the user's active location alongside analytical predictions.
"20m had 2,400 spots from your area in the last 24h with avg SNR -8" next to "model predicts
20m is GOOD right now."

### Database: `band_region_stats` Table

New table with geographic bucketing. Uses **2-character Maidenhead grid prefix** (field square,
~1,000 km resolution — e.g., "FN" for US Northeast, "JO" for Western Europe). This gives ~324
possible regions globally, with most HF activity concentrated in ~40-50 regions.

```sql
CREATE TABLE IF NOT EXISTS public.band_region_stats (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  hour_utc        timestamptz NOT NULL,
  band            text NOT NULL,
  region          text NOT NULL,  -- 2-char Maidenhead field (e.g., "FN", "JO")

  -- Spot counts (TX stations in this region)
  spot_count      integer NOT NULL DEFAULT 0,
  unique_tx       integer NOT NULL DEFAULT 0,

  -- Signal quality (as reported by receivers)
  avg_snr         real,
  median_snr      real,

  -- Where spots were heard (JSONB: { "FN": 42, "JO": 18, ... })
  rx_region_counts jsonb NOT NULL DEFAULT '{}',

  -- Top modes (JSONB: { "FT8": 120, "CW": 30 })
  mode_counts     jsonb NOT NULL DEFAULT '{}',

  -- Solar conditions (denormalized, same as band_hourly_stats)
  kp_index        real,
  sfi             real,
  bz_gsm          real,
  bt              real,

  UNIQUE (hour_utc, band, region)
);

CREATE INDEX band_region_stats_region_hour_idx
  ON public.band_region_stats (region, hour_utc DESC);

CREATE INDEX band_region_stats_hour_idx
  ON public.band_region_stats (hour_utc DESC);
```

**Why 2-char grid?** Balances geographic resolution with row count. At ~12 bands × 24 hours × 50
active regions = ~14,400 rows/day. After a month: ~430K rows — trivially small. A 4-char grid
(e.g., "FN31") would be 32,400 possible buckets, most empty, with sparser data per bucket.

### Collector Changes

Modify `collector/src/aggregator/hourly.ts` to also populate `band_region_stats`:

```typescript
// After computing global band_hourly_stats, also compute per-region stats

// Group spots by TX region (first 2 chars of tx_grid)
const regionGroups = new Map<string, typeof spots>();
for (const spot of spots) {
  if (!spot.tx_grid || spot.tx_grid.length < 2) continue;
  const region = spot.tx_grid.substring(0, 2).toUpperCase();
  if (!regionGroups.has(region)) regionGroups.set(region, []);
  regionGroups.get(region)!.push(spot);
}

// Upsert one row per region per band per hour
for (const [region, regionSpots] of regionGroups) {
  const txSet = new Set(regionSpots.map((s) => s.tx_callsign));
  const snrs = regionSpots
    .map((s) => s.snr)
    .filter(Boolean)
    .sort((a, b) => a - b);

  // Count which RX regions heard these TX stations
  const rxRegionCounts: Record<string, number> = {};
  for (const s of regionSpots) {
    if (s.rx_grid && s.rx_grid.length >= 2) {
      const rxRegion = s.rx_grid.substring(0, 2).toUpperCase();
      rxRegionCounts[rxRegion] = (rxRegionCounts[rxRegion] || 0) + 1;
    }
  }

  await db.from("band_region_stats").upsert(
    {
      hour_utc: prevHourISO,
      band,
      region,
      spot_count: regionSpots.length,
      unique_tx: txSet.size,
      avg_snr: snrs.length ? average(snrs) : null,
      median_snr: snrs.length ? median(snrs) : null,
      rx_region_counts: rxRegionCounts,
      mode_counts: countBy(regionSpots, "mode"),
      kp_index: solarRow?.kp_index ?? null,
      sfi: solarRow?.sfi ?? null,
      bz_gsm: solarRow?.bz_gsm ?? null,
      bt: solarRow?.bt ?? null,
    },
    { onConflict: "hour_utc,band,region" },
  );
}
```

### Frontend: `useLocationBandActivity` Hook

```typescript
// src/hooks/useLocationBandActivity.ts

function useLocationBandActivity() {
  const { station } = useProfileStore();
  const activeLocation = getActiveLocation(station); // resolved location
  const region = activeLocation.grid.substring(0, 2).toUpperCase();

  return useQuery({
    queryKey: ["band-region-stats", region],
    queryFn: () =>
      supabase
        .from("band_region_stats")
        .select("*")
        .eq("region", region)
        .gte("hour_utc", last24hISO())
        .order("hour_utc", { ascending: false }),
    staleTime: 5 * 60 * 1000, // 5 min
    enabled: !!region,
  });
}
```

### Frontend: `BandActivityPanel` Component

Shows alongside the existing `BandConditions` solar widget:

- **Per-band row**: spot count (last 24h), avg SNR, trend sparkline, top modes
- **"Hot bands" highlight**: bands with above-average activity for this region
- **Comparison badge**: "Model says GOOD / Spots say ACTIVE" or "Model says FAIR / No spots"
- **Time-of-day heatmap**: 24h × bands grid colored by spot density

---

## Level 2: Trained Prediction Model (Future)

### Prerequisites

- `band_region_stats` has 14+ days of data with solar conditions
- Pattern: given `(region, hour_of_day, day_of_year, kp, sfi, bz_gsm)` → predict `(spot_count, avg_snr)`

### Approach Options

#### Option A: Supabase Edge Function with Simple Regression

Train a lightweight model (linear regression or small decision tree) offline, export coefficients,
serve predictions from a Supabase Edge Function.

**Pros**: No ML infrastructure, coefficients fit in a JSON file, sub-50ms predictions.
**Cons**: Limited model complexity, manual retraining.

```
POST /api/predict-band-activity
Body: { region: "FN", kp: 3.0, sfi: 150, bz_gsm: -2.1 }
Response: { bands: { "20m": { predicted_spots: 340, predicted_snr: -6, confidence: 0.82 }, ... } }
```

#### Option B: PostgreSQL ML (pg_ml or custom SQL)

Use Postgres functions to run predictions directly in the database. Supabase supports
`plpgsql` functions that could implement a lookup table or interpolation.

**Pros**: No additional infrastructure, queries return predictions inline.
**Cons**: Limited to simple models, harder to iterate.

#### Option C: External ML Service

Train a proper model (XGBoost, small neural net) on exported data, deploy as a microservice
on Railway alongside the collector.

**Pros**: Best model quality, can use sophisticated features.
**Cons**: Additional infrastructure cost, latency, complexity.

### Recommended: Option A First, Option C Later

Start with exported regression coefficients in an Edge Function. The feature vector is small
(~6 inputs), and a decision tree with ~50 leaves would capture the main patterns (band + time
of day + solar conditions → activity level). Retrain monthly by exporting `band_region_stats`
and running a Python script locally.

### Training Data Schema

Each training row from `band_region_stats`:

| Feature       | Type                               | Source             |
| ------------- | ---------------------------------- | ------------------ |
| `region`      | categorical (one-hot or embedding) | grid prefix        |
| `hour_of_day` | cyclical (sin/cos encoding)        | `hour_utc`         |
| `day_of_year` | cyclical (sin/cos encoding)        | `hour_utc`         |
| `band`        | categorical                        | band column        |
| `kp_index`    | float                              | denormalized solar |
| `sfi`         | float                              | denormalized solar |
| `bz_gsm`      | float                              | denormalized solar |
| `bt`          | float                              | denormalized solar |

| Target       | Type                                             |
| ------------ | ------------------------------------------------ |
| `spot_count` | integer (regression)                             |
| `avg_snr`    | float (regression)                               |
| `band_open`  | boolean (classification, spot_count > threshold) |

### Model Evaluation

Use last 2 days as holdout. Metrics:

- **Regression**: RMSE, MAE on spot_count and avg_snr
- **Classification**: Precision/recall on "band open" (spot_count > 10)
- **Baseline**: Compare against "same hour yesterday" naive predictor

---

## Level 3: Path-Specific Predictions (Future Future)

Once Level 2 works for single-location predictions, extend to path-based:

- "From FN (your QTH) to JO (Western Europe) on 20m, what's the prediction?"
- Query `spot_history` for TX in region A, RX in region B (or vice versa)
- Build a path-specific model: `(tx_region, rx_region, band, hour, solar)` → `(spot_count, snr)`
- This bridges the analytical model (which is inherently path-based) with real data

### Integration with Analytical Engine

The analytical engine (`src/lib/utils/bands.ts`) currently returns:

```typescript
interface BandCondition {
  name: string;
  freq: string;
  status: BandStatus; // "good" | "fair" | "poor" | "closed"
  percentage: number; // 0-100 confidence
  bestFor: string;
  isVhf: boolean;
  signalPrediction?: SignalPrediction;
}
```

Add a `realWorldOverlay` field:

```typescript
interface BandCondition {
  // ... existing fields ...
  realWorld?: {
    spotCount24h: number; // spots from this region in last 24h
    avgSnr: number; // average reported SNR
    trend: "rising" | "falling" | "stable";
    predictedSpots?: number; // ML prediction (Level 2)
    confidence?: number; // model confidence
    lastSpotAge: number; // minutes since last spot on this band from region
  };
}
```

The UI can then show both: "Model: GOOD (physics) / Reality: ACTIVE (342 spots, -6 dB avg)"

---

## Cross-Browser Sync Flow

```
User logs in on new device
        │
        ▼
SyncManager.pullAll()
        │
        ├── profileSync.pull() → saved_locations[]
        ├── shackSync.pull()   → equipment, presets
        └── preferencesSync.pull() → settings, theme
        │
        ▼
User activates location "Home" (grid: FN31pr)
        │
        ▼
useLocationBandActivity("FN")
        │
        ▼
Supabase query: band_region_stats WHERE region='FN' AND hour_utc > now()-24h
        │
        ▼
BandActivityPanel renders with real data immediately
```

No local data needed — everything comes from Supabase. The analytical model still runs
client-side (it only needs lat/lon + solar indices), but the real-world overlay is server-sourced.

---

## Implementation Checklist

### Phase 1: Geographic Bucketing (Collector)

- [ ] Write migration: `20260215000000_band_region_stats.sql`
- [ ] Add `band_region_stats` table with `UNIQUE(hour_utc, band, region)`
- [ ] Add indexes: `(region, hour_utc DESC)`, `(hour_utc DESC)`
- [ ] Add RLS: public read, service role write
- [ ] Modify `collector/src/aggregator/hourly.ts` to group by TX grid prefix
- [ ] Upsert region stats alongside global stats
- [ ] Deploy collector update to Railway
- [ ] Verify data flowing with: `SELECT region, COUNT(*) FROM band_region_stats GROUP BY region`

### Phase 2: Frontend Consumer

- [ ] Add `band_region_stats` to Supabase TypeScript types
- [ ] Create `useLocationBandActivity` hook (TanStack Query, 5-min stale time)
- [ ] Create `BandActivityPanel` component
- [ ] Integrate into solar dashboard / band conditions view
- [ ] Show per-band: spot count, avg SNR, sparkline trend, "hot band" badges
- [ ] Handle empty state: "Collecting data for your region..."
- [ ] Mobile responsive layout

### Phase 3: Model Training (When Data Sufficient)

- [ ] Export `band_region_stats` to CSV (14+ days)
- [ ] Python training script: feature engineering, train/test split, model selection
- [ ] Export model coefficients as JSON
- [ ] Create Vercel Edge Function: `/api/predict-band-activity`
- [ ] Frontend: fetch predictions, display alongside historical data
- [ ] A/B compare: model vs. analytical vs. historical

### Phase 4: Path-Specific (Future)

- [ ] Create `path_hourly_stats` table (tx_region × rx_region × band × hour)
- [ ] Extend collector to aggregate path-level stats
- [ ] Integrate with analytical engine's `BandCondition` type
- [ ] Train path-specific model

---

## Data Volume Estimates

| Table                        | Rows/Day | Rows/Month                | Rows/Year |
| ---------------------------- | -------- | ------------------------- | --------- |
| `spot_history`               | ~7-9M    | ~240M (pruned to 30 days) | N/A       |
| `band_hourly_stats`          | ~288     | ~8,640                    | ~105K     |
| `band_region_stats`          | ~14,400  | ~432K                     | ~5.3M     |
| `path_hourly_stats` (future) | ~100K+   | ~3M+                      | ~36M+     |

`band_region_stats` at 5.3M rows/year is still very manageable for Postgres. Consider pruning
to 1 year or compressing to daily granularity after 90 days if needed.

---

## Key Decisions Made

1. **2-char grid prefix** for geographic bucketing (not 4-char) — balances resolution with data density
2. **TX-station region** as primary bucket (not RX) — TX location = where propagation originates
3. **`rx_region_counts` JSONB** — captures where spots were heard without exploding row count
4. **Denormalized solar conditions** — same pattern as `band_hourly_stats`, avoids joins for ML
5. **No pruning on `band_region_stats`** — preserved for model training (same as `band_hourly_stats`)
6. **TanStack Query with 5-min stale time** — hourly data doesn't need real-time refresh

---

## Related Files

| Area                 | File                                                    | Role                                            |
| -------------------- | ------------------------------------------------------- | ----------------------------------------------- |
| Collector aggregator | `collector/src/aggregator/hourly.ts`                    | Will be modified for region stats               |
| Migration            | `supabase/migrations/20260209000000_spot_collector.sql` | Existing tables                                 |
| Propagation engine   | `src/lib/utils/bands.ts`                                | Analytical model (will get `realWorld` overlay) |
| Ionosphere model     | `src/lib/utils/ionosphere.ts`                           | ITU-R P.533 calculations                        |
| Profile store        | `src/stores/profileStore.ts`                            | Location data, `activeLocationId`               |
| Sync engine          | `src/lib/sync/modules/profileSync.ts`                   | Cross-browser location sync                     |
| Types                | `src/types/propagation.ts`                              | Will extend `BandCondition`                     |
| Solar widgets        | `src/components/solar/BandConditions.tsx`               | UI integration point                            |
