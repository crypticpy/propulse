# Self-hosting PropPulse

**Status:** Open Core baseline (M3). PropPulse's frontend, physics engine, and
every public-data proxy run entirely from this repository. Cloud-tier features
(accounts, cross-device sync, Display Wall pairing, billing) live in PropPulse
Cloud and are **not** part of the self-hosted stack — the app hides them with
an honest one-liner when they're unavailable.

## What you get self-hosted

- The full SPA: PropSphere globe, solar dashboards, DX tools, contest engine,
  logbook (IndexedDB — your QSOs never need a server), kiosk/Scenes mode.
- The custom ITU-R P.533 propagation physics engine (`src/lib/utils/`) —
  runs client-side, no service required.
- All public-data proxies (NOAA solar/space-wx, spots, POTA/SOTA, lightning,
  fires, satellites, …) as **portable handlers** in `api/_lib/handlers/` and
  `api/_lib/` shared modules. The same functions that run as Vercel edge
  functions mount in the bridge — there is no cloud-only logic in them.
- Rig control, WSJT-X, DX cluster telnet, and ICOM spectrum via the bridge.

## What stays cloud-only

| Feature | Why | Local answer |
|---|---|---|
| Accounts / auth | Supabase | Not needed — app runs anonymous locally |
| QSO cloud sync | Supabase RLS | IndexedDB + ADIF export/import |
| Display Wall pairing | Supabase + Realtime | Kiosk mode + `?scene=` deep links per display |
| Billing | Stripe | n/a |

## Quick start (single machine)

```bash
git clone https://github.com/crypticpy/propulse && cd propulse
npm install
npm run dev          # http://localhost:5173 — dev proxies serve /api/* locally
```

The Vite dev server mirrors the edge functions with local middleware, so the
full app works with **no** cloud configuration. Leave `VITE_SUPABASE_URL`
unset: the app runs in local mode and never shows a login screen.

## Production-style LAN host (bridge)

The bridge (`bridge/`) is a localhost/LAN Node service that serves the built
SPA and the same `/api/*` handlers the cloud runs:

```bash
npm run build                      # SPA → dist/
cd bridge && npm install && npm run build && node dist/server.js
```

(`npm run build` in `bridge/` compiles the server **and** bundles the portable
API handlers into `dist/portableRoutes.mjs` — plain `npx tsc` skips the
bundle and every `/api/*` request will answer 503.)

- WebSocket (rig control, WSJT-X, cluster): `ws://127.0.0.1:9867` —
  **always localhost-only**; rig control never leaves the machine.
- App + API: `http://<host>:3173` — serves the built SPA and mounts the
  portable `/api/*` handlers (53 routes: solar, spots, satellites, weather,
  tides, METAR, DXpeditions, user RSS feeds, propagation physics, …)
  bundled from `api/_lib/portableRoutes.ts`. The
  NowCast/FutureCast model-service proxies are cloud-only (they authenticate
  and spend a paid inference token); the app falls back to the local physics
  engine automatically.

Env (all optional): `BRIDGE_PORT` (9867), `BRIDGE_STATIC_PORT` (3173),
`BRIDGE_STATIC_HOST` (default 127.0.0.1 — set `0.0.0.0` to serve the LAN;
this also starts mDNS so devices can reach `http://propulse.local:3173`),
`BRIDGE_DATA_DIR` (default `~/.propulse` — holds the shared settings blob),
plus any upstream API keys you use (`FIRMS_MAP_KEY`, `REPEATERBOOK_APP_TOKEN`,
`AIRNOW_API_KEY` / `WAQI_TOKEN` for air quality, …).

> LAN-mode detection keys off the serving origin: port `3173` or a `.local`
> hostname. If you change `BRIDGE_STATIC_PORT` **and** browse by raw IP, the
> app can't tell it's bridge-served — the LAN badge and Shack LAN Sync stay
> hidden (data still works). Keep the default port or use `propulse.local`.

### Shared shack settings

Bridge-served devices show a **Shack LAN Sync** block in Settings → Data.
One device publishes its settings as the shack-wide blob
(`PUT /api/bridge/settings`, persisted in `BRIDGE_DATA_DIR`); every other
bridge-served device pulls it automatically within ~30 s. Pulls are
automatic, publishing is always an explicit button press.

> Some upstreams need free keys (NASA FIRMS for fire hotspots, RepeaterBook).
> Without a key those layers show their "source unavailable" state; nothing
> else breaks.

## Wall displays

See `docs/recipes/` for turnkey wall-display setups (Raspberry Pi labwc +
systemd, Fully Kiosk on Android/Fire OS, Windows mini PC). Self-hosted
displays use `/kiosk?scene=<id>` deep links; each device keeps its own scene
list in localStorage.

## License

PropPulse Open Core is AGPL-3.0 (see `LICENSE`). If you host a modified copy
for others over a network, the AGPL requires you to offer them your source.
