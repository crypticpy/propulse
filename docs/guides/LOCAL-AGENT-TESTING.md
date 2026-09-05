# Local testing and agent server coordination

Last updated: 2026-09-04

Read this before starting, restarting, or borrowing a local ProPulse server.
Several agents and other projects use this machine. A responding port is not
proof that it serves your checkout. A second server in the same checkout does
not isolate source edits: both receive those edits through HMR.

## Quick start

From the checkout/worktree root, inspect managed sessions and actual listeners:

```sh
npm run dev:session -- status
lsof -nP -iTCP -sTCP:LISTEN
```

Reuse a compatible server only after checking its checkout, testing profile,
and owner handoff. For an independent UI test session:

```sh
npm run dev:session -- start --owner hamclock-refinement --task "HamClock scaling and panels" --profile local
```

The command claims a free port from 5180–5199, binds to **127.0.0.1**, and prints
an identity record when ready. Keep the foreground terminal/tool session alive.
Open the exact printed URL followed by `/map` for PropSphere or `/solar` for
SolarPulse. Select HamClock through the shared layout selector on `/map`.

Use `--port 5182` when a stable origin is needed; an occupied or claimed port
fails instead of silently moving to the next one. Install dependencies with the
repository's normal workflow only if they are missing; coordinate installs in a
shared checkout because they affect every server there.

Verify a managed server before using it:

```sh
curl --fail --silent http://127.0.0.1:5182/__propulse_dev_session
```

Substitute the port that was actually allocated. Compare `root`, `owner`, `task`,
`profile`, and `id` to the handoff. `status` reports a live PID as
`running-or-starting`; only the ready output and matching HTTP identity confirm
the server is usable. No credentials belong in owner/task text or the registry.

## Ownership and isolation rules

1. Each managed server has one named owner responsible for its foreground session.
   Before starting, inspect the registry; do not create a fresh server every time
   you resume a task. The helper refuses an already registered live session with
   the same checkout, owner, task, and profile. Borrowers record the owner and do
   not restart it. Still coordinate simultaneous launches: the port claim is
   atomic, but the duplicate-task check is advisory rather than a task lock.
2. Different source changes require separate worktrees/checkouts. Different
   browser scenarios on the same source can share a server with isolated browser
   contexts. Separate ports provide separate browser origins, not code isolation.
3. Use separate browser profiles/contexts for independent fixtures. Tabs on the
   same origin share localStorage, IndexedDB, auth, and some cross-tab events.
   Two-window synchronization tests deliberately share the required origin/context.
4. Use the exact host consistently. `localhost`, `127.0.0.1`, and `::1` are not
   interchangeable browser origins. IPv4 and IPv6 listeners can even serve
   different applications on the same port number.
5. Stop your managed session using Ctrl-C in its owning terminal, or the tool's
   interrupt for that exact session. The helper closes its Vite instance and
   releases its claim. Do not use `pkill node`, `killall`, broad Vite process
   matches, or kill a PID merely because it occupies the port you wanted.
6. Do not start the bridge, daemon, collector, or hardware detection for map-only
   testing. Those services have their own shared ports and hardware state. Radio
   tests need a separate explicit ownership handoff for those services.
7. For performance captures, record other active dev servers and browser windows.
   Coordinate with their owners to pause load if necessary; do not close them
   yourself. Capture cold/warm measurements at the same quality and traffic state.

The per-user registry lives in the OS temporary directory printed by `status`.
It is shared across worktrees and checkouts using this helper. Exclusive claim
files prevent simultaneous allocation of the same port. Both loopback address
families are checked, and Vite `strictPort` handles a listener appearing after
the initial check. Each port has its own Vite dependency cache under
`node_modules/.vite-sessions/` to avoid connected/local profile cache collisions.
`npm run dev` remains available for manual use but does not register ownership.

The helper deliberately has no takeover/kill command and does not automatically
reclaim stale claims. If an owner crashes, inspect the exact recorded PID, its
command/working directory, the port on both address families, and the identity
endpoint. A reused PID or unreadable record is ambiguous. A designated cleanup
owner may remove the exact stale JSON claim only after verifying the old process
is gone and the port is free, with other agents informed not to start on that
port during cleanup. Otherwise choose a different port. Never delete the whole
registry while sessions may be active.

## Existing unregistered instances on this machine

The initial read-only inventory on 2026-09-04 found ProPulse processes on several
5173–5178 ports, including both IPv4 and IPv6 5173 listeners, across the main
checkout and multiple worktrees. Port 4174 was serving a different project.
These are observations, not permanent assignments. None were stopped or adopted.

Inspect a specific current listener without dumping its environment:

```sh
lsof -nP -iTCP:5173 -sTCP:LISTEN
lsof -a -p <observed-pid> -d cwd -Fn
ps -p <observed-pid> -o pid=,ppid=,etime=,comm=
```

Replace the placeholders with the observed PID. For an unregistered server,
identify its owner and checkout before reuse. Let its owner retire it in favor
of a managed session at a convenient stopping point. Do not infer that all local
Node servers belong to ProPulse.

## Choose the testing profile deliberately

| Profile | Startup | What it establishes |
| --- | --- | --- |
| Connected | `--profile connected` (default) | Existing environment and real login/sync behavior; use an authorized test account/session |
| Local UI | `--profile local` | Empty client Supabase URL/key for this process, using the existing unconfigured-client path; useful for layout and browser fixtures |
| First visit | Either profile, new isolated browser context | Welcome/setup/tour behavior; leave onboarding state untouched |

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
report. A new port is a new origin; a session on 5173 will not automatically
authenticate 5180. Login redirects must support the exact selected origin.

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

| Content | Completion state |
| --- | --- |
| Welcome | `localStorage["propulse-welcome-seen"] === "true"` |
| Radio setup | `radioSetupCompleted` in the persisted `propulse-settings` store |
| PropSphere tour | `localStorage["propulse-onboarding-completed"] === "true"` |
| Login | Supabase auth state, separate from all onboarding flags |

For automated returning-visitor layout tests in a **disposable browser context**,
seed before the first navigation. Merge the settings envelope instead of replacing
other settings or hardcoding its migration version:

```ts
await context.addInitScript(() => {
  localStorage.setItem("propulse-welcome-seen", "true");
  localStorage.setItem("propulse-onboarding-completed", "true");
  const saved = JSON.parse(localStorage.getItem("propulse-settings") ?? "{}");
  localStorage.setItem("propulse-settings", JSON.stringify({
    ...saved,
    state: { ...saved.state, radioSetupCompleted: true },
  }));
});
```

This suppresses first-visit presentation only; it supplies no station, logbook,
auth session, or radio connection. Do not use it in onboarding tests or the user's
regular browser profile. Never use `localStorage.clear()` or wipe IndexedDB to
get past a modal in a borrowed profile. Do not set kiosk/device identity flags
as a shortcut: kiosk changes presentation, and registered display auth is a
different workflow. Use a new context for first-visit coverage.

## Browser test runner

The SolarPulse Playwright configuration starts its own managed **local** server,
requires an unused exact port, and refuses to reuse an unknown listener. Because
4174 is the historical default and may be occupied, choose a verified free port:

```sh
PROPULSE_E2E_PORT=5195 npm run test:solar:browser
```

Do not pre-start that server: Playwright owns startup/cleanup. For simultaneous
runs choose distinct ports **and worktrees** (test output files otherwise collide).
The runner sends SIGTERM with a five-second grace period so the helper can release
its claim. A forced kill/crash can still leave a stale record; inspect it using
the ownership rules above rather than assuming the port is reusable.
The existing SolarPulse tests seed returning-visitor state and intercept solar
requests; their results are not evidence of a successful real login or live solar
provider availability. Test runner configuration changes should not affect another
agent's foreground dev server.

## Handoff block for another agent

```text
Task and next check:
Checkout/worktree (absolute path), branch/revision, relevant uncommitted changes:
Server owner and managed session ID:
Exact origin and route:
Profile: connected / local; data: live / fixture (which one):
Foreground terminal/tool session ID; who will stop it:
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

Use an isolated checkout when another task is editing the application. Run the
managed server in a foreground terminal, keeping the returned ID, owner, root, and
URL in the handoff:

```sh
npm run dev:session -- status
npm run dev:session -- start --owner hamclock-review --task display-regression --profile local
```

From **that same checkout**, substitute the printed URL:

```sh
node scripts/check-hamclock-display.mjs http://127.0.0.1:5180
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
that fixture mismatch for a layout reset or restart another owner's server to fix it.

Stop only your own foreground server with Ctrl-C after the check, then verify its
registry entry was released. The script closes its disposable browsers and leaves
server ownership with the terminal that started it.

Focused regression command (Node 26 currently needs the Web Storage flag so Vitest
uses the configured DOM storage implementation):

```sh
NODE_OPTIONS=--no-experimental-webstorage npx vitest run src/lib/hamclock src/lib/map/filterMapSpots.test.ts src/hooks/useGridActivityMap.test.ts src/components/map/lib/flatMapScene.test.ts src/components/map/lib/flatMufRaster.test.ts src/components/map/lib/flatMapLayout.test.ts src/stores/hamclockStore.test.ts src/stores/hamclockDisplayStore.test.ts src/stores/mapStore.hamclockBeauty.test.ts src/components/map/hamclock
```

## HamClock map fidelity regression

`node scripts/check-hamclock-display.mjs <managed-local-url>` also checks a 4K
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
