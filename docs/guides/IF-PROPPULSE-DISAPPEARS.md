# If PropPulse disappears

A continuity promise to operators: **nothing you depend on for daily operating
lives only on our servers.** If the cloud service, the Vercel deployment, or
the project itself vanished tomorrow, here is exactly what happens and what
you do.

## Your data

- **QSOs** live in your browser's IndexedDB, on your machine. Export any time:
  Logbook → Export → ADIF/Cabrillo. They are never held hostage by an account.
- **Settings, scenes, layouts** are localStorage on each device. The Settings
  page can export/import them as JSON.
- **Cloud-synced copies** (if you used an account) are a convenience mirror of
  your local log, not the primary. Losing the cloud loses nothing local.

## The app itself

The entire application is AGPL-3.0 open source. A clone of this repository is
a complete, working copy:

```bash
git clone https://github.com/crypticpy/propulse
cd propulse && npm install && npm run dev
```

No build secrets, no private registries, no license server. The production
build (`npm run build`) is a static bundle you can host anywhere — or serve
from the bridge on a Raspberry Pi in your shack (`docs/guides/SELF-HOSTING.md`).

## The data feeds

PropPulse's live data comes from public, government, and community sources —
NOAA SWPC, NASA, USGS, PSKReporter, RBN, DX clusters, POTA/SOTA. The proxies
in `api/_lib/handlers/` exist to solve CORS and rate limiting, not to gatekeep:
every upstream URL is visible in the source, and the same proxy functions run
in the bridge on your LAN. If our proxy endpoints go dark, your self-hosted
bridge keeps serving the same feeds.

The propagation engine is a from-scratch ITU-R P.533 implementation in
`src/lib/utils/` — physics, not a service. It computes on your CPU and cannot
be turned off remotely.

## What genuinely dies with the cloud

- Accounts, cross-device QSO sync, profiles/follows
- Display Wall phone-pairing (self-hosted answer: kiosk deep links)
- The pre-trained NowCast/FutureCast models served from Railway — the app
  automatically falls back to the local physics engine, which is the same
  fallback it uses during any outage today

## What you should do now (five minutes of insurance)

1. `git clone` the repository somewhere you control.
2. Export an ADIF backup of your log (calendar reminder: quarterly).
3. If you run wall displays, note their scene deep-link URLs.

That's the whole disaster plan. It fits on an index card, which is the point.
