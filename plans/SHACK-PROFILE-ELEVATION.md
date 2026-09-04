# Shack and Profile Product Elevation

**Status:** Agreed source of truth
**Date:** 2026-09-04
**North star:** The shack is not a list of gear. It is the station that PropSphere, the log, and the public operator card all run on.

This plan complements [plans/PROPSPHERE-OPERATING-LOGGER-PLAN.md](PROPSPHERE-OPERATING-LOGGER-PLAN.md) (PropSphere as the radio desk). That plan owns hunt/log/map posture. This plan owns the **station** that those verbs should already know.

---

## 1. What we actually have (Sept 2026)

`/shack` is a **3-tab** page (`src/pages/ShackPage.tsx`): Equipment, Diagram (Station Builder Lab), Performance. The Feb 2026 V2 PRD still describes a 7-tab page — that document is stale.

**Shipped and real**

- Inventory: radios (curated + Sherwood), antennas, feedlines, accessories, inline components. Photos on hero cards. Setup wizard.
- Station Builder Lab: drag-and-drop signal chains, connector checks, live ERP/loss sidebar via `src/lib/station/stationChainEngine.ts`.
- Collectible L-cards whose cosmetics change with **operator rank** (tilt, aurora, gold borders, ethereal chroma) — not per-piece XP.
- ML NowCast / ReachMap / Band Planner consume the full chain envelope (`station-chain-v1`): EIRP, losses, azimuth vs bearing, live mode from CAT/WSJT.
- Rank points include equipment count and chain count (`src/hooks/useOperatorRank.ts`).
- Contact This Station exists on visitor profiles (`src/components/profile/ContactThisStation.tsx`) but uses log stats + solar path, **not** either operator's shack.

**Split brain (the core product failure)**

Inventory and chains feed ML NowCast and rank cosmetics. Globe physics, the Performance tab, the QSO log, visitor profiles, and HamClock kit pickers mostly ignore the active chain. Globe/spots hardcode 100 W / FT8. Logs have free-text `myRig` / `myAntenna` with no FKs. Visitor shack dumps `statsCache.equipment` which is never written.

Card “level-up” is operator-rank cosmetics. Flip, wear/patina, compare, live band dots, and trophy shelf are designed and **not wired**. Contest / share / elmer RP are hardcoded 0.

---

## 2. Competitive map (what people actually use)

- **Callsign identity:** QRZ biography + shack photos. We have a modern card; visitor shack is empty.
- **Social logging / presence:** Station Master Pro. We win contest + globe + physics; we lose presence/chat — do not chase chat.
- **Portable logging:** Ham2K PoLo. Do not beat PoLo on phone-first POTA; own field-kit chains that stamp home vs park QSOs.
- **Equipment-aware advice:** ElmerShack already joins gear to QSOs. That join is our gap. We already have a deeper RF model.
- **Desktop DXer trust:** QLog / Log4OM / DXLab. Table-stakes owned by the Operating Logger plan.
- **Station engineering:** Nobody as a product. This is still our unique asset if the numbers show up everywhere.

Younger 30–50 operators grew up on Steam, Strava, GitHub, Peloton. They want earned identity, shareable artifacts, and systems that use the data they typed once.

---

## 3. Audience decision (locked)

Primary: **home-station tinkerers 30–50**. Secondary: **portable-first**, represented as a named chain (“POTA pack”), not a separate app.

Tone: Strava / GitHub / Steam showcase. **100% earned, 0% purchased.**

Do **not** build: SMP chat, ElmerShack-style AI mentor as the core, NEC antenna simulation, equipment marketplace, RF-exposure as a v1 hero.

---

## 4. Elevation sequence

### Phase A — One station, everywhere (foundation)

1. Point Performance, What-If, and PresetComparison at `useChainPerformance` / active chain. Retire presets as the live source (keep a read adapter for old data).
2. Thread `txPowerWatts`, `systemLossDb`, and live `operatingStore` mode into Globe, Flat, Azimuthal, spot presentation, PathAnalysis MUF/LUF, and the 24h heatmap. Kill 100 W / FT8 hardcodes.
3. HamClock reliability pickers read/write the active chain instead of a parallel kit.
4. Antenna (and radio) forms collect the fields the engine already uses: SWR by band, gain override, manufacturer/model.
5. Stamp every new QSO with `chainId`, `radioId`, `antennaId`, plus ADIF `MY_RIG` / `MY_ANTENNA` / `TX_PWR` / `MY_GRIDSQUARE` from the chain + linked location.
6. Default log power from chain `operatingPowerWatts` (and CAT power when present). WSJT auto-log **writes** `qsoStore` with that stamp.

Success: change coax length in the lab → 10m ERP changes on the globe, in NowCast, and in the next logged QSO.

### Phase B — Showroom

1. Public shack at `/op/{callsign}/shack` (or profile Shack tab that works for visitors): schematic + L-cards + photos. Honor `visibility.equipment`.
2. Write a real `stats_cache.equipment` summary on sync (active chain, radio, antenna, ERP on 20m/40m, photo ids).
3. Share card includes station line (“IC-7300 · EFHW @ 10 m · 100 W”).
4. EquipmentSummary uses the **active chain**, not “first antenna in the array.”
5. Wire designed-but-dead card features: flip (specs vs photo), wear from QSO count **on that instance**, history on the back.

### Phase C — Operating loop

1. Compact “active kit” chip on PropSphere (name of chain, ERP this band, tap to switch Home / POTA pack).
2. Per-QSO kit override in the logger dock (default = active chain). Portable activations auto-select the field-kit chain when `mySig` is POTA/SOTA.
3. Contact This Station and PathAnalysis use **both** envelopes when the target has a public chain.
4. DX Wizard and PredictionsCard consume `useStationCastContext`, not settings `antennaType` / 100 W.
5. Profile completeness and rank: credit **chains that have QSOs**, not item count. Inventory-only RP drops.

### Phase D — Tinkerer delight (only after A–C)

1. What-If on a **sandbox copy of the active chain** with live ERP delta, then “apply to chain.”
2. One quantified upgrade suggestion from the real chain.
3. Equipment challenges tied to openings, local-only, never streak-guilt.
4. Cloud radio DB / community photos — only after the local catalog + Sherwood path is the one the forms and cards actually use.

---

## 5. What we will not elevate yet

- Cloud marketplace, DX Engineering affiliate, insurance PDF.
- NEC / height-true patterns (keep 8 pattern models; expose gain override instead).
- SMP-style live frequency chat.
- Per-piece XP ladders separate from operator rank.
- Rebuilding the 7-tab V2 PRD layout.

---

## 6. Implementation notes

Highest-leverage files for Phase A:

- `src/hooks/useActiveStationGain.ts` — already computes power/loss; consumers must stop discarding them
- `src/lib/utils/bands.ts` `getEnhancedBandConditions` — already accepts power/mode/gain
- `src/hooks/useStationPerformance.ts` vs `src/hooks/useChainPerformance.ts`
- `src/stores/qsoStore.ts` `logQSO` / `initializeFromProfile`
- `src/lib/db/types.ts` `LogEntry`
- `src/hooks/useWSJTXAutoLog.ts`
- `src/lib/sync/modules/profileSync.ts` for visitor equipment

Verification bar: one chain edit must be observable on `/shack` Performance, `/map` path/spot, a logged QSO’s ADIF fields, and `/profile` (own + visitor).
