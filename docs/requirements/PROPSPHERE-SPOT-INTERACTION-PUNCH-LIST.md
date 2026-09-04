# PropSphere Spot Interaction and Map Readability Plan

## Objective

Make every live spot a deterministic, projection-independent target-selection
surface while improving selected-spot presentation, cluster accuracy, toolbar
responsiveness, azimuthal readability, and operator lookup integration.

This plan deliberately preserves the existing PropSphere industrial dark/cyan
visual language and avoids unrelated imagery, kiosk, and wall-display work that
may be in progress in the shared worktree.

## Implementation status

Status: **implemented** on 2026-08-31.

- Globe, flat-map, azimuthal-pin, and aggregate-member selection now share one
  target-selection command and location-resolution policy.
- Spot interactions own their pointer/double-click events, including flat-map
  press-and-hold, so they cannot leak into surface recentering.
- Selected spots now retain a larger visual state and a persistent propagation
  card with full-details and in-app operator-lookup actions.
- Spot-derived targets render one selected route and suppress duplicate generic
  target annotations; manual targets retain the established presentation.
- Clusters use resolved locations, stable membership, member centroids, and
  dateline-safe longitude averaging. Unresolved reports remain visible singles.
- Azimuthal mode defaults to aggregate endpoint pins and only renders bounded
  individual traces when Spot Traces is explicitly enabled.
- The map masthead responds to its own container width, preserves all controls
  as compact popovers, pins `Views`, and stacks status/view controls when tight.
- The existing HamQTH, Callook/FCC, QRZ, and local-history operator experience
  is available directly from the selected-spot card.

## Product contract

- A single click or tap on any DX spot tag selects that station as the target,
  regardless of source, color, mode, country, or hemisphere.
- Selection updates the map target, target beacon, selected spot state, and
  highlighted path as one operation.
- The selected spot tag remains visibly emphasized and exposes an interactive,
  persistent propagation card.
- The card shows difficulty, optimal band/signal, frequency, mode, and actions
  for full spot details and operator information.
- A spot double-click never reaches the map-surface recenter handler.
- Selecting a member of a cluster has the same effect as selecting a standalone
  tag.
- Manual map targets keep their existing generic target presentation; a target
  derived from an existing spot is not annotated twice.
- Bare-map gestures retain their existing behavior.

## P0 — Deterministic spot selection

### 1. Shared spot-selection command

- Introduce one shared selection operation for globe, flat, azimuthal, spot
  lists, and cluster-popover rows.
- Resolve the DX endpoint in this order:
  1. Finite reported `dxLat` and `dxLon`.
  2. Center of a reported Maidenhead grid.
  3. Existing callsign/location resolver result, visibly marked approximate.
  4. Explicit location-unavailable feedback; never retain the previous target
     silently.
- Atomically update selected DX spot and map target.
- Preserve valid coordinates at latitude `0` or longitude `0` by using
  finite/null checks instead of truthiness checks.

### 2. Real tag controls

- Add click, touch, keyboard, and accessible button semantics to globe tags.
- Add selection callbacks to endpoint hit targets.
- Stop click, pointer, and double-click propagation before it reaches the map
  surface.
- Make flat-map label hit-testing dispatch the shared selection operation.
- Make azimuthal spot/aggregate hit-testing dispatch the same operation.

### 3. Double-click isolation

- A double-click on a tag performs no map-surface action.
- Validate all recenter coordinates as finite and within geographic bounds.
- Preserve bare-surface double-click recentering.

## P1 — Selected-spot presentation

### 4. Persistent selected-spot card

- Keep the current transient, pointer-transparent hover preview.
- Add a persistent pointer-enabled selected state anchored near the selected
  tag or endpoint.
- Show callsign, grid, frequency, mode, age/source, path difficulty, optimal
  band/signal, and whether the position is approximate.
- Add `Details`, `Operator`, and close actions.
- Reuse the existing spot-details dialog for `Details`.
- Reuse the existing callsign detail view for `Operator`.

### 5. Deduplicate selected annotations

- Add target provenance such as `manual`, `pin`, or `spot`, plus an optional
  spot identifier.
- For a spot-derived target, retain the beacon/glow and highlighted path while
  suppressing the second generic target/grid/difficulty label.
- Enlarge and persistently highlight the selected spot tag.
- Manual and pin targets retain their existing target labels.

## P1 — Cluster correctness and responsive controls

### 6. Resolve before clustering

- Cluster resolved DX locations rather than only raw feed coordinates.
- Replace fixed geographic bucket-center placement with member-centroid or
  screen-space placement.
- Handle the international dateline when averaging longitudes.
- Define stable membership, primary-spot, and threshold behavior.
- Ensure unlocated spots do not disappear and do not form misleading clusters.

### 7. Container-aware map masthead

- Base compaction on the available map-container width, including side-panel
  widths, instead of viewport breakpoints alone.
- Keep panel controls, projection/view selection, and `Views` always reachable.
- Collapse UTC/grid/system status into one abbreviated chip when constrained.
- Retain watch, cluster connection, and secondary controls as compact popovers
  at constrained widths while hiding only redundant inline status text.
- Verify the layout with both side panels open at 1920px, 2560px, and 4K.

## P2 — Azimuthal readability

### 8. Purpose-specific live activity

- Treat azimuthal mode as a path-planning view rather than a full callsign-label
  wall.
- Default to aggregated grid cells or compact endpoint pins.
- Show individual live arcs only for the selected target, watched stations, or
  an explicitly enabled active-band layer.
- Clicking an aggregate opens its member list; selecting a member uses the
  shared selection command.
- Keep grid glow/activity as the overview signal.
- Render a selected spot and its target as one visual path.

## P2 — Operator information

### 9. Integrate existing providers

- Open the existing in-app callsign detail view from the selected-spot card.
- Prefer HamQTH when credentials are configured.
- Use the existing no-key Callook/FCC lookup for U.S. callsigns.
- Merge local QSO history where available.
- Retain QRZ as an external link and optional credentialed provider.
- Target selection must use spot/grid data immediately and must not wait for a
  callbook request.

## Verification matrix

- Select spots in the United States, Brazil, Europe, Japan, Australia, and near
  the international dateline.
- Cover explicit coordinates, grid-only spots, approximate-prefix locations,
  unavailable locations, and exact `0` latitude/longitude values.
- Verify one click produces one target update, one beacon, one selected path,
  and one persistent card.
- Verify rapid clicks and double-clicks on a tag never recenter to the pole.
- Verify cluster-member and standalone-tag selection are identical.
- Verify manual targets and spot-derived targets have no duplicate annotation.
- Verify masthead controls remain reachable with both panels open at common
  desktop and 4K widths.
- Verify azimuthal readability and selection at 50, 200, and 500 incoming
  spots.
- Verify clustering across bucket boundaries, the dateline, missing raw
  coordinates, and repeated reports of the same DX station.
- Run focused tests, `npm run lint`, and `npm run build`.

## Coordination guardrails

- Inspect the current diff before editing any file because the shared worktree
  contains unrelated background-agent changes.
- Do not modify imagery, tile-provider, kiosk, wall-display, entitlement, or
  seasonal-texture work unless required by this plan.
- Assign agents non-overlapping file ownership and integrate through narrow
  callbacks/types rather than broad rewrites.
- Preserve unrelated edits in every touched file.

## Verification record

- `npx tsc -b --pretty false`: passed.
- Focused Vitest suite: 8 files and 26 tests passed, covering location
  resolution, exact zero coordinates, unavailable-location clearing, dateline
  clustering, tag/endpoint event ownership, flat-map quick/double/long-click
  isolation, persistent-card actions, operator initialization, and compact
  status rendering.
- `npm run lint`: passed with zero warnings.
- `npm run build`: passed.
- `git diff --check`: passed.
- Repository-wide Vitest run: 117 files and 782 tests passed; 32 pre-existing
  tests in `AuthGate`, `clusterPrefs`, and `useSeasonalDayTexture` remain blocked
  because Vitest workers expose `localStorage` as undefined under the current
  Node runtime. The same three files fail with and without an explicit parent
  Node local-storage file.
- Interactive browser QA could not run in this environment because the in-app
  browser runtime reported no available browser instances. The container-width
  behavior is implemented and automated coverage is green, but the manual
  1920px/2560px/4K matrix remains a release smoke-check.
