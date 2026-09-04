# DX Wizard Comprehensive Plan

Status: draft — ready for execution
Owner surface: `/dx` (`src/pages/DXWizard.tsx`, `MobileDXWizard`, DX help)
Created: 2026-09-04

## 1. Product contract

### What DX Wizard is
A **path advisor**: given operator QTH + a DX target + operating constraints, answer:

1. **What band/mode should I use right now?**
2. **How much power do I need?**
3. **Where should I tune (legal freqs for my license/region)?**
4. **Is short-path or long-path better?**
5. **When is the next good window if not now?**
6. **Does live activity agree with the model?**
7. **What do I do next?** (map, CAT tune, save target, Band Planner)

### What it is not
- Not a second PropSphere (no live globe, no layer stack, no spot list as primary UI)
- Not Band Planner (24h heatmaps stay on `/bands` or equivalent)
- Not Contest Logger / awards tracker (those remain their own pages; Wizard only *consumes* their signals)

### Competitive bar
Match or beat Proppy / VOACAP Online / DX Toolbox–class path advisors on:

| Capability | Competitive expectation |
|---|---|
| Target resolve | Grid, coords, place name, **world** callsign |
| Now advice | Ranked bands with power, SNR, confidence |
| Path geometry | Bearing, distance, SP/LP with separate scores |
| Timing | Next peak window + deep-link to Band Planner |
| Reality check | Live spot/activity correlation → Confirmed / Likely / Surprise Open / Closed |
| Station fidelity | Real antenna/ERP/noise from Shack + settings |
| Contest awareness | Congestion **re-ranks** advice, not just a footnote |
| Actionability | Open on map, CAT tune, save target, share URL |
| Mobile parity | Same advice depth; step UI only differs in layout |

## 2. Current state (inventory)

### Already solid
- ITU-R P.533 / multi-hop ray-trace via `getEnhancedBandConditions`
- Mode SNR targets (FT8/CW/SSB), license + ITU band-plan freq/power caps
- Radio picker + TX ceiling, antenna type + noise environment inputs
- Recent PropSphere targets dropdown (desktop)
- Contest callout UI (`DxWizardContestNote`) — informational only
- Mobile step flow with all-bands expandable list
- Help section + tooltips

### Broken or incomplete (must fix)
1. Callsign lookup is **Callook-only** → DX calls fail
2. Help overclaims map auto-target; Wizard never hydrates `mapStore.target`
3. TX ceiling not clamped when radio max drops
4. No Enter-to-submit; Resolve clears prior good target before failure
5. Desktop missing all-bands ranking that mobile already has
6. Mobile missing contest note + recent targets
7. Contest PRD 7.10 ACs unchecked (no re-rank)
8. `WorkStationPanel` dead (never mounted); no spot → Wizard handoff
9. Shack ERP/feedline not wired (`antennaType` preference only)
10. No SP/LP, no bearing/distance card, no forecast peek, no live verdict overlay

### Reusable infrastructure (do not rebuild)
| Need | Existing module |
|---|---|
| Path metrics SP/LP | `src/lib/utils/path.ts` (`PathMetrics`) |
| Map path mode | `mapStore.pathMode` |
| Propagation mode class | `classifyPropagationMode` in `propagationModes.ts` |
| 24h forecast / windows | `getForecastForPath`, `getBestWindows` in `bands.ts` |
| Band verdict ladder | `useBandVerdicts`, `verdictStore`, HelioClock-style framing |
| World callsign | `fetchHamQTH`, `/api/callsign/qrz`, improve `/api/callsign/lookup` |
| Station ERP | `useStationPerformance` / `stationChainEngine` |
| Contest congestion | `contestCongestionModel` + `useContestContext` |
| CAT tune | `rigStore.setPendingFrequency` / `setPendingMode` (see WorkStationPanel) |
| Saved targets | `profileStore.savedTargets` / `userStore.addTarget` |
| Share / deep link | `useShareParams` pattern; add Wizard-specific query params |

## 3. Architecture

### Extract a pure recommendation engine
Today ranking lives inline in `DXWizard.tsx` (~100 lines of `useMemo`). Extract to:

```
src/lib/dxwizard/
  types.ts                 # WizardMode, ResolvedTarget, BandCandidate, WizardRecommendation
  power.ts                 # estimateRequiredPowerWatts, clampWatts
  frequencies.ts           # pickAllowedFrequenciesKHz, getMaxAllowedPowerWatts
  recommend.ts             # buildWizardRecommendation(...) pure
  contestRank.ts           # applyContestCongestionRanking(...)
  pathGeometry.ts          # wrap path.ts for wizard display (SP/LP targets)
  correlation.ts           # fuse model status + band activity / verdict → RealityCheck
  lookupTarget.ts          # resolve grid/coords/geocode/callsign (shared desktop+mobile)
```

`DXWizard.tsx` and `MobileDXWizard` become thin views over:

```
src/hooks/useDXWizardSession.ts
  - target state + resolve
  - constraints (mode, license, ITU, radio, power, pathMode, optimizeFor)
  - recommendation + correlation + nextWindow
  - actions: openOnMap, saveTarget, tuneCAT, openBandPlanner
```

### URL / deep-link contract
Support (read on mount, write on resolve):

```
/dx?grid=FN31pr
/dx?call=JA1ABC
/dx?lat=35.68&lon=139.76
/dx?mode=FT8&path=long&optimize=balance
```

Also accept handoff from PropSphere / WorkStation: navigate with `?call=` + optional `freq`/`band`.

### Ranking inputs (single sorted candidate list)
For each HF band (and later VHF when Es/TEP relevant):

1. Physics status + SNR @100W (existing)
2. Required watts vs ceiling / legal / kit max
3. Allowed freqs for mode/license/region
4. Path mode (short vs long endpoint geometry)
5. Contest congestion weight (configurable)
6. Reality-check boost/penalty from live activity
7. Confidence interval from signal model

**Optimize-for modes** (PRD 7.10):
- `propagation` — ignore congestion (default when no contest)
- `clear` — prefer contest-free / WARC when contest active
- `balance` — default when contest active (`contestWeight ≈ 0.3`)

## 4. Workstreams

### W0 — Foundation & correctness (ship first)
**Goal:** trustworthy basics; no new product surface yet.

- [ ] Callsign provider chain: Callook → HamQTH → QRZ (credentials when present); surface provider in UI
- [ ] Hydrate target from `mapStore.target` on mount; keep recentTargets
- [ ] Deep-link parse/write (`grid`, `call`, `lat/lon`, `mode`, `path`)
- [ ] Clamp `txPowerCeilingWatts` whenever `effectiveMaxPower` changes
- [ ] Enter key on target + callsign fields; do not clear prior target until resolve succeeds
- [ ] Desktop **All Bands** ranked list (parity with mobile)
- [ ] Mobile: recent targets + contest note
- [ ] Extract `lib/dxwizard/*` + `useDXWizardSession` without behavior change (then layer features)
- [ ] Unit tests for recommend ranking, power clamp, freq picker, lookup fallback order
- [ ] Fix help copy that overclaims map auto-set

**Exit:** DX callsigns resolve; map/URL handoff works; desktop/mobile show same ranked bands; tests green.

---

### W1 — Path geometry & result completeness
**Goal:** look like a serious path tool, not a three-tile summary.

- [ ] Path metrics card: distance km/mi, SP bearing + reciprocal, LP bearing + distance
- [ ] SP / LP toggle (local wizard state; optionally sync `mapStore.pathMode` when opening map)
- [ ] Recompute recommendation against long-path geometry when LP selected (antipode routing via existing path helpers / reverse great-circle)
- [ ] Propagation mode badge via `classifyPropagationMode` (F2 / NVIS / LP / etc.)
- [ ] Confidence display from `signalPrediction.confidence*` already on conditions
- [ ] Show SNR target for selected mode + margin vs required
- [ ] Grayline proximity note when path is near terminator (reuse grayline utils if present)

**Exit:** Result panel answers “which way, how far, how sure, what mode of prop.”

---

### W2 — Timing (“not just now”)
**Goal:** close the Diana friction: “when is Japan open?”

- [ ] Compute `getForecastForPath` + `getBestWindows` for current target/mode (lightweight, memoized)
- [ ] “Next best window” strip: band, UTC hour, status, SNR estimate, hours-away
- [ ] CTA: **Open in Band Planner** with target grid prefilled (query param or store)
- [ ] If now is closed but a window exists within 6–12h, elevate that message above “No viable options”
- [ ] Optional: mini 6–12h sparkline of best-band status (keep CSS budget in mind)

**Exit:** Wizard answers both *now* and *next*; Band Planner remains the deep forecast UI.

---

### W3 — Reality check (model ↔ live activity)
**Goal:** HelioClock “prediction that checks itself” on the *path*, not just global ladder.

- [ ] For resolved target, drive DX-scoped band activity / verdict inputs (`useBandVerdicts` DX scope or thin path-scoped activity query)
- [ ] Per recommended band: `Confirmed` / `Likely` / `Surprise Open` / `Closed` framing (`src/lib/dxwizard/correlation.ts`)
- [ ] Surface discrepancy copy: “Model closed 15m; cluster shows N spots on this path/region”
- [ ] Do **not** invent new spot ingestion — reuse collector/band-activity/verdict stores
- [ ] Optional hold/hysteresis aligned with verdict state machine (don’t flicker)

**Exit:** Top recommendation always shows model + live agreement state.

---

### W4 — Contest-aware ranking (finish PRD 7.10)
**Goal:** congestion changes the answer, not just a note.

- [ ] Attach `contestImpact` to each candidate via `estimateCongestion`
- [ ] Re-rank with `optimizeFor` + `contestWeight`
- [ ] When best prop band is heavy/extreme, auto-suggest WARC/clear alternatives with SNR delta (“17m ~3 dB weaker, contest-free”)
- [ ] UI control: Optimize for Propagation / Clear spectrum / Balance (default Balance on contest weekends)
- [ ] Keep `DxWizardContestNote` but feed it the same ranked alternatives (no divergent logic)
- [ ] Mobile parity for optimize control + alternatives

**Exit:** US-7.10.1 and US-7.10.2 acceptance criteria checked.

---

### W5 — Station fidelity (Shack + radio truth)
**Goal:** power advice reflects the real station.

- [ ] Prefer `useStationPerformance` ERP / per-band gain when an active shack preset exists
- [ ] Fall back to `getAntennaGainForPath(antennaType, distance)` when no preset
- [ ] Show “Station: {preset name} · ERP ≈ X W · Ant +Y dBi” on results
- [ ] Respect radio mode capability (don’t recommend FT8 if radio modes exclude DATA equivalents — map carefully)
- [ ] Sync license/ITU defaults from profile; optional “save as defaults” without surprising silent writes

**Exit:** Changing shack preset visibly changes required watts / ranking.

---

### W6 — Actions & handoffs
**Goal:** one click from advice to operating.

- [ ] **Open on PropSphere** — `setTarget` + navigate `/map`
- [ ] **Save target** — `addTarget` / profile savedTargets
- [ ] **Tune** — if CAT enabled, `setPendingFrequency` + mode (from recommended freq)
- [ ] **Copy summary** — band, freq, power, bearing, path mode (clipboard)
- [ ] Revive **Work This Station**: mount panel from spot detail / SelectedSpotCard; primary CTA navigates `/dx?call=…&band=…` (or sets session) and runs full model — retire distance-heuristic assessment or keep as instant preview only
- [ ] Command palette: “Analyze path to {recent/saved}”
- [ ] Kiosk scene already lists `/dx` — ensure deep-link + large-type result layout doesn’t break

**Exit:** Spot → Wizard → Map/CAT loop works without retyping.

---

### W7 — Modes & band coverage polish
**Goal:** mode set matches how people actually DX.

- [ ] Add **FT4** (SNR target between FT8 and CW; DATA band plan)
- [ ] Add **RTTY** (DATA plan; contest-relevant)
- [ ] Consider **AM** only if band-plan segments exist cleanly — otherwise skip
- [ ] Per-mode tip packs for new modes
- [ ] Ensure band list includes WARC consistently in ranking (already in PATH_BANDS — verify)
- [ ] Optional later: 6m when Es/TEP classifier fires (depends on sporadic-E signals already in codebase) — **phase gate**, not blocking W0–W6

**Exit:** FT4/RTTY selectable with sane freqs and power advice.

---

### W8 — UX polish, a11y, help, mobile parity
**Goal:** feel finished.

- [ ] Single results composition: Path → Best Now (+ reality) → Alternates → Next Window → Contest → Actions → Tips → Notes
- [ ] Keyboard: Enter resolve, Esc close dropdowns, arrow keys in band list (basic)
- [ ] Loading / empty / error states for lookup, solar fetch, activity correlation
- [ ] Update `DXWizardSection` help + tooltips for SP/LP, optimize-for, reality check, deep links
- [ ] Onboarding WelcomeOverlay blurb refresh
- [ ] CSS/bundle budget check after UI growth (`npm run check:bundles`)
- [ ] No side flyouts (repo UX rule) — use inline expansion + centered modals only

**Exit:** Help matches product; mobile/desktop feature parity; verify + bundles pass.

---

### W9 — Verification & regression
- [ ] Unit: `recommend`, `contestRank`, `correlation`, lookup chain, deep-link parse
- [ ] Component: desktop ranked list, mobile steps, contest re-rank snapshot tests where repo pattern exists
- [ ] Manual script (appendix below)
- [ ] `npm run lint` + `npm run build` (and `verify` before PR merge)

## 5. Delivery sequence (2 PRs)

Two large PRs off `main` (clean worktrees). Most work ships; no eight-way split.

| PR | Title | Scope |
|---|---|---|
| **PR 1 — Path advisor core** | `feat(dx-wizard): path advisor core` | **W0** foundation (extract `lib/dxwizard` + session hook, world callsign chain, map/URL hydrate, power clamp, Enter keys, desktop all-bands, mobile recent+contest note, help fix) · **W1** SP/LP, bearings/distance, prop-mode badge, confidence · **W2** next window + Band Planner handoff · **W7** FT4/RTTY · help/UX for those surfaces · tests for recommend/lookup/deep-link |
| **PR 2 — Live ops & station intelligence** | `feat(dx-wizard): live correlation, contest rank, shack, actions` | **W3** model↔live reality check · **W4** contest re-rank + optimize-for (finish PRD 7.10) · **W5** shack ERP wiring · **W6** actions (map/save/CAT/copy) + revive Work This Station → Wizard · remaining **W8/W9** polish, help, verify/bundles |

**Dependency:** PR 2 stacks on PR 1 (or merges after PR 1 lands on `main`). Do not open PR 2 against stale main without the session hook + types from PR 1.

**Why this cut:** PR 1 makes `/dx` a complete standalone path tool. PR 2 wires it into live spots, contests, shack truth, and operating handoffs without blocking the advisor itself.

## 6. Explicit non-goals / defer
- Rebuilding live WSPR ingest (repo hard rule — decommissioned)
- Full VOACAP parity UI (we keep P.533; no VOACAP dependency)
- Embedding PropSphere globe inside `/dx`
- Full awards/ATNO engine inside Wizard (consume badges from dxccStore later if cheap)
- Rotor control / rotctld (bearing display only unless CAT rotor already exists — verify before promising)
- Multi-day historical climatology DB (Band Planner / research lane)

## 7. Success metrics
- DX callsign resolve success rate for JA/EU/VK samples (manual + fixture)
- Time-to-first-advice from PropSphere spot click ≤ 2 interactions
- Contest weekend: recommended band changes when Optimize=Clear vs Propagation on a congested path
- Reality check shows non-`Likely` states when activity disagrees with model in staging with live spots
- Desktop/mobile feature matrix equal except layout
- No help-doc contradictions
- Lint/build/bundles green

## 8. Manual test script (appendix)

1. No station → alert; set station in Settings → advice unlocks
2. Resolve `FN31`, `Tokyo, Japan`, `35.68, 139.76`, `W1AW`, `JA1ABC` (HamQTH path)
3. Enter key resolves; failed geocode keeps previous target
4. From PropSphere set target → open `/dx` → auto-filled
5. Open `/dx?call=VK3ABC&mode=CW&path=long`
6. Toggle SP/LP → bearings + ranking change for near-antipodal path
7. Lower radio max power → ceiling clamps; required watts “exceeds” when appropriate
8. Contest weekend (or mocked context) → Balance vs Clear changes top band; WARC alternatives listed
9. Live spots present → recommended band shows Confirmed or Surprise Open when applicable
10. Actions: Open map, Save target, Tune (CAT on), Open Band Planner
11. Mobile: same flows via steps; recent targets + contest note visible
12. FT4/RTTY freqs land in DATA segments for Extra/ITU2

## 9. Implementation notes / decisions (locked for execution)

1. **Extract before decorate** — W0 extract keeps ranking behavior identical, then features land on the pure API.
2. **Correlation is additive** — never hide physics; always show model + live side by side.
3. **Band Planner owns deep forecast** — Wizard only peeks next window.
4. **Callsign chain order** — Callook (fast US) → HamQTH (world, app credentials) → QRZ (user key).
5. **Long path** — use existing `path.ts` metrics; feed LP endpoints into `getEnhancedBandConditions` by routing via the long-path great circle (or antipodal midpoint strategy already used elsewhere — match PropSphere/PathAnalysis, don’t invent a third).
6. **WorkStationPanel** — become a thin CTA into Wizard session; delete duplicate heuristic once Wizard handoff is reliable.
7. **CSS budget** — prefer existing panel/card patterns; avoid new drop-shadow utilities that previously blew CSS budget.

## 10. Execution
Start **PR 1 (path advisor core)** immediately. After it is up for review (or merged), cut **PR 2** from that tip for live correlation, contest re-rank, shack ERP, and actions.
