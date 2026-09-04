# PropSphere Unified Spot Information Plan

Status: implemented / superseded by map + HamClock work landed through #133

## Objective

Create one coherent spot-information system for PropSphere. Every individual
spot should expose the compact propagation hover preview shown in the supplied
reference image, and every deliberate selection should open the same
non-modal details card and action set regardless of whether the spot came from
a tag, endpoint, collector pin, cluster, highlighted grid, or azimuthal group.

This work preserves the existing industrial dark/cyan-orange visual language,
typography, map rendering, and unrelated UHD/display work in the shared tree.

## Canonical interaction contract

- Hover or keyboard focus on an individual spot enlarges/elevates its tag and
  opens the compact propagation preview anchored to that tag.
- The preview prefers the space above the tag, flips below when required, and
  clamps horizontally inside the viewport.
- The preview retains the reference content: callsign/reference, grid,
  difficulty, optimal-band condition, S-unit, confidence, signal color bar,
  and modeled-path note.
- Clicking an individual spot selects it as the active map target and opens a
  reusable, pointer-enabled details card without a scrim or inert background.
- Clicking a group, collector, cluster, or highlighted grid opens a reusable
  member list. Clicking a member selects it and opens the same details card.
- Clicking outside, pressing Escape, clicking the close button, or selecting a
  different spot dismisses the current card. Closing the card does not clear
  the selected target.
- Spot UI owns its click, pointer, touch, and double-click events so actions do
  not leak into map recentering or rotation.

## P0 — Canonical spot hover preview

- Reuse the existing target-hover visual rather than the unrelated legacy
  `SpotDetailsFlyout` presentation.
- Feed the hovered spot's resolved endpoint—not the previous target—into path
  difficulty and optimal-band calculations.
- Preserve explicit zero latitude/longitude and mark prefix-centroid locations
  as approximate.
- Show a useful unavailable state when QTH or propagation data is missing.
- Use one collision-aware anchored-position helper for hover previews, detail
  cards, and collections.
- Apply the preview to globe tags/endpoints, flat-map labels/endpoints, and
  azimuthal single pins. Aggregate pins retain a group affordance.

## P0 — Unified non-modal details card

- Merge `SelectedSpotCard`, `SpotDetailsModal`, the cluster/collector detail
  treatment, and the useful portions of `SpotDetailPanel` into one reusable
  card based on `LiveSpot`/`DXSpot` data.
- Include callsign, reference/comment, entity and continent where known, grid,
  exact/approximate location, frequency, band, mode, source, age/time, spotter,
  SNR/WPM, distance, bearing, difficulty, and optimal-band signal.
- Keep the map visible and interactive: no fullscreen dialog, dimming scrim,
  focus trap, or scroll lock.
- Provide a stable shared action bar:
  - Set as Target / Target Selected
  - View Path
  - Copy Details
  - Operator Information
  - Open QRZ
  - Watch Callsign
  - Tune when CAT is available
- Use the existing map selection, watch, operator lookup, clipboard, external
  QRZ, and rig-control services rather than duplicating business logic.

## P1 — Unified spot collections

- Extract one non-modal collection popover for clusters, collector pins,
  azimuthal aggregates, and highlighted Maidenhead grids.
- Sort members newest first and show callsign, frequency, band, mode, source,
  age, and signal metadata.
- Preserve collection summaries such as grid/coordinates, mode distribution,
  unique bands, and latest activity.
- Clicking a member closes the collection, selects that exact report as the
  target, and opens the canonical details card at the collection anchor.
- Avoid hidden fullscreen details transitions from collection rows.

## P1 — Highlighted-grid selection

- Match clicks to the same resolved, non-approximate spot membership that
  produces the grid highlight and hover summary.
- On a highlighted grid with members, open the canonical collection instead
  of the generic location flyout.
- On an unhighlighted/empty grid, preserve the existing map-location action.
- Use the displayed grid precision when practical; normalize collection labels
  to a stable Maidenhead prefix so hover and click describe the same members.
- Implement the behavior for globe and flat map; expose the same collection
  semantics for azimuthal grid activity where its renderer supplies a hit.

## P1 — Migration and cleanup

- Route all map spot entry points through the shared selection command.
- Replace map usages of the modal spot-details dialog with the unified card.
- Retain compatibility wrappers only where a non-map surface still requires
  its current layout, then remove dead duplicated formatting/action code.
- Keep projection-specific modules responsible only for hit-testing,
  anchoring, and map state—not spot-information rendering.

## Verification

- Hover individual tags near every viewport edge and confirm the preview
  remains attached, readable, and based on that spot.
- Cover explicit coordinates, grid-derived positions, approximate positions,
  missing QTH, and exact zero latitude/longitude.
- Verify tag hover enlargement/focus, click selection, outside/Escape/X
  dismissal, and no map-gesture leakage.
- Verify tag, endpoint, cluster member, collector member, azimuthal member, and
  highlighted-grid member all open the same details card and action bar.
- Verify Set Target, View Path, Copy Details, Operator, QRZ, Watch, and CAT Tune
  actions use the selected report and degrade safely when unavailable.
- Verify highlighted-grid membership matches its hover count and that empty
  grids retain the normal map click flow.
- Add focused component and interaction tests, then run TypeScript, focused
  Vitest, full lint, production build, and `git diff --check`.

## Coordination guardrails

- Inspect overlapping diffs before every edit; this is a shared dirty tree.
- Preserve unrelated imagery, tiles, kiosk, wall-display, entitlement, and
  seasonal-texture changes.
- Prefer narrow reusable components and callbacks over broad projection
  rewrites.

## Implementation status

Status: **implemented**.

### Delivered

- Added one viewport-aware anchoring system for the hover preview, spot
  collection, and selected-spot card.
- Restored the compact propagation preview for globe and flat-map tags and
  endpoints, plus single azimuthal spots, using the hovered station's path.
- Consolidated map spot details into one non-modal card with entity, report,
  path, propagation, and age data plus Target, Path, Copy, Operator, QRZ,
  Watch, and conditional CAT Tune actions.
- Consolidated globe clusters, azimuthal aggregates, collector recent-activity
  rows, and highlighted Maidenhead grids into the shared spot-selection flow.
- Made grid hover and click membership share the same resolver at the displayed
  four- or six-character precision.
- Preserved the legacy modal/flyout modules only for compatibility; globe,
  flat-map, and azimuthal spot selections no longer render the fullscreen spot
  modal.

### Verification record

- `npx tsc -b --pretty false`: passed.
- Focused interaction suite: 11 files and 35 tests passed.
- `npm run lint`: passed with zero warnings.
- `npm run build`: passed; Vite emitted its existing Browserslist-age and large
  chunk advisories.
- `git diff --check`: passed.
- Full `npx vitest run`: 121 files / 792 tests passed. The remaining 32 tests
  failed only in `AuthGate.test.tsx`, `clusterPrefs.test.ts`, and
  `useSeasonalDayTexture.test.ts` because this Node runtime exposes an
  unavailable `localStorage`; those failures are outside this work and the
  focused spot suite passes under the same runtime.
- A live visual smoke test was attempted, but no in-app or connected browser
  session was available in this environment. Manual projection/viewport QA is
  therefore still recommended on the target 4K display.
