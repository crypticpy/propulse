# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run dev              # Vite dev server at http://localhost:5173
npm run build            # tsc -b && vite build (typecheck + bundle)
npm run lint             # eslint . --max-warnings 0 (zero tolerance)
npm run check:bundles    # Enforce bundle size budgets
npm run verify           # Full pipeline: tracked-artifacts + lint + build + bundles
npm run preview          # Serve production build locally
npm run hooks:install    # One-time git hook setup (pre-commit + pre-push)
```

Bridge server (optional, for rig control):

```bash
cd bridge && npm install && npm run dev   # WebSocket on ws://localhost:9867
```

There is no test framework (no Vitest/Jest). Quality relies on `npm run verify` + manual UI checks.

## Architecture Overview

**Stack**: React 18 + TypeScript 5.7 (strict) + Vite 6 + Tailwind 3 + Three.js + Zustand 5

**Deployment**: Vercel SPA with Edge Functions. The `api/` directory contains ~46 Edge Functions that proxy external APIs (NOAA, DX clusters, callsign services) to avoid CORS. Each exports `config = { runtime: "edge" }` and handles rate limiting via `api/_lib/rateLimit.ts`. Protected endpoints verify Supabase JWTs via `api/_lib/auth.ts`.

**Three-tier local architecture**:

- **Frontend** (Vite SPA) — React app with 30+ lazy-loaded routes
- **Bridge** (`bridge/`) — localhost-only Node.js WebSocket server for CAT rig control, WSJT-X UDP, DX cluster telnet, ICOM CI-V spectrum. Port 9867.
- **Collector** (`collector/`) — Railway-deployed service ingesting spots from PSKReporter/RBN/DXCluster and NOAA solar data into Supabase

### Key Directories

| Directory          | Purpose                                                                                                                             |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `src/pages/`       | Route-level page components (lazy-loaded)                                                                                           |
| `src/components/`  | Feature components grouped by domain: `map/`, `contest/`, `dx/`, `solar/`, `profile/`, `shack/`, `sdr/`, `settings/`, `qso/`, `ui/` |
| `src/stores/`      | 39 Zustand stores (client state + persistence)                                                                                      |
| `src/hooks/`       | ~48 custom hooks (data fetching, UI logic)                                                                                          |
| `src/lib/utils/`   | Propagation physics engine (custom ITU-R P.533, NOT VOACAP): `ionosphere.ts`, `rayTrace.ts`, `signal.ts`                            |
| `src/lib/contest/` | Full contest engine: scoring, dupes, multipliers, SCP, Cabrillo export (15+ modules)                                                |
| `src/lib/data/`    | Static reference data: band plans, DXCC entities, Sherwood radio DB, contest definitions                                            |
| `src/lib/db/`      | IndexedDB wrappers: `logStore`, `imageStore`, `credentialStore`                                                                     |
| `src/lib/audio/`   | Client-side DSP chain: noise gate, spectral NR, EQ (AudioWorklet via Blob URLs)                                                     |
| `api/`             | Vercel Edge Functions grouped: `solar/`, `spots/`, `callsign/`, `log/`, `sync/`, `satellites/`, `activation/`, `billing/`           |
| `api/_lib/`        | Shared edge utilities: `auth.ts`, `rateLimit.ts`                                                                                    |

### Routing

Routes defined in `src/App.tsx` using React Router v7. All pages lazy-loaded via `React.lazy()`. Layout switches between `<Layout>` and `<MobileLayout>` based on `useIsMobile()`. Key routes: `/` (dashboard), `/map` (PropSphere globe), `/solar`, `/dx`, `/log` (logbook), `/contest`, `/sdr`, `/shack`, `/profile`, `/settings`.

### State Management

**Zustand stores** with `persist` middleware and incremental migrations. Pattern:

```ts
export const useMyStore = create<MyStore>()(
  persist(
    (set) => ({
      /* state + actions */
    }),
    {
      name: "propulse-my-store", // localStorage key
      version: N, // bump on schema changes
      storage: createJSONStorage(() => localStorage),
      migrate: (persisted: unknown, version: number) => {
        const state = persisted as Record<string, unknown>;
        if (version < 2) {
          /* add fields with defaults */
        }
        // ...incremental per-version
        return state as unknown as MyStoreType;
      },
    },
  ),
);
```

- Cast through `unknown` for migrations: `state as unknown as StoreType`
- Cross-store reads: `useOtherStore.getState()` (not hooks — only in actions)
- QSOs/images use IndexedDB (via `idb`), not localStorage

**TanStack React Query** for server state (solar data, spots, callsign lookups).

### Import Conventions

- Path alias: `@/` → `./src/` (configured in both `tsconfig.json` and `vite.config.ts`)
- Always use `@/...` for src imports: `import { useSettingsStore } from "@/stores/settingsStore"`

## Coding Conventions

- **TypeScript strict** with `noUnusedLocals`, `noUnusedParameters`
- **React function components** only (no classes)
- **Formatting**: 2-space indent, trailing commas, double quotes
- **Naming**: components `PascalCase.tsx`, hooks `useThing.ts`, stores `thingStore.ts`
- **Styling**: Tailwind CSS utilities. Custom theme colors are CSS-variable-driven (supports color-blind modes): `plasma-orange`, `signal-green`, `caution-amber`, `alert-red`, `void-black`, `deep-space`, `nebula-blue`, `panel`
- **Fonts**: Orbitron (headings), JetBrains Mono (mono), Inter (body)
- **ESLint**: flat config (v9+), zero warnings allowed. `react-refresh/only-export-components` enforced with allowlist.

## UX Rules

### No Flyout/Slide-in Panels

**NEVER** use side-of-browser flyout panels (position: fixed, slide-in from right/left).
They break user focus, appear off-screen, and don't match the app's interaction model.

Use instead:

- **Centered modals** with backdrop for detail views and confirmations
- **Inline expansion** within the current view for contextual editing
- **Popovers** anchored near the trigger element for quick actions

### Canvas-Based Views

For visual builder / flowchart views (Station Builder Lab):

- Use **zoom** (mouse wheel / pinch), not horizontal scroll
- Use **pan** (click-drag background, or middle-click drag)
- Equipment interactions: drag-and-drop like Kanban cards
- Keep user focus centered — no actions that move attention to browser edges

## Engineering Governance

### Quality Gates

All checks must pass before push. Fix issues immediately — do not defer.

```bash
npm run verify   # Runs: tracked-artifacts + lint + build + bundle check
```

Git hooks (install with `npm run hooks:install`):

- `pre-commit`: blocks generated artifacts + oversized diffs, then runs lint
- `pre-push`: blocks oversized branch pushes, then runs full `npm run verify`

### Agent Rules for Failures

- Never "fix" by relaxing budgets or thresholds unless explicitly requested
- Never bypass checks by adding broad ignores or disabling lint/type rules
- Prefer structural fixes: code splitting, dead-code removal, dependency hygiene
- Keep commits focused; avoid mixing refactors, generated data, and feature work
- If a push is intentionally large, use: `ALLOW_LARGE_PUSH=1 git push ...`

### Repo Hygiene

Do not commit generated/build artifacts: `node_modules/`, `dist/`, `dev-dist/`, `bridge/dist/`, `collector/dist/`, `.next/`, `coverage/`, `.cache/`, `.vite/`, `.turbo/`, `*.tsbuildinfo`

`package-lock.json` IS source-controlled — commit it when dependencies change.

### Local-First Development

Local iterative development without PRs is allowed while prototyping. Use short-lived feature branches and small commits. Move to PR-first for integration and release branches.

## Environment Variables

**Frontend** (`.env`):

- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — Supabase auth (optional for local dev)
- `HAMQTH_USERNAME` / `HAMQTH_PASSWORD` — HamQTH callsign lookup (dev proxy only)

**Edge Functions**:

- `ALLOWED_ORIGIN` — CORS origin (defaults to `https://propulse.vercel.app`)
- `SUPABASE_URL` / `SUPABASE_ANON_KEY` — JWT verification for protected endpoints

**Bridge** (env or defaults):

- `BRIDGE_PORT` (default 9867), `BRIDGE_HOST` (default 127.0.0.1), `BRIDGE_STATIC_PORT` (default 3173)
- `BRIDGE_ROTOR=1` enables the rotctld client (opt-in; gates the `rotor` capability), configured by `ROTCTLD_HOST` (default 127.0.0.1) / `ROTCTLD_PORT` (default 4533)

## Technical Gotchas

- `spot.time` is typed as `Date` but arrives as string from JSON — always narrow with `instanceof Date`
- Discriminated union `Omit<>` doesn't distribute — use `OmitFromUnion<T, K>` helper or `as Type` cast after spread
- AudioWorklet processors use Blob URL pattern (inline JS string → `new Blob()` → `addModule()`) to avoid Vite serving issues
- Bridge `ts-node-dev` is broken for ESM — must `cd bridge && npx tsc && node dist/server.js`
- Vite config contains ~6 dev proxy plugins mirroring edge function behavior for local development
- Propagation model is custom ITU-R P.533 implementation (NOT VOACAP) in `src/lib/utils/ionosphere.ts`, `rayTrace.ts`, `signal.ts`
- **No live WSPR ingestion — do not rebuild it.** The M5→Supabase live-WSPR research pipeline was decommissioned 2026-07-21 (migrations `20260721110000`/`112000`/`120000`; code removed from `ml/service/` and `api/propagation/`). NowCast/FutureCast are served by pre-trained models on Railway (`VITE_PROPAGATION_MODEL_URL`) with the physics engine as fallback; WSPR data is used only for offline base-model training from the public wspr.live archive (~yearly). Nothing is scheduled on the M5. `spot_history` is a ~2h sliding window enforced by pg_cron; the only durable spot data are the small aggregates `path_hourly_stats`/`band_hourly_stats`.
