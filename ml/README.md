# Propulse ML — Contact Probability Model

> **Status**: V1-V4 short-window experiments and Archive Proof V2 are complete.
> Exposure-aware Archive V3 completed its eight-month M5 run on 2026-07-12.
> See the [methodology and decision](ARCHIVE-MULTIMONTH-V3-RESULTS.md),
> [animated report](results/archive_v3/archive_v3_eight_month/REPORT.html), and
> frozen [preregistration](ARCHIVE-MULTIMONTH-V3-PLAN.md). V3 passed its
> temporal statistical gate but is not approved for all-years scaling or
> product probability serving.
> **Created**: 2026-07-11
> **Supersedes**: Level 2/3 of `docs/plans/LOCATION-AWARE-PROPAGATION-MODEL.md` (Level 1 — `band_region_stats` — was never implemented)

## Goal

Train our own model that answers the question a DXer actually asks:

> "From **my QTH**, on **this band/mode**, **right now** (given current solar + geomagnetic
> conditions), what are my chances of completing a contact — and to where?"

Output feeds the website alongside the analytical ITU-R P.533 engine
(`src/lib/utils/ionosphere.ts` / `rayTrace.ts` / `signal.ts`), grounding physics predictions
in what stations are *actually* working on the air.

---

## Data Inventory (`ml/data/raw/`)

All files exported from Supabase on **2026-04-05**. Format gotchas:

- `band_hourly_stats.csv` / `solar_snapshots.csv` are **Postgres COPY dumps** —
  comma-separated header line, then **tab-delimited** rows with `\N` nulls
  (DuckDB: `delim='\t'`, `nullstr='\N'`, `skip=1`).
- `spot_history.csv.gz` is genuine comma CSV but with **two `SET` statement lines
  before the header** (DuckDB: `skip=3`, `header=false`).
- **RBN rows (85% of all spots) carry no grid squares** — path info must be
  backfilled via a callsign→field map built from grid-bearing (PSKReporter) rows.
  See `src/build_dataset.py`.

| File | Size | Rows | Coverage | Contents |
| --- | --- | --- | --- | --- |
| `spot_history.csv.gz` (symlink) | 4.3 GB gz (~20+ GB raw) | ~150–200M | rolling window ending 2026-04-05 | Raw spots: source, spotted_at, tx/rx callsign + grid + lat/lon, freq, band, mode, SNR, wpm, dxcc, continent |
| `band_hourly_stats.csv` | 2.3 MB | 13,141 | 2026-02-10 → 2026-04-05 | Global hourly per-band aggregates with denormalized solar (kp, sfi, bz, bt, by, xray, dst, proton flux) |
| `solar_snapshots.csv` | 870 KB | 9,328 | 2026-02-10 → 2026-04-05 | Solar indices every ~5 min: kp, sfi, bz/by/bt, wind speed/density, SSN, xray, proton, dst |
| `full-schema.sql` | 93 KB | — | — | Complete DB schema reference |

**The raw `spot_history` is the asset.** It has TX *and* RX grid for every spot, which means
we can build **path-level** training data (region → region) — the thing the aggregate tables
threw away. `band_hourly_stats` alone can only support a global "is the band open" model.

### Known data biases (design around these)

- **Mode/source bias**: RBN = CW skimmers, PSKReporter = FT8/FT4/digital. SSB is nearly
  invisible (a handful of DXCluster spots). Honest framing of v1: *digital-mode + CW
  reachability*, which correlates with, but overstates, SSB reachability.
- **Presence-only data**: spots record successes. There are no logged failures. Negatives
  must be constructed (see Target Definition below).
- **8 weeks, one season, one point in the solar cycle**: Feb–Apr 2026 only. `day_of_year`
  is unlearnable from this; leave seasonal effects to the analytical engine for now and
  keep collecting.
- **Receiver density ≠ propagation**: lots of spots into a region partly means lots of
  *receivers* there. Normalize by active-receiver counts per region-hour.

---

## Target Definition (the key modeling decision)

Aggregate raw spots into **path-hour cells**:

```
(hour_utc, band, tx_region, rx_region)  →  spot_count, unique_tx, unique_rx, avg/median SNR
```

where `region` = 2-char Maidenhead field ("FN", "JO", ~324 globally, ~40–60 active),
per the original plan doc.

Then two model heads:

1. **`path_open`** (classification): P(≥1 contact possible) on this path/band/hour.
   - **Positives**: cells with spots.
   - **Negatives (constructed)**: cells where *both* regions had active stations that hour
     (TX activity in region A on any band, RX monitors in region B) but zero spots crossed
     the path on this band. This controls for "nobody was trying" vs "the band was closed."
2. **`expected_snr`** (regression): median SNR given the path is open — drives the
   "reliability" number shown to users.

User-facing probability = `path_open` probability, optionally blended with the analytical
engine's prediction (see Serving).

---

## Features

| Feature | Encoding | Notes |
| --- | --- | --- |
| band | categorical | 160m–6m |
| hour of day | sin/cos | UTC |
| tx_region, rx_region | categorical / learned embedding | 2-char grid |
| path distance | float (km) | great-circle between field centers |
| path bearing | sin/cos | |
| **solar zenith angle at path midpoint (+ endpoints)** | float | Cheap to compute, encodes day/night geometry — likely the single strongest feature besides band |
| kp_index, sfi, bz_gsm, bt, by_gsm | float | from `solar_snapshots`, joined on hour |
| xray_flux (log), dst_index, proton_flux_10mev | float | flare/absorption events; sparse early, present after ~Feb 15 |
| mode class | categorical (CW / digital) | source-driven; keep heads separate or feature it |
| rx-region receiver count that hour | float (log) | activity normalizer |

Skip for v1: day_of_year (confounded — only one season of data), terrestrial weather
(matters for VHF tropo/Es, not HF skywave — revisit when we do 6m/2m).

---

## Model & Serving

**Model: gradient-boosted trees (LightGBM or XGBoost).** Right tool for medium-size
tabular data; handles categorical + nonlinear interactions (band × zenith × sfi) natively;
trains in minutes on a laptop.

**Serving — two stages, per the original plan's recommendation:**

- **v1 — Edge Function**: export the trained GBT to JSON (both libs support tree dumps),
  score in a Vercel Edge Function `POST /api/predict-path`. A few hundred trees evaluate in
  well under 1 ms. Request: `{ txGrid, rxGrid?, band, at? }` + server-side current solar.
  Response: per-band `{ pOpen, expectedSnr, confidence }`.
- **v2 — client-side**: same JSON tree dump evaluated in TS (or ONNX Runtime Web) so the
  globe can score hundreds of paths per frame for a "reachability heatmap" overlay.

**Integration point**: the `realWorld` overlay on `BandCondition`
(`src/types/propagation.ts`) sketched in the original plan doc — show
"Physics: GOOD / Model: 78% / Live: 342 spots" side by side.

---

## Evaluation

Time-based split — **train Feb 10 → Mar 22, holdout Mar 23 → Apr 5**. Never random split
(hourly rows are autocorrelated; random splits leak).

Baselines the model must beat to be worth shipping:

1. **Climatology**: historical open-rate for (path, band, hour-of-day).
2. **Persistence**: same path/band/hour yesterday.
3. **The analytical engine**: run ITU-R P.533 over the same holdout cells. If GBT doesn't
   beat physics on Brier score / AUC, ship nothing and keep collecting data.

Metrics: AUC + Brier score (calibration matters — we show users a probability) for
`path_open`; MAE for SNR. Slice metrics by band and by path distance bucket.

---

## Phases

### Phase 0 — Data pipeline (local, DuckDB + Python)
- [ ] `ml/src/build_dataset.py`: stream `spot_history.csv.gz` through DuckDB → path-hour
      aggregate table → Parquet in `ml/data/processed/` (~few million rows from ~200M spots)
- [ ] Join solar features on hour; compute zenith/distance/bearing features
- [ ] Construct negatives per Target Definition
- [ ] Sanity notebook: spots/day over time, band × hour heatmaps, region coverage map

### Phase 1 — Model v1
- [ ] Train LightGBM `path_open` + `expected_snr`; compare vs 3 baselines on holdout
- [ ] Calibrate probabilities (isotonic) — users see these numbers
- [ ] Export tree dump JSON + a `predict()` reference impl in Python and TS with matching outputs

### Phase 2 — Serving
- [ ] `api/predict-path.ts` Edge Function (auth + rate limit per existing `api/_lib` patterns)
- [ ] Frontend hook `usePathPrediction` + `realWorld` overlay on `BandCondition`
- [ ] A/B panel: physics vs model vs live spots

### Phase 3 — Data flywheel (do early, it's cheap)
- [x] Add `path_hourly_stats` aggregation to `collector/src/aggregator/` so path-level
      training data accrues server-side forever (raw spots prune at 30 days — every month
      we don't aggregate is training data lost).
      **Built 2026-07-11, awaiting collector reactivation:**
      `supabase/migrations/20260711000000_path_hourly_stats.sql` (tables
      `path_hourly_stats` + `callsign_fields`, RPCs `compute_path_hourly_stats` /
      `refresh_callsign_fields` — aggregation runs inside Postgres) and
      `collector/src/aggregator/pathHourly.ts` (hourly catch-up walker, registered in
      `collector/src/index.ts`). Cell shape matches `build_dataset_v4.py` exactly:
      (hour, band, mode_class cw|digital, tx_field, rx_field). After a long outage,
      seed the callsign map wide once: `SELECT refresh_callsign_fields('30 days');`
- [ ] Fresh export / incremental pull to extend training beyond Apr 5
- [ ] Retrain cadence: monthly; version models; log predictions vs outcomes
- [ ] Publish dataset + model artifacts to Hugging Face (dataset repo for the parquet
      aggregates, model repo for tree dumps) — versioned, reproducible training

### Later
- Seasonal features once we have 6+ months spanning seasons
- VHF/6m sporadic-E + tropo model (this is where terrestrial weather data enters)
- Per-station personalization: fold in user's antenna/power from shackStore as a prior
