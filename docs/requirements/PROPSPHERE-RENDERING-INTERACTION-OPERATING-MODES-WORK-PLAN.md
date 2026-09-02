# PropSphere Rendering, Interaction, and Operating Modes Work Plan

## Goal

Deliver a production-ready PropSphere experience in which dense or overlapping
spots remain stable and selectable, map overlays have deterministic render and
interaction order on both the illuminated and dark sides of the globe, 3D and
2D tile work is limited to what the operator can actually see, active-grid
activity is meaningful and scalable, and logging or contest operation shows
only the information appropriate to the current operating scope.

This document is the execution source of truth for that goal.

## Status

- Status: **approved for implementation** on 2026-09-01.
- Baseline reviewed: `origin/main` at `3a86bdc6` (`fix(map): stabilize dense
  spot interactions (#124)`).
- Delivery: a sequence of focused, production-ready pull requests rather than
  one broad rendering rewrite.
- PR size target: approximately 8-16 changed files, and fewer than 20 changed
  files unless a generated or mechanical change makes the count misleading.
- Required checks per PR: focused tests, repository lint, production build,
  applicable full tests, and manual rendering checks.

## Scope

### Included

1. Remaining globe spot-hover blinking and tooltip compositing artifacts.
2. Overlap arbitration for labels, endpoint hit targets, activation tags, and
   aggregate beacons.
3. A shared screen-space label-placement and aggregation system.
4. Deterministic WebGL and DOM-overlay render ordering on the day and night
   sides of the globe.
5. 3D globe tile selection, request, cache, decode, and render performance.
6. 2D map tile and canvas-composition performance.
7. A unified, adaptive active-grid activity model and presentation.
8. Explicit observation, logging, and contest data scopes.
9. Automated dense-scene regression fixtures and performance instrumentation.

### Not included unless required by an item above

- A tile-provider redesign or unrelated imagery-provider work.
- General homepage, solar-data, or propagation-model punch-list items.
- A rewrite of QSO logging, contest scoring, WSJT-X, or CAT integrations.
- Unrelated kiosk, wall-display, authentication, or entitlement work already
  present in the shared worktree.

## Evidence and current-system findings

### Hover blinking

The previous stabilization work protects a newer hover from a stale leave or
unmount event. That addresses feed refreshes and expiring traces, but it does
not choose one deterministic winner when multiple hit targets occupy the same
screen pixels.

The remaining likely failure chain is:

1. `SpotEndpointHitArea` renders a transparent raycast sphere for an endpoint
   and reclaims hover on every pointer move.
2. `LiveSpotArcs` can render an interactive DOM label and an independent WebGL
   endpoint hit target for the same report.
3. Two or more co-located reports create several nearly equal raycast hits.
   The winning object can change as the pointer or camera moves by a fraction
   of a pixel.
4. Each winning object has a different spot identity, so the hover controller
   can replace the preview even though the pointer appears stationary.
5. Existing DX stacking uses geographic proximity. Remaining activation
   singles use a different geographic bucket after their screen-space cluster
   pass. Spotter, DX, and activation layouts therefore still collide across
   layer boundaries.
6. The hover tooltip uses a 95-percent opaque, backdrop-blurred surface over an
   animated WebGL canvas. Even when its DOM order is correct, bright paths are
   intentionally partially visible through it, and the backdrop filter adds a
   browser compositor boundary that can amplify flashing.
7. The tooltip is offset from its anchor. The transparent interaction bridge
   does not derive its size from the actual computed gap and tooltip bounds,
   leaving a possible transit seam.

This is the leading diagnosis and must be validated with the deterministic
overlap fixture in PR 1 before the implementation is considered complete.

### 3D tiles and render work

- `TiledGlobe` delegates camera-frustum and screen-space-error selection to
  `3d-tiles-renderer` and uses `UpdateOnChangePlugin`.
- The application does not expose enough renderer statistics to prove how many
  tiles are visible, cached, queued, downloading, decoded, or selected outside
  the useful viewport.
- `TiledLabels` uses a second tile renderer and therefore has a second tile
  traversal, request queue, cache, and fade lifecycle. It does not currently
  share the imagery renderer's update-on-change policy.
- Several map overlays deliberately set `frustumCulled={false}`. Some use
  shader-side or depth-based rejection, which avoids visible far-side output
  but can still submit unnecessary instances and perform vertex work.
- Multiple independent `useFrame` loops remain. Each one can keep the canvas
  active even when its visible result has settled.

The first 3D performance change must be instrumentation. Quality, cache, and
request settings must not be changed blindly.

### 2D tiles and composition

`flatTileLayer` already:

- derives an exact visible map-space window;
- limits XYZ ranges to that window plus configured prefetch;
- cancels obsolete authenticated requests;
- uses bounded concurrency, ancestor fallback, settle delay, and an LRU cache;
- draws only tiles that intersect the visible view.

The larger 2D cost is composition:

- every completed tile currently advances a React epoch;
- the main canvas redraw includes the base map, tiles, propagation layers,
  spots, labels, and other overlays;
- active-grid glow animation advances a React tick every animation frame;
- that glow tick can redraw the full main canvas rather than only the animated
  overlay.

The plan therefore preserves the existing tile-range logic and separates
retained/static rendering from dynamic overlays.

### Active grids

There are currently two grid semantics:

- persistent activity uses four-character Maidenhead squares and a 30-minute
  rolling count;
- transient arrival glow uses two-character Maidenhead fields.

Additional limitations:

- reports are deduplicated by position and timestamp rather than a stable
  source/report identity;
- both reporter and DX endpoints can contribute without an explicit semantic
  distinction;
- absolute count thresholds do not account for time window, unique callsigns,
  or source mix;
- the persistent 3D pool takes the first bounded set rather than ranking cells
  by visibility, density, and recency;
- both grid renderers can continue per-frame work or submit far-side instances;
- the activity input may reflect display-density filtering rather than the
  entire eligible feed.

### Operating modes and data provenance

The current concepts are independent:

- observatory mode controls lean-back presentation and globe navigation;
- an operating profile controls layers and visual filters;
- QSO operating mode controls logging fields;
- contest store tracks the active contest session;
- FT8 session state has its own contest signal;
- map interaction mode controls renderer-agnostic targeting behavior.

The built-in contest profile describes a focused view but still enables public
spots, and the contest overlay engine derives multiplier candidates from the
public DX Cluster feed. Layer visibility alone cannot express whether a layer
may use public, own-station, active-session, or selected-target data.

## Product contracts

### Hover and selection

- One pointer position has at most one spot-hover owner.
- Moving between a tag and its preview does not dismiss the preview.
- A feed refresh or stale unmount cannot dismiss a newer hover.
- A report exposed by both a label and an endpoint behaves as one interaction
  target.
- Hovering or clicking an aggregate never activates a hidden member underneath.
- Dense tags never blink, rapidly swap identity, or become unselectable.
- The hover preview fully obscures animated paths beneath its content surface.
- Click, keyboard, touch, and double-click isolation behavior remains intact.

### Rendering order

- Basemap imagery and terrain establish the surface.
- Day/night shading affects surface layers that are intended to be illuminated.
- Surface-aligned scientific and grid overlays follow an explicit depth policy.
- Live paths, endpoints, beacons, selected paths, and labels follow documented
  relative ordering.
- Interactive DOM overlays render above all WebGL content.
- Far-side labels, hit targets, and interaction surfaces are unavailable even
  when a visual shader could technically draw them.
- The same semantic hierarchy applies in 3D, flat, and azimuthal projections.

### Tile and frame work

- While the camera is moving, tile requests are limited to the visible area.
- Optional neighboring-tile prefetch begins only after the configured settle
  delay.
- Obsolete requests are cancelled when the view changes.
- A stationary view produces no new tile requests.
- A settled scene with no active visual animation does not continuously
  invalidate the renderer.
- An animated 2D overlay does not redraw the static basemap and tile layer.
- Performance-quality changes are supported by captured before/after metrics.

### Active grids

- Grid color and intensity have one documented meaning in every projection.
- Density and recency are visually distinguishable.
- Grid resolution adapts to zoom instead of placing enormous field pulses over
  a detailed regional view.
- The default activity surface represents DX/contact endpoints.
- Reporter-origin activity is available as a separately labeled option.
- Selecting a grid exposes the exact contributing reports.

### Operational scopes

| Scope | Default data | Public assistance |
| --- | --- | --- |
| Observe | Public live spots, activations, beacons, traces, and global active grids | Enabled |
| Log | Current target, own rig/WSJT-X activity, own RX/TX paths, QSO draft, and recent own QSOs | Disabled by default |
| Contest | Active-session QSOs, own-station activity, needed multipliers, bandmap/queue, and selected targets | Disabled by default and explicitly labeled if enabled |

- Entering a focused scope preserves the operator's observation-layer settings.
- Leaving the focused scope restores those settings.
- Contest assistance state is visible and cannot silently change an operator's
  assisted/unassisted posture.
- Automatic scope derivation has one precedence rule: active contest session,
  then active logging/station session, then observation.
- A visible scope control permits deliberate manual override.

## Execution plan

## PR 1 — Deterministic hover arbitration and tooltip compositing

### Implementation

1. Add a development-only dense-overlap fixture supporting 2, 5, 20, and 50
   co-located reports, mixed spot sources, activations, feed refresh, and trace
   expiry.
2. Add optional hover-transition diagnostics containing the pointer position,
   complete candidate set, chosen identity, reason for the choice, and dismiss
   reason. Keep diagnostics disabled in production.
3. Introduce a single hover controller with:
   - stable report identity;
   - deterministic priority;
   - distance and source tie breakers;
   - a small screen-space hysteresis region;
   - owner-aware delayed dismissal;
   - animation-frame-throttled anchor updates.
4. Register DOM labels and WebGL endpoint hit targets as interaction surfaces
   for the same report instead of allowing each surface to own independent
   hover state.
5. Do not dispatch a new hover selection when only the cursor anchor changes.
6. Derive the label-to-preview transit envelope from actual anchor and preview
   bounds. Cancel dismissal on preview pointer/focus entry.
7. Render map previews in a dedicated DOM overlay portal with a named z-index
   token above every Drei `Html` layer.
8. Make the preview content surface opaque and remove WebGL backdrop filtering.
   Keep translucency only on decorative chrome that does not sit behind text.
9. Preserve detailed existing comments. Add focused comments around ownership,
   hysteresis, and why duplicate interaction surfaces are unified.

### Tests

- Arbitration chooses one deterministic winner for equal-distance candidates.
- Candidate input order does not change the winner.
- Repeated pointer movement for the same winner does not replace hover data.
- Stale leave/unmount does not dismiss a newer owner.
- Tag-to-preview movement does not create a null-hover frame.
- Preview-to-tag movement behaves the same way.
- Aggregate hover blocks hidden members.
- Keyboard focus and click behavior remains accessible.

### Exit criteria

- No visible blinking during a 10-second stationary hover over each density
  fixture.
- No unexpected identity changes in the diagnostic trace.
- Bright selected and highlighted paths do not show through preview content.
- Light-side, terminator, and dark-side checks pass in Chromium and WebKit when
  available.

## PR 2 — Shared screen-space layout, label stacking, and aggregation

### Implementation

1. Create one projection-independent candidate model for DX labels, spotter
   labels, activation labels, endpoints, and aggregate beacons.
2. Project candidates to the viewport and reject invalid, far-side, and
   margin-external candidates before layout.
3. Build a deterministic spatial-hash layout pass. Candidate priority should
   include selected state, watched state, active band, recency, source type,
   and stable identity.
4. Place non-conflicting labels directly. Apply bounded, deterministic offsets
   to small conflicts.
5. Convert dense unresolved conflicts into one aggregate beacon. Use a bounded
   logarithmic or square-root count scale so a very large aggregate remains
   usable.
6. Replace the separate geographic stacking paths in live spots and activation
   markers with this layout result.
7. Recompute on meaningful camera, viewport, label-scale, filter, or feed
   changes. Do not run a React layout update on every animation frame.
8. Use the same stable member ordering and collection popover for aggregate
   selection.
9. Keep unresolved-location reports visible in lists without creating a false
   geographic aggregate.

### Tests

- Collision decisions are stable across input order and feed refresh.
- Dateline, pole-adjacent, and exact-coordinate overlaps are handled.
- DX, spotter, and activation candidates collide with one another.
- Zooming in separates an aggregate only after sufficient screen space exists.
- Hidden and far-side members cannot receive pointer events.
- Aggregate count, centroid, primary member, and member ordering remain stable.

### Exit criteria

- Dense northeast-U.S. and multi-region fixtures produce readable aggregates.
- No visible label overlap remains outside the documented small-stack limit.
- Every exposed standalone tag and aggregate member is selectable.
- Camera rotation does not make labels oscillate between adjacent placements.

## PR 3 — Render-order contract and 3D performance budgets

### Instrumentation first

Capture, behind development diagnostics:

- frame time and p50/p95 frame time;
- renderer invalidations per second;
- WebGL draw calls, triangles, geometries, and textures;
- visible, active, cached, queued, downloading, failed, and decoded tiles;
- imagery and label tile counts separately;
- visible/submitted counts for paths, labels, hit targets, beacons, and grids;
- camera-moving, settling, and stationary phases.

Store a repeatable baseline for global, continental, regional, and local zoom
using balanced and UHD quality profiles.

### Implementation

1. Formalize WebGL render-order tokens and DOM overlay z-index tokens. Document
   the depth-test, depth-write, transparency, and illumination expectation for
   every major map layer.
2. Add update-on-change behavior to the label tile renderer.
3. Suspend label tiles entirely when labels are disabled.
4. Wire quality-profile cache and request budgets only where the metrics prove
   they are currently unbounded or mismatched.
5. Allow prefetch only after navigation settles.
6. CPU-cull screen-oriented labels and hit targets to the visible hemisphere.
7. Rank/cull large instanced overlays before GPU upload where shader-side
   rejection currently submits the whole globe.
8. Consolidate compatible animation clocks and stop them when their visual
   phase ends.
9. Profile the separate label renderer. If its duplicate traversal is material,
   prototype either shared visible-tile selection or provider-side compositing;
   adopt the safer option only when visual and attribution behavior remains
   correct.
10. Verify surface overlays on the day side, at the terminator, and on the dark
    side against the render-order matrix.

### Exit criteria

- Stationary scenes issue zero tile requests.
- Settled scenes without active animation have zero continuous invalidation.
- No far-side labels or hit targets are submitted as interactive candidates.
- A configured idle-prefetch ring never grows beyond its documented radius.
- Balanced quality maintains the agreed reference-device frame budget without
  degrading visible tile sharpness.
- Before/after diagnostic captures are attached to the PR.

## PR 4 — Retained 2D tiles and canvas composition

### Implementation

1. Preserve the existing viewport tile-range, cancellation, LRU, concurrency,
   and ancestor-fallback behavior.
2. Split rendering into retained canvases or equivalent retained surfaces:
   - base imagery and loaded tiles;
   - slow propagation/scientific layers;
   - live spots, paths, endpoints, and labels;
   - animated highlights and active-grid effects.
3. Coalesce tile completion notifications into at most one invalidation per
   animation frame.
4. Redraw the retained tile surface only when view state, provider, quality, or
   tile readiness changes.
5. Move active-grid animation off the main React `glowTick` redraw dependency.
6. During active navigation, use a zero prefetch radius. Restore the configured
   radius only after the settle delay.
7. Retain visible ancestor tiles until exact children are ready so optimization
   does not introduce flashes or blank areas.
8. Add development tile-bound and dirty-layer visualization.

### Tests

- Visible-window XYZ range at dateline wrapping and Mercator latitude limits.
- Obsolete loading requests are cancelled after view changes.
- Tile completions within one frame create one retained-layer invalidation.
- Grid animation does not invalidate the basemap/tile surface.
- Offscreen prefetched tiles are never drawn.
- Rapid pan reversal reuses valid cache entries without duplicate requests.

### Exit criteria

- No offscreen tile requests occur while the operator is actively navigating.
- Animated grid/highlight frames do not redraw the base map.
- No new tile seam, flash, tainted-canvas, or provider-fallback regression.
- Before/after 2D navigation traces are attached to the PR.

## PR 5 — Unified active-grid activity and adaptive LOD

### Data model

Create a renderer-independent activity model containing:

- stable grid ID and resolution;
- report count;
- unique DX callsigns;
- unique reporter callsigns;
- unique paths where available;
- most recent activity timestamp;
- oldest retained activity timestamp;
- source and mode mix;
- contributing report identities;
- density score and recency score as separate values.

### Implementation

1. Aggregate from the complete eligible feed before display-density limiting.
2. Deduplicate with source/report identity. Define a documented fallback key for
   sources that do not provide a stable ID.
3. Default activity to DX/contact endpoints. Add reporter-origin activity as a
   separate selectable semantic rather than silently double counting paths.
4. Use adaptive resolution:
   - coarse fields for global views;
   - four-character grids for regional views;
   - finer resolution only at zoom levels where the cells remain selectable.
5. Encode density with persistent fill and recency with a short border/pulse.
   Remove the simultaneous unrelated two-character and four-character effects.
6. Rank visible cells by visibility, recency, and density before enforcing a
   GPU/UI budget.
7. Stop the animation clock when all recency pulses have settled.
8. Use one semantic model in globe, flat, and azimuthal renderers.
9. Make each grid selectable and expose its exact contributing reports using
   the canonical spot collection and selection path.

### Tests

- Stable-ID deduplication and fallback deduplication.
- Rolling-window expiry while feeds are quiet.
- DX-only, reporter-only, and mixed-source semantics.
- Adaptive resolution transitions without count loss.
- Visible ranking and deterministic bounded selection.
- Cross-projection count and color consistency.

### Exit criteria

- The same source fixture produces the same activity facts in every projection.
- Zoom transitions do not double count or temporarily erase activity.
- A selected cell's member list reconciles with its displayed counts.
- Idle persistent cells do not require a full-frame animation loop.

## PR 6 — Observation, logging, and contest data scopes

### Architecture

Introduce a renderer-independent operational context. Suggested types:

```ts
type MapDataScope = "observe" | "log" | "contest";

type MapDataProvenance =
  | "public"
  | "station"
  | "session"
  | "selected";
```

Layer configuration must describe both whether a layer is visible and which
provenance it may consume. Do not encode provenance as another set of unrelated
layer booleans.

The focused scopes are also workspace modes, not map filters alone. PropSphere
must bridge observation into the application's existing operating tools so an
operator can select activity, work the contact, and log it without mentally or
visually switching between unrelated products. The implementation should reuse
the established QSO draft/editor, contact logging, CAT/radio, WSJT-X/FT8, and
contest services rather than introducing a second logging stack.

### Implementation

1. Add one derived operational-context selector with precedence:
   - active contest session;
   - active logging/rig/WSJT-X station operation;
   - normal observation.
2. Add a visible scope chip/control and an intentional manual override.
3. Define source policies for live spots, paths, labels, active grids, logged
   QSOs, contest QSOs, FT8 RX/TX, selected target, and needed multipliers.
4. In logging scope, show own-station activity, current target/draft, recent own
   QSOs, and station paths. Hide public spots, public paths, and global activity
   unless explicitly enabled.
5. In contest scope, show the active session, own station, bandmap/queue,
   selected targets, and contest-relevant overlays. Default public spotting
   assistance off.
6. If contest public assistance is enabled, show a persistent assisted indicator
   and store the choice per contest session.
7. Preserve and restore observation layer/filter settings across scope changes.
8. Replace the contest operating profile's unconditional public `spots: true`
   behavior with the operational source policy.
9. Update the contest overlay engine so multiplier candidates respect the
   session's public-assistance policy.
10. Normalize own-station identity across QSO, contest, FT8, WSJT-X, and CAT
    events sufficiently to filter RX, TX, draft, and completed contacts.
11. Add a responsive PropSphere operating workspace that can be shown as a
    docked overlay panel in the normal view and opened as a synchronized
    secondary window when screen space or operator workflow calls for it.
12. Compose that workspace from existing contact-entry, QSO draft, lookup,
    radio/CAT, WSJT-X, and contest components or their underlying shared hooks.
    Do not fork validation, persistence, scoring, rig-control, or lookup logic.
13. Keep map selection, current target/path conditions, tuned frequency/mode,
    active QSO draft, session contacts, and focus state synchronized between the
    3D view, 2D view, docked workspace, and secondary window.
14. Make the observation-to-operation transition explicit: selecting a public
    report may seed a target and draft, but entering log/contest scope switches
    the map to owned/session provenance. The source report remains attributable
    without leaving unrelated public traffic visible.
15. Preserve the standalone logging and contest routes as full-page workflows;
    the PropSphere workspace is an integrated presentation of the same state and
    commands, not a replacement data model.

### Tests

- Automatic scope precedence and manual override.
- Enter/exit preservation of observation settings.
- Logging scope excludes public feed records.
- Contest scope excludes public feed records by default.
- Enabling assistance exposes and persists the assisted indicator.
- Ending a contest session restores the previous observation state.
- Renderer adapters receive identical scoped data in globe, flat, and
  azimuthal views.
- A selected public spot can seed the existing QSO draft, enter logging scope,
  follow CAT/WSJT-X frequency and mode updates, and save through the canonical
  logging path without duplicated records.
- Docked and secondary-window workspaces remain synchronized when either side
  edits the target, QSO draft, radio state, or contest session.
- Closing or reopening the integrated workspace does not lose an in-progress
  draft and does not alter the saved observation-layer configuration.

### Exit criteria

- Starting a logging or contest session cannot silently leave public activity
  visible.
- Ending the session restores the operator's prior observation configuration.
- Every visible map item can be traced to an allowed provenance in diagnostics.
- Contest assistance state is obvious in both normal and fullscreen layouts.
- An operator can discover a station in observation mode, transition into a
  focused operating workspace, work and log the contact, and return to the
  restored observation view without leaving PropSphere or re-entering data.

## Cross-PR verification matrix

### Hover and density

- 2, 5, 20, and 50 exact-coordinate overlaps.
- Dense northeast-U.S., Gulf Coast, Texas, Europe, and dateline fixtures.
- DX Cluster, FT8/digital, CW, SSB, RTTY, POTA, SOTA, beacon, and mixed source
  combinations.
- Pointer stationary, slow transit, rapid transit, click, double-click,
  keyboard, touch, feed refresh, and expiring trace cases.

### Projection and lighting

- Globe day side, terminator, and dark side.
- Flat view at global, continental, regional, and local zoom.
- Azimuthal overview and selected-target state.
- Normal and fullscreen layouts.
- Dark and light application themes where supported.

### Performance

- Balanced and UHD quality profiles.
- Stationary, continuous pan/rotation, wheel zoom, rapid direction reversal,
  and settle phases.
- Labels off/on and imagery-only versus imagery-plus-label tiles.
- Spots and active grids at 50, 200, 500, and 1,000 eligible reports.
- Baseline and after captures from the same reference device and viewport.

### Operational scopes

- No session, logging-only, WSJT-X-connected, contest-active, and contest-ended.
- Public assistance disabled and enabled.
- Own RX, own TX, current draft, completed QSO, contest QSO, public report, and
  selected public target provenance.

## Delivery and review protocol

For every PR:

1. Start from the latest clean `main` in a dedicated worktree or branch.
2. Inspect the shared root worktree before editing and never overwrite unrelated
   user or agent changes.
3. Preserve detailed existing comments. Add comments where ownership, render
   order, scheduling, or provenance behavior is non-obvious.
4. Keep the PR below 20 changed files when practical.
5. Run focused tests during implementation.
6. Run `npm run lint` and `npm run build` before opening the PR.
7. Run the full applicable test suite and record any demonstrably pre-existing
   failures separately.
8. Include screenshots or a short capture for visible UI changes and attach
   performance evidence for rendering PRs.
9. Address actionable AI and human review feedback. Reply with technical
   reasoning when a suggestion is not applicable.
10. Poll CI/review approximately every five minutes. Once CI is green and no
    new actionable feedback has appeared for ten minutes, merge with branch
    deletion.
11. Rebase or refresh the next PR from the newly merged `main` before continuing.

## Completion definition

The goal is complete only when all six PRs are merged, their production checks
are green, all actionable review feedback is resolved, the cross-PR verification
matrix has been exercised, and no required follow-up is left merely documented
without an owner or scheduled PR.
