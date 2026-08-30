# Band Health — prediction → verification → activity, as the core IP

Owner-approved direction (2026-08-29). This is the design record for the Band
Health system: graduated, traffic-verified band verdicts scoped to the
operator's location and DX targets, with built-in self-scoring. Supersedes
nothing; extends the E4 verdict engine and the M4 eval loop.

## 1. Why this is the IP

A 2026-08-29 landscape scan (KC2G, VOACAP/Proppy, N0NBH, PSKReporter, RBN,
DXHeat/DXMaps/DX Summit, HamClock, ham-stats.com, HF+, HamDeck, current
foF2-forecasting ML literature) found a hard wall through the whole field:
**prediction products never verify against traffic** (VOACAP monthly-median
SSN; KC2G verifies against ionosondes, not QSOs; N0NBH is an unauditable
heuristic), and **observation products never predict** (PSKReporter, RBN's
Propagation Dashboard, ham-stats.com — which states "no forecasting"
explicitly). The closest prior art (DXMaps' VOACAP overlay, HF+'s separate
live map and 24 h prediction tool) *juxtaposes* the two layers and leaves the
fusion to the user's eyeballs.

Confirmed white space, in moat order:

1. **A prediction → traffic-verified state machine.** Nobody has
   `forecast → opening → verified → hot`, with timestamps and provenance.
2. **Published calibration.** Nobody tracks "when we said 80 %, did it open
   80 % of the time" — no Brier scores, no reliability curves, anywhere.
3. **Climatology-normalized activity.** Nobody says "85th percentile for a
   14Z hour"; everyone shows raw counts or Good/Fair/Poor against fixed
   thresholds.
4. **Traffic assimilation into a running model.** KC2G assimilates
   ionosondes; nobody assimilates spot traffic back into their model.

The compounding asset is the logged prediction history (forecast_snapshots,
live since 2026-08-29): a competitor can copy the UI in a quarter but cannot
backfill months of predictions-vs-outcomes.

## 2. Naming

**Band Health** is the umbrella. The verified badge language is **Verified
Open** (traffic-proven) and **Hot** (escalating). "Confirmed" as a term is
retired from UI copy in favor of Verified (the E4 engine's internal
`confirmed` verdict value stays until the ladder replaces it).

## 3. The state ladder (levels of verified)

Owner spec: predict the opening → show "people are on the band" when traffic
appears → **verified after ~5–10 contacts in 20 min holding steady** →
a higher state when traffic escalates → and always show over-busy and decay.

Design decision: a clean primary ladder plus two orthogonal dimensions, so
the hold/hysteresis machinery stays monotone and testable:

**Primary ladder** (per band × scope, extends `VERDICT_RANK`):

| State | Meaning | Enter (defaults, all tunable constants) |
| --- | --- | --- |
| `closed` | No prediction, no traffic | — |
| `forecast` | Model predicts an opening at/for your location (lead time shown) | blended p_open ≥ 0.4 (existing enter threshold) |
| `stirring` | Traffic detected below verification — "people are appearing" | ≥ 1 spot in the 20-min window, below verified bar |
| `verified` | **Verified Open** — sustained real traffic | ≥ 6 spots from ≥ 3 unique reporters in 20 min |
| `hot` | Escalating — traffic rising beyond verified | verified + rising trend sustained one full hold |

`surprise` remains the interrupt: `stirring`/`verified` reached while the
model said closed — surfaced loudly, and logged as a model miss (§8).

**Trend dimension** (computed per tick, shown as a modifier):
`rising | steady | falling`. Rate in the trailing 10 min vs the prior
10 min, with a dead band (±20 %) so noise reads as steady. Two consecutive
falling windows from any open state displays **Fading**; the ladder itself
downgrades only after the existing 20-min downgrade hold (a pause between
spots must never flap the wall display).

**Congestion dimension**: **Crowded** badge when current activity is at or
above the 95th climatology percentile for this band + hour (§5). Congestion
is not a ladder state — a band can be verified-open and crowded, which is
precisely what an operator wants to know before calling.

Example renderings: `Verified Open · rising`, `Hot · crowded`,
`Verified Open · fading (opened 1417Z · 9 reporters · PSKReporter+RBN)`.

Holds: upgrades keep the 5-min hold, downgrades the 20-min hold
(`stateMachine.ts` unchanged in spirit; ladder ranks extended). The
verified-bar constants (6 spots / 3 reporters / 20 min) live beside
`SPOTS_CONFIRM_ENTER` and get the same hysteresis treatment (exit well below
enter).

## 4. Scopes: Regional vs DX

"Open" is meaningless without *open to whom*. Two scope instances of the
ladder run per band:

- **Regional** — activity involving your continent/region. Numerator:
  spots whose tx or rx continent matches yours (spot rows carry
  `continent`); baseline: climatology of the same slice.
- **DX** — activity crossing between your Maidenhead field and a saved
  target's field (both directions). `path_hourly_stats`
  (hour × band × mode_class × tx_field × rx_field) is the durable baseline;
  the live 20-min numerator comes from `spot_history` (§6).

**DX mode** (operator intent toggle): the headline verdict per band is the DX
scope; Regional demotes to secondary. Default mode leads with Regional.
"40m is open in the US" and "15m just opened to JA" are different facts and
the UI never conflates them.

Personalization tiers (in order):
1. **Location-aware now** — the per-path physics arm (M4 F3) already scores
   QTH→target through the P.533 chain.
2. **Gear-aware later** — the stationChainEngine envelope (already built for
   NowCast personalization) adjusts the *forecast* arm: "openable for 100 W
   + dipole" vs "needs the amp". Ships after BH1–BH3 (§9).

## 5. Activity Index (over-busy / decaying inputs)

Per band × scope: current 20-min spot rate + unique actives, expressed as a
percentile against the climatology of the same band × UTC-hour-of-day from
`band_hourly_stats` (same held-out percentile machinery as the F2 eval
harness — reuse `scripts/lib/forecast-eval-core.mjs` logic, ported to a
shared lib).

Display bands: Quiet (< 25th) / Normal / Busy (≥ 75th) / Exceptional
(≥ 95th → the Crowded badge). Trend arrow from §3's trend dimension.

Honesty rule: numerator and denominator must come from the **same
population**. The climatology is built from collector ingest, so the live
numerator reads `spot_history` (the 2-h global sliding window fed by the
same ingest) via a small server-side count endpoint — *not* from the
client's grid-scoped PSKReporter fetches, which sample a different
population.

## 6. Data plumbing (new surface, all inside existing platform)

- **`api/spots/band-activity` edge function**: 20-min counts per band
  (+ optional scope filters: continent, tx_field/rx_field pair, mode_class)
  over `spot_history`. Indexed reads, well under the 8-s PostgREST budget;
  rate-limited like sibling endpoints; cacheable ~60 s.
- **Climatology snapshot**: per band × hour-of-day percentile table
  (p25/p75/p95 + open threshold), recomputed daily by the collector into a
  small public-read table (≤ 11 bands × 24 h rows per scope) so clients
  never scan history.
- Verdict provenance: the ingest batch already carries per-source spots
  client-side; the ladder records first-crossing timestamps ("opened at")
  and the contributing source mix for the badge tooltip.

## 7. Mode-class honesty

Machine-reported traffic is CW + digital (`path_hourly_stats.mode_class ∈
{cw, digital}`); SSB is visible only through human cluster spots. Verified
badges therefore carry the mode-class they were proven by (default view
fuses both machine classes; SSB never silently inherits an FT8-verified
badge). This is a truthfulness constraint, not a limitation to hide — copy
should say "verified by digital traffic" when that's what happened.

## 8. Self-scoring, user feedback, and abuse resistance

- **Self-scoring is structural**: every forecast state change is already
  logged to `forecast_snapshots` before outcomes are known; F2 scores Brier
  + reliability vs climatology. BH adds scoring of the *ladder's* calls
  (did `forecast` reach `verified` within the stated lead window?).
- **Accuracy panel** (public): rolling 30-day hit rate, Brier vs
  climatology, reliability curve, and the worst recent miss. Showing bad
  months is the point — receipts are the differentiator.
- **User feedback**: per-band thumbs up/down ("was this verdict right?") with
  optional note. Stored as `verdict_feedback` (user id, band, scope, state,
  ts).
- **Abuse containment — feedback is never a live input.** It cannot move a
  verdict, threshold, or model weight directly. It is offline labeled data:
  weighted by each reporter's historical agreement with *objective* outcomes
  (spot-verified truth), rate-capped per user, influence-capped per cohort,
  and surfaced in eval reports as a disagreement-rate diagnostic. Sock
  puppets can therefore waste only their own weight.
- **`surprise` ledger**: every surprise event (traffic the model missed) is
  logged with the solar/path context — the highest-value training rows for
  the F4 loop.

## 9. Gear/power measurement — viability answer

Direct TX power is **not available live**: PSKReporter/RBN/cluster spots
carry SNR, WPM, grids, continent — no power field. Only WSPR encodes dBm,
and live WSPR ingestion stays permanently decommissioned. Viable proxies,
in order of value:

1. **SNR margin analysis** — SNR + grid-pair distance per spot. A path
   decoding at +15 dB over the mode threshold closes at QRP; near-threshold
   decodes mean high-power-only. Aggregated per path × band this yields a
   "power margin" estimate without ever knowing watts. (Requires adding SNR
   stats to the DX-scope live endpoint; `avg_snr`/`median_snr` already exist
   in both aggregate tables.)
2. **NCDXF beacon probes** — 18 known 100 W transmitters on 5 bands, spotted
   by RBN skimmers: calibrated path probes with a known denominator (a
   *missing* beacon spot is evidence, unlike ordinary spot absence). Design
   item: the collector's RBN parser must retain the feed's beacon spot-type
   tag. Feeds the F4 assimilation loop.
3. **Model-side power awareness** — NowCast's estimand is the WSPR
   single-decode probability (power-normalized at training time); the
   station envelope maps it to the operator's own power/antenna/mode.

So gear-aware verdicts are viable — via margins, not reported watts.

## 10. Phases

Ordered so nothing model-side moves before the M4.b evidence gate
(≥ 14 consecutive snapshot days, ~2026-09-12; see DEV-PLAN-FORECAST-ENGINE).

### BH1 — Activity Index (no model changes)
Climatology snapshot table + `band-activity` endpoint + client gauge
(percentile band, trend arrow, Crowded badge). Verify: unit tests on
percentile/trend math; endpoint under rate-limit + timeout budgets; gauge
matches a hand-computed hour.

### BH2 — Ladder + scopes + provenance (no model changes)
Extend the verdict engine to the §3 ladder and §4 dual scopes; provenance
timestamps and source mix; DX-mode toggle; mode-class badges. Verify:
state-machine unit tests (every transition, holds, hysteresis, trend dead
band); ladder never flaps on recorded quiet/busy fixtures.

### BH3 — Opening timeline
"Likely opens ~40 min" from physics time-sweep + FutureCast horizons where
capability allows; every lead-time call logged as a `horizon_hours > 0`
forecast snapshot so F2 can score it. Verify: snapshots visible in the eval
report with their own horizon rows.

### BH4 — Accuracy panel + feedback
Public rolling scores from the F2 harness; `verdict_feedback` table + RLS +
rate caps; disagreement diagnostics in eval reports. Verify: panel numbers
reproducible from `npm run eval:forecast` output; feedback writes capped and
scoped by RLS.

### BH5 — Assimilation loop (gated on M4.b evidence)
Blend weights (physics / NowCast / climatology) chosen by Brier
minimization on logged outcomes; beacon probes as calibrated correction
inputs; surprise ledger feeds retraining decisions. Model-side — does not
start before the eval gate passes, per the F4 scope limit.

## 11. Constraints (standing)

- **No live WSPR ingestion — permanent** (decommissioned 2026-07-21). WSPR
  is offline base-model training only.
- Budget ≤ $25/mo; `spot_history` stays a ~2-h window; durable data is
  aggregates only.
- PostgREST 8-s statement timeout; write pages ≤ 1000 rows.
- Client feedback never mutates live verdicts (§8).
- Deliverables are local Markdown in `docs/`; PR merges are the owner's.

## 12. Out of scope

- SSB "verified" claims beyond what cluster spots can honestly support.
- Any new paid infrastructure or reporter-network scraping outside published
  APIs/feeds and their terms.
- Rebuilding any part of the M5/WSPR research pipeline.
