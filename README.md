<p align="center">
  <img src="public/propulse.svg" alt="Propulse" width="100" height="100">
</p>

<h1 align="center">Propulse</h1>

<p align="center">
  <strong>The Ionosphere, Visualized.</strong><br>
  A free and open source propagation observatory, DX operations console, and contest platform for amateur radio.
</p>

<p align="center">
  <a href="https://propulse.cloud"><img src="https://img.shields.io/badge/Live-propulse.cloud-f97316?style=flat-square" alt="Live at propulse.cloud"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-AGPL--3.0-22c55e?style=flat-square" alt="License: AGPL-3.0"></a>
  <img src="https://img.shields.io/badge/React-18-61dafb?style=flat-square" alt="React 18">
  <img src="https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square" alt="TypeScript strict">
  <img src="https://img.shields.io/badge/Vite-6-646cff?style=flat-square" alt="Vite 6">
  <img src="https://img.shields.io/badge/PWA-installable-8b5cf6?style=flat-square" alt="Installable PWA">
</p>

<p align="center">
  <a href="https://propulse.cloud"><strong>Try it now at propulse.cloud</strong></a>
</p>

---

## Contents

- [What Propulse is](#what-propulse-is)
- [Free and open source](#free-and-open-source)
- [How NowCast works](#how-nowcast-works)
- [What we deliberately do not do](#what-we-deliberately-do-not-do)
- [What makes Propulse different](#what-makes-propulse-different)
- [Displays, canvases and workspaces](#displays-canvases-and-workspaces)
- [The station design system](#the-station-design-system)
- [Architecture](#architecture)
- [Getting started](#getting-started)
- [The Propulse Bridge](#the-propulse-bridge)
- [Environment variables](#environment-variables)
- [How this project is built](#how-this-project-is-built)
- [Contributing](#contributing)
- [License](#license)

---

## What Propulse is

Propulse is a live propagation observatory for HF radio. It runs at
**[propulse.cloud](https://propulse.cloud)** in any browser, installs as an offline-capable
app, and drives everything from a phone in the field to a wall-mounted shack display.

An HF operator asks one question all day: _can I work anyone, on which band, in which
direction, right now?_ Answering it honestly means three different things at once, and
Propulse does all three and keeps them visibly separate:

1. **Predict.** A propagation physics engine that runs entirely in the browser, with no
   server in the loop, and keeps working offline once its route has been opened and
   cached by the installed app.
2. **Observe.** A live ingest of what stations are actually hearing each other, right now,
   from the reporting networks that amateur radio already runs.
3. **Reconcile.** A published evidence ladder that says plainly whether a band is merely
   _modelled_ open or has been _verified_ open by observation, and flags it when reality
   and the model disagree.

Most propagation tools do the first and stop. The interesting engineering in this project
is in the second and third, and in refusing to blur the line between them.

Propulse also carries the working parts of a station: a logbook with QSL services, a
contest engine, a net control console, an equipment and feedline modeller, satellite
tracking, space weather, and a local bridge that talks to your radio.

---

## Free and open source

Propulse is a **nonprofit project**. It is licensed under the **GNU Affero General Public
License v3.0** ([LICENSE](LICENSE)), and the whole stack is in this repository: the
application, the physics engine, the edge functions, the collector and the bridge. Anyone
may download it, run it and serve it themselves, and the AGPL keeps it that way: the
project builds on other open-source work, and the same licence that lets us use that work
obliges us, and anyone who runs a modified Propulse as a service, to publish the source.

**The software is free. The only thing that has ever cost money, or ever will, is the
cloud.** Any pricing in Propulse, now or in the future, exists solely to recover the cost
of delivering the hosted service at [propulse.cloud](https://propulse.cloud): cloud
resources, third-party data and tile fees, and the upkeep of the online application. There
is no plan to charge for the software itself or for its core functionality. Anyone who
would rather not use the hosted service can download Propulse, install it on their own
cloud stack and run it for themselves, carrying those hosting costs directly; self-hosting
is a supported path, not a grudging one.

**The operating app is free to use today.** The map, physics engine, Band Health ladder,
wall display, logbook, contest engine, nets, shack builder, space weather and bridge are all
free at propulse.cloud on a free account. The hosted build asks you to sign in for
everything except the home page, the display-device routes under `/display/` (including
the anonymous registration page a new wall screen uses to pair), and a paired display
itself, which runs on its device token and can be steered to any view without ever
seeing a sign-in;
a free account costs nothing and unlocks every feature that does not carry a per-user
hosting cost. How the hosted service is sustained:

- **Donations** are the primary intended support.
- **An optional Pro subscription ($6.99 per month)** is intended to cover the hosted
  costs of features that consume server storage, history or compute. The intended
  boundary is the `FREE_FLAGS` / `PRO_FLAGS` table in
  [`src/lib/featureFlags.ts`](src/lib/featureFlags.ts), and the tier is set server-side
  from Stripe and synced to the profile, never decided in the browser. Enforcement is
  partial today, and we say so: spot replay, contest-aware watch presets and
  high-resolution satellite imagery (Mapbox tiles and Google photorealistic 3D, checked
  both in the client and by the tile proxies server-side) enforce the tier, while custom
  profile and gear images and per-user propagation modelling are declared in the table
  but not yet gated, so free accounts can currently use them. The flags also carry 7-day
  and 30-day replay windows, but the raw spot table is trimmed to roughly two hours, so
  neither window is served.
- **Unlimited free displays.** Pairing extra screens to your station, the thing a
  commercial product would meter, is deliberately never metered.

Anything in this README that is not shipped is marked **planned**. We would rather ship a
shorter, true README than a longer, aspirational one.

---

## How NowCast works

Three independent things produce a propagation answer, and the UI always tells you which
one you are looking at.

### The physics engine (always available)

A custom **simplified ITU-R P.533 approach with CCIR/ITU-R models**, written in TypeScript
and run client-side in three modules:

- **[`ionosphere.ts`](src/lib/utils/ionosphere.ts)** estimates layer structure: critical
  frequencies `f0F2` and `f0E`, heights `hmF2`/`hmF1`/`hmE`, the `M(3000)F2` MUF factor
  and D-layer absorption, with solar flux converted to a 12-month smoothed sunspot number
  through the CCIR relation `SFI = 63.7 + 0.728 * R12`.
- **[`rayTrace.ts`](src/lib/utils/rayTrace.ts)** walks the great circle, short or long
  path, in up to twelve hops: local `f0F2` from a Chapman-style profile, MUF via **Martyn's secant law**,
  D-layer absorption, free-space path loss, and a hop quality score folding in MUF margin,
  absorption and Kp.
- **[`signal.ts`](src/lib/utils/signal.ts)** turns path loss into a signal prediction: an
  ITU-R P.372 external noise floor, thermal noise at -174 dBm/Hz, and SNR in a **2500 Hz
  reference bandwidth** so published per-mode thresholds (SSB, CW, FT8) are compared
  honestly rather than through a per-mode noise floor.

This engine is **not VOACAP**, does not wrap VOACAP, and does not claim VOACAP's accuracy.
It is our own model, and it is the baseline everything else must beat.

### The learned models (trained offline, served with a physics fallback)

We train our own contact-probability models offline and serve them from a Railway
inference service that sits behind the app's authenticated `/api/propagation` edge proxy
(the browser never talks to Railway directly in production; `VITE_PROPAGATION_MODEL_URL`
exists only for local development against a model service), with physics as the fallback
profile whenever a model is unavailable or its inputs fail their freshness contract.

The frozen line is **Personalized Propagation V4.2** (the A6 blend), with a published model
card, data card and visual report under `ml/results/propagation_v4_2/`. Its status block in
[`ml/README.md`](ml/README.md) records both the result and its limits, and we quote the
limits as written: A6 improved Brier score over the frozen V3/B2 baseline by **2.354%** on
October-November development, **2.038%** on December, and **2.134%** across
**208,372,533** locked 2025 archive rows, every month and every supported HF band
improving. The same block states the model is **approved for shadow integration only, not
yet for prospective or learned-personalization claims**; the client may request and show
it only in an internal mode, and nothing public is claimed from it. That boundary is part of
the work.

The current line of work is **NowCast N5**, an ionosphere-aware model trained from the
CEDAR Madrigal amateur radio signal report archive rather than from WSPR alone
([`ml/NOWCAST-N5-PLAN.md`](ml/NOWCAST-N5-PLAN.md)). N5 is **in progress and not shipped**,
written against frozen preregistered gates (Brier skill over a calibrated physics baseline,
a per-band no-regression bound, a calibration error ceiling, and an ablation that must
retain most of its skill without recency features), and its served provider status stays
`unavailable` to the public until its shadow window passes. It states its scope precisely: it
predicts whether a receiving field's reporter network hears any transmitting station in a
transmitting field on a band and mode class, which is not one operator's chance of a
contact.

**FutureCast**, the forecast line at +3, +6, +12 and +24 hours from archived NOAA SWPC
forecast products, is **planned**; its protocol
([`ml/FUTURECAST-V1-PROTOCOL.md`](ml/FUTURECAST-V1-PROTOCOL.md)) keeps training and release
mechanically disabled until enough genuine issuance days have matured to score it.

### The live feature pipeline

The [`collector/`](collector/) service ingests spots from PSK Reporter, the Reverse Beacon
Network and DX cluster feeds into Supabase, and fetches solar and geomagnetic inputs
directly from NOAA SWPC and GFZ into `solar_snapshots` for the models. Separately, the
browser reads its space-weather panels through 24 edge proxies in
[`api/solar/`](api/solar/): planetary K index, F10.7 and its forecasts, X-ray flux and
flares, proton flux, solar wind plasma and magnetometer (Bt/Bz), Dst, sunspots, SWPC
scales and alerts, and the D-RAP absorption product. The two paths share sources but not
code, so an outage in one does not imply an outage in the other.

Raw spots are deliberately **not** hoarded: `spot_history` is a roughly two-hour sliding
window trimmed by a scheduled job. What persists is derived data rather than raw
reports: hourly and daily aggregates by path, band and region (`path_hourly_stats`,
`band_hourly_stats`, `region_hourly_stats`, `path_recency_hourly`, the two climatology
tables), the Band Health verdict states with a 13-month `verdict_events` log, and a
`callsign_fields` mapping of callsigns to the grid fields they were heard from, which is
kept without a retention delete today. This list is not exhaustive; `supabase/migrations/`
is the record. Keeping the durable footprint small is a design choice about cost and
privacy, not an accident, and the callsign mapping is the piece of it we would most want a
privacy reviewer to look at.

### The Band Health verified-state ladder

The reconciliation step lives in [`src/lib/verdict/ladder.ts`](src/lib/verdict/ladder.ts),
mirrored server-side in `collector/src/verdict/ladder.ts` and served from
`api/spots/band-ladder.ts`. A band, globally or per region, sits in exactly one of five
states,
ordered by strength of evidence:

```
closed  <  forecast  <  stirring  <  verified  <  hot
```

- **`forecast`** means the physics engine says open and nothing has been heard. It is a
  model claim and it is labelled as one.
- **`stirring`** requires at least one real deduplicated observation.
- **`verified`** requires **6 deduplicated observations from 3 distinct reporters in the
  trailing 20 minutes**, and the raw condition only drops back out once observations fall
  to 2 or fewer. That asymmetry is deliberate hysteresis: a lull between spots must not
  flap a verified band off the wall. On top of the raw evaluation, a state machine
  (`src/lib/verdict/stateMachine.ts`) holds every promotion for 5 minutes and every
  demotion for 20 minutes before the served state changes, so a band that has just
  qualified is not shown as verified instantly, and a sustained count of exactly two does
  eventually demote it.
- **`hot`** is `verified` plus a rising trend across two 10-minute windows.

One observation is one deduplicated `(tx, rx, band, 5-minute bucket)` tuple, and reporters
are distinct receiving callsigns after that dedup, so a single chatty skimmer cannot
promote a band alone. A **surprise** flag, orthogonal to the ladder, fires when real
activity appears while the forecast said closed: the honest signal of sporadic-E or TEP,
logged rather than smoothed away.

The schema has a `verdict_feedback` table as groundwork for operator feedback, but no
submission flow ships yet, and by design feedback will **never be an input to the live
ladder**. The evaluation
function takes only the physics score, the deduplicated observation and reporter counts,
and the two trend windows. Nothing a user clicks can talk a band into looking open.

### Honest provenance

The provenance standard every data-bearing widget is held to: the source's observation
time (`observedAt`) kept distinct from our fetch time (`fetchedAt`), provider attribution,
and explicit **stale**, **partial** and **unavailable** states. Most panels meet it; the
ones that do not yet are tracked as defects (for example the band activity tile, which
carries only a fetch time and keeps showing its last good counts if a refresh fails). When a source is down, the
panel says so, and a stale number is never dressed in a fresh timestamp. The rule that a
missing value renders as missing rather than as a zero is the standard every panel is
held to; a few NOAA scale renderers still show an absent scale as level 0 and are tracked
as bugs, not accepted behaviour.

---

## What we deliberately do not do

- **No VOACAP.** The physics engine is our own P.533-style implementation. We do not
  wrap VOACAP and we do not borrow its reputation.
- **No persisted WSPR pipeline.** The map still shows the last 30 minutes of WSPR
  reports fetched on demand from wspr.live, but the research pipeline that stored live
  WSPR into our database was decommissioned in July 2026 and will not be rebuilt. WSPR
  archives are used for offline training only.
- **No silent fallbacks.** If a model is unavailable the UI falls back to physics and
  says which profile produced the answer.
- **No fabricated zeros.** A contaminated or absent upstream value is an outage state,
  not a data point. This is the rule, with one known violation still open: a few NOAA
  scale renderers show an absent scale as level 0 (see the provenance section above).
- **No station-to-station promises from band-level evidence.** Guidance derived from
  general conditions is labelled as general conditions.

---

## What makes Propulse different

### PropSphere, the propagation map

| View            | What it is                                                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **3D globe**    | Tiled, textured Earth with day/night terminator, night lights, labels and live spot plotting                                                                        |
| **2D flat map** | The same spots, paths, pins and panels on a flat projection; some globe-only layers (D-RAP, sporadic-E, TEC, NVIS and others) say so rather than silently vanishing |
| **Azimuthal**   | WebGL azimuthal equidistant projection centred on your QTH, showing true bearings and distances                                                                     |

- Live spot arcs drawn as great circles from DX cluster, PSK Reporter and RBN feeds.
- **Occlusion-aware labels**: spot and marker labels are hidden when their point is on
  the far side of the globe, accounting for the 23.5 degree axial tilt of the scene, so
  the map never shows you a callsign that is physically behind the Earth.
- MUF, sporadic-E, aurora (OVATION), D-RAP, lightning, radar and satellite layers.
- Time scrubber, spot clustering, compass rose, mini-map, pins and path analysis.

### The wall display

A dedicated shack-wall view, inspired by HamClock and rebuilt on our own design system:

- Full-height **hero tiles** sized for a monitor across the room rather than a laptop.
- **Paged rails** of secondary tiles, so a wall shows depth without shrinking type.
- **Engineered per-tile reports**: clicking a supported tile (all of the propagation,
  solar and activity tiles; the SDR scope and decode tiles do not open one yet) opens a
  centred report built for that
  specific subject, showing the physics, the model and the observed evidence side by side,
  rather than a generic drill-down.
- Selectable themes and a strict no-flyout, no-hover-menu interaction model.

### DX Wizard

Enter a grid square, coordinates, city or callsign and get a worked answer: recommended
band, power and frequency, with the multi-hop ray trace, D-layer absorption, IGRF-13
geomagnetic latitude, ITU-R P.372 noise floor, antenna pattern modelling, NVIS analysis
and receiver performance from the Sherwood Engineering database behind it.

### Contest engine

Thirty-six contest definitions with real-time scoring, per-contest dupe rules, multiplier
tracking, Super Check Partial, rate sheet, band map with one-click QSY, keyboard-first
entry, Cabrillo and ADIF export, N1MM-compatible UDP broadcast, off-time and QTC handling,
and multi-tab synchronisation.

### Logbook and QSL

QSO logging in IndexedDB with DXCC tracking, ADIF import and export, and a unified QSL
manager for LoTW, eQSL and Club Log. Service credentials live in an AES-256-GCM encrypted
vault with PBKDF2 key derivation and an inactivity auto-lock.

### Shack builder

Full equipment inventory across radios, antennas, feedlines and accessories, with a
**feedline loss engine** (square-root-of-frequency interpolation, connector loss, cable
condition and SWR mismatch) and station presets that compute **per-band ERP**. The active
preset feeds back into the map's propagation calculations, so the predictions reflect your
actual antenna and coax rather than a generic dipole.

### Nets, space weather and more

A net control console (scheduled nets, check-in roster and rotation, live running order,
participation logs and post-net analytics); a space weather page that keeps Kp
observations, estimates and predictions visibly distinct and carries SWPC scales, alerts,
flare probabilities, proton flux, Dst and D-RAP with cache-stable NOAA and NASA imagery;
satellite tracking; a client-side audio DSP chain (noise gate, spectral noise reduction,
EQ); and an installable PWA with dedicated mobile layouts, offline caching and 44px touch
targets. Because the physics engine runs locally, the core propagation answer survives
losing the network in the field, provided the route was opened once while online so the
installed app has cached its code.

---

## Displays, canvases and workspaces

Propulse is designed around **four canvases**: the wall, the workstation, the tablet and
the phone. The same modules compose differently on each, rather than each device getting
its own cut-down product.

**Shipped today:** the wall display, the mobile and tablet layouts, and display pairing.
A new screen opens `/display/pair` to register and show a code, the owner claims that
code on `/pair`, and `/displays` manages the screens already paired. Paired screens run
as view-only displays, with no limit on how many you may pair.

**In design:** the composed workstation, tablet and phone _workspaces_, with rails,
docking, paged spaces and cross-device operating state so that an action on the phone
follows you to the wall. A workspace shell exists behind the `/workspace` route, but the
composition work is an open programme, not a shipped feature.

**Planned:** club mode and QR-joined operating sessions.

---

## The station design system

Every surface is built from one shared station design system rather than per-page styling:

- A **token-driven theme layer** (`src/lib/themes/`) that emits CSS custom properties, so
  themes, accent colours and density are a data change rather than a restyle.
- **Colour-blind modes** for deuteranopia, protanopia and tritanopia, applied in the same
  write as the theme so the two can never disagree. The HamClock wall's own status tones
  still resolve to fixed fallbacks and do not yet follow the colour-blind selection; that
  gap is tracked as a defect.
- A **legibility standard** written for operators who wear glasses: high contrast, no pure
  white on black, no halo or fringing effects, and a user text-size control instead of
  smaller type.
- **Contrast is enforced by tests as well as by review.** Every UI-touching change also
  needs an approved design review before merge, but the numbers are checked by guards such as
  `src/lib/themes/stationTokens.test.ts`, `accentTintContrast.test.ts`,
  `statusTintContrast.test.ts` and
  `src/components/map/hamclock/hamClockHoverChromeContrast.test.ts` compute contrast
  ratios on the real composited surface a token is used on. A tint that fails inside a
  glass card fails the build even if it passes on a bare panel.

---

## Architecture

Three tiers plus a serverless edge:

```
propulse/
├── api/          Vercel Edge Functions: CORS-safe proxies and protected endpoints
│                 solar/ spots/ callsign/ log/ sync/ satellites/ activation/ billing/
│                 nets/ views/ displays/ weather/ atmos/ tiles/ propagation/ ...
├── bridge/       Local-only Node.js WebSocket server (CAT, WSJT-X, cluster, CI-V)
├── collector/    Railway service: spot and solar ingestion into Supabase
├── ml/           Offline training, model cards, plans and preregistered protocols
├── src/
│   ├── pages/          Route-level pages, all lazy-loaded
│   ├── components/     Feature components by domain (map, contest, dx, solar,
│   │                   shack, nets, station-ui, ui, ...)
│   ├── stores/         Zustand stores with persistence and versioned migrations
│   ├── hooks/          Data-fetching and UI hooks
│   └── lib/
│       ├── utils/      Propagation physics engine
│       ├── verdict/    Band Health ladder and verdict engine
│       ├── contest/    Contest scoring, dupes, multipliers, SCP, Cabrillo
│       ├── themes/     Design tokens, colour-blind modes, contrast guards
│       ├── db/         IndexedDB: log store, image store, credential vault
│       └── audio/      Client-side DSP: noise gate, spectral NR, EQ
├── docs/         Specifications, design records and the agent constitution
└── scripts/      Verification gates and data generation
```

| Layer      | Technology                                                |
| ---------- | --------------------------------------------------------- |
| UI         | React 18, TypeScript 5.7 strict, Tailwind CSS 3           |
| 3D         | Three.js, @react-three/fiber, @react-three/drei           |
| State      | Zustand 5 (persisted, versioned), TanStack React Query    |
| Build      | Vite 6, React Router 7 with lazy routes                   |
| Backend    | Vercel Edge Functions, Supabase (Postgres), IndexedDB     |
| Services   | Collector on Railway; models trained offline with XGBoost |
| Encryption | Web Crypto API (AES-256-GCM, PBKDF2)                      |

### Data sources

| Source                            | Data                                                              |
| --------------------------------- | ----------------------------------------------------------------- |
| NOAA SWPC                         | Kp, F10.7, X-ray, protons, solar wind, Dst, scales, alerts, D-RAP |
| NOAA OVATION                      | Aurora oval                                                       |
| DX cluster feeds                  | DX spots                                                          |
| PSK Reporter                      | Digital-mode reception reports                                    |
| Reverse Beacon Network            | CW and digital skimmer spots                                      |
| CEDAR Madrigal, wspr.live archive | Offline model training corpora only                               |
| HamQTH, callook.info              | Callsign lookup                                                   |
| LoTW, eQSL, Club Log              | QSL confirmation                                                  |
| Sherwood Engineering              | Receiver performance database                                     |

---

## Getting started

Requires Node.js 20 or later and npm 9 or later (the frontend alone builds on Node 18,
but the collector, and therefore the full verify gate, needs Node 20).

```bash
git clone https://github.com/crypticpy/propulse.git
cd propulse
npm install
npm run dev
```

The dev server serves the app at `http://localhost:5173` with hot module replacement.
That plain `npm run dev` is for a human at the keyboard. Agents and scripted checks on a
shared machine use the managed session instead: check `npm run dev:session -- status`
first, then start an owned server with
`npm run dev:session -- start --owner <slug> --task <description> --profile local`. Each
session is claimed per worktree on a port from 5180 to 5199, runs in the foreground, and
is never taken over or stopped by another agent; separate ports do not isolate source
edits, so different code changes need separate worktrees. See
`docs/guides/LOCAL-AGENT-TESTING.md` and the shared-machine rules in `CLAUDE.md`.
Supabase credentials are optional for local development; without them the app runs
unauthenticated and the physics engine still works.

`npm run verify`, the gate every push must pass, also runs the bridge, collector, radio
daemon and ML checks, so a contributor who intends to push needs their dependencies too:

```bash
(cd bridge && npm install)
(cd collector && npm install)
python3.12 -m venv ml/.venv   # Python 3.12 is the known-good version (the service image uses it)
ml/.venv/bin/pip install -r ml/requirements.txt -r ml/service/requirements-runtime.txt
# radio daemon tests need a Rust toolchain (https://rustup.rs); on Debian/Ubuntu also
# apt install pkg-config libasound2-dev libudev-dev for the cpal and serialport crates
```

### Everyday commands

```bash
npm run dev              # Vite dev server (human use)
npm run dev:session -- status   # managed dev sessions for agents (see Getting started)
npm run build            # tsc -b && vite build (typecheck + bundle)
npm run lint             # eslint . --max-warnings 0 (zero tolerance)
npm run test             # vitest run
npm run check:bundles    # enforce bundle size budgets
npm run verify           # the full gate pipeline used before every push
npm run preview          # serve the production build locally
npm run hooks:install    # one-time git hook setup (pre-commit + pre-push)
```

---

## The Propulse Bridge

The bridge is an optional local service that connects the browser app to the hardware on
your desk. It binds to `127.0.0.1` only and is never exposed to the network.

```bash
cd bridge && npm install && npm run dev   # WebSocket on ws://localhost:9867
```

| System       | Protocol         | Purpose                           |
| ------------ | ---------------- | --------------------------------- |
| Hamlib       | CAT (serial/TCP) | Frequency, mode and PTT control   |
| WSJT-X       | UDP              | Decode reception and auto-logging |
| DX cluster   | Telnet           | Real-time spots                   |
| ICOM CI-V    | Serial           | Spectrum and waterfall capture    |
| N1MM Logger+ | UDP broadcast    | Contest interoperability          |

See [bridge/README.md](bridge/README.md) for the protocol and architecture.

---

## Environment variables

**Frontend** (`.env`): `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (both optional for
local development). Leave `VITE_PROPAGATION_MODEL_URL` unset in production: the client then
calls the same-origin `/api/propagation` proxy, which enforces JWT, origin, rate and
response checks before reaching the Railway model service, and falls back to the physics
engine when the model is unavailable. Set the variable only for direct local development
against a model service, as described in [`ml/service/README.md`](ml/service/README.md).

**Edge functions**: `ALLOWED_ORIGIN` for the CORS allowlist, plus `SUPABASE_URL`,
`SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` for JWT verification and server-side
reads and writes. The `/api/propagation` proxy also needs `PROPULSE_INFERENCE_URL` and
`PROPULSE_SERVICE_TOKEN` (server-only) to reach the model service; without both it answers
503 and the client stays on physics.

**Collector** (self-hosted only): configured from its own
[`collector/.env.example`](collector/.env.example), not the root file. Note that the default
`COLLECTOR_ENABLED_SOURCES` includes `rbn`, and the RBN feed refuses to start without a
`RBN_LOGIN_CALLSIGN` (a receive-only callsign); set one or drop `rbn` from the list.

**Bridge**: `BRIDGE_PORT` (default 9867), `BRIDGE_HOST` (default 127.0.0.1),
`BRIDGE_STATIC_PORT` (default 3173).

Map tiles, weather, callsign lookup and several research flags have their own keys; see
[.env.example](.env.example). A self-hosted deployment that enables the Pro subscription
also needs the server-only Stripe settings read by [`api/billing/`](api/billing/):
`STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_SUCCESS_URL`,
`STRIPE_CANCEL_URL` and `STRIPE_PORTAL_RETURN_URL`.

---

## How this project is built

Propulse is built with heavy agent assistance, under a written rulebook rather than on
trust. This is stated plainly because it shapes the codebase a reviewer is looking at.

- **A written constitution.** [`docs/AGENT-CONSTITUTION.md`](docs/AGENT-CONSTITUTION.md)
  is the binding rulebook for any agent or human contributor working here, with
  [`docs/AGENT-PROCESS-REFERENCE.md`](docs/AGENT-PROCESS-REFERENCE.md) alongside it.
- **Every pull request is reviewed by machine and by a second opinion.** Automated review
  threads must be resolved before merge, and a separate second-opinion review is posted on
  top of them. Unresolved review threads block the merge even when the checks are green.
- **A single verify pipeline gates every push.** `npm run verify` runs tracked-artifact and
  design-token checks, preregistration and archive integrity checks, production-boundary
  checks, lint at zero warnings, the full Vitest suite plus the bridge, radio daemon and
  collector suites, a typechecked build, and bundle-size budgets. The pre-push hook runs
  a reduced, path-specific subset for documentation, tooling and application-only
  pushes and the full pipeline only for ML and migration changes, so `npm run verify`
  is run by hand before any push that matters.
- **Contrast and legibility are tests.** Design rules that would normally live in a style
  guide are executable assertions, so they cannot rot.
- **Preregistration for model claims.** Model plans state their gates and their metrics
  before the runs happen, and failed gates stay published rather than being overwritten.
  The `ml/` directory contains the record, including the results we did not like.

---

## Contributing

Contributions are welcome, from bug reports to bands of the ionosphere we have modelled
badly.

1. Pick or file a tracked issue and claim it there; one issue is one branch and one PR.
2. Fork, then create a fresh worktree and branch from current `origin/main` with
   `npm run worktree:new -- <slug> <type>/<epic-slug>-<task-slug>` (the type is `feat`,
   `fix`, `docs`, `chore`, `refactor` or `test`; omitting it defaults to `feat/`); never
   work in a shared checkout.
3. Follow the existing style: TypeScript strict, 2-space indent, double quotes, Tailwind
   utilities, `@/` import alias.
4. Run `npm run verify` before pushing.
5. Commit with [Conventional Commits](https://www.conventionalcommits.org/)
   (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`).
6. Open a pull request with a summary and testing notes, a `Closes #N` (or `Refs #N` for a
   partial slice) line, and an `Agent:` line naming who or what wrote it; the `pr-contract`
   check fails without them. UI-touching changes also need an approved design review on
   the current head before merge.

[AGENTS.md](AGENTS.md) and [docs/AGENT-CONSTITUTION.md](docs/AGENT-CONSTITUTION.md) hold
the detailed repository rules. Corrections to the physics, the model methodology or the
data provenance are especially valued: if we have a claim wrong, we want the issue.

---

## License

Copyright (C) Propulse contributors. This program is free software: you may redistribute
and modify it under the terms of the **GNU Affero General Public License, version 3**, as
published by the Free Software Foundation. It is distributed WITHOUT ANY WARRANTY, without
even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See
[LICENSE](LICENSE) for the full text.

### Trademarks

The AGPL covers the code. It does not grant any right to the project's name or marks. The
name **Propulse**, the **propulse.cloud** service name and the Propulse logo are trademarks
of the Propulse project. You are welcome to run, modify and redistribute the software under
the AGPL, but if you operate your own instance or a modified version, please do so under
your own name and branding and do not present it as Propulse, as propulse.cloud, or as
endorsed by or affiliated with the project. Plain factual references ("based on Propulse",
"a fork of Propulse") are fine. If you want to use the marks in another way, ask first
through an issue on this repository.

---

<p align="center">
  <a href="https://propulse.cloud"><strong>propulse.cloud</strong></a><br>
  Built for the amateur radio community. 73 de Propulse.
</p>
