# PropSphere Production Integration Plan

Status: active production stabilization and ordered release in progress. PRs
#113, #114, #117, #119, #118, #120, and the clean #121 reconstruction are
live. Stale PRs #115 and #116 are closed. Clean Wall Display replacement #122
has been reconstructed from current production and passes its complete local
release gates; hosted review, merge, deployment, and live verification remain.

Owner: PropSphere
Last updated: 2026-09-01

## Goal

Make every recent PropSphere map and display feature usable from the real
production routes. Work is complete only when an operator can reach the
feature, interact with it consistently in every supported projection, and use
it in the deployed Vercel application. A component, hook, store, passing test,
or preview deployment by itself is not a production result.

## Production acceptance criteria

- Clicking any individual spot tag or endpoint selects that callsign as the
  current target, moves the target marker, and updates the path regardless of
  country, longitude, band, condition color, or zero-valued coordinates.
- Hovering or focusing any spot tag consistently opens the rich anchored
  preview with difficulty, distance/bearing, optimal band, signal scale,
  S-unit, confidence, and an honest unavailable-state reason.
- The preview remains open while the pointer moves from the tag into it. A
  click on the tag, endpoint, or preview opens one reusable non-modal details
  card without dimming the map.
- Clicking aggregate pins or highlighted grids opens the same collection
  surface; choosing a row enters the same target/details flow.
- Double-clicking a label, endpoint, preview, or card never leaks through to
  the map and never sends the camera to a pole.
- Visible secondary traces retain visible destination endpoints and use the
  same filtered candidate set as persistent live spots. Selected paths remain
  visible independent of background activity-layer toggles.
- Azimuthal mode uses aggregate destination pins and a bounded number of
  traces so labels and arcs do not overwhelm the projection.
- Normal, Lite, Pro, HamClock, Wall Display, Deep-Zoom, Photorealistic 3D, and
  Configure Displays remain reachable from the shared display menu, with a
  dependable return to Normal from every immersive view.
- Saver, Auto, UHD, and Extreme affect actual globe, flat, and azimuthal
  renderers: DPR, tile refinement/concurrency/prefetch, texture resolution,
  and stationary refinement follow the selected policy.
- The global surface is de-clouded; live clouds are an independently toggled,
  attributed layer. UHD/Extreme prefer the high-resolution seasonal
  de-clouded asset with a bundled fallback.
- Flat-map zoom resolves to real XYZ tile detail rather than enlarging one
  global raster. Requests remain bounded, cancellable, attributed, and safe to
  fall back.
- The map-control row never exposes a horizontal browser scrollbar. Layers,
  Reach Map, Colors, Profile, Views, and compact system health remain
  reachable with both side panels open.
- Wall scenes can be created, enabled, reordered, duplicated, edited,
  launched, and rotated with per-scene timing, transition, projection,
  quality, basemap, theme, clouds, and rotation.

## Release-blocking stabilization

### 1. Interactive hover and canonical details

- Make the tag and its anchored preview one pointer-safe interaction zone.
  Entering either surface cancels dismissal; leaving both dismisses after a
  short grace period that tolerates normal diagonal pointer travel.
- Give the preview pointer and keyboard semantics instead of rendering it with
  `pointer-events: none`. Activate the same original `LiveSpot` from the tag,
  endpoint, preview, cluster row, or highlighted-grid row.
- Preserve exact identity and metadata rather than reconstructing a partial
  synthetic spot that can no longer be found in the current feed.
- Route every selection through `useMapSpotSelection`, set the target, and open
  `SelectedSpotCard`. Keep click-outside and close-button dismissal without a
  full-scene scrim.
- Apply the same ownership, delay, selection, and gesture-isolation behavior
  in Globe, Flat, and Azimuthal renderers.
- Treat ordinary Azimuthal DX pills as first-class interactive tags, not just
  canvas paint. They must expose the same hover, target, and details contract
  as activation pills.
- Test tag -> preview -> details, edge placement, all band/condition styles,
  endpoint-only interaction, keyboard activation, click outside, close, and
  double-click isolation.

### 2. Trace and endpoint consistency

- Make Live Spots own persistent interactive destination pins and optional
  labels. Keep spotter/origin rings faint and noninteractive by default.
- Make Spot Traces a bounded new-arrival animation over the same resolved,
  filtered, clustered candidate set. Do not enqueue the whole existing feed
  as new activity on mount.
- Retain a visible destination pin and hit target for the lifetime of each
  visible trace, or expire the line with the pin. Remove invisible or stale hit
  targets when layers and labels are disabled.
- Fix the endpoint instance budget so every rendered path has the markers its
  interaction contract promises at 50, 100, and 200-spot densities.
- Keep the selected marker, path, hover, and card visible when Live Spots or
  Spot Traces is toggled. Only the selected or hovered path receives detailed
  hop/reflection markers; secondary paths obey a deterministic clutter budget.
- Test the full Globe/Flat layer matrix, initial hydration versus new arrivals,
  trace/pin lifecycle parity, filter and clustering parity, hidden-label
  endpoint hover/click, and selected-path persistence.

### 3. No-scroll map toolbar

- Remove `overflow-x-auto` from the map-control row. Observe available width
  and wrap or collapse lower-frequency actions into an explicit More/Display
  menu before controls overflow.
- Keep Layers, Reach Map, Colors, Profile, Views, and compact System Health
  visible or reachable without horizontal scrolling.
- Remove duplicate UTC and operating-location readouts from the 3D/2D map
  control row; they already have dedicated page-level presentation.
- Retain conflict, connectivity, sync, and health in one compact control that
  expands to actionable detail.
- Verify normal, compact, both-side-panels, Lite, Pro, and 3840x2160 layouts,
  including keyboard navigation, focus order, popover escape behavior, and an
  unclipped Views control.

## Feature workstreams

### 4. UHD de-clouded imagery and deep zoom

- Connect the display-quality store to every renderer and basemap control.
- Select 2K/4K fallbacks by effective quality and theme, bounded by the
  device's maximum texture size.
- Prefer high-resolution seasonal Blue Marble imagery in UHD/Extreme while
  retaining bundled fallbacks and independent live-cloud attribution.
- Bound flat-tile concurrency and cache work, prefetch around the viewport,
  cancel stale requests, and refine after motion settles.
- Route MapLibre Deep-Zoom and gated Google Photorealistic 3D as optional,
  code-split explorers with clear exits and secure provider configuration.
- Keep Mapbox, Esri, OpenStreetMap, and Google Maps attribution visible,
  separately linked where required, accessible, and clear of application UI.
- Refresh authenticated Mapbox tile credentials during long-running display
  sessions and keep the final native zoom visible instead of hiding its layer.

### 5. Projection-specific presentation

- Keep full spot interaction parity on Globe and Flat.
- Aggregate Azimuthal endpoints, cap background paths, and open canonical
  collection/details surfaces from its pins.
- Keep highlighted-grid collections clickable across projections.
- Preserve activation, lunar, hazard, contest, solar, and existing renderer
  pipelines while replacing only the inconsistent spot interaction path.

### 6. Display navigation and Wall Display Center

- Use one shared layout selector in Standard, Lite, Pro, HamClock, wall, and
  kiosk chrome.
- Keep the selector and exit controls reachable even with constrained map
  width or immersive presentation.
- Use versioned kiosk-scene migration for enable, duration, transition,
  projection, quality, basemap, theme, clouds, and rotation settings.
- Rotate only enabled scenes, respect per-scene dwell time, and honor reduced
  motion.
- Re-arm one-shot scene rotation when `activeSceneId` changes so consecutive
  scenes with the same dwell duration cannot stop the rotation loop.
- Persist an explicit empty scene list when the operator clears every scene;
  do not silently retain the previous assignment.
- Make wall-exit wording and behavior literal: provide a direct return to
  Normal PropSphere separately from opening the display configurator.
- Provide Geochron, Observatory, HamClock, and Photorealistic templates plus
  save-current-view.

## Ordered PR and deployment sequence

1. Keep the already-live #113 and #114 capabilities as the production baseline.
2. Keep #117's no-scroll toolbar and #119's serverless typecheck cleanup live
   while finishing #118's filtered trace and endpoint lifecycle rereview.
3. Keep #118 and #120's filtered trace lifecycle, endpoint parity, owner-safe
   hover bridge, canonical details card, and Azimuthal DX-pill interaction as
   immutable production foundations.
4. Keep #121's clean reconstruction of #115 live. It was built from the
   current production baseline without the inherited pre-squash #113/#114
   history and preserves the stabilized hover bridge and canonical details.
5. Ship the clean Wall Display reconstruction built from #121's production
   `main`; do not retain stale #116's stacked ancestry. Its rotation re-arming,
   clear-all scene persistence, literal exit navigation, explorer viewport
   sizing, route-capability controls, and remote-sync race handling have passed
   the full local gates and joined review.
6. Run the final 3840x2160 cross-view checklist against the public production
   alias and reconcile every acceptance criterion in this file.

## Production evidence ledger

- #117 toolbar: squash merge `ee3d034`; Vercel production deployment
  `dpl_3thGtZFkzT16SEvX2fAz4aEQzSug` reached Ready and served the production
  alias.
- #119 serverless typecheck: squash merge `eeef047`; Vercel production
  deployment `dpl_FDyQEVRpNPKTHpnU749TW1gQieqG` cloned that exact commit,
  completed without the prior RSS TS2345 diagnostic, reached Ready, and owns
  `propulse.cloud`.
- #118 trace/endpoints: squash merge `2256e92`; Vercel production deployment
  `dpl_CYeZDV7PCiGaWYxqW8iqub4WBQbi` cloned that exact `main` commit, reached
  Ready, and owns `propulse.cloud`. The PR head was `276f6318`; the different
  production SHA is the expected result of the squash merge.
- #120 hover/details: reviewed head `89ee36c`; squash merge `f53380e`; Vercel
  production deployment `dpl_4CuxPhkVL9UiTr7ADgQifrQC4y8A` cloned that exact
  `main` commit, reached Ready, and owns `propulse.cloud`.
- #121 explorers/Azimuthal density: reviewed head `a71fdb24`; squash merge
  `5eae5eec`; Vercel production deployment
  `dpl_5ySMFfJWrSVnv3VTGVUyc8mJDwfb` cloned that exact `main` commit, reached
  Ready, and owns `propulse.cloud`. Stale #115 was closed as superseded.
- #122 Wall Display replacement head `a78acb15`: 211 Vitest files / 1,183 tests,
  ESLint, TypeScript, production Vite build, bundle budgets, and two joined
  release-blocker reviews passed from a dedicated clean worktree based on
  `5eae5eec`. Stale #116 was closed as superseded and remains unmerged.
- Authenticated 3840x2160 pointer verification remains a separate final gate;
  public automation currently reaches the invite login rather than the map.
- The free Esri de-clouded Deep-Zoom path needs no new production secret.
  Mapbox HD and Google Photorealistic 3D remain honestly gated until
  `MAPBOX_ACCESS_TOKEN`, `GOOGLE_MAP_TILES_API_KEY`, and
  `VITE_GOOGLE_PHOTOREALISTIC_3D_ENABLED` are configured in production.

## Verification gates

- Focused unit/component tests for every changed ownership and layer contract.
- Complete Vitest suite, ESLint, TypeScript, production Vite build, and bundle
  budgets from a clean worktree.
- Require the Deep-Zoom route, Photorealistic route, MapLibre JS/CSS, and 3D
  Tiles vendor chunks in bundle checks so missing production code cannot pass.
- Built-manifest inspection proving explorer routes and shared interaction
  components are reachable from production routes.
- Manual 3840x2160 checks for Standard, dual-panel, Pro/UHD, Flat, Azimuthal,
  Deep-Zoom, Photorealistic configured/fallback, Wall Center, and kiosk.
- No console/page errors, horizontal control scrollbar, clipped selector,
  orphan trace, invisible hit target, disappearing selected target, or modal
  scene scrim.
- Each merged layer records merge SHA, Vercel deployment completion, public
  production alias, and a successful live smoke result. A green preview alone
  is not production proof.

## Collision policy

Use dedicated worktrees and narrowly scoped branches. Do not modify the shared
root checkout or another agent's bug-fix worktree. Integrate at hunk level and
preserve unrelated working-tree changes. When squash-merged ancestors are
embedded in a stale feature branch, reconstruct from fresh `main` with only
the unique audited commits instead of rebasing or force-copying whole files.
