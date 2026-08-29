# DEV PLAN — Forecast Engine (M4 / Phase 3)

> **Authorized 2026-08-29 (owner):** plan + execution approved in the post-M3 work block.
> Eval harness first. Historical-store budget cap **~$25/mo**. See
> `DEV-PLAN-SPLIT-AND-PARITY.md` §9 for the M4 milestone line.

## 0. Hard constraints (non-negotiable)

- **The live WSPR ingest stays dead.** The M5→Supabase pipeline was decommissioned
  2026-07-21 (migrations `20260721110000`/`112000`/`120000`). Nothing in this plan
  reintroduces live WSPR ingestion in any form. WSPR data is used only for offline
  base-model training from the public wspr.live archive (~yearly cadence).
- NowCast/FutureCast are served by pre-trained models on Railway
  (`VITE_PROPAGATION_MODEL_URL` client-side, `PROPULSE_INFERENCE_URL` +
  `PROPULSE_SERVICE_TOKEN` behind the `api/propagation/*` proxies). The custom
  ITU-R P.533 physics engine (`src/lib/utils/ionosphere.ts`, `rayTrace.ts`,
  `signal.ts`) is the fallback and the baseline.
- `spot_history` is a ~2 h sliding window enforced by pg_cron. The only durable
  spot-derived signals are the aggregates `band_hourly_stats` and
  `path_hourly_stats` — the eval harness is built on them.
- PostgREST inherits an 8 s statement timeout (57014 surfaces as HTTP 500 even for
  service_role). Keep reads paged ≤1000 rows; long jobs run where they can batch.
- Incremental spend for any historical store: **≤ ~$25/mo**. No new paid services
  without a design doc first.
- Deliverables are local markdown under `docs/` (no published artifacts).

## 1. Current state (audited 2026-08-29)

- **Model serving:** `src/lib/propagation/modelClient.ts` — the
  `PropagationPrediction.profile` (`"physics" | "nowcast"`) is decided upstream on
  Railway; the repo only proxies requests (auth-verified) and falls back to local
  physics. Consumers: `useNowCastBandPredictions` → `NowCastBandPanel`,
  `PathAnalysis`, `PropagationForecastMini`/`Modal`, `MobileMap`,
  `MobileBandPlanner`.
- **Band Verdict (E4):** `physicsScore` is a five-word lookup
  (`CONDITION_SCORE` in `src/hooks/useBandVerdicts.ts`) over
  `calculateBandConditions(kp, sfi)` — *not* P.533, *not* the model. The v1.1
  per-path plumbing is absent.
- **Ground truth available:**
  - `band_hourly_stats` — `hour_utc`, `band`, `spot_count`, `unique_tx/rx`,
    SNR stats, `mode_counts`/`source_counts` jsonb, grid spreads, denormalized
    solar (`kp_index`, `sfi`, `bz_gsm`, `bt`); `UNIQUE (hour_utc, band)`.
  - `path_hourly_stats` — `hour_utc`, `band`, `mode_class`, `tx_field`,
    `rx_field` (2-char Maidenhead fields), `spot_count`, `unique_tx/rx`,
    `avg/median_snr`, `backfilled_count`;
    `UNIQUE (hour_utc, band, mode_class, tx_field, rx_field)`. No `created_at`.
- **`researchParticipation.ts`** records operator-initiated attempt outcomes only —
  useful color, far too sparse to be the eval ground truth.
- **No production accuracy evaluation exists anywhere.** Nothing scores NowCast,
  FutureCast, or the physics engine against observed activity. This is the gap M4
  exists to close, and it is why the eval harness comes first.
- **Latent defect found in audit:** `queryBandHourlyStats`
  (`src/lib/supabase.ts:130`) filters and orders on `created_at`, a column
  `band_hourly_stats` does not have (the time key is `hour_utc`), and its
  `BandHourlyStatsRow` interface (`hour`, `day_of_year`, `xray_flux`,
  `dst_index`, …) matches neither the table nor any caller. The function has
  **zero consumers** today, so it fails only when first used — which would have
  been the eval harness. Fixed/replaced in F0.

## 2. Design principles

1. **Eval before improvement** (owner directive). Measure what the served stack
   actually does before touching models or features.
2. **Score against activity proxies honestly.** The aggregates measure *observed
   spotting activity*, not physical channel truth. Frame model outputs as
   band-openness probabilities and use proper scoring rules — Brier score +
   reliability curves — with skill measured relative to two baselines:
   (a) the physics engine, (b) climatology (same band, hour-of-day ± day-of-year
   window average). A model that can't beat climatology isn't earning its
   Railway bill.
3. **Log predictions, don't reconstruct them.** Snapshot what the served model
   says at hour *t*; never try to rebuild historical inputs after the fact.
4. **Stay inside the existing platform.** Supabase + the already-running
   collector/inference services. Snapshot volume is tiny (10 bands × 24 h × 3
   sources ≈ 22k rows/mo, a few MB/yr) — nowhere near the $25/mo cap; the cap
   exists to keep it that way.

## 3. Phases

### F0 — Ground-truth reader fix (tiny, first commit)
- Replace `queryBandHourlyStats` + `BandHourlyStatsRow` with an `hour_utc`-keyed
  reader and a row type matching the real schema; page ≤1000 rows.
- Same pass: add a `path_hourly_stats` reader (band + field-pair + window).
- Verify: unit test against the row shapes; no UI change.

### F1 — Prediction snapshot logging
- New table `forecast_snapshots`:
  `hour_utc timestamptz`, `band text`, `source text` (`physics` | `nowcast` |
  `futurecast`), `horizon_hours smallint` (0 for nowcast/physics),
  `p_open real`, `meta jsonb` (model version, solar inputs used),
  `UNIQUE (hour_utc, band, source, horizon_hours)`. RLS like other collector
  tables; 13-month retention pruned by pg_cron.
- Writer runs hourly. Preferred host: the collector (already scheduled on
  Railway, already writes Supabase, already fetches solar). It computes the
  physics score (small shared calculation ported into `collector/`) and calls
  the inference service for NowCast/FutureCast. If the collector can't reach
  `PROPULSE_INFERENCE_URL`, fall back to a scheduled edge function. Decide at
  implementation; document the choice here.
- **Implementation decisions (2026-08-29, shipped in `feat/m4-f0-hourly-readers`):**
  - Host: the collector, as preferred — `collector/src/collectors/forecastSnapshot.ts`,
    registered like the aggregators (5-min ticks, first upsert per hour wins via
    `ignoreDuplicates`, solar input rejected if >3h stale). No edge-function
    fallback was needed.
  - Physics source only, for now. The Railway inference service exposes
    per-path (`/path`) and per-origin-surface (`/surface`) predictions —
    there is no per-band global endpoint, so a global per-band `p_open` for
    `nowcast`/`futurecast` is not well-defined without choosing a reference
    origin (which would bias the eval to one location). Logging those two
    sources needs an aggregation design first (candidates: fixed origin panel
    averaged; a coarse global cell grid via `/surface`). Until then the 14-day
    gate runs on `physics`, and F2's first report evaluates physics vs
    climatology. **F1 is therefore complete for the `physics` source only**;
    capturing `nowcast`/`futurecast` is an explicit open work item (the
    aggregation design above) and a hard prerequisite for any F4 conclusion
    about the inference service — see F4.
  - Global day/night blend: the frontend picks day or night per station;
    the global log has no station, so `p_open` = mean of the day and night
    condition scores. Both conditions and the solar inputs are kept in `meta`
    (`algo: "bands-v1-daynight-mean"`).
  - Migration `20260829200000_forecast_snapshots.sql` applied to the live DB
    2026-08-29 (table + RLS + retention cron verified).
- Milestone gate: snapshots flowing for ≥14 consecutive days before F2 reports
  are treated as meaningful (the harness enforces this as the longest run of
  consecutive UTC days with ≥20/24 snapshot hours, so post-outage scatter
  cannot pass as a continuous run).

### F2 — Scoring job + eval report
- Outcome label: band open at hour *h* when `spot_count` ≥ a band+hour-specific
  threshold derived from climatology percentiles (document the percentile choice
  and its sensitivity in the first report).
- Metrics per band and overall, 7-day and 30-day windows: Brier score,
  reliability curve (10 bins), skill vs physics, skill vs climatology. The
  30-day window is only meaningful once ~30 consecutive days of snapshots
  exist; before that the report still prints it but flags the actual
  coverage (the 14-day gate admits reports whose 30-day window is partial —
  read the coverage line, not the window label).
- Surface: an `npm run eval:forecast` script in the repo that reads
  `forecast_snapshots` + `band_hourly_stats` and writes
  `docs/reports/forecast-eval-YYYYMMDD.md`. An admin panel only if the reports
  prove worth watching routinely.

### F3 — Band Verdict v1.1 (per-path physics)
- Replace the `CONDITION_SCORE` word table with per-path P.533 reliability from
  the existing physics engine for QTH→target when a target exists; keep the
  kp/sfi table as the no-target fallback. Pure client change; verify with the
  existing verdict tests plus new per-path cases.

### F4 — Improvement loop (gated on F2 evidence)
- Only after two scored weeks: decide, from the reports, whether the next lever
  is offline retraining (wspr.live archive, yearly cadence), feature fixes in
  the inference service, or nothing. If a historical feature store is proposed,
  it gets its own design doc first and lives under the $25/mo cap.
- **Scope limit while snapshots are physics-only:** F2 reports can support
  conclusions about physics vs climatology, nothing more. Any F4 decision
  that touches the inference service (retraining, feature fixes) first
  requires the `nowcast`/`futurecast` aggregation design (F1 open item),
  then ≥14 consecutive days of those sources' snapshots scored by F2.

## 4. Milestones

| Milestone | Contents | Proof |
| --- | --- | --- |
| M4.a | F0 + F1 (logging live) | snapshots accumulating; no user-visible change |
| M4.b | F2 first eval report | `docs/reports/forecast-eval-*.md` committed |
| M4.c | F3 Verdict v1.1 | per-path physics score behind existing verdict UI |
| M4.d | F4 decision gate | written go/no-go with F2 evidence attached |

## 5. Explicitly out of scope

- Any live WSPR ingestion, M5 scheduling, or research-hour machinery (permanent).
- New paid infrastructure or anything projected > $25/mo.
- Model-side changes before M4.b evidence exists.
- Client-side heavy evaluation queries (PostgREST 8 s timeout).
