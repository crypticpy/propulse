# HamClock operating views delivery plan

Updated: 2026-09-07. Owner direction: finish operating views, spots, activations,
and related controls before weather. This plan updates delivery priority; the
[wall specification](../designs/hamclock-wall-spec.md) and
[tile system](../guides/hamclock-tile-system.md) retain their product contracts.

Tracking: [ProPulse Delivery](https://github.com/users/crypticpy/projects/4),
[umbrella #213](https://github.com/crypticpy/propulse/issues/213).
Issue ownership and project fields are the live claim record. Queue order is
not a claim. Do not reserve all batches for one agent.

## Ownership and coordination

| Lane | Responsibility | Boundary |
| --- | --- | --- |
| Codex / HamClock operating views | Current work: review and dependency follow-up; #524 band-history correction and #527 contact-sync metadata are published. Operating batches #285–#289, B24/#232, B18 and B10/#206 are in review; B11 awaits B10 merge | One active implementation item; retain review and acceptance follow-up |
| Existing modeling / 3D agent | NowCast training, inference, evaluation, model activation, and 3D globe work, per owner direction | This plan does not assign or change that agent's existing cards |
| Additional contributor | Claim an unclaimed Ready item; B10/#206 is now claimed | Check current board, issue comments, and changed files before starting |
| Weather | Deferred until operating work is complete | Inspect OpenWxGlobe before designing new weather adapters or layers |

Shared-file coordination is required for `wall/tiles/index.ts`, report CSS,
`wall/pages.ts`, `wall/presets.ts`, shared report/chart components, `mapStore`,
spot ingestion contracts, and renderer entry points. Record exact files on the
issue before editing. Independent reports can proceed with isolated worktrees;
serialize edits to shared registry/CSS files or make a small integration PR.

The display lane consumes the existing prediction interfaces. It does not change
model math, training, activation gates, confidence definitions, inference services,
or 3D rendering. Request a narrow interface change through the modeling owner's
issue when needed. Do not equate observed spots with confirmed propagation or
make comparative accuracy claims without evaluation evidence.

## Delivery queue

Order reflects the owner's latest direction, superseding the older sequential
weather-first placement in the batch tracker. Preserve actual data dependencies.

| Order | Work | Readiness / outcome |
| --- | --- | --- |
| 0 | Reconcile tracker; continue #250 acceptance review | Keep merged polish fixes. Review the reports touched by each batch and retain a final full matrix; do not mark the epic complete from old screenshots. |
| 1 | [B24 #232](https://github.com/crypticpy/propulse/issues/232): activity, contacts, cluster | Implementation in review: #407 contacts, #408 history API, #409 activity, #410 cluster. Acceptance remains pending. |
| 2 | [#286](https://github.com/crypticpy/propulse/issues/286): shared click-to-tune | Existing rig path first, frequency and mode together, visible target and truthful disabled reasons. Keep AetherSDR/TCI integration pending its adapter. |
| 3 | [#285](https://github.com/crypticpy/propulse/issues/285): Activations | Start with existing POTA/SOTA contracts; add WWFF/WWBOTA/CanParks in separately verified source slices. Use the shared tuning affordance. Whole issue stays open until all accepted programmes are handled. |
| 4 | [#287](https://github.com/crypticpy/propulse/issues/287): PSK Reporter and WSJT-X | OF/BY station activity, decode report, CQ emphasis, freshness, disconnected states. Shared tuning and age-window contract are prerequisites for their integrations. |
| 4a | [#288](https://github.com/crypticpy/propulse/issues/288): spot density, age, paths, glyphs | Split window/filter contract from renderer changes. Coordinate `mapStore` and 3D arcs/glyphs with globe owner. Flat paths must use actual great-circle geometry. Validate performance before raising density defaults. |
| Parallel | [B10 #206](https://github.com/crypticpy/propulse/issues/206): config contract + news | Ready after merged B9. Good independent contributor task. Reuse B0 primitives; inspect what already exists before rebuilding a shell/store. |
| After B10 | [B11 #207](https://github.com/crypticpy/propulse/issues/207): remaining config | Cluster filters, band controls and world clocks first. Weather/alert configuration comes with the later weather phase; retain partial status meanwhile. |
| 5 | [B18 #226](https://github.com/crypticpy/propulse/issues/226): Reliability/Forecast reports | B17 dependency merged. Presentation only; agree on model-output interface with modeling owner. Show unavailable horizons with their actual reason. |
| 6 | [#250](https://github.com/crypticpy/propulse/issues/250) and [#161](https://github.com/crypticpy/propulse/issues/161): final polish and wall validation | Complete theme/resolution/report matrix, live traffic checks, physical readability, sustained operation, and paired-display verification. |
| Last | B12–B16, B22–B23: Earth events / weather / EmComm | Deferred. Sequence and OpenWxGlobe audit below. |

Small adjacent fix [#289](https://github.com/crypticpy/propulse/issues/289), rigctld
port defaults, is available separately after inspecting the bridge configuration.
Do not start hardware services during UI testing.

[#290](https://github.com/crypticpy/propulse/issues/290) belongs with the model
owner for offline reference benchmarking; any optional reliability colour choice
can follow as display work. [B25 #233](https://github.com/crypticpy/propulse/issues/233)
is deferred model research after the weather inputs and panels are ready. Neither
is claimed by this display plan.


## Delivery progress — 2026-09-06

- B24 is **In review**, not Done. PRs [#407](https://github.com/crypticpy/propulse/pull/407), [#408](https://github.com/crypticpy/propulse/pull/408), [#409](https://github.com/crypticpy/propulse/pull/409), and [#410](https://github.com/crypticpy/propulse/pull/410) hold the implementation and evidence. #409 includes session-only current-hour observations, truthful incomplete-history/source states, and canonical band focus. #410 preserves cluster content while opting into whole-row paging on the wall. Each PR stays within 15 files.
- The new history/report endpoint and UI pass app checks; Band Activity has 48 fixture display/state combinations. Cluster checks include populated data, expanded filters/details, paging, pin/unpin, and keyboard focus. Maintainer merge, deployed/authenticated, and physical-display acceptance are still pending; these are not inferred from local fixtures.
- #286 is in review; Codex retains the outstanding integration and acceptance follow-up. PR [#411](https://github.com/crypticpy/propulse/pull/411) provides the shared guarded action, cluster/detail/alert callers and reviewed sequential bridge dispatch. Stacked PR [#412](https://github.com/crypticpy/propulse/pull/412) integrates station and satellite receive controls; [#413](https://github.com/crypticpy/propulse/pull/413) integrates favourites and selected activations with strict frequency parsing. Latest full gates: 367 files / 3,237 tests, lint, build and bundle checks pass. Evidence lives in each implementation branch under `docs/designs/hamclock-*tuning*.md`. Remaining: combine the B24 reports with tuning, add wall activation/decode actions with their data work, and validate physical/deployed behaviour. AetherSDR remains dependent on its actual adapter. Review ownership remains with Codex; none of these PRs has been merged by the contributor.
- #285 is in review; Codex retains review and production/physical acceptance follow-up. The aggregate already supports POTA, SOTA and WWFF. PR [#414](https://github.com/crypticpy/propulse/pull/414) records independent provider retrieval times; PR [#415](https://github.com/crypticpy/propulse/pull/415) adds the activations tile and programme report, per-feed empty/failure states, whole rows, pinning and explicit tuning. Full gates pass: 369 files / 3,244 tests, lint, build and bundle budgets; 18 programme/theme/resolution browser cases plus tuning and focus checks. PR [#416](https://github.com/crypticpy/propulse/pull/416) adds verified WWBOTA; [#417](https://github.com/crypticpy/propulse/pull/417) adds CANParks expiry and imported-source provenance; [#418](https://github.com/crypticpy/propulse/pull/418) adds existing-layout migration, selected-card expiry/precision/provenance and compact tab sizing. Latest full gates: 369 files / 3,259 tests; local browser evidence covers all 30 programme/theme/resolution combinations, tuning/pin/focus, cached and selected-card expiry, v5 migration and narrow compact tabs. Required production rendering before merge remains pending. Physical/deployed acceptance remains pending. Claim and shared-file boundaries: [issue comment](https://github.com/crypticpy/propulse/issues/285#issuecomment-5562670949).
- #287 is in review. [#419](https://github.com/crypticpy/propulse/pull/419) captures per-instance decode-time dial context; [#420](https://github.com/crypticpy/propulse/pull/420) adds lossless ingestion and correct frequency/date consumers; [#421](https://github.com/crypticpy/propulse/pull/421) adds the WSJT-X wall surfaces and guarded dial tuning; [#422](https://github.com/crypticpy/propulse/pull/422) adds the callsign-specific PSK source; [#423](https://github.com/crypticpy/propulse/pull/423) adds PSK wall views and controls; [#424](https://github.com/crypticpy/propulse/pull/424) adds WSJT-X heard-by evidence with independent source state, shared band/window controls, preserved OF/BY selection and stable dialog/pin identity. Latest required verification passes: 380 frontend files / 3,309 tests, Python preregistration/archive suites, lint, 27 bridge tests, daemon tests, build and bundle budgets. Browser evidence covers 36 WSJT-X, 78 PSK and 48 heard-by cases across 1080p/4K; see each branch's `docs/designs/hamclock-*` evidence. Retain review and deployed/physical acceptance follow-up.
- #422's quota/capacity/parser reviews are addressed in `b8896ccb`: one service-role-only Postgres gate/cache coordinates callers and server instances, parsing retains at most 1,000 report objects, and missing coordination fails closed. Isolated PostgreSQL verification covers permissions, reuse, cooldown, fencing, capacity, migration reapplication and ten concurrent callers with exactly one grant. The production cache migration and server-only credentials are **not applied/configured by this work** and remain explicit maintainer deployment prerequisites. #423's ascending migrations include direct-v6/v7 custom-layout coverage (`f276b3ff`, 44 store tests).
- #288 remains the sole active Codex implementation claim. [#426](https://github.com/crypticpy/propulse/pull/426) (`d1c52246`, six files, stacked on #424) implements true great-circle flat spot paths and circle=TX/square=RX endpoints for normal, hovered and selected paths; `drawCallsignLabels` is unchanged. Full required checks pass: 381 frontend files / 3,320 tests, Python suites, lint, bridge/daemon tests, builds and bundle budgets. Six theme/resolution cases plus world/hover checks passed. Evidence is in `docs/designs/hamclock-flat-spot-paths.md` on that branch. Geometry-only cache timings do not replace complete-render/physical performance acceptance.
- [#452](https://github.com/crypticpy/propulse/pull/452) (`69d0e8da`, ten files, stacked on #426) implements a 150 spot default and Settings → Spots cap controls (10/50/100/150/200), preserves intermediate desktop values, and normalizes invalid/fractional caps. Full required verification passes: 382 frontend files / 3,329 tests plus Python, lint, bridge/daemon, builds and bundle budgets. Nine theme/resolution cases and all five choices verify actual rendering, fit, 44px controls and keyboard/focus. Headless flat live-paint measurements support the bounded choice but do not prove physical/3D performance. Evidence: `docs/designs/hamclock-spot-density.md` on that branch. #426's polar review is fixed in `3b26e841`, with six extra regression cases and resolved review thread.
- [#469](https://github.com/crypticpy/propulse/pull/469) (`1b04cdfb`, six files, stacked on #452) separates requested 15/30/60-minute stored-feed history from the 30-minute freshness threshold. All three API routes validate windows, retain historical rows with stale state and original timestamps, exclude future/out-of-window rows, and keep bounded storage requests. Full required checks pass: 382 frontend files / 3,343 tests plus Python, lint, bridge/daemon, builds and budgets; 24 focused API tests pass. The existing two-hour retention migration must already be deployed; no migration was applied. Evidence/consumer contract: `docs/designs/hamclock-spot-age-source.md` on the branch.
- [#470](https://github.com/crypticpy/propulse/pull/470) (`95e510aa`, six files, stacked on corrected #469) adds browser feed APIs retaining source state, original timestamps, freshness duration and declared window. Explicit history requests require server confirmation; legacy arrays remain supported with unknown metadata. Invalid DX times cannot become current observations. Full required checks pass: 383 frontend files / 3,375 tests plus Python, lint, bridge/daemon, builds and budgets; 43 focused client tests pass. #469's review fixes in `c5275752` retain a 30-minute freshness lookback for 15-minute selections and exclude future rows before storage limiting; both review threads resolved (26 focused API tests).
- [#471](https://github.com/crypticpy/propulse/pull/471) (`fc715410`, 13 files, stacked on #470) delivers persisted map age 15/30/60, explicit history requests, ten-second cached expiry and immediate new-arrival eligibility, source freshness states and trace-window identity. Full required verification: 384 frontend files / 3,382 tests, bridge/daemon, Python, lint, builds and budgets; 27 focused tests and 27 isolated browser theme/resolution/window cases through 4K, plus stale/unavailable/expiry checks, all passed. Evidence: `docs/designs/hamclock-spot-age-map.md`. Owned server stopped. #470 CSV/date/frequency review correction is in `c2f98813` (45 focused tests, full 383/3,377), thread resolved.
- [#472](https://github.com/crypticpy/propulse/pull/472) (`9bb90127`, 15 files, stacked on corrected #471) coordinates personal PSK report/map direction, band and all five windows, with explicit global/personal scope, real TX/RX locator paths, clock expiry and public-assistance restrictions. SHOW ON MAP preserves contacts from Contacts-only display. Full required verification passed: 386 frontend files / 3,392 tests plus Python, bridge/daemon, lint, builds and budgets; 27 focused tests and 60 browser theme/resolution/direction/window cases through 4K. No filter-triggered requests after initial development mounting, zero page errors; server stopped. Evidence: `docs/designs/hamclock-psk-map.md`. #471 Spectrum Ring-only Settings status correction is in `9e5c7dd8` (384/3,383 full app tests), review thread resolved and merged into #472.
- [#473](https://github.com/crypticpy/propulse/pull/473) (`feca89c6`, nine files, stacked on #472) adds DX-only 120-minute source/client history with matching metadata confirmation, unchanged freshness/bounds and unchanged PSK/RBN/map windows. Full required verification passed: 386 app files / 3,397 tests plus Python, bridge/daemon, lint, builds and budgets; 63 focused source/client tests. Existing two-hour retention remains a deployment prerequisite; no migration applied. Evidence: `docs/designs/hamclock-cluster-history.md`. #472's incorrect coordinate review assertion was checked against the implementation and four passing geometry-conversion tests, answered with the EM38 longitude calculation, and resolved without code changes.
- [#474](https://github.com/crypticpy/propulse/pull/474) (`eb3d8216`, 15 files, stacked on #473) locally integrates #410's Cluster report into the operating-view stack, preserving newer row observation and activation/PSK/WSJT-X styles. Full required verification: 388 app files / 3,404 tests plus Python, bridge/daemon, lint, builds and budgets; 12 focused tests and 13 browser scenarios through 4K, no overflow/page errors. Paging/keyboard/pin/focus and PSK map action verified together; evidence updated in `docs/designs/hamclock-cluster-evidence.md`. Owned server stopped; GitHub PRs remain open. Fixed-pixel Cluster typography remains B11/#250 work, and physical/deployed acceptance stays pending.
- [#475](https://github.com/crypticpy/propulse/pull/475) (`5b910f6b`, 13 files, stacked on #474) wires list history, metadata, valid-empty clearing, cached failure state and clock expiry, with original source times and passive tile/report status. Protects default snapshots and live bridge state from disabled/external/new empty observers. Full required verification: 389 app files / 3,416 tests plus Python, bridge/daemon, lint, builds and budgets; 16 focused tests and 30 browser age/theme/resolution cases through 4K plus error/empty/expiry cases, zero page errors. Server stopped; evidence `docs/designs/hamclock-cluster-feed.md`. Typography and deployed/physical acceptance remain separate.
- [#478](https://github.com/crypticpy/propulse/pull/478) (`994cfabc`, six files, stacked on #475) fixes reproduced batched-message loss and new-observer history replacement through direct transport ingestion and atomic shared merging. Validates reports, deduplicates broadcasts, bounds retention, and guards stale REST publication. Full required verification passed: 391 app files / 3,420 tests plus Python, bridge/daemon, lint, builds and budgets; 16 focused tests. Unmodified browser transport with intercepted sockets retained four reports across burst/new-observer/duplicate/invalid cases, zero page errors; owned server stopped. Evidence `docs/designs/hamclock-cluster-ingestion.md`. Addresses the #475 shared-history review finding in the follow-up stack.
- #288 operating-view implementation is in review. Remaining 3D glyph/renderer integration belongs to the existing globe owner; sustained real traffic, deployed retention and physical 4K readability remain acceptance follow-ups, not completed claims. Next independent candidate is B10/#206 (widget configuration/news), currently unassigned on issue audit; recheck board and claim narrowly before editing. Weather remains last.
- All later queue entries remain available to contributors according to their live issue/board status. Weather remains last; model and 3D boundaries remain unchanged.

## First batch: B24 / #232

Use branch `feat/hamclock-b24-codex` in its own worktree. Own HW-70, HW-71,
HW-72 for this batch only. Deliver at most 15 changed files per PR; do not close
#232 until all three register entries and acceptance checks are satisfied.

1. **Recent Contacts (HW-71).** Add a centered report and tile entry point. Compute
   today/week/month counts, unique DXCC, best DX, top band/mode and a 30-day daily
   chart from canonical logged contacts. Define date boundaries, count unique
   stable identities, preserve missing-location states, and make day selection
   refill the facts. Retain existing log scope semantics; report empty/loading/
   failed data honestly. Do not edit QSOs or change log storage writers.
2. **Band Activity (HW-70).** Audit available history, then build BANDS / TOP DX,
   mode split, source coverage, furthest spot and map-focus interactions. Spec
   §26.14 calls for `api/spots/band-history` over `band_hourly_stats` plus current
   live counts. The live window is only two hours and a session trend is not six
   hours of history. Inspect the aggregate schema and scope/mode/source fidelity
   before choosing response fields. Missing buckets are gaps, never invented
   observations. Add the narrow read endpoint if needed; coordinate any collector
   or database change separately with the model/data owner. Do not rebuild ingestion.
3. **Cluster chrome (HW-72).** Adopt the WallReport title, pin, footer and focus
   return without changing cluster data/filter semantics or the existing list
   layout. Add shared tuning later under #286.

Expected first-slice files: `wall/reports/RecentContactsReport.tsx`, its tests,
`wall/tiles/RecentContactsTile.tsx`, `src/lib/hamclock/recentContacts.ts` and tests,
tile registry only if required, and additive report CSS only if existing classes
cannot express the approved layout. Record the final file set on #232 before edits.

B24's old issue brief understates the history API work and refers to earlier
activity presentation. Read the later dedicated report contract (§26.14–26.16)
alongside the brief. Band Activity represents observed activity and does not
need an engine comparison strip, as §26.14 specifies.

## Spot and activation data decisions

- Share one age-window contract across the list, map and PSK report. Implement
  15/30/60 minutes against supported retention first. Six-hour/24-hour choices
  require a verified aggregate or public-source adapter; no empty promises in UI.
- Preserve source identities: public reports, own receiver decodes and logged
  contacts are different evidence. Keep worked/needed and station scope intact.
- The Tune control names the target frequency, checks connection state, and uses
  the existing command path. Follow radio remains observation-only. A user action
  may tune; selecting a filter or receiving a cross-window update must not tune.
- New activation sources need source timestamps, rate limits, cache policy,
  parser fixtures and explicit failure states before the programme is marked live.
- #288 spans ownership boundaries. Its data/filter work can be a display-lane
  subtask; 3D implementation requires a file-level handoff from the globe owner.

## Deferred weather and OpenWxGlobe reuse

Source: [crypticpy/openwxglobe](https://github.com/crypticpy/openwxglobe), audited
at [`17bb7a04e72b15c608f3b1ed99144f6fcd817247`](https://github.com/crypticpy/openwxglobe/commit/17bb7a04e72b15c608f3b1ed99144f6fcd817247).
The repository is private; contributors need owner-granted access. See the
[reuse audit and reproducible checkout instructions](hamclock-openwx-reuse-audit.md)
for verified candidate paths, license and compatibility limits. The local
inspection path was `/Users/crypticpy/Projects/OpenWeather/openwxglobe`; it is
not required on another machine. The root license is Apache-2.0. This source
audit does not establish completed adapter or live-provider compatibility.

Inspect these when weather reaches the front of the queue:

- `packages/layer-registry`: layer manifests, coverage, units and provenance.
- `apps/api/src/openwx_api/services`: published observations, satellite transport,
  numeric tiles, CO-OPS currents and point briefings.
- `apps/web/src/globe` and layer components: time/selection handling and overlays;
  coordinate renderer integration with the 3D owner.
- Existing source fixtures and data-quality tests; retain applicable license,
  notices and provider attribution in any copied/adapted code.

Prefer small adapters or pure utilities that fit ProPulse's React/Three/Vercel
contracts. Do not copy the other application's backend/deployment architecture
wholesale. Do not modify its working tree or services for this task.

Later order: B12 Earth events; B13 weather tiles/config; B22 forecast fetch and
Weather/Alerts reports; B14 radar/lightning reports; B15 2D/3D layer parity;
B16 EmComm; B23 RIM/regions; `/atmos` retirement only after complete parity.
Resolve overlap before claiming: B22 owns HW-41 weather report, B23 owns HW-47
regions, and B13 owns weather configuration while B11 supplies its shared contract.
Separate B16's EmComm work from route retirement so the B23 region dependency
does not create a circular gate. B25 is last and remains model-owner work.

## Claim, verification and handoff procedure

1. Read this plan, the batch issue, wall spec and tile guide. Check the live board,
   issue comments and open PRs. Ready means dependencies are merged, not reserved.
2. Claim one item: Agent, assignee, Status=Claimed, plus an issue comment naming
   scope, exact branch/worktree and shared-file boundaries. Re-read to confirm no
   competing claim. Move to In progress when implementation starts.
3. Work from current `origin/main` in an isolated worktree. Never reset or copy the
   dirty primary checkout into the task. Keep each implementation PR ≤15 files.
4. Use existing `--hc-*`/`--hcr-*` tokens, ≥44px actions, centered dialogs, no hover
   menus and no internal tile/report scrolling. Follow visible-row fitting and
   accessible table twins. Preserve focus, pin, units and source-age behavior.
5. Run focused tests for computations, source gaps, interactions and scope, then
   required repository lint/build/verification gates. Do not relax budgets or
   quality rules. Documentation-only PRs use the existing documentation gate.
6. Follow [Local agent testing](../guides/LOCAL-AGENT-TESTING.md). Record managed
   server owner/session, worktree, exact URL and disposable browser context.
   Validate wall and desk, 1080p and 4K, all three themes, keyboard/focus, populated,
   sparse, empty, stale and disconnected states. Record fixture versus live data.
7. Capture before/after evidence for affected reports, then review the intended
   deployed revision. Physical TV review and real cross-device/radio validation
   remain explicit pending checks until performed. Never claim those from fixtures.
8. Open a PR with issue/HW IDs and evidence; set In review. Partial slices use
   `Refs #232`, not `Closes #232`. Update only completed feature-register rows and
   tracker counts with evidence. Follow repository maintainer merge policy.
9. While a reviewable batch awaits maintainer merge or external acceptance, keep
   it In review and retain its follow-up ownership. The next independent Ready
   item may become the sole active implementation claim; do not reserve the
   remaining queue. After merge, reconcile register and board with actual
   acceptance evidence. A paused task records remaining work and ownership.

## Initial tracking reconciliation

Snapshot verified from GitHub on 2026-09-06:

- #203 (B7) and #248 are closed but board Status was Ready: set Done.
- #225/B17 is delivered by #246; umbrella #213 still called it In review.
- #248 fixes landed via #258 and #282; #213 still had an unchecked historical row.
- #250 remains open: #262, #264, #267, #269, #270 and #272 are merged polish work,
  not remaining implementation. Do not close until its complete review is recorded.
- #252 remains open despite later footer work in #282. Review its diff before
  closing as superseded; this plan does not assume every hunk is redundant.
- B10, B18 and B24 have merged prerequisites. Promote readiness without claiming
  all three. B24 is the sole initial Codex implementation claim.
- Add missing status/workstream/priority/Unclaimed fields to #285–#289. Leave
  modeling-owned cards and existing active work untouched.

Plan worktree: `.worktrees/hamclock-delivery-plan`, branch
`docs/hamclock-delivery-plan`. Implementation worktree:
`.worktrees/hamclock-b24-codex`, branch `feat/hamclock-b24-codex`.
No application server or hardware service is started by the planning pass.


## B10 active handoff

B10/#206 is the sole In progress implementation claim (Codex, crypticpy),
following the #288 review handoff. Worktree `.worktrees/hamclock-b10-codex`,
branch `feat/hamclock-b10-codex`, starts at current `origin/main` 19b75c8b.
The B0 validated widget store and registry contract already exist. Reuse them;
wrap existing feedStore preferences rather than duplicating feed state.

Implement server verification through `api/_lib/handlers/rssFeed.ts` with its
existing URL/redirect/body controls, then the centered config shell/news panel,
source fetch interval/status/refresh controls, verify-before-add and category
pagination. The ticker already has alert/news settings: preserve alert controls
while providing the wall news configuration entry. Keep each PR within 15 files;
other reports/settings, model/3D and ticker rendering remain outside this batch.
Full verify and theme/resolution/browser acceptance precede review handoff.

Initial source slice adds `verify=1` returning parsed title and bounded item
count, accepts titled empty feeds, rejects HTML/untitled documents and retains
SSRF checks. Focused handler tests pass; the complete B10 UI remains in progress.


B10 acceptance review found the legacy combined dialog still exposed an
unverified add-feed form. The UI now routes additions to the verified dialog,
retaining existing-feed and alert controls. Unit regressions and a second
30-case browser matrix (including legacy handoff/focus restoration) pass.
The owned server is stopped and its claim released. Server verification is
published separately as [#479](https://github.com/crypticpy/propulse/pull/479),
`c158c0a5`, two files, with full checks passing (364 app files / 3,205 tests).
The UI branch locally incorporates that prerequisite and will target it, leaving
room for register updates under the 15-file cap. B10 remains the sole active
implementation claim until its full UI review handoff; no other batch is reserved.


B10 review handoff: [#480](https://github.com/crypticpy/propulse/pull/480) targets
[#479](https://github.com/crypticpy/propulse/pull/479), with 14 UI/register/evidence
files against the prerequisite. Final UI verification passes: 365 app files /
3,211 tests plus every required gate. Both 30-case browser matrices pass through
4K, including the legacy bypass fix and focus restoration. Board #206 is In
review, with review follow-up ownership retained. No batch is currently in active
implementation; recheck Ready status for B11/#207's nonweather configuration or
B18/#226 presentation before claiming the next one. Weather remains last.


B10 review corrections are published: server #479 e8e09970 rejects HTML with
feed-like text and keeps verification failures uncached; UI #480 587641d2 routes
Home additions through verification and preserves a valid tab after page removal.
All six original review threads are answered/resolved with regression evidence.
Final full UI checks: 365 app files / 3,214 tests; real-component browser harness
verifies Home add/active selection, page recovery and focus, without bypassing
Home's sign-in gate. Server stopped. The UI PR is now 15 files against #479.
B11/#207 remains Backlog on the latest board audit; B18/#226 is Ready/unclaimed
and is the next candidate after a fresh ownership check. No new claim yet.


## B18 active implementation

Fresh board audit: B18/#226 Ready and unclaimed; now the sole In progress claim
(Codex, crypticpy). Branch `feat/hamclock-b18-codex`, worktree
`.worktrees/hamclock-b18-codex`, starts from origin/main 19b75c8b.

Scope: Reliability NOW/BY HOUR and Propagation MATRIX/HORIZONS reports, accessible
matrix twins, engine comparison, explicit off/stale reasons and source metadata.
No model maths, activation/capability gates, station calibration or 3D edits.
The existing NowCast hook already returns full prediction objects, including
factors/flags/freshness/version, so presentation can consume them directly.
The wall physics adapter retains full cells but lacked their station context;
initial change exposes exact power/pattern/gain/noise/threshold/path inputs and
the oldest solar observation timestamp. Three adapter regressions pass.

The existing matrix spans two UTC calendar days, and path-specific cells are
empty without a target. Regional evidence comes through separate band interfaces.
Audit source scope/time before combining charts: current predictions and spot
counts must not become fabricated historical series, and relative physics scores
must not be described as calibrated QSO probabilities. Show missing model/history
interfaces explicitly and record owner dependencies. Keep every PR ≤15 files,
with separate prerequisites if needed. Weather remains last.

### B18 Reliability review slice — PR #494

[PR #494](https://github.com/crypticpy/propulse/pull/494) implements the dedicated
Reliability report on `feat/hamclock-b18-codex` (15 files against main). The full
pre-push verification passed, including 3,209 application tests, bridge/daemon
checks, lint, build and bundle budgets. The wall suite passed 318 tests; the
browser matrix passed 24 target/QTH × theme × resolution × tab cases with
populated scoped counts, grid selection and focus return.

HW-58 remains partial: the supplied contracts have no historical model/observed
series and no hop count. The report explicitly shows those gaps. Model evidence
is gated and matched to station/path/mode/time; unavailable models are not
counted as disagreement. No reliability mathematics or model gates changed.

B18/#226 stays the sole active implementation claim while the Forecast slice is
built in `.worktrees/hamclock-b18-forecast`, branch
`feat/hamclock-b18-forecast`, stacked on Reliability. It retains all four horizon
rows and the complete two-day matrix. The new presentation adapter rebuilds
future-time request features and respects the existing service capability gates;
it does not activate FutureCast. Forecast verification and PR remain pending.

### User-requested masthead and Settings follow-up — PR #498

[PR #498](https://github.com/crypticpy/propulse/pull/498), branch
`feat/hamclock-masthead-controls`, responds to the user's direct follow-up:
zone labels beside clock digits; mode/projection controls in Settings; globe
auto-rotate and speed exposed; compact Settings/layer category navigation.
This supersedes the earlier B1 requirement to keep mode/projection in the
masthead. It is a separate 15-file review slice; B18 remains the only claimed
batch and resumes with Forecast.

Full pre-push verification passed (3,205 app tests, bridge/daemon, lint,
build and budgets), as did 40 focused tests, 117 browser layout cases and
interaction checks for the new controls and keyboard/focus behavior.

User-facing preview is intentionally left running: owner
`hamclock-masthead-controls`, task `Verify clock labels and settings view controls`,
profile `local`, worktree `.worktrees/hamclock-masthead-controls`, URL
`http://127.0.0.1:5182/map`, session id
`823382be-4652-4c34-9101-4b35f034a643`, PID 76440 (tool session 8045).
Verify identity before using it; do not replace or stop it while the user may be
reviewing the shared preview.


### B18 Forecast review slice — PR #502

[PR #502](https://github.com/crypticpy/propulse/pull/502), branch
`feat/hamclock-b18-forecast`, is stacked on Reliability PR #494. Its 14 files
cover the two-UTC-day chart, 288-value matrix with day selection, all four gated
FutureCast rows, the best-in-six-hours summary and selected NOAA Kp forecast
bucket. Capability/runtime gates, modeling mathematics and 3D internals remain
unchanged. Review found a missing FutureCast serving contract; both feature registers now
keep HW-59 partial. HW-58 also remains partial for source history and hop-count
contracts. See the correction below.

Full pre-push verification passed: 3,219 app tests in 368 files, Python/archive,
bridge/daemon, lint, production build and bundle budgets. The required wall suite
passed 328 tests. Final browser checks passed 48 cases covering populated and
model-off horizons, QTH/target, three themes, 1080p/4K, both tabs, all 288 matrix
values, 44px hit targets, dialog size, overflow, selection and focus return.
Fixtures were synthetic and isolated; no live FutureCast release is claimed.

B18 now moves to In review, retaining Codex ownership for feedback. B11/#207 is
still Backlog/unclaimed on the fresh board audit, and B10 PR #480 remains open.
Recheck its readiness before claiming; prioritize operating configuration/world
clocks ahead of its weather portions. Weather remains last. PR #498 review fixes
(aa362a90) also passed verification and all four review threads were resolved;
the user preview above stays running.


### Forecast serving boundary correction and next claim

PR #502 review found that the generic path endpoint selects only NowCast or
physics scorers, regardless of a future valid timestamp. The report must not
label those scores FutureCast. Commit `96fb62ce` removes future-time path
requests and cached future evidence; even advertised horizons stay MODEL OFF
with FUTURECAST SCORER NOT AVAILABLE. A horizon-aware scorer/endpoint and
model/horizon-identifying response contract are an external dependency for the
model owner. HW-59 is partial, not delivered. The regression failed before the
fix and passes afterward; 326 wall tests and 24 advertised-horizon browser
cases pass with zero future-time path requests. Full verification passed with
3,217 app tests plus Python/archive, bridge/daemon, lint, build and budgets; the
review thread is resolved.

The next independently Ready item is #289, now the sole In progress / Codex
claim: `.worktrees/hamclock-rigctld-default`, `fix/hamclock-rigctld-default`, based
on origin/main `0d28c6c0`. The fix covers all radio default call sites, the
settings migration and setup placeholders. Rotator port 4533 remains intact.
Existing settings contain no provenance for an explicit 4533 selection; the
issue's old-default equality migration requires WFView users on that port to
select it again once, as documented. Other custom ports and current-version
explicit 4533 values survive reload. Four isolated browser scenarios and
14 focused radio/settings tests pass; bridge compilation passes. No bridge,
daemon or hardware service was started. PR #503 now contains the 8-file fix
(3bc25dbb), with required targeted pre-push checks passing: 3,221 app tests, lint,
build, bundle budgets and bridge compilation. #289 is In review with Codex
ownership retained for feedback.

B11 remains Backlog pending B10 merge. #250 is already In progress under its
existing report-polish ownership. Weather remains last. The Settings user
preview at 5182 remains running and must be preserved.


Completed UI test sessions have been stopped: Forecast owner
`hamclock-b18-forecast` at 5181 (session 748360b1-0a9e-47f6-8982-ca56e532ecb5)
and rigctld owner `hamclock-rigctld-default` at 5183 (session
5e3fe846-ec96-4a78-80f8-573ca6c073c9). Their own stale registry files were
removed after matching identity, absent PID and free IPv4/IPv6 bind checks.
The user-facing masthead preview at 5182 is still preserved.


### Active spot review follow-up — #288

A full review-thread audit found remaining defects in #417, #418, #474 and
#478. #288 is again the sole In progress / Codex implementation claim. Work is
isolated in `.worktrees/hamclock-spot-review`, branch `fix/hamclock-spot-review`,
based on #478 commit `994cfabc`; the prior activation and cluster integrations
are retained. Review ownership of the other batches is unchanged.

Three reproduced defects are fixed locally: disabled activation consumers no
longer subscribe to clock updates, enabled consumers honor ten-second cadence
beside a one-second clock; renewed activations replace expired selections before
the card is cleared; bridge reports retain the existing one-minute timestamp
allowance through ingestion, rendering and cleanup while REST filtering remains
strict. All 32 focused tests pass, including regressions that failed before the
fixes. No modeling/3D internals or global clock behavior changed.

Next: anchor later cluster pages to report IDs, reconcile selected spots with
the rendered window, and keep keyboard focus on the same report when live rows
are prepended. Then complete browser/full verification and publish the bounded
follow-up. Weather remains after these operating corrections.


### Spot review follow-up published — #505

[#505](https://github.com/crypticpy/propulse/pull/505), commit `86bb6dc3`, is a
14-file follow-up stacked on #478. All activation and bridge corrections above
are included. Later report pages and keyboard focus now track spot IDs; initial
and external selections are revealed, while manual paging remains available.
Regressions reproduce the former failures; 38 focused tests pass. Full required
pre-push verification passed: 392 app test files / 3,429 tests, Python/archive,
bridge/daemon, lint, production build and bundle budgets. Browser fixtures pass
in Pulse, Classic and Brass, including 1080p/4K resize, deep selection, live
prepend, no duplicate Next rows and Escape focus return. No page errors occurred.

#288 returns to In review / Codex. Parent review findings on #417, #418, #474 and
#478 point to this follow-up; the parent PRs require their dependent stack before
acceptance. Evidence: `docs/designs/hamclock-spot-review-corrections.md` on #505.
Owned server 5181 (`hamclock-spot-review`, session
`2072480c-4c38-4bf5-aedb-87ead6d17987`) was stopped. Its stale claim was removed
only after verifying the recorded PID was absent and both loopback binds were
free. User settings preview 5182 remains running.

Fresh full-board audit (107 items): B11/#207, B12/#208 and B13/#209 remain
Backlog/Unclaimed; B10 PR #480 is still open, so B11's prerequisite is not merged.
#250 remains another contributor's report-polish work. Ready modeling and design
system cards are outside this HamClock lane. No additional batch was claimed.
The read-only [Open WX Globe reuse audit](hamclock-openwx-reuse-audit.md) records
specific utility/contracts candidates and their limitations for later weather
work. No Open WX Globe source or services were changed. Weather stays last.


### Reopened shared tuning: missing B24 wall actions

A source-level completion audit found a concrete remaining #286 requirement:
#407's Recent Contacts tile/report and #409's Band Activity report still lack
shared tune controls. Earlier station/satellite/favorites/activation/decode
slices do not satisfy those B24 surfaces. #286 is again the sole In progress /
Codex claim; #288 stays In review. This is actionable independently of B11's
merge dependency.

Current worktree `.worktrees/hamclock-contact-tune`, branch
`feat/hamclock-contact-tune`, starts at #505 (`86bb6dc3`) and locally integrates
#407. Both HW-71 and HW-72 stay Partial, retaining pending deployed/physical
acceptance. The two tracker conflicts are reconciled without discarding either
report's implementation evidence. No GitHub PR was merged.

Contact controls now consume the logged kHz frequency and mode in the shared
TuneButton; last-contact and best-DX report actions plus tile-row actions are
being checked. Fourteen focused history/report tests pass, including exact
frequency/mode staging and invalid-frequency rejection. Browser/full verification
and publication remain in progress. Band Activity is the next separate slice
within #286; adapter-dependent SDR routing still awaits the real adapter.


### Contacts published; Band Activity integration continues

[#509](https://github.com/crypticpy/propulse/pull/509), `d26a19c4`, contains the
13-file contact-report integration and tune controls. Full mandatory checks
passed: 395 app files / 3,442 tests, Python/archive, bridge/daemon, lint, build
and budgets. Fifteen focused tests plus Pulse/Classic/Brass × 1080p/4K report
fixtures pass with no overflow/page errors. The owned contact-test server 5181
was stopped; its claim was removed after absent-PID and both-loopback bind checks.
Preview 5182 remains preserved.

#505 also received a reviewed follow-up, `77ad802e`: the cluster tile applies
bridge clock tolerance consistently with the report, while REST remains strict.
A rendered-tile regression failed before the fix and passes afterward. Full
checks pass (392 app files / 3,430 tests); the review thread is resolved and the
PR remains within 15 files.

#286 remains the sole active claim. Next worktree:
`.worktrees/hamclock-band-history-integration`, branch
`feat/hamclock-band-history-integration`, based on #509. It locally integrates
#408's six-file history API and preserves the newer PSK station route while
resolving the portable-route import conflict. Twenty-five focused history/spot
API tests pass. Integration commit/full checks/publication are ongoing; the
subsequent #409 report integration will add TuneButton to TOP DX rows. No new
batch, model/3D work, hardware service or weather implementation is claimed.


### Band Activity report integration verified locally

[#513](https://github.com/crypticpy/propulse/pull/513) publishes the six-file
history integration (`bc7fcd1d`): 396 app files / 3,454 tests and all mandatory
checks passed. Review follow-up `8c58b956` corrects self-hosting documentation:
stored aggregate history requires its configured source; unavailable history
returns 503 and the client retains separately labeled session samples when live
activity exists. No no-config historical source or credentials are invented.
The review thread is answered/resolved with that explicit boundary.

Current #286 slice: `.worktrees/hamclock-band-tune`, `feat/hamclock-band-tune`,
commit `e97a45b8`, based on #513 with local #409 integration (15 files). It adds
separate map and tune actions to TOP DX, retains exact frequency/mode, and uses
bridge-only clock tolerance. TOP DX now names its home-relative sample, keeps
its own cluster status/timestamp, preserves the selected view when pinned, and
uses the existing list-report layout instead of unrelated activity headlines.
Twenty-eight focused tests and 48 populated browser cases pass (four views,
three themes, 1080p/4K, history success/503). No overflow/page errors; no hardware
connections. Full pre-push verification is currently running before publication.

Owned server 5181 (`hamclock-band-tune`, session
`9b8d1f25-60b2-4e57-b8a8-238898eb9bcc`) was stopped and its claim released after
absent-PID and both-loopback bind checks. User preview 5182 is preserved.

A new #509 review finding remains actionable after this slice: cloud logbook
serializers drop `myGrid` and recorded `dxcc` on push/pull/delta paths. The
20260216000000 migration already defines both columns, but current generated
client types and mappings omit them. Preserve those two metadata fields and
verify round trips before treating cross-device contact statistics as ready.
No sync implementation claim or source edits have started yet; #286 remains
the sole active batch until the Band Activity report is published.


### Operating integration and metadata follow-up published — 2026-09-07

[#524](https://github.com/crypticpy/propulse/pull/524), `e97a45b8`, publishes
the 15-file Band Activity/TOP DX integration. Full mandatory checks passed
(399 app files / 3,471 tests plus Python/archive, bridge/daemon, lint, build
and budgets). #286 is back In review. The 48 browser cases and preview 5182
boundary described above remain valid.

B24/#232 was then claimed narrowly for contact-sync metadata and returned to
In review after publishing [#527](https://github.com/crypticpy/propulse/pull/527),
`45552c51`, five files based on #524. Both cloud serializers now preserve
recorded home grid and DXCC through push/pull/delta/conflict paths; types match
the existing migration. Five transport tests simulate another device and
exercise actual contact statistics, including missing metadata and conflict
recovery. Eighteen focused tests and full mandatory checks pass (400 app files /
3,476 tests). The #509 review thread is resolved. No cloud write or migration
was performed; live two-device acceptance remains pending.

Current review follow-up on #524: `c7f62d57` uses the collector's existing ten
HF band identities for completeness, so complete history/live samples show a
known peak. Missing HF bands remain partial even with duplicate/VHF rows. The
collector is unchanged. Twenty focused history/report tests, TypeScript, lint and full mandatory
pre-push checks pass; the correction is published on #524. This edits existing
files and retains the 15-file PR boundary.

The requested masthead/settings cleanup is already in #498 (`aa362a90`): zone
labels left of clock digits; mode/projection controls under Settings → View;
auto-rotate and its speed control; vertical Settings and Layers navigation.
Its previously recorded full checks and 117 browser cases passed. The owned
preview at http://127.0.0.1:5182/map is preserved.

B10 #480 remains OPEN on the fresh dependency check, so B11 is not claimed.
No implementation batch is currently reserved while the #524 review correction
finishes; model/3D and weather ownership/dependency boundaries remain unchanged.


The fresh board audit confirms #232 and #285–#289 remain In review and
B11–B13 remain unclaimed Backlog. The new Spots & Paths foundation #511 is
claimed by separate session `codex-sp01-20260907-0845` in
`/private/tmp/propulse-sp01-codex`; #514 remains blocked Backlog. Do not treat
the shared Codex agent-family label as permission to take that session's work.
Its #288/#207 integration contracts require coordination when those packages
become Ready. No source ownership was transferred in this audit.


### Portable weather source handoff — 2026-09-07

The #406 review finding about the Mac-only OpenWX path is addressed by a
verified repository URL, exact audited commit and detached-checkout instructions
in the reuse audit. GitHub confirms the commit exists and the repository is
private; contributor access is an explicit prerequisite. Candidate paths were
checked against the pinned tree. No weather implementation is claimed, and no
source was copied or modified. #524's review thread is now resolved after
publication of `c7f62d57` (399 app files / 3,473 tests and all required checks).

### Five-minute report stability check — 2026-09-07

On #524 revision `c7f62d57`, a disposable headless Chromium context kept the
populated Band Activity report open for 302 seconds. Thirty-one samples at
roughly ten-second intervals checked report-container overflow while cycling
TOP DX, BANDS and HISTORY every thirty seconds. TOP DX tune controls remained
disabled with the disconnected bridge state; Escape returned focus to the tile
opener after the run. No overflow assertions or page errors occurred.

Configuration: local profile, Pulse, Flat map, 1920×1080/DPR 1, default text size,
synthetic N0TEST/EM38, thirty synthetic cluster reports, synthetic activity and
stored-history endpoints, no signed-in session. Non-HMR WebSockets were blocked.
Source files were unchanged during the run. Diagnostics recorded one document
throughout, 60.5–90.1 MB sampled JS heap, and 4.85 seconds cumulative browser task
time after measurement began. These are observations from a short local run,
not proof of leak freedom, real-traffic throughput, GPU performance or physical
readability. Other owners' servers at 5182 and 5184 remained running; no attempt
was made to control their load. No sustained-operation acceptance box is closed.

Reproduction artifacts are local and ignored under
`.worktrees/hamclock-band-tune/tmp/band-tune/`: `duration.mjs`,
`duration-result.json`; command `node tmp/band-tune/duration.mjs` from that
checkout. The script validates the exact owned server identity; a new run must
substitute its new verified identity before launch. Log:
`/private/tmp/hc-band-duration-browser.log`.
Server owner `hamclock-band-duration`, session
`2492529c-84da-4228-9be4-c91f64c9fb9f`, origin `http://127.0.0.1:5181`, was stopped
using its own foreground session and its claim released only after the process
was absent and both loopback addresses were free. User preview 5182 is preserved.

Fresh scope audit: B11/#207 still requires B10 #480 to merge; #480 is OPEN.
#250 explicitly assigns the shared/per-report production polish pass to Fable.
#286's SDR target still depends on its actual adapter; no merged AetherSDR/TCI
PR was found in the current audit. B18 retains its documented missing historical
model/observed/hop contracts and FutureCast scorer dependency. These are not
completed by this local report check. Production-rendered activation acceptance,
real radio/WSJT-X operation, deployed PSK cache/retention, authenticated cross-device
sync, and physical/sustained wall validation remain separate external checks.

### Existing-device metadata upgrade fixed — 2026-09-07

Two new #527 review findings required a narrow B24/#232 claim: old synced rows
were skipped by advanced cursors, and later versioned merges could still drop
an absent home grid. Published correction `023dc2d4` adds a one-time account-scoped
repair before both pull paths. It queries only existing IDs with missing fields,
in batches of 100, fills absent metadata without resetting cursors, and re-reads
local rows to preserve intervening edits/deletions. Errors retry without marking
the repair complete. Later versioned merges also fill an absent home grid while
retaining the existing policy for explicitly recorded local values.

Five new regressions fail without the correction; all ten metadata transport
tests and the 16-test focused contact suite pass. Full mandatory publication
checks pass: 400 app files / 3,481 tests, Python/archive, bridge/daemon, lint,
builds and budgets. #527 now has six files; both review threads are answered and
resolved. B24/#232 returns to In review. No database migration, remote mutation,
actual cloud session or hardware operation was performed. Deployed upgrade and
two-device acceptance remain pending; no other batch was claimed.


### Owner-authorized release wave — 2026-09-07

The owner authorized publication and merge work on ProPulse resources. Root retains integration and merge ownership while isolated worktrees validate each small release. No further user approval gate remains for this release wave. Existing user previews remain owned by their recorded sessions and must not be replaced or stopped by unrelated work.

Merged in this wave:

| PR | Delivered slice | Merge commit |
| --- | --- | --- |
| #498 | Masthead clock labels, View settings, auto-rotate, settings/layer navigation | `47d43d5c` |
| #542 | Larger ticker, contained footer AUTO control, six-band reliability fit | `0ae6bda2` |
| #479 | Verified RSS/Atom proxy prerequisite | `7c80fe48` |
| #480 | News/widget configuration foundation | `8a3332df` |
| #411 | Shared guarded Tune action and combined frequency/mode dispatch | `84426989` |
| #407 | Recent Contacts report and date selection | `6976be79` |
| #412 | Station and satellite receive tuning | `ec3b0c38` |
| #413 | Favourite and activation tuning; unknown mode remains unchanged | `8298a780` |
| #408 | Bounded completed-hour Band History API | `12c8b8b4` |
| #414 | Per-provider activation freshness | `f81842c8` |
| #415 | Activation tile and report | `84df8ec4` |
| #503 | Correct rigctld default port and persisted-default migration | `b33ab151` |
| #416 | WWBOTA provider and presentation | `a0866d48` |
| #417 | CANParks provider and presentation | `96257e23` |
| #418 | Activation expiry, detail and layout migration | `befada47` |
| #550 | Contact metadata transport and existing-device repair | `bdbd22ff` |
| #419 | Per-instance WSJT-X decode-time dial context | `22c3b966` |
| #420 | Lossless WSJT-X ingestion and frequency/date consumers | `d04bc8a7` |
| #421 | WSJT-X wall surfaces and guarded dial tuning | `eae72ac0` |
| #409 | Band Activity report, completed-hour history and TOP DX | `f4574aa3` |
| #557 | Cluster report integration, paging and selected-spot reveal | `b76d5d80` |
| #559 | Recover measured wall rows after a compact zero-row fit | `aa9800a3` |
| #561 | Exact logged-frequency tuning in Recent Contacts | `6e6dd060` |
| #562 | Activation renewal and disabled-clock lifecycle | `d70d2a72` |
| #422 | Shared PSK station source/cache | `25cf48e7` |
| #423 | PSK wall report and filtering controls | `619dcf58` |
| #424 | WSJT-X hearing-me report | `f18bf920` |

Each integration retained its bounded file boundary, current theme/layout changes, normal hooks and non-force history. PRs #410 and #474 are closed as superseded by #557. PR #524 is closed after its band-history corrections landed through #409, and #527 is closed after the independent #550 contact-metadata extraction. These slices do not by themselves close their parent issues or physical acceptance gates.

### Production operating evidence and remaining gates — 2026-09-07

A single anonymous production smoke at `https://propulse-orpin.vercel.app` returned HTTP 200 from each operating endpoint: DX cluster returned 10 requested rows with provider status OK; activations returned 118 reports (POTA 100, SOTA 0, WWFF 11, WWBOTA 1, CANParks 6) with all five provider statuses OK; Band Activity returned 10 global bands; Band History returned 60 global completed-hour rows for the six-hour window. The SOTA zero is a successful point-in-time empty result, not a provider failure. This establishes deployed endpoint behavior at that instant, not sustained operation or physical-display readability.

HW-70 and HW-72 advance from Not started to Partial in both registers. #409 and #557 provide merged implementation, production endpoint evidence and local browser coverage; physical display review remains. HW-71 stays Partial: #407 and #550 are merged and the anonymous schema/deployment checks pass, while authenticated two-device sync and physical review remain outstanding. Counts in the feature tracker and wall specification reflect these moves.

PSK #422–424 are merged as `25cf48e7`, `619dcf58` and `f18bf920`. The shared prerequisite `supabase/migrations/20260907010000_psk_station_cache.sql` is recorded and applied on the verified production project. Read-only checks confirm both tables and RPCs, RLS on the cache, no anonymous/authenticated claim access, no anonymous cache SELECT, and service-role claim access. Production Vercel has the required `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` names. Merged PR #559 is the two-file row-fitting prerequisite; it prevents a compact zero-row tile from clipping and restores rows when space returns. The #423 integration opts its compact PSK list into minimum zero, and the combined 126-case browser matrix passes before #424 publication. Physical WSJT-X/rig behavior and deployed PSK rendering remain acceptance checks; infrastructure configuration is no longer a blocker.

B11/#207 is available only within the current Spots & Paths ownership boundaries. Cluster/band configuration must coordinate with the scoped runtime, preference and display owners; world clocks remain the independent candidate after a fresh ownership check. Weather and alert scope stay last. HW-58/HW-59 and the B18 model activation, calibration and physical evidence gates are unchanged, as are the model/3D owners' boundaries.


### Contact and activation follow-through — 2026-09-07

PR #561 merged as `6e6dd060`: Recent Contacts tile/report tuning preserves the exact logged frequency and mode, with compact zero-row fitting and restoration after growth. PR #562 merged as `d70d2a72`: renewed activation reports retain the selected detail card, and disabled activation consumers stop their expiry clock and polling. Both passed focused regressions, full normal release gates and isolated browser checks. #509 is superseded; #505 retains its separate bridge timestamp/source/runtime remainder.

PSK source PR #422 merged as `25cf48e7` and its production deployment succeeded. The first alias request returned an HTTP 307 redirect to the verified canonical `https://propulse.cloud` and never reached the handler. An upstream-free OPTIONS request to the canonical PSK route returned 204, confirming registration; the single canonical GET returned HTTP 502 with a valid `unavailable` envelope, zero reports, no fetched timestamp and a five-minute retry timestamp. No retry was issued. This verifies honest failure handling, not successful PSK data retrieval; failure diagnosis remains open. The exact #424 merge has a successful production deployment. Report PRs #423/#424 merged after refreshing on the merged prerequisites with reviewed heads `9b44dd20` and `991ae9f3`, respectively (15 and 10 files). Their reviewed report behavior is unchanged; focused tests and full pre-push gates pass.

The API and model files from old integration PR #513 match merged #408 exactly, and the portable registry already includes both history and PSK through #422. Its useful self-hosting clarification is preserved here: global history needs the aggregate store, while current-browser samples cannot reconstruct absent hours.


### Scoped-runtime ownership update — 2026-09-07

The newer [SP-03 handoff on #514](https://github.com/crypticpy/propulse/issues/514) releases the old Codex reservation to external Agent 3. That agent owns runtime/provider/registry/slot modules and its declared selection/follow extraction. Codex retains persistence and final integration; the current five-worker amendment on #510 supersedes the older three-worker coordination wording for that initiative. This handoff is not a claim by the HamClock report session. B11 cluster/band configuration and personal PSK map controls must use the accepted scoped-runtime contract after its owner delivers it. Non-spot widget work remains on #207; weather stays below operating work.


### PSK production diagnosis — 2026-09-07

PR #569 merged as `bd508f19`, adding fixed-category server diagnostics without logging callsigns, URLs, report bodies, credentials or raw exception text. The unchanged shared lease and cooldown remain enforced. Its full publication checks passed (421 app files / 3,633 tests plus normal bridge/daemon, lint, build and budgets).

The exact diagnostics deployment reached READY on the canonical `propulse.cloud` alias. After the previous retry window elapsed, one ordinary anonymous request at 19:35:58 UTC returned the valid HTTP 502 unavailable envelope. The matching server diagnostic is `provider_http`, upstream status **403**. This identifies the remaining failure as PSK Reporter rejecting the production server request, rather than route registration or XML parsing. No access bypass, alternate egress, forced retry or database reset was attempted. The provider-access acceptance gate remains open even though #422–#424 are merged and deployed.


Read-only fallback audit: the owned collector subscribes to the sampled `pskr/filter/v2raw_1pc/#` stream. Raw `spot_history_live` is retained for roughly two hours, while durable band/path aggregates discard callsign identity. Explicit server-side TX/RX predicates could support labeled sampled 15/30/60-minute OF/BY results, but current global retrieval caps rows before local filtering and has only a 30-minute query window. The existing owned data is therefore not a complete or six-/24-hour replacement for the station endpoint. Do not silently fill longer windows from empty or sampled history; a proper fallback needs an explicit completeness contract and owned retention/index work coordinated with the source owners. No fallback or storage change was made.


### B18 presentation released — 2026-09-07

Reliability #570 merged as `217a5b46` (13 files) and Forecast #571 as `5f2ae261` (10 files). The final report stack passed 424 app files / 3,649 tests and all normal publication gates. Final browser matrices cover 24 cases per report across target/QTH, three themes and 1080p/4K, plus six paired Reliability tile-row checks. Both reports preserve selected band, hour and tab when pinned; screenshots are included. The two owned B18 dev sessions (5197/5198) were stopped and their exact stale claims removed after process/listener verification. User previews 5181/5182 and integration 5186 remain untouched.

Old #494/#502 are superseded and closed. HW-58/HW-59 now move from Not started to Partial in both registers; totals are 47 delivered, 7 partial and 19 not started. Historical model/observed series, hop count, a horizon-aware FutureCast scorer/response contract and physical acceptance remain open. FutureCast active=[] and zero future-model requests are preserved. The remaining shared DX bridge ingestion/timestamp slice is being completed under the explicit #288/#514 file handoff; view runtime and model/3D work remain with their current owners.


### DX source/API prerequisite — 2026-09-07

#576 merged as `ba2a0568`, replacing the old #473 stack with eleven source/API
files. The strict feed adapter preserves failures and validates source/window
metadata; DX alone adds a bounded 120-minute sample window. Legacy array wrappers
remain available, PSK/RBN stay at 15/30/60 minutes, and source freshness remains
30 minutes. Full publication checks passed 426 app files / 3,713 tests. The
production 120-minute anonymous contract check returned HTTP 200 with matching
metadata and ten reports; detailed evidence and the still-unverified production
retention job are recorded in [the source contract](hamclock-cluster-history.md).

Root integration review changed release order: the API prerequisite precedes the
bridge fix because the legacy helper converted REST failures to empty arrays.
The bridge hook must use the strict adapter before it can safely distinguish
valid-empty data from an outage. Broader #475 source metadata/window-selection
publication still needs the #514 store handoff; world clocks and cluster/band
configuration retain their scoped-widget/settings dependencies. Weather remains
last and no broader batch is claimed by this release.


### Shared bridge source released — 2026-09-07

#577 merged as `996ec6af` on the strict #576 API adapter. Every transport message
is ingested, shared snapshots are validated/deduplicated/bounded, quiet bridge
rows expire, and the permitted 60-second bridge clock skew is consistent. Late
REST results cannot overwrite bridge data; failed REST requests preserve the
last good snapshot, while genuine empty results clear it. Final checks passed
56 focused tests and 428 app files / 3,726 tests plus normal release gates.
The actual tile/report browser smoke passed with fresh, skewed, invalid and
expired fixtures; its temporary fixture and exact owned server were removed.

#478 and #505 are closed as superseded: paging/selection landed through #557,
activation lifecycle through #562, and bridge behavior through #577. The shared
source hook boundary is released for the scoped-runtime owner to consume.
Remaining #475 window-selection/full metadata publication and B11 settings must
coordinate with that owner. Physical bridge operation, authenticated two-device
contact sync, PSK Reporter production access (403), B18 model/source contracts
and production retention-job verification remain explicit acceptance gates.
