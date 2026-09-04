# Shack and Profile Elevation — Isolate, Finish, Ship

**Status:** Execution plan (not started)
**Date:** 2026-09-04
**Source of truth for product:** [SHACK-PROFILE-ELEVATION.md](SHACK-PROFILE-ELEVATION.md)
**This document:** how to get that product onto `main` as its own PR, complete the finish the first pass skipped, and close the ten quality gaps.

Do **not** edit [SHACK-PROFILE-ELEVATION.md](SHACK-PROFILE-ELEVATION.md). Do **not** commit from `feat/cluster-settings`. That branch is a stew (HamClock, radar, kiosk, tiles, spots) whose remote is already gone.

---

## 0. What “done” means

An operator on production can:

1. Change coax length (or type) on the active chain in Station Builder Lab.
2. See 10m ERP move on `/shack` Performance, on `/map` path/spot physics, on the next logged QSO (`txPower` / `myAntenna` / `chainId`), and on `/profile` (own Equipment summary + visitor `/op/{call}/shack`).
3. Send one URL after a QSO and the other station sees kit that matches the model: schematic, L-cards, photos (when visibility allows), station line on the share card.
4. Switch Home ↔ POTA pack on PropSphere and have globe, forecast, log stamp, and public card follow without a second settings screen.

No marketplace, NEC, SMP chat, per-piece XP ladders, or 7-tab V2 layout.

---

## 1. Current reality (do not skip)

| Fact | Detail |
| --- | --- |
| Live? | **No.** Uncommitted local files. No commit, no PR, not on `origin/main`. |
| Branch | `feat/cluster-settings` tracks a **gone** remote. Last PRs (#80/#81) were unrelated map-cluster work, already merged. |
| Tree | ~100 modified files + dozens of untracked files mixing this feature with HamClock, radar, kiosk, tiles, explorers. |
| First pass | Wiring exists in the dirty tree: chain → Performance/What-If/HamClock/globe/log stamp/public JSON summary/kit chip. Product finish and the success bar were not proven. |
| Auth | `/shack` is behind sign-in. Browser verification must use a signed-in session or a seeded local profile, not the login wall. |

`origin/main` already has `useChainPerformance`, `useActiveStationGain`, `HamClockReliabilityPanel`, `useSpotPathPresentation`, Performance/What-If. The elevation work **patches** those. It does not invent a parallel RF engine.

---

## 2. Isolation procedure

### 2.1 Worktree from main

```bash
git fetch origin
git worktree add -b feat/shack-profile-elevation \
  .worktrees/shack-profile-elevation origin/main
```

All implementation happens **only** in `.worktrees/shack-profile-elevation`. The current workspace stays untouched except this plan file (already in `plans/` on the dirty tree — copy it in with the allowlist).

Never `git add` from `feat/cluster-settings`. Never mix kiosk/tiles/radar into this branch.

### 2.2 How to port code

1. **Whole-file copy** for allowlisted new or feature-owned files (section 3.1–3.2).
2. **Surgical port** for mixed files (section 3.3): open `origin/main` version in the worktree, then apply **only** the shack/station hunks described. If a hunk cannot be separated, rewrite the change against main instead of copying the dirty file.
3. After each port group, `npx tsc -b --pretty false` and `npx eslint --max-warnings 0` on touched paths. Do not wait until the end.

Source of the dirty implementation: `/Users/crypticpy/Projects/propulse` working tree (not HEAD). `git show` will not have it.

### 2.3 What never comes along

`.worktrees/`, `ml/service/wspr_*`, `docs/requirements/PROPSPHERE-*`, kiosk/display pairing, Google tiles, radar composite, map explorers, photorealistic 3D, spot clustering/hover/selection, HamClock crawl/moon/contests (except the reliability panel chain wiring), `.env.example` tile keys, `api/tiles/*`.

---

## 3. File allowlist

### 3.1 New files (copy entire)

| Path | Role |
| --- | --- |
| `plans/SHACK-PROFILE-ELEVATION.md` | Product SoT |
| `plans/SHACK-PROFILE-ELEVATION-SHIP.md` | This ship plan |
| `src/lib/station/stationPhysics.ts` | Mode/power/gain for the physics stack |
| `src/lib/station/stationIdentity.ts` | Kit resolve, QSO stamp, public summary, dual-envelope copy, field-kit pick |
| `src/lib/station/stationIdentity.test.ts` | Identity + physics + upgrade unit tests |
| `src/lib/station/stationUpgrade.ts` | Coax upgrade + opening-tied challenge |
| `src/components/map/ActiveKitChip.tsx` | PropSphere kit switcher |
| `src/components/profile/PublicShackPanel.tsx` | Visitor shack (will be expanded in §5) |
| `src/hooks/useStationQsoIndex.ts` | **New in this plan** — shared QSO-count index (see §6.4) |
| `src/lib/station/stationSuccessBar.test.ts` | **New in this plan** — coax → ERP → stamp → public summary |

Add further new files only when a section below names them (`PathComparison.tsx`, `TrophyShelf.tsx`, `usePublicEquipmentImage.ts`, rank migrate helper).

### 3.2 Feature-owned existing files (copy/replace from dirty tree, then finish)

These are shack/profile/qso/rank. Main already has them; replace with the elevation version, then apply §5–§6 on top.

- `src/hooks/useActiveStationGain.ts`
- `src/hooks/useChainPerformance.ts` (only if dirty tree changed it; otherwise leave main)
- `src/hooks/useOperatorRank.ts`
- `src/hooks/useProfileCompleteness.ts`
- `src/hooks/useWSJTXAutoLog.ts`
- `src/lib/db/types.ts` (`chainId` / `radioId` / `antennaId` on `LogEntry`)
- `src/lib/ft8/ft8QsoLogger.ts`
- `src/lib/profile/cardRenderer.ts`
- `src/lib/sync/modules/profileSync.ts`
- `src/lib/utils/bands.ts` — **hunk only:** `ForecastStationParams` + last arg to `getForecastForPath`
- `src/stores/qsoStore.ts`
- `src/stores/shackStore.ts` — **hunk only:** `getStationInventory` / `useStationInventory`
- `src/types/qso.ts` (`chainId` on form)
- `src/components/profile/ContactThisStation.tsx`
- `src/components/profile/EquipmentSummary.tsx`
- `src/components/profile/MyShackTab.tsx`
- `src/components/profile/ShareCard.tsx`
- `src/components/profile/index.ts`
- `src/components/qso/QSOEntryForm.tsx`
- `src/components/settings/RadioManager.tsx` — **hunk only:** `instanceId` on cards; custom-radio instance vs catalog id (§6.10)
- `src/components/shack/AntennaManager.tsx`
- `src/components/shack/EquipmentCard.tsx`
- `src/components/shack/AccessoryManager.tsx` / `FeedlineManager.tsx` / `InlineComponentManager.tsx` — `instanceId` only
- `src/components/shack/PerformanceDashboard.tsx`
- `src/components/shack/PerformanceSection.tsx`
- `src/components/shack/PresetComparison.tsx` (rename in §6.8)
- `src/components/shack/WhatIfSimulator.tsx`
- `src/pages/ProfilePage.tsx` — visitor shack panel + `/shack` initial tab
- `src/pages/DXWizard.tsx` — physics from chain (§5 C4, §6.6)
- `src/components/dx/PredictionsCard.tsx` + test
- `src/components/mobile/MobileBandPlanner.tsx` — `useForecastStationParams` only
- `src/pages/BandPlanner.tsx` — same
- `src/lib/utils/adifParser.ts` — station fields in `generateADIF` / parse (§6 / A5)
- `src/lib/utils/recommendations.ts` — pass `ForecastStationParams` into `getForecastForPath`

### 3.3 Mixed files (surgical hunks only)

Port **only** the listed change. If the dirty file has HamClock beauty, radar, clustering, etc., leave those on the dirty tree.

| File | Take |
| --- | --- |
| `src/App.tsx` | Routes `/op/:callsign` and `/op/:callsign/shack` → `ProfilePage` |
| `src/pages/PropSphere.tsx` | Import + mount `ActiveKitChip` next to `MapStatusChip` |
| `src/components/map/index.ts` | `export { ActiveKitChip }` |
| `src/components/map/GlobeView.tsx` | `physicsArgsForPath` instead of hardcoded 100 W / FT8 |
| `src/components/map/FlatMapView.tsx` | same |
| `src/components/map/AzimuthalView.tsx` | same |
| `src/components/map/BandConditionsPanel.tsx` | same |
| `src/components/map/OptimalBandsPanel.tsx` | same |
| `src/components/map/PathAnalysis.tsx` | our envelope **and** dual envelope (§5 C3, §6.6) |
| `src/components/map/PropagationForecast.tsx` | `getForecastForPath(..., stationParams)` |
| `src/components/map/PropagationForecastMini.tsx` | same |
| `src/hooks/useSpotPathPresentation.ts` | `physicsArgsForPath` (file exists on main) |
| `src/components/map/hamclock/HamClockReliabilityPanel.tsx` + test | chain power/antenna; then §6.7 (do not write discrete power onto the chain) |

`src/stores/hamclockStore.ts` — **do not copy** the dirty file. Reliability settings already exist on main. Only change the panel’s read/write behavior.

---

## 4. Execution sequence

Do these in order. Each phase has an exit test. Do not start B until A’s success-bar test is green on the isolated branch.

```
Isolation → A finish + success bar → B showroom finish → C operating loop finish
         → D delight polish → ten quality gaps (several fold into A–D) → verify → PR
```

The ten gaps are mapped into sections so they are not a leftover punch list.

| # | Gap | Lands in |
| --- | --- | --- |
| 1 | Own branch, not the stew | §2 |
| 2 | Prove coax → ERP → QSO → profile | §5 A + `stationSuccessBar.test.ts` |
| 3 | Rank cliff | §6.3 |
| 4 | `useLogbook` on every card | §6.4 |
| 5 | Public shack is a caption | §5 B |
| 6 | Dual-envelope is copy, not physics | §5 C3 + §6.6 |
| 7 | HamClock shadow kit + power snap | §6.7 |
| 8 | What-If / comparison chrome | §6.8 |
| 9 | Flip/wear are a label and a brown wash | §5 B5 + §6.9 |
| 10 | Radio instance vs catalog id | §6.10 |

---

## 5. Complete the product plan

### Phase A — One station, everywhere (finish)

Keep the first-pass wiring. Then:

1. **Single live source.** Performance, What-If, path comparison use `useChainPerformance` / active chain. Presets remain a read adapter inside `useActiveStationGain` only when `activeChain` is null (old data). Empty Performance copy must never mention presets.
2. **Physics consumers** all call `physicsArgsForPath` or `useForecastStationParams`. Grep on the isolated branch for hardcoded `100` + `"FT8"` in map/shack/dx/planner (ignore FT8 radio protocol code).
3. **HamClock** — see §6.7. After that, there is no parallel kit while a chain exists.
4. **Antenna form** already collects manufacturer, model, SWR by band, gain override. Keep it. Radio manufacturer/model stay on the catalog/custom radio form (already there). Do not rebuild RadioManager.
5. **QSO stamp** via `buildQsoStationStamp` in `logQSO`, FT8 logger, and WSJT `quickLog`. ADIF:
   - UI export (`src/lib/adif/export.ts`) already writes `MY_RIG` / `MY_ANTENNA` / `TX_PWR` / `MY_GRIDSQUARE`.
   - **Also** write those fields from `src/lib/utils/adifParser.ts` `generateADIF` (used by `useLogbook.exportADIF`, FT8 QSL, sync queue).
   - Parse them back on import (`recordToLogEntry` + `src/lib/adif/import.ts`).
   - Optional local-only: `APP_PROPULSE_CHAIN_ID`, `APP_PROPULSE_RADIO_ID`, `APP_PROPULSE_ANTENNA_ID` so a round-trip keeps FKs.
6. Default power: form → CAT `rigStore.power` if `> 0` → chain `operatingPowerWatts`.

**A exit:** `stationSuccessBar.test.ts` (§7) green. Grep clean for map 100 W / FT8 hardcodes.

### Phase B — Showroom (product finish)

First pass wrote a station-line box. The plan requires **schematic + L-cards + photos** and `visibility.equipment`.

1. **Visitor shack** (`PublicShackPanel` + own `MyShackTab` when the viewer is not the owner):
   - Honor `visibility.equipment === "private"` (already gated in `ProfilePage`; keep that).
   - **Schematic:** read-only `ShackSchematicView` (or a slim `PublicSchematic` that reuses chain node components) driven by the public summary **plus** a compact `nodes[]` sketch in `stats_cache.equipment` (radio → feedline → antenna labels). Do not require the visitor to have the owner’s IndexedDB inventory.
   - **L-cards:** render `EquipmentCard` (not only `EquipmentCardSm`) for radio + antenna from the summary. Front = photo if URL exists, else symbol. Flip = specs + ERP 20m/40m.
   - **Photos:** do **not** invent a new pipeline. `imageSync` already uploads to Supabase Storage bucket `equipment-images` at `{userId}/{imageId}.jpg`. Public summary already has `radioPhotoId` / `antennaPhotoId`. Add `usePublicEquipmentImage(ownerUserId, imageId)` that builds the public Storage URL (and falls back to symbol if 404 / private bucket). If the bucket is not public, add a short-lived signed URL via an existing edge function or a tiny `api/profile/equipment-image.ts` — prefer making the bucket public-read for `equipment-images` if that is already the product intent. Document the chosen path in the PR.
2. **`stats_cache.equipment`** on profile push (already merged, not wiped). Extend the payload:

```ts
{
  chainId, chainName, radioName, antennaName, antennaType,
  powerWatts, erp20m, erp40m, stationLine,
  radioPhotoId, antennaPhotoId,
  radioId, antennaId,
  nodes: Array<{ type: "radio" | "feedline" | "antenna"; label: string }>,
}
```

   Keep `parsePublicEquipmentSummary` backward compatible with the first-pass shape.

3. **Share card** station line on **all** templates that draw an info row under the callsign, not only minimalist + classic. QR still points at `/profile/{callsign}` (or `/op/{callsign}` if we standardize — pick one and use it in both renderer and `PublicShackPanel` links).
4. **EquipmentSummary** = active chain via `resolveChainKit` (already). Keep.
5. **Card finish** (also §6.9):
   - CSS 3D flip (`perspective` + `rotateY(180deg)`), not a `FLIP` text button that swaps the art zone.
   - Flip available without apprentice gate (sharing is the job; rank still gates tilt/particles/chroma).
   - Back: full stats, QSO count on that instance, last history lines from `equipmentHistory`.
   - Wear tiers from `docs/designs/card-level-up-system.md` §9: New / Seasoned (>100) / Veteran (>1000) — subtle corner patina + scar hash, **not** a brown full-card wash. Legendary gear aura stays rank-gated as today.
   - **Live band dots:** green/amber/red dot on each band pill from current band-condition status (existing solar/band helpers). Antenna and radio L-cards only.
   - **Trophy shelf:** CSS shelf on the profile Awards surface (own + visitor if awards visibility allows), per design doc §7. Do not put it on `/shack` Equipment. Do not rebuild AchievementGrid’s data model — restyle the grid into shelves.

**B exit:** `/op/{call}/shack` shows schematic + at least radio/antenna L-cards + photo or honest fallback. Share PNG includes the station line. Flip works at novice.

### Phase C — Operating loop (finish)

1. **Active kit chip** on PropSphere: chain name, ERP this band, listbox of named chains. Already sketched — keep compact, works in lite mode too if the toolbar is visible.
2. **Logger kit picker** + POTA/SOTA auto-select via `pickChainForActivation`. Do **not** overwrite a manual kit choice unless `mySig` is a field activation (already). Portable activations auto-select when `mySig` is POTA/SOTA/WWFF.
3. **Dual envelope (physics, not a sentence):**
   - Viewer: `useChainPerformance` / `useForecastStationParams`.
   - Target: `parsePublicEquipmentSummary(profile.statsCache.equipment)` → approximate far-end ERP/gain.
   - **Contact This Station:** keep the overlap sentence **and** feed both envelopes into `getEnhancedBandConditions` (our tx params; if we only have their ERP, fold it as extra far-end gain vs isotropic).
   - **PathAnalysis:** same. Show “your ERP vs their ERP” on the path panel when the target profile/summary is available (map target with a callsign that resolves to a public profile, or visitor view). If no public chain, behave as today (our envelope only).
4. **DX Wizard:** `physicsArgsForPath` for the forecast (already). Then:
   - Init `txPowerCeilingWatts` from chain power, not `useState(100)`.
   - `estimateRequiredPowerWatts` must scale from **actual** `txPowerWatts`, not a 100 W SNR reference. Relabel “Est. SNR @100W” to the chain power.
   - PredictionsCard: do not only reorder. Prefer bands the chain supports **and** rank with chain ERP (boost or filter using `useChainPerformance().bands` erp/supported). Still use `useStationCastContext` for location/day-night.
5. **Rank + completeness:** credit chains/radios/antennas that have QSOs, with **§6.3 migration** so existing accounts do not cliff.

**C exit:** Switching Home → POTA pack updates chip ERP, globe params (via `useActiveStationGain`), default `form.chainId`, and the next `stats_cache` push payload. Dual-envelope line **and** path scores change when the target summary has `erp20m`.

### Phase D — Tinkerer delight (finish)

1. What-If = sandbox copy of the **active chain** (power, feedline length, SWR). Live ERP delta vs baseline. **Apply** writes only what changed:
   - `updateChain({ operatingPowerWatts })`
   - `updateFeedline({ lengthFeet })` for the live run
   - `updateAntenna({ swrByBand })` **only for bands the user touched**, not every band set to 1.5
2. One quantified coax suggestion (`suggestFeedlineUpgrade`). Informational, not a modal nag.
3. Opening-tied challenge (`openingTiedChallenge`) local-only, no streak copy.
4. Cloud radio DB / community photos — **still out**. Local catalog + Sherwood remain the form source. Public photos are **owner uploads via existing `imageSync`**, not a community library.

**D exit:** Apply on What-If changes lab ERP and the success-bar observables without resetting unrelated SWR.

---

## 6. The ten quality gaps (how to do them)

### 6.1 Own branch

§2. Non-negotiable. PR title: `feat(shack): make the active chain the station`.

### 6.2 Success bar as a test, not a hope

Add `src/lib/station/stationSuccessBar.test.ts` (pure, no React):

1. Fixture inventory: radio, RG-58 80 ft, dipole, chain 100 W.
2. `computeStationChainPerformance` → snapshot 10m `erpWatts`.
3. Swap feedline type to `lmr400` (same length) or shorten length.
4. Assert 10m ERP increased by a meaningful delta (use the same loss math as `suggestFeedlineUpgrade`).
5. `buildQsoStationStamp` includes `chainId`, `myAntenna`, `txPower`.
6. `buildPublicEquipmentSummary` station line contains radio + antenna + watts; `erp20m`/`erp40m` defined when those bands exist.

Optional component test: Performance empty state string does not include “preset”.

This is the A exit gate. Do not call A done without it.

### 6.3 Rank cliff

Today, `equipmentCount` / `signalPathCount` become “IDs that appear on QSOs”. Old logs have no FKs → RP drops.

**Rule:**

- If the logbook has **zero** rows with `chainId` or `radioId` or `antennaId`, keep **legacy** scoring: inventory counts (radios + antennas + feedlines + accessories + inlines) and chain **count**.
- Once **any** stamped QSO exists, switch to “equipment/chains that have QSOs”.
- One-shot optional backfill (local, in `logQSO` migrate or a `backfillStationStamps()` called from shack/log hydrate): for entries missing FKs, stamp the **current** active chain. Make it explicit in code comments: this is “best guess for history,” not claimed truth. Do not overwrite entries that already have FKs.

Put the branch in a pure helper `stationRankInput(entries, inventory, chains)` tested with empty stamps vs mixed stamps.

### 6.4 Do not load IndexedDB on every card

`useOperatorRank` and `useProfileCompleteness` must **not** call `useLogbook()`.

Add `useStationQsoIndex` (or a slice on `qsoStore`):

- `qsoCountById: Record<string, number>` keyed by `radioId` | `antennaId` | `chainId`
- Recompute when log entries change **once** (subscribe to logbook load + `logQSO`)
- Rank, completeness, and `EquipmentCard` wear all read this index

`EquipmentCard` already calls `useOperatorRank`; after this, rank must not fetch the log itself.

### 6.5 Public shack is a showroom

§5 B. Photos via `equipment-images`. Schematic from cached `nodes[]`. L-cards from summary. No JSON dump anywhere in the visitor tab.

### 6.6 Dual envelope is physics

Extend `ForecastStationParams` (or a sibling `FarEndParams`) so PathAnalysis and Contact This Station can pass far-end ERP/gain. If their public summary only has `erp20m`/`erp40m`, use those bands; for other bands scale by dB from 20m as a documented assumption in `stationIdentity.ts`.

PredictionsCard and DX Wizard consume **our** envelope for tx; they do not need their envelope unless a target is selected (Wizard already has a target — use ours for tx, theirs if the target is a callsign with `stats_cache`).

Rewrite `estimateRequiredPowerWatts(snrAtCurrentPower, currentWatts, targetSnr)` — no hidden 100.

### 6.7 HamClock: one kit

- If `useActiveChain()` is null: keep the existing reliability pickers (main’s parallel kit). Copy explains “No signal path — using HamClock kit.”
- If a chain exists: **hide** antenna select (show chain antenna name, disabled). Power slider/select is a **display quantization** for the reliability matrix only: `nearestHamClockPower(chain.operatingPowerWatts)` feeds `buildReliabilityForecast`. **Do not** `updateChain({ operatingPowerWatts: 100 })` when the chain is 75 W. If the operator should change live power, deep-link to `/shack` Diagram or call `updateChain` with the value they chose **explicitly**, not on first render.
- Tests: mock a chain at 75 W; changing nothing must not write 100 W; matrix is called with 100 (nearest) or 25 — pick one and assert it does not mutate the chain.

### 6.8 What-If / comparison chrome

- Rename `PresetComparison.tsx` → `PathComparison.tsx` (export alias if anything still imports the old name; grep and update).
- PerformanceSection: one page stack, no nested double cards. Header = active chain name.
- What-If Apply: per §5 D1 (touched fields only). Reset restores sandbox from the live chain, including feedline length.

### 6.9 Flip / wear / live dots / trophy shelf

Implement against `docs/designs/card-level-up-system.md` §§4, 7–9, with these product constraints from the elevation plan:

- Flip is for **sharing**, so it is not apprentice-gated.
- Wear is from **QSO count on that instance**, via `useStationQsoIndex`, not operator rank.
- Live band dots are on L-cards; they are not a new HamClock.
- Trophy shelf is the awards presentation, not a new shack tab.
- Skip design-doc extras not in the elevation plan: comparative overlays, signal-flow mini-map, profile holo export beyond existing ShareCard, purchased cosmetics.

### 6.10 Radio IDs

`userStore` radios **are** `shackStore.radios` (facade). Owned-instance cards must pass `instanceId={userRadio.id}`.

Custom catalog rows in RadioManager (`customRadios.map`) must **not** use `radio.id` (equipment catalog id) as `instanceId`. Wear/QSO counts key off the **owned instance**. If the card represents a catalog template with no instance, omit `instanceId`.

Grep `instanceId={` after the change; every radio card that represents an owned rig uses the instance UUID.

---

## 7. Verification

### Automated (must pass before PR)

```bash
npx vitest run src/lib/station src/hooks/useOperatorRank.ts \
  src/components/map/hamclock/HamClockReliabilityPanel.test.tsx \
  src/components/dx/PredictionsCard.test.tsx
npx tsc -b --pretty false
npx eslint --max-warnings 0 <touched paths>
```

If `useOperatorRank` has no test file, add `src/hooks/useOperatorRank.rankInput.test.ts` for the legacy-vs-stamped branch (§6.3).

### Manual (signed-in)

1. `/shack` Diagram: active chain, note 10m ERP in the lab sidebar.
2. Change coax length; confirm Performance, What-If baseline, and (after Apply) lab ERP.
3. `/map`: kit chip shows new ERP; PathAnalysis / band panel not stuck at 100 W FT8.
4. Log a QSO; inspect IndexedDB/`QSODetailModal` for `myRig` / `myAntenna` / `txPower` / `chainId`. Export ADIF from the QSO menu **and** from any path using `generateADIF`.
5. WSJT auto-log (or `quickLog` from console) writes a row, not only a toast.
6. `/profile` overview Equipment = active chain. Share card shows station line.
7. `/op/{ownCall}/shack` (or a second account): schematic + cards + photos or fallback; private equipment hidden.
8. Switch chip to a chain named like `POTA pack`; log with `mySig=POTA`; stamp uses that chain.
9. Rank: account with only unstamped history does not lose equipment RP; after one stamped QSO, inventory-only dummy antennas stop earning path RP.

### Out of scope to “fix by relaxing”

Do not raise bundle budgets, disable lint, or skip the success-bar test.

---

## 8. PR

- Branch: `feat/shack-profile-elevation` from `origin/main`.
- Title: `feat(shack): make the active chain the station`
- Body: north star + phases landed + test plan checklist above.
- Link [SHACK-PROFILE-ELEVATION.md](SHACK-PROFILE-ELEVATION.md).
- Do not include this ship plan as the product SoT; it can stay in `plans/` as the execution record.

---

## 9. Agent notes

- Match existing code: 2-space, double quotes, `@/` imports, no new flyout panels.
- `getEnhancedBandConditions` mode is `"SSB" | "CW" | "FT8"` — use `toPhysicsMode()`.
- WSJT frequency is Hz; log form is kHz.
- `useUserRadios()` returns `{ userRadio, equipment }[]`.
- IndexedDB `LogEntry` is schemaless; FKs need no migration file.
- Cloud radio DB is explicitly later — do not sneak it in under “photos.”
- If isolation of a mixed file is unclear, **rewrite the hunk on main** rather than copying the dirty 4k-line map file.
