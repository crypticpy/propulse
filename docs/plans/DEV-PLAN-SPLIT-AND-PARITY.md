# Dev Plan: Executing the Split & Parity-Plus

**Date:** 2026-08-29 · **Status:** active · **Product plan:** `PLAN-WALL-DISPLAY-AND-PARITY.md`
**Locked decisions:** License = **AGPL-3.0** (Open Core; LICENSE lands with the first split commit). Working names stand (Shack Server, Scenes, Display Wall, Band Verdict) until the owner renames. Owner is pursuing 501(c)(3) + ARDC in parallel; nothing here blocks on it. Deliverables are local markdown only — no artifacts.

## 0. Branch & verification mechanics

- Integration branch: **`feat/split-parity`**, cut from `main` after the 2026-08-29 cleanup (§7). Epics land on it as focused commits; it merges to `main` via PR at each milestone (M1–M4 below) and is re-cut. Never force-push.
- Every epic exits through `npm run verify` (lint + typecheck + build + bundle budgets). **Vitest is live in this repo** (`npm run test`, see `src/stores/*.test.ts`) — new pure logic (verdict engine, pairing-code logic, ephemeris helpers) ships with unit tests. UI panels: manual check + the edit-hook self-check.
- Supabase migrations are **never auto-applied** — write SQL under `supabase/migrations/`, apply via psql through the aws-1 session pooler, and verify with a PostgREST probe before shipping dependent UI.
- Bundle budgets are sacred: new panels are lazy-loaded; any new dependency must clear `npm run check:bundles` (planets math: prefer a tiny in-repo VSOP87 subset over a heavy ephemeris dep if `astronomy-engine` blows the budget).
- Cross-cutting rule ("portable by construction"): **every new `api/` proxy is written as a shared handler** under `api/_lib/handlers/` (pure `(req) => Response`, no Vercel-isms outside the wrapper), so Shack Server (E5) mounts the same functions in the bridge without rework. This starts with E6's new proxies — retrofitting the existing ~65 comes in E5.

## 1. E1 — Scenes & Kiosk (Milestone M1)

| Item | Target |
|---|---|
| Scene model + store | `src/stores/sceneStore.ts` — persisted Zustand store (versioned, migrate pattern per CLAUDE.md). `Scene = { id, name, layoutMode, mapLayers, panels, createdAt }`. Actions: `captureCurrent()` (reads `mapStore` layout + layer state via `getState()`), `apply(id)`, CRUD, `rotation: { enabled, intervalSec, sceneIds }` |
| Kiosk route | `src/pages/KioskPage.tsx`, lazy route `/kiosk` in `App.tsx`. Fullscreen request on entry, zero-chrome, big UTC/local clock header (`src/components/kiosk/KioskClock.tsx`), scene rotation timer, `?scene=<id>` deep link |
| Wake lock | `src/hooks/useWakeLock.ts` — acquire on mount, re-acquire on `visibilitychange` |
| Stall tolerance | `src/components/kiosk/DataAgeBadge.tsx` — panels show data age, never spinners, on feed stall |
| Alert break-in | Kiosk subscribes to `alertsStore`; severe space-wx/NWS alerts interrupt rotation with a full-screen takeover card until acknowledged or expired (step-up dedup: one takeover per escalation, not per refresh) |
| QR handoff | `src/components/kiosk/KioskQr.tsx` using existing `qrcode` dep — corner QR linking the current view to a phone |

Verify: scene capture/apply round-trips layout+layers; kiosk survives a feed outage (kill network, badges age, no spinner); rotation + break-in unit-testable as pure reducer logic.

## 2. E2 — Parity batch 1: computed/static panels (M1)

All client-side, no new feeds; each lands as a kiosk-ready card. Moon (G6) via existing `suncalc`; world clocks (G7) via `Intl` + a small city list in `src/lib/data/`; named countdowns (G11) generalize `ContestCountdown`; quick-reference overlay (G12) — one-keystroke (`?`) modal over data already in `src/lib/data/` (band plans, Q-codes, prosigns); planets (G16) — visibility list, dep decision per §0; seasonal basemaps (G19) — 12 Blue Marble months, swap on the 1st (asset-size check against bundle budget — candidates for lazy fetch, not bundle); WWV/WWVH markers (G20) — static marker layer + path rating via existing path math; **ON-AIR banner (G23)** — `rigStore` PTT state → fullscreen banner + TX timer component, kiosk-aware.

## 3. E3 — Display Wall baseline (M2)

- **Migration:** `displays` (id uuid, owner uuid FK, name text, scene_config jsonb, last_seen_at timestamptz) + `display_pairing_codes` (code char(6), display_id, expires_at, claimed_at). RLS: owner-only CRUD; device reads its own row via a scoped claim.
- **Pairing flow:** `/display/pair` (device: generates identity, shows code + QR, subscribes to pre-pairing Realtime channel) → authenticated owner confirms at `/pair?code=X` → device flips instantly. Edge function only where the anon device needs writes (`api/displays/pair.ts`); everything else client-side supabase-js under RLS.
- **Display route:** `/display/:id` — self-contained, zero-interaction, wake lock, renders assigned scene; re-renders on Realtime broadcast (`display:<id>` via existing `useRealtimeSubscription`), poll-on-reconnect fallback (Realtime is optimization, DB row is truth).
- **Management:** Displays page (rename, assign scene/rotation, last-seen). Open Core note: this epic is Cloud-tier by nature (accounts+Realtime); the Open Core LAN answer is E5's local settings sync.
- **Recipes:** `docs/recipes/` — Pi labwc autostart + systemd restart wrapper; Fully Kiosk; Windows mini PC (from MULTI-DISPLAY-TECH.md).

## 4. E4 — Band Verdict v1 (M2)

- `src/lib/verdict/` — `verdictEngine.ts`: per-band P.533 reliability (existing `ionosphere.ts`/`signal.ts`) × live confirmation (DX/RBN/PSK spots binned by band/path from existing stores) → `Confirmed | Likely | Surprise Open | Closed`; `stateMachine.ts`: 20-min hold-to-confirm + hysteresis (no flapping) — pure, unit-tested; `decisionLog.ts`: persisted ring buffer with "why" (inputs at flip time).
- `src/components/dx/BandVerdictPanel.tsx` — dashboard + kiosk card; per-band chips + "why" popover reading the decision log.
- Entirely client-side (Open Core-clean). v2 (cloud correction) is Phase 3, out of scope here.

## 5. E5 — Shack Server (M3)

1. Handler extraction: move portable proxy logic (the ~65 non-Supabase routes inventoried in `HelioClock_Competitive_Analysis.md`) into `api/_lib/handlers/` pure functions; Vercel files become 3-line wrappers. Mechanical, high-file-count — run `/freview` gate.
2. Bridge mount: bridge (already serving `dist/` on 3173) mounts the same handlers under `/api/*`; add `propulse.local` mDNS (bonjour) + LAN settings sync (HamTab-style: bridge persists a shared settings blob; clients poll/subscribe).
3. Degradation tiers: connectivity state (cloud / LAN / offline) in `dataSourceStatusStore` + a persistent badge; cloud-only features hide with an honest one-liner, never break.
4. Docs: "Self-hosting PropPulse" + **"If PropPulse disappears"**.
5. **LICENSE (AGPL-3.0) + NOTICE** land at the start of this epic's PR if not already on `feat/split-parity` (decision: land LICENSE with the first split commit — see M1).

## 6. E6 — Parity batch 2: new feeds (M3)

New proxies written portable-by-construction (§0): tides G4 (NOAA CO-OPS), UV G5 (Open-Meteo), METAR G8 (aviationweather.gov + station DB — size-check the DB), volcanoes G9 (USGS HANS), DXpeditions G10 (NG3K ADXO), JTWC basins G13 (extend `api/atmos/tropical.ts`), user RSS G14 (proxy with allowlist + size caps — input-validation boundary), AQI G15 (AirNow/WAQI keys via env), QTH scopes G18 (presentation layer over existing radar/lightning/fire data — range rings + proximity audio using the DSP chain's audio context). Then **E7 — Launch Wall** (Chromium `getScreenDetails()` enhancement, graceful fallback) closes M3.

## 7. Repo cleanup record (2026-08-29)

- **Merged:** `research/helioclock-feature-gap` (analysis + research + plans, PR #47); `feat/durable-owner-fixture` (additive seed tooling, clean merge, PR #48).
- **Stashed, not merged:** the uncommitted `ml/service/` working-tree changes (interrupted-agent WSPR retry variant). Investigation showed main had already landed better committed equivalents (`711a3fca`, `b30ca161`, `b6f745fb`) and then deleted the entire pipeline in the decommission commit `e315df3f` — the working tree was doubly obsolete. Preserved as a described git stash for the record.
- **Closed:** draft PR #40 + `codex/propagation-data-retention-archive`, `codex/propagation-retention-review-fixes`, `origin/agent/propagation-data-retention-archive` — retention work for the pipeline fully decommissioned 2026-07-21; superseded by the decommission itself.
- **Deleted (patch-equivalent already on main):** `codex/fix-globe-deep-zoom`, `fix/k-index-snapshot-freshness`, `fix/pwa-reload-lightning-recovery`, `fix/satellite-proxy-first`, `fix/solar-source-cadence`, `fix/supabase-auth-redirects` + all fully-merged locals (reachmap, doctor-command, salvage, etc.).
- **Kept, dormant (unique work, stale vs. reworked map or old base):** `codex/fix-globe-pan-scale`, `codex/fix-spot-endpoint-scale` (checked out in a Codex worktree — left untouched), `codex/fix-uniform-tile-scale` (all conflict with post-reachmap map code; if deep-zoom symptoms persist, redo fresh), `rescue/ml-uncommitted-20260720` (snapshot insurance), `feat/sherwood-radio-import` (unmerged importer UI), `wip/guest-logging`, `codex/prd-radio-daemon`, `feat/prd-audit-v2`, `origin/agent/research-health-api` (pre-decommission ops APIs — likely obsolete, owner call).

## 8. Punchlist (owner-reported, not yet scheduled)

- **P1 — Resolution-aware layout.** On small/low-res displays the map page squishes the globe and side panels into unreadable slivers. Build resolution/viewport detection that switches to a layout that actually fits: collapse side panels into tabs (or a cycling strip) below a width/height breakpoint, scale type up for wall distance, and let the user override per display (fits E3's per-display profile concept — a saved layout per paired screen). Reported 2026-08-29 while kiosk-testing on a small window.
- **P2 — Globe default orientation.** The globe should initially center on the user's QTH (or an explicit "natural position" toggle), not a fixed default: on a small display the operator's own continent can end up hidden while dead regions fill the screen. Respect auto-rotate when enabled; this is the resting/initial orientation. Reported 2026-08-29.

## 9. Milestones

- **M1** = E1 + E2 + LICENSE → merge. *A kiosk-mode PropPulse with rotating scenes, break-in alerts, and 8 new panels.*
- **M2** = E3 + E4 → merge. *Paired displays managed from a phone; Band Verdict on every dashboard.*
- **M3** = E5 + E6 + E7 → merge. *`propulse.local` full Open Core; parity complete; Launch Wall.*
- **M4** = Phase-3 forecast-engine work — separate dev plan when M3 closes (eval harness first; the dead WSPR ingest stays dead; any historical store is designed fresh under an approved budget cap).
