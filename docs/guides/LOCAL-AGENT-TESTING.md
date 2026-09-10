# Local testing and agent server coordination

Last updated: 2026-09-10

Read this before using a local ProPulse server. This machine runs **exactly
one** Vite dev server, on **port 5173**, owned by the human or the
orchestrator session. Agents never start their own — not `npm run dev`, not
`npm run dev:session start`, not `vite`/`vite preview`, not a Playwright
`webServer`. Orphaned per-agent servers have crashed this machine before.

## Quick start

From the checkout/worktree root, check whether the shared server is running:

```sh
npm run dev:session -- status
pgrep -fl vite
```

If it is running, use the shared origin directly — do not start anything:

```sh
curl --fail --silent http://127.0.0.1:5173/__propulse_dev_session
```

Open `http://localhost:5173/map` for PropSphere or `http://localhost:5173/solar`
for SolarPulse. Select HamClock through the shared layout selector on `/map`.

If it is **not** running, do not start one. Report that in your findings and
stop; only the human or the orchestrator starts the shared server. A task brief
that hands you a URL is the only authorization to use a server session.

`npm run dev:session -- start` itself refuses when any dev server — managed by
this tool or not — is already listening on this machine, and always binds
port 5173. A plain `npm run dev` runs the same refusal first, via its
`predev` script (`npm run dev:session -- guard`), so it fails the same way
before Vite even starts.

`DEV_SERVER_ALLOW_EXTRA=1` **moves** the one shared server to a different
port (owner-only escape hatch, for example when 5173 is occupied by something
outside ProPulse). It never permits a second, simultaneous server — the rule
stays "exactly one dev server per machine," just not necessarily on 5173.
Agents must not set it.

### Recovering from a stuck or stale claim

`npm run dev:session -- start` auto-recovers a claim file whose owning
process has actually died (a crashed or `kill -9`'d session): it detects the
dead pid, removes that one registry file, and retries once. You do not need
to intervene for that case.

If `start` still fails after the automatic retry, its error message names the
exact registry file(s) it checked. Before touching anything:

```sh
npm run dev:session -- status          # lists every managed claim + its processState
ps -p <pid-from-the-claim>             # confirm the owning process is actually gone
```

Only if the owning process is confirmed dead and the automatic retry still
didn't clear it, delete that **exact** file yourself — never delete the whole
registry directory, and never do this while another session might legitimately
be starting up (a claim file mid-write is expected to look "stale" for a
moment). The registry directory itself is printed by `status`.

## One server, many worktrees

A single running server serves the checkout/worktree it was started from. It
does not automatically pick up source edits made in a different worktree.
Coordinate with whoever owns the running session before assuming it reflects
your branch; if your change lives in a different worktree, ask the owner to
restart against it, or wait rather than starting a second server.

1. Never kill, restart, or take over the shared server yourself. Only the
   owner (the human, or the orchestrator that started it) stops it, with
   Ctrl-C in its foreground terminal — not `pkill node`, `killall`, or a
   broad Vite process match.
2. Use separate browser profiles/contexts for independent fixtures against the
   shared server. Tabs on the same origin share localStorage, IndexedDB, auth,
   and some cross-tab events. Two-window synchronization tests deliberately
   share the required origin/context.
3. Use the exact host consistently. `localhost`, `127.0.0.1`, and `::1` are
   not interchangeable browser origins.
4. Do not start the bridge, daemon, collector, or hardware detection for
   map-only testing. Those services have their own shared ports and hardware
   state. Radio tests need a separate explicit ownership handoff for those
   services.
5. For performance captures, record other active browser windows against the
   shared server. Coordinate with the owner to pause load if necessary; do not
   close anything yourself. Capture cold/warm measurements at the same quality
   and traffic state.

The dev-session registry (`npm run dev:session -- status` prints its path in
the OS temp directory) tracks the one managed session, if any. It exists so
`start` can detect and refuse a second server; it is not a pool of ports to
claim. `npm run dev` remains available for the owner's manual use only; it
does not register in the registry.

## Existing or unregistered instances on this machine

A responding port is not proof it serves your checkout, or even this project.
Before treating a listener on 5173 as usable, confirm its identity:

```sh
lsof -nP -iTCP:5173 -sTCP:LISTEN
lsof -a -p <observed-pid> -d cwd -Fn
ps -p <observed-pid> -o pid=,ppid=,etime=,comm=
curl --fail --silent http://127.0.0.1:5173/__propulse_dev_session
```

If a Vite process is listening but was not started through `dev:session`
(so it has no identity endpoint), it is unmanaged: do not assume it is the
shared server. Identify its owner before reuse; let the owner retire it in
favor of a managed session at a convenient stopping point. Do not infer that
every local Node server on this machine belongs to ProPulse.

## Choose the testing profile deliberately

| Profile     | Startup                                      | What it establishes                                                                                                                 |
| ----------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Connected   | `--profile connected` (default)              | Existing environment and real login/sync behavior; use an authorized test account/session                                           |
| Local UI    | `--profile local`                            | Empty client Supabase URL/key for this process, using the existing unconfigured-client path; useful for layout and browser fixtures |
| First visit | Either profile, new isolated browser context | Welcome/setup/tour behavior; leave onboarding state untouched                                                                       |

Local UI mode never edits `.env.local` and does not add a production auth bypass.
It is **not an offline sandbox**: dev API handlers may still use configured
backends and external feeds. It does not establish authentication, paid feature
access, cloud sync, live contacts, or disconnected behavior. Use request fixtures
for deterministic data and record which feeds are live. Do not fabricate
entitlements or disable production gates to get a screenshot.

Connected mode uses the normal AuthGate: when Supabase is configured and no
session is present, `/map` and `/solar` show LoginPage. Wait for auth initialization
and sync before diagnosing missing station/log data. If a required test session
is unavailable, continue local UI checks and report the authenticated checks as
pending. Do not send magic-link or password-reset email without explicit user
authorization. Do not copy the user's auth tokens into source files or handoffs.

For authorized browser automation, keep any saved authentication state in an
ignored, private local path (for example under `tmp/`), never in a commit or a
report. Login redirects must support the shared origin, `http://localhost:5173`.

The [owner fixture](../../scripts/OWNER-FIXTURE.md) writes durable cloud records
when applied. It is not a routine browser bootstrap. Never run its `--apply` path
just to make panels look populated; use already authorized account data or local
test fixtures. The fixture guide's historical checkout examples are not a reason
to switch repositories; run commands from the checkout you have verified.

## Welcome, radio setup, and the PropSphere tour

These are separate from login. For manual returning-user checks:

1. Complete authorized login if using the connected profile.
2. Dismiss the welcome modal with **Close welcome overlay**.
3. Skip the radio setup wizard for UI-only work using its close/skip control
   (**Close setup wizard**); avoid starting hardware detection.
4. Dismiss/complete the PropSphere tour and any actual rank celebration through
   their UI. Then confirm no backdrop covers the map before capturing or clicking.
5. Configure the intended station/location through existing UI or a declared
   local fixture. A blank local profile does not reproduce the owner's station.

Current state locations, verified in source:

| Content         | Completion state                                                 |
| --------------- | ---------------------------------------------------------------- |
| Welcome         | `localStorage["propulse-welcome-seen"] === "true"`               |
| Radio setup     | `radioSetupCompleted` in the persisted `propulse-settings` store |
| PropSphere tour | `localStorage["propulse-onboarding-completed"] === "true"`       |
| Login           | Supabase auth state, separate from all onboarding flags          |

For automated returning-visitor layout tests in a **disposable browser context**,
seed before the first navigation. Merge the settings envelope instead of replacing
other settings or hardcoding its migration version:

```ts
await context.addInitScript(() => {
  localStorage.setItem("propulse-welcome-seen", "true");
  localStorage.setItem("propulse-onboarding-completed", "true");
  const saved = JSON.parse(localStorage.getItem("propulse-settings") ?? "{}");
  localStorage.setItem(
    "propulse-settings",
    JSON.stringify({
      ...saved,
      state: { ...saved.state, radioSetupCompleted: true },
    }),
  );
});
```

This suppresses first-visit presentation only; it supplies no station, logbook,
auth session, or radio connection. Do not use it in onboarding tests or the user's
regular browser profile. Never use `localStorage.clear()` or wipe IndexedDB to
get past a modal in a borrowed profile. Do not set kiosk/device identity flags
as a shortcut: kiosk changes presentation, and registered display auth is a
different workflow. Use a new context for first-visit coverage.

## Browser test runner

Both Playwright configurations (`playwright.config.ts` for SolarPulse,
`playwright.home.config.ts` for Home) default to the shared server at port
5173 and never start one on their own: `webServer` is only defined when
`PROPULSE_E2E_ALLOW_START=1` is explicitly set **and** the port is still 5173
— that is an opt-in for a deliberate one-off, not routine agent use. A
shared `globalSetup` (`tests/support/sharedServer.ts`) runs before every
suite and fails fast if nothing is listening on the target port, or if the
listener answers `/__propulse_dev_session` with a different worktree's root
than this one (so a same-port server from another checkout can't silently
serve stale/different source code to your test run).

```sh
npm run test:solar:browser
npm run test:home:browser
```

If the shared server is not running, do not set `PROPULSE_E2E_ALLOW_START=1`
yourself — report that in your findings and ask the human or orchestrator to
start it, same as any other local check.

An explicit `PROPULSE_E2E_PORT` overrides the target origin for a one-off
check against a different, already-running server; it does not itself start
anything on that port. The existing SolarPulse tests seed returning-visitor
state and intercept solar requests; their results are not evidence of a
successful real login or live solar provider availability. Test runner
configuration changes should not affect the shared dev server.

## Handoff block for another agent

```text
Task and next check:
Checkout/worktree (absolute path), branch/revision, relevant uncommitted changes:
Shared server confirmed running at http://localhost:5173 (yes/no, checked how):
Exact route:
Profile: connected / local; data: live / fixture (which one):
Identity endpoint checked (root/profile match):
Browser profile/context/tab; shared intentionally or disposable:
Auth: signed in / local UI / pending (no tokens, passwords, or private state):
Welcome / radio setup / tour state:
Station/location; band/mode; log scope:
Projection, region, quality, Text Size, panels, enabled layers:
Viewport, DPR, browser zoom; physical screen/distance if reviewed:
Checks completed, reproduction steps, screenshots/traces, remaining limitations:
Borrowers/other active test load; cleanup or explicit ownership transfer:
```

For HamClock work also read the
[experience revision plan](../requirements/PROPSPHERE-HAMCLOCK-EXPERIENCE-REVISION-PLAN.md).
For every test, distinguish a fresh visitor from an already configured operator
and distinguish isolated UI evidence from authenticated or cross-device evidence.

## HamClock display regression

Confirm the shared server is running and serves the checkout you need
(`npm run dev:session -- status`, then the identity endpoint check above). If
it does not serve your branch, ask its owner or the orchestrator rather than
starting a second one.

```sh
node scripts/check-hamclock-display.mjs http://127.0.0.1:5173
```

The script refuses a non-loopback, unmanaged, connected-profile, or different-root
server. It creates fresh Playwright contexts, marks welcome/onboarding/setup complete
inside those contexts, seeds a synthetic station, intercepts spot responses, and
exercises synthetic IndexedDB contacts and operating reports. It does not use a
personal browser profile, authenticate, modify `.env`, or connect/tune hardware.
It checks Flat/3D/AZ, local text size up to 250%, panel selection/reset/overflow,
Activity filters, Observatory, and companion log/radio updates. JSON results and
screenshots are written under ignored `tmp/hamclock-check/`. Treat these as UI
checks; repeat signed-in and physical-monitor checks separately.

The fixture resolves the application's already-loaded Vite module URLs before
seeding stores. After hot updates, importing an unversioned store URL can create a
second module instance that differs from the UI's timestamped import. Do not mistake
that fixture mismatch for a layout reset or restart the shared server to fix it.

Never stop the shared server after this check — it is not yours. The script
closes its own disposable browsers and leaves server ownership untouched.

Focused regression command (Node 26 currently needs the Web Storage flag so Vitest
uses the configured DOM storage implementation):

```sh
NODE_OPTIONS=--no-experimental-webstorage npx vitest run src/lib/hamclock src/lib/map/filterMapSpots.test.ts src/hooks/useGridActivityMap.test.ts src/components/map/lib/flatMapScene.test.ts src/components/map/lib/flatMufRaster.test.ts src/components/map/lib/flatMapLayout.test.ts src/stores/hamclockStore.test.ts src/stores/hamclockDisplayStore.test.ts src/stores/mapStore.hamclockBeauty.test.ts src/components/map/hamclock
```

## HamClock map fidelity regression

`node scripts/check-hamclock-display.mjs <shared-server-url>` also checks a 4K
intercontinental home view, both complete world edges (including Japan/Australia),
and bounded retained-surface repaints during wheel gestures. Camera geometry and
paint counts are in `tmp/hamclock-check/functional.json`; screenshots include
`home-context-4k.png` and `world-context-4k.png`. The diagnostic camera describes
the committed image; CSS transforms preview a gesture until its final repaint.

After a production build, run `node scripts/check-tile-cache.mjs`. This evaluates
the generated worker's route registrations: public Esri/OSM tiles use bounded
30-day CacheFirst caches; authenticated HD proxy tiles use NetworkOnly so the
browser honors the endpoint's private one-hour HTTP cache and `Vary: Authorization`.
A general API route must not capture `/api/tiles/` first. Token refresh may require
new private requests; no offline or cross-session HD entitlement is promised.
Both paths also reuse the decoded tile LRU. Local dev has HTTP/memory caching;
persistent public Workbox caches require a controlling production worker.

For performance comparisons, keep viewport, DPR, layer selection, initial camera,
provider and cold/warm cache state fixed. Record other concurrent workloads.
Headless timing is diagnostic evidence, not a physical-display frame-rate promise.
On a cold Vite dependency cache, allow optimization/reloads to finish before
injecting store fixtures; a destroyed execution context at startup needs a stable
reload, not another dev server.
