# PropSphere Production Integration Plan

Status: implementation and automated release gates complete in the integration
worktree; PR review, merge, deployment, and live verification remain  
Owner: PropSphere  
Last updated: 2026-08-31

## Goal

Make every PropSphere feature delivered in the recent map/display work usable
from the real production routes. The work is not complete when a hook, card,
store, or provider exists in isolation: it is complete only when an operator
can reach it, interact with it consistently in every supported projection,
build the production bundle, and use it in the deployed Vercel application.

## Production acceptance criteria

- Clicking any individual spot tag or endpoint selects that callsign as the
  current target, moves the target marker, and updates the path regardless of
  country, longitude, or zero-valued coordinates.
- Hovering or focusing any spot tag consistently opens the rich anchored
  preview with difficulty, distance, optimal-band signal scale, S-unit, and
  confidence. The preview remains readable near viewport edges.
- Clicking a spot opens one reusable, non-modal details card with target,
  path, copy, operator lookup, and external profile actions. Clicking outside
  or its close control dismisses it without dimming the map.
- Clicking aggregate pins or highlighted grids opens the same collection
  surface; selecting a row enters the same target/details flow.
- Double-clicking a label or endpoint never leaks through to the globe/map and
  never sends the camera to a pole.
- Azimuthal mode uses aggregate endpoint pins and a bounded number of traces so
  labels and arcs do not overwhelm the projection.
- Normal, Lite, Pro, HamClock, Wall Display, Deep-Zoom, Photorealistic 3D, and
  Configure Displays remain reachable from the shared display menu wherever
  the operator is working, with dependable exits from immersive views.
- Saver, Auto, UHD, and Extreme affect the actual globe, flat, and azimuthal
  renderers: DPR, tile refinement/concurrency/prefetch, texture resolution,
  and stationary refinement all follow the selected policy.
- The global surface is de-clouded; live clouds are an independently toggled,
  attributed layer. UHD/Extreme prefer the existing high-resolution seasonal
  de-clouded asset with a bundled fallback.
- Flat-map zoom resolves to real XYZ tile detail instead of enlarging the
  global raster. Tile requests are bounded, cancellable, attributed, and fall
  back safely.
- Deep-Zoom and gated Google Photorealistic 3D are routed, code-split
  production pages with secure provider configuration and clear exits.
- Wall scenes can be created from templates or the current view, enabled,
  reordered, duplicated, edited, launched, and rotated with per-scene timing,
  transition, projection, quality, basemap, theme, clouds, and rotation.
- Existing solar, activation, lunar, hazard, contest, HamClock, ticker,
  current-location, and display features from the audited commits continue to
  build and pass their tests.

## Implementation workstreams

### 1. Unified spot interaction

- Route globe, flat, and azimuthal spot labels, endpoints, clusters, and grid
  collections through `useMapSpotSelection`.
- Use `SpotHoverPreview`, `SelectedSpotCard`, and `SpotCollectionPopover` as
  the canonical preview, details, and collection surfaces.
- Keep selection coordinates, callsign metadata, band/mode data, comments,
  approximate-location state, and screen anchors intact end-to-end.
- Suppress map gestures on overlay pointer, touch, keyboard, click, and
  double-click interactions.
- Preserve direct map targeting for locations that are not live spots.

### 2. Projection-specific presentation

- Keep full spot interaction parity on globe and flat views.
- Aggregate azimuthal endpoints, cap background path traces, and open the
  canonical collection/details surfaces from pins.
- Keep grid-highlight collections clickable across projections.
- Retain activation details, lunar marker, hazards, contest overlays, and
  existing renderer pipelines while replacing only the spot interaction path.

### 3. UHD, de-clouded imagery, and deep zoom

- Connect the display-quality store to every renderer and basemap control.
- Select 2K/4K fallback maps by effective quality and theme, bounded by each
  device's reported maximum texture size.
- Prefer high-resolution seasonal Blue Marble imagery in UHD/Extreme while
  retaining offline/generated fallbacks.
- Use theme-matched labels and intentionally designed light/dark/high-contrast
  standard maps.
- Bound flat-tile concurrency and cache work, prefetch around the viewport,
  cancel stale requests, and refine after motion settles.
- Show imagery/cloud source and quality attribution in immersive views.
- Route MapLibre Deep-Zoom and Google Photorealistic 3D as optional explorers,
  not replacements for dependable global modes.

### 4. Display navigation and Wall Display Center

- Use one `LayoutModeDropdown` in standard, Lite, Pro, HamClock, and kiosk
  chrome.
- Keep toolbar controls reachable when both side panels are open.
- Expand the hardened kiosk store with versioned migration for scene enable,
  duration, transition, projection, quality, basemap, theme, clouds, and
  rotation settings.
- Rotate only enabled scenes, respect per-scene dwell time, and honor reduced
  motion during transitions.
- Provide polished Geochron, Observatory, HamClock, and Photorealistic
  starting templates plus save-current-view.

## Recent-commit integration audit

The first-parent production history from PRs #81 through #112 was traced.
Most earlier features were already reachable from production. The following
recent gaps required explicit wiring in this integration:

| PR | Delivered primitive | Production integration in this plan |
| --- | --- | --- |
| #104 | secure providers and 3D helpers | Deep-Zoom and Photorealistic routes, navigation, fallback, attribution |
| #105 | display quality policy/store | globe, flat, azimuthal, labels, textures, and tile scheduler consume it |
| #106 | unified spot selection hook | all three projections and every spot entry point consume it |
| #107 | highlighted-grid collection helper | grid clicks open the canonical collection surface |
| #108 | location-aware clustering | cluster pins open the same spot collection/details flow |
| #109 | shared view selector | all layouts plus deep-zoom/3D/wall/config destinations |
| #110 | reachable toolbar primitives | retained and validated with panel-constrained layouts |
| #111 | rich hover preview | labels/endpoints across globe, flat, and azimuthal |
| #112 | unified details card | selected spots from tags, pins, clusters, and grids |

The regression suite remains responsible for the already-routed functionality
from PRs #81-#103: visibility/controls, Band Health and solar freshness,
ticker/news, forecast panel, HamClock operations, kiosk clock scenes, lunar
subpoint, portable activations, nearby activity, current-location override,
night darkness, and activation details.

## Verification and release gates

Automated gates completed on 2026-08-31:

- ESLint: passed with zero warnings.
- TypeScript and Vite production build: passed.
- Vitest: 175 files and 1,017 tests passed.
- Bundle budgets: passed, including the 850 KiB raw app-entry limit.
- Tracked generated-artifact and diff-integrity checks: passed.

The 3840×2160 interaction smoke remains required before the live release can
be declared verified; the integration session did not have a connected in-app
browser when the automated gates completed.

1. Run focused interaction, quality, tile, navigation, and kiosk tests.
2. Run the complete Vitest suite, ESLint, and the TypeScript/Vite production
   build from the clean integration worktree.
3. Inspect the built manifest/chunks to prove both explorer routes and all
   shared interaction components are included or imported by routed code.
4. Smoke-test 3840×2160 Normal, Pro/UHD, flat, azimuthal, wall center, kiosk,
   Deep-Zoom, and 3D fallback/configured states with no console/page errors.
5. Review the diff for unrelated changes and split it into coherent commits so
   automated reviewers can reason about spot wiring, imagery/rendering, and
   wall/navigation independently.
6. Open the reviewable PR stack in dependency order, address bot/CI findings,
   merge in order, wait for Vercel production deployment, and repeat the smoke
   checks against the live deployment.

## Collision policy

All implementation and verification happens in the dedicated
`fix/complete-production-wiring` worktree. The shared root checkout and other
agents' bug-fix worktrees are not modified. Integrations are performed at
hunk-level so existing production behavior is preserved rather than replacing
whole files from a parallel branch.
