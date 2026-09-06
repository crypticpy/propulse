# HamClock operating views delivery plan

Updated: 2026-09-06. Owner direction: finish operating views, spots, activations,
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
| Codex / HamClock operating views | Current implementation: Activations / #285; shared tuning / #286 and B24 / #232 in review | One active implementation item; retain review and acceptance follow-up |
| Existing modeling / 3D agent | NowCast training, inference, evaluation, model activation, and 3D globe work, per owner direction | This plan does not assign or change that agent's existing cards |
| Additional contributor | Claim an unclaimed Ready item, preferably B10 / #206 initially | Check current board, issue comments, and changed files before starting |
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
- #285 is the sole current implementation claim, starting on `feat/hamclock-activations-feed`. The aggregate already supports POTA, SOTA and WWFF; add per-source retrieval timing before the wall tile/report. WWBOTA and CanParks require verified adapters in later source slices. Claim and shared-file boundaries: [issue comment](https://github.com/crypticpy/propulse/issues/285#issuecomment-5562670949).
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

Local project found at `/Users/crypticpy/Projects/OpenWeather/openwxglobe`.
The README describes weather, radar, ocean and alert layers; its root license is
Apache-2.0. This is a reuse lead, not a completed adapter compatibility audit.

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
