# PropSphere HamClock Experience Revision Plan

Status: initial revision implemented and browser-verified; physical display/performance review pending
Owner: PropSphere
Last updated: 2026-09-04

## Outcome

Make HamClock a polished ProPulse display for both detailed station use and
viewing from across a room. Retain the fixed HamClock panels around any supported
projection, including the 3D globe. Give operators readable controls, useful
regional framing, vivid geographic detail, stable interaction, and a companion
view of operating activity and their contacts.

The primary reference setup is the owner's 55-inch 4K monitor above a 57-inch
ultrawide, viewed from approximately 20 inches away. The owner wants detail and
modest interface enlargement. A display viewed from roughly ten feet away is a
second validation scenario, not the assumed use of every large monitor.

Screen resolution does not tell us physical size, viewing distance, or desired
information density. Do not automatically simplify HamClock because it is on a
4K screen. UI size, map zoom, and imagery quality serve different needs.

## Relationship to existing work

- [HamClock refinement plan](PROPSPHERE-HAMCLOCK-REFINEMENT-PLAN.md): completed
  baseline and implementation history. This revision proposes replacing its
  separate Traffic/Bands interaction with shared activity filtering.
- [UHD and Wall Display plan](PROPSPHERE-UHD-WALL-DISPLAY-PLAN.md): retain its
  quality profiles, tile providers, attribution, scene system, and display tools.
- [Rendering and operating modes plan](PROPSPHERE-RENDERING-INTERACTION-OPERATING-MODES-WORK-PLAN.md):
  coordinate renderer instrumentation, composition, grid activity, and data
  scopes with that work. Reuse landed fixes; do not start a competing rewrite.
- [SDR product vision](../comp_analysis/SDR_Product_Vision_Document.md): retain
  progressive depth, hardware independence, shared configuration, and extensibility.

This plan is the next HamClock revision. It does not mark existing rendering
work complete or authorize implementing the entire future ecosystem.

## Product decisions

### 1. One familiar application

HamClock arranges the existing ProPulse experience for a dedicated display.
Reuse the application's station selection, band/mode controls, spot details,
logbook terminology, accessibility preferences, and anchored popover/modal
patterns. Let operators choose the panels within the fixed HamClock composition;
keep the existing sidebars rather than introducing free-floating windows or a
separate logging workflow.

The existing presentation name is **Observatory**. Reuse that name consistently.
It describes a wider, visually rich, optionally moving Earth presentation.
It does not mean enabling every analytical overlay at once. Combine Observatory
behavior with the HamClock shell without ejecting the operator into another layout.

Keep projection independent: **Flat / AZ / 3D**. Changing the activity filter,
expanding a panel, or choosing Observatory must not silently change projection.
Keep Satellites and Weather reachable as focused presets using existing language.

### 2. Smart scaling and chosen panels, independent of map zoom

Start with the existing **Text Size** preference (`sm/md/lg/xl`) and shared design
tokens. Audit which HamClock elements bypass those tokens with fixed pixel sizes.
Scale the surrounding controls, row heights, spacing, and panel widths along with
text so increasing readability does not cause clipped labels or tiny targets.

Provide a compact Display settings popover with **Smart scaling**, the familiar
**Text Size** preference, and **Choose panels**. Audit the main interface's fit and
scaling behavior before implementation and reuse sound shared behavior. Prototype
the four existing text sizes before adding another slider or density control;
extend the range only if physical-display review shows it is insufficient.

Smart scaling fits the operator's chosen content around their preferred readable
size. It uses available viewport space and selected panel minimum sizes, not an
assumed viewing distance. Adapt panel width, padding, and visible list-row counts
within defined limits. Text Size sets the readability floor; fitting must never
shrink text below it. With Smart scaling off, use the chosen size and predictable
scrolling. Smart scaling must not resize imagery buffers or change map zoom.

**Choose panels** lists existing HamClock sections with simple visibility toggles:
DX Spots, Band Conditions, station/target details, Space Weather, Moon, Contests,
DXpeditions, and Reliability. Include Recent Contacts when Phase 3 ships. Preserve
the clock, map, essential status, and navigation as the shell. Selected sections
use stable positions; support an optional **Keep visible** priority in the picker
if needed for the panels the operator wants expanded at all times. Initial
defaults retain the familiar composition; no blank dashboard setup is required.

The give-and-take must be understandable:

1. Larger text leaves fewer visible list rows; smaller text allows more detail.
2. Removing an unwanted panel frees room for selected panels and their content.
3. First adjust spacing and row counts, respecting minimum usable panel sizes and
   minimum map space. Do not reorder panels when new data arrives.
4. If the selection cannot fit, show that fact in the settings preview: for
   example, “These panels need scrolling at this size.” Offer a smaller selection
   or an explicit choice to collapse lower-priority panels. Do not silently remove
   selected widgets, reduce readability, or start automatically rotating pages.
5. Keep scrolling as the reliable fallback. In a distant-display arrangement,
   help the operator choose a smaller set that fits without scrolling.

Preview changes live and provide reset. Save selected panels, expansion intent,
priorities if used, Smart scaling, and size with the local view/display preferences.
Resizing the browser must not overwrite those choices with transient fit results.
Distinguish user collapse from any explicitly allowed adaptive collapse so more
space restores only panels the operator wanted expanded. Ignore unknown saved
panel IDs safely during migration. Panel visibility controls presentation, not
whether canonical logging or shared station synchronization continues.

Example compositions, not new operating modes:

| Use | Chosen content and scaling behavior |
| --- | --- |
| Owner's close-up 4K screen | Detailed DX Spots, Recent Contacts, and conditions; modest text enlargement; long lists remain available |
| Across-room display | Larger text with a small chosen set, such as clock/status, Band Conditions, and Recent Contacts; essential chosen panels fit without scrolling |
| Observatory | Map-heavy composition with a few chosen condition panels; no forced reset of the operator's saved panel choices |

Implementation requirements:

- Use layout/font tokens; do not transform-scale the entire application or canvas.
- Map rendering remains at the selected imagery quality and device pixel ratio.
- Respect browser zoom, keyboard focus, and existing high-contrast/color settings.
- Constrain sidebar overflow and retain usable map space at every supported size.
- Compute fit from stable container measurements and explicit size bounds; avoid
  resize feedback loops, oscillation near breakpoints, and per-tile fit recalculation.
- Provide a clear reset to the inherited application Text Size.
- Resolve overrides in this order: local view override, assigned display setting,
  application preference. An override replaces the inherited size; it does not
  multiply it. Store view preferences independently of shared operating state.
- Reuse paired-display configuration where possible. Audit `useDisplaySync`,
  which currently writes assigned text size into application settings, before
  claiming per-display isolation. Define persistence for an unpaired companion
  window so its size does not change the operator's other window.

### 3. Home-region framing with a stable camera

On first entry without an explicit saved scene or user framing, use the active
station location to frame a useful home region. For a continental-US station,
the initial view should comfortably show the continental US and nearby paths,
not a city-level crop. Support the equivalent intent elsewhere without assuming
all continents have the same size or centering on a continent's geometric midpoint.

Fit the region to the actual map viewport after sidebar layout. On a globe, keep
the relevant region on the visible hemisphere. Include sensible margins and
handle dateline-crossing regions and stations near regional boundaries. When
location is unavailable, show a coherent world view and use existing station setup.

Precedence: explicit scene framing, deliberate local framing, then home-region
startup. Late station hydration must not override a camera the user already moved.
Provide **Home region** as a reset. Observatory may widen the framing and enable
optional rotation; leaving it restores the previous deliberate framing.

Opening an accordion must preserve both map center and geographic scale. When
sidebar width or Text Size changes the viewport, preserve center and geographic
scale as far as projection limits allow; reveal/crop at the edges rather than
starting a camera animation. Apply any necessary bounds correction once after
layout settles. Do not repeatedly refit during CSS transitions.

### 4. Clear activity controls instead of duplicate modes

Consolidate Traffic and Bands into a single activity experience. Band selection
is a filter within it; Band Conditions remains a panel for comparing conditions.
Reuse the standard band/mode selector and the operating context exposed by
`useActiveBandMode`. Avoid a new Contact mode and competing HamClock-only band state.

Add **Follow radio** when a live radio source is available. Manual selection
continues to work without a bridge. Clearly show the selected band/mode and
whether the source is live, manual, or disconnected; do not describe retained
values after a disconnect as live radio state. Following updates this display's
filter and does not tune hardware.

Migrate saved Traffic/Bands preferences deliberately: both map to activity;
retain an operator's explicit band selection and exit-restore behavior. Verify
filters affect the spot list and map consistently, including active grids.

### 5. Fixed sidebar for opportunities and recent contacts

Offer two sections, enabled by default, in the existing spots sidebar (right by
default, preserving the side-swap preference). Either can be hidden through
Choose panels:

- **DX Spots:** recent stations matching the chosen band/mode, showing callsign,
  frequency, spot age, and existing worked/needed indicators. Start with existing
  filtering and ranking; do not imply a public report proves this station can hear us.
- **Recent Contacts:** actual logged contacts, newest first, with callsign, time,
  band, and mode. Use existing logbook/session selectors. Default to the active
  session where one is defined; otherwise explicitly label a Today scope using
  the operator's configured time convention. Keep older entries accessible.

Both sections remain independently scrollable/collapsible and readable at larger
Text Sizes. Avoid automatic scrolling that displaces the row someone is reading.
Use existing spot and contact detail interactions.

Give the map a compact **Activity / My contacts / Both** content choice. Render
only logged contacts as My contacts; distinguish them from public reports and
own-station decodes. Use status shapes/line treatments plus a small legend,
preserving the existing band palette instead of giving colors conflicting meanings.
Contacts without usable locations stay in the list with location unavailable;
do not invent a map position. Logged does not imply independently confirmed.

An optional brief highlight may acknowledge a new logged contact. It must not
pan the map or restart an animation indefinitely as synchronization repeats.

### 6. Fidelity with readable overlays

Keep regional satellite detail, coherent day/night appearance, and restrained
chrome as primary visual qualities. Tune analytical fills independently from
spot markers and path colors. Strong colors covering large areas should not
erase terrain contrast or turn the satellite surface into a uniform wash.

Compare lower-opacity fills, boundaries/contours, and selected-path emphasis
using the same scene at multiple zoom levels. Preserve scale legends, data meaning,
existing band colors, and accessibility alternatives. Do not change scientific
thresholds or manufacture extra spatial precision as part of a visual pass.

Use good defaults first. Reuse existing layer opacity controls where appropriate;
defer an assortment of saturation/contrast sliders until a demonstrated need.

### 7. A companion window that follows the station

Share current operating band/mode and canonical log updates. Keep projection,
camera, Text Size override, map content choice, and panel layout local to each
display. A monitor should follow station activity without rearranging the main
operating window or commanding its radio.

Audit existing logbook synchronization, event handling, and paired-display tools.
Test same-browser windows first; document cross-device behavior separately.
Synchronize contact creation, edits, deletion, reconnect catch-up, and deduplication
by stable identity. A local cross-tab event is not evidence that separate devices
will synchronize. Show truthful loading, stale, disconnected, and empty states.

## Evidence and unresolved diagnoses

The owner reports unreadably small side content, map movement when opening Band
Conditions, washed-out colored overlays, and sluggish high-quality regional zoom.
The panel-resize report and repeated canvas work were reproduced below; physical GPU/frame-budget validation remains pending.

Baseline code inspection found:

- `HamClockView` uses a 36px header and fixed 240/280px sidebar widths; some
  HamClock controls use 9–12px text. Shared Text Size and display overrides exist.
- Traffic and Bands share almost all map layers, with Bands adding spot traces,
  band focus filters, and different default Band Conditions expansion.
- Both presets enable grid activity; disappearing grids are not an intended
  distinction. Check filter eligibility and rendering separately.
- Flat layout resize math preserves normalized center while retaining zoom scale;
  a changed map-box size can still change apparent geographic scale. Accordion
  content, grid sizing, and observer callbacks are investigation leads, not a
  confirmed explanation of the reported panel movement.
- The flat MUF overlay uses blurred colored cells at 45% opacity. It is a plausible
  source of the wash, but the exact reported overlay must be identified in the UI.
- Flat-map glow ticks and tile arrivals can trigger the full drawing pass, which
  includes base imagery and MUF calculation on a newly created temporary canvas.
  Measure the cost before assigning the slowdown to downloads or the GPU.

## Delivery sequence

### Phase 1 — Reproduce, measure, and stabilize

Before launching, follow [Local agent testing](../guides/LOCAL-AGENT-TESTING.md):
claim or verify a server, choose connected versus local UI testing, account for
login/welcome/setup/tour state, and record the browser context and server owner
in the handoff. Do not profile an unidentified instance or restart another
agent's server. First-visit and configured-operator checks need separate contexts.

1. Record the exact projection, layers, filter state, browser viewport, DPR,
   browser/OS scaling, imagery quality, and visible traffic for each reproduction.
2. Capture opening/closing Band Conditions and switching Traffic/Bands; track
   map viewport bounds, resize callbacks, camera center, and geographic scale.
3. Capture cold and warm regional zoom traces. Separate tile network/decode cost,
   React updates, overlay calculation, canvas composition, and GPU frame work.
4. Apply focused fixes for panel/camera coupling and unintended grid disappearance.
5. Optimize demonstrated repeated work: cache stable imagery/analytical layers,
   coalesce tile invalidations, and animate changing overlays independently where
   measurements justify it. Reuse existing tile culling/cache behavior.

Done when: accordion changes produce no measurable camera/scale change at an
unchanged map viewport; grid behavior matches filter eligibility; warm zoom stays
responsive while imagery refines. Record before/after traces with identical
quality and traffic. Target p95 frame work within one display refresh interval
during warm interaction and no repeatable app-caused stalls over 100ms on the
reference machine. Report misses rather than silently lowering quality. Retain
the old imagery during refinement so delayed tiles do not create blank flashes.

### Phase 2 — Scale, framing, and visual composition

1. Wire HamClock to shared text/layout sizing with local override semantics.
2. Implement Smart scaling and Choose panels with live preview, deterministic fit,
   explicit overflow handling, saved choices, and a reset to useful defaults.
3. Implement home-region framing and camera preservation across layout changes.
4. Refine panel hierarchy and overlay appearance at standard and larger sizes.
5. Verify fixed-panel 3D support and Observatory entry/exit using shared behavior.

Done when: the owner can retain detailed content while enlarging the interface
and choose which panels receive the available space; oversized selections have
an honest, usable fallback; the map stays sharp and steady; startup is regionally
useful; an enlarged selection is also usable from across the room after physical
review. Fit changes must not cause camera motion or repeated layout oscillation.

### Phase 3 — Simplify activity and add the contacts companion

1. Consolidate Traffic/Bands and migrate saved preferences.
2. Add Follow radio with truthful source state and manual fallback.
3. Add Recent Contacts beside DX Spots and the map content choice.
4. Wire canonical operating/log updates across windows, retaining local display
   preferences. Reuse supported cross-device synchronization where it exists;
   record remaining integration gaps explicitly.

Done when: a contact logged in another ProPulse window appears once in the list
and, when located, on the map; edits/deletions propagate; changing the operating
band updates a following display; the monitor never changes the other window's
camera, size, layout, or radio frequency.

### Phase 4 — Integrated verification and product review

Run focused regression tests for camera/layout math, scaling/fit bounds and
overflow, selection and expansion restoration, preference migration and isolation,
filter/grid semantics, and contact identity handling. Run repository
lint, relevant existing tests, and production build for implementation changes.
The repository now has Vitest and Playwright despite the older AGENTS.md note.

Manual matrix:

| Scenario | What must be checked |
| --- | --- |
| 55-inch 4K above ultrawide, approximately 20 inches away | Detail retention, modest Text Size increase, comfortable panels, regional imagery |
| Large display approximately ten feet away | Enlarged essentials readable physically; detail still reachable |
| 1080p/1440p desktop and narrow browser window | No clipped controls or unusable map; predictable overflow |
| Few/many selected panels at every Text Size, Smart scaling on/off | Readability floor, overflow preview, stable fit, reset, reload restoration, no loss of user choices |
| Flat and 3D, with AZ regression smoke | Startup, pan/zoom, Home region, panel changes, projection transitions |
| Day/night and sparse/dense traffic | Overlay contrast, legend meaning, labels, grid activity, warm/cold performance |
| Manual operation, live radio, disconnect/reconnect | Accurate source state, filter behavior, no unintended tuning |
| Two ProPulse windows and a supported paired display | Shared operating/log data, independent presentation, refresh/reconnect correctness |

Include screenshots at fixed scenes and sizes, interaction recordings, and
performance evidence. Headless 4K screenshots establish layout, not physical
readability. Record physical-display review separately. Run an always-on session
of at least one hour to check cache growth, stale data, repeated animations, and
resource cleanup before claiming companion-display readiness.

## Implementation touch points

| Area | Existing starting points |
| --- | --- |
| Shell and panels | `HamClockView.tsx`, `components/map/hamclock/*` |
| Preferences and display isolation | `hamclockStore`, `settingsStore`, `displayStore`, `useTextScale`, `useDisplaySync`, `styles/design-tokens.css` |
| Modes and camera restore | `mapStore`, `lib/hamclock/modePresets.ts`, existing Observatory behavior |
| Flat rendering and resize | `FlatMapView.tsx`, `components/map/lib/flatMapLayout.ts`, `lib/tiles/flatTileLayer.ts` |
| Globe rendering | `GlobeView.tsx`, `TiledGlobe.tsx`, shared rendering instrumentation |
| Location and operating context | `useActiveLocation`, `useActiveBandMode`, existing region helpers |
| Spots and contacts | `DXSpotList`, `useLogbook`, `useLoggedQsoLocations`, `lib/sync/modules/logbookSync.ts` |

## Future direction retained as context

AetherDX is intended as the open-source SDR integration path, evolving toward a
simple installer for a bridge supporting multiple devices and browser operation.
The longer-term direction includes a standalone package, locally available core
operation without a required subscription, and replaceable spot/data providers.
Keep these as architecture constraints: share station concepts, preserve source
identity, and avoid making HamClock depend on a particular bridge or provider.
Installer packaging, new hardware integrations, offline asset/model distribution,
subscription changes, and a general plugin system are outside this revision.

The competitive aim remains a visually excellent Earth/ham display with useful
station-specific intelligence. A later extension can connect propagation and
solar-model output to observed activity and operating results, with freshness,
evidence, and confidence. This revision must not present model forecasts as
confirmed openings or imply prediction quality has already been validated.

## Review checkpoints

- After Phase 1: verify the reported bugs and measured performance improvement.
- During Phase 2: compare actual Text Sizes, chosen-panel combinations, Smart
  scaling tradeoffs, and overlay treatments on the owner's monitor; adjust token
  values, fit bounds, and regional margins using those results.
- Before Phase 3: settle the compact placement of activity controls within the
  existing header and verify Recent Contacts scope against available session data.

These are concrete product review points, not reasons to block independent
diagnosis or invent additional modes before the simpler composition is tested.


## Implementation and validation — 2026-09-04

Delivered in this revision:

- Fixed the intrinsic grid-row minimum that let expanded Band Conditions grow the
  map beyond the viewport. Sidebar resizing preserves geographic scale and center
  within projection bounds; column transitions no longer repeatedly resize it.
- Uses the separate flat-map render surfaces already on main, with cached
  coarse MUF calculations by minute/solar flux, and coalesced tile invalidations.
  MUF fills use 22% opacity in HamClock, preserving the existing model resolution.
- Added Display → Text Size, Smart scaling, Choose panels, Reset display, and an
  explicit scrolling notice. Local choices use sessionStorage and do not change
  the application root text size. Additional 200%/250% options support larger text.
  At constrained sizes, panels scroll; no selected widget is silently removed.
- Added home-region startup/reset for Flat and 3D, including the globe's axial
  tilt. Observatory keeps the HamClock composition/projection and restores framing.
- Consolidated Traffic/Bands into Activity, preserving remembered band selections.
  Band/mode filters apply before flat-map density and 3D clustering; changing scope
  clears excluded persistent grid activity. Normal-mode globe dimming is retained.
- Added compact DX entries and independently collapsible DX Spots/Recent Contacts.
  Recent Contacts uses the active contest session, otherwise today in UTC; it polls
  IndexedDB every five seconds, including background windows. Located logged QSOs
  use hollow map markers. Entries without valid grids remain listed with an explicit
  unavailable location; HamClock does not place them at country-prefix centroids.
- Added Activity / My contacts / Both and observation-only Follow radio. A same-origin
  BroadcastChannel carries live CAT/WSJT-X operating state; it never writes received
  values into the operating store or sends tune commands. A 15-second expiry plus
  disconnect reports prevents abandoned windows from remaining live indefinitely.

The revision is ported onto current `main`, preserving its activation feed tabs,
location conditions, scoped map filtering, and separate rendering surfaces.
The initial local prototype exposed the Band Conditions map-height regression;
that earlier canvas-allocation baseline predates the newer renderer on `main`
and is not a performance comparison for this PR.

Validation commands:

```sh
npm run lint
npm run build
npm run check:bundles
npm run test:dev-session
npm run test -- src/lib/hamclock src/stores/hamclockStore.test.ts src/stores/hamclockDisplayStore.test.ts src/stores/mapStore.hamclockBeauty.test.ts src/components/map/lib/flatMapLayout.test.ts src/components/map/lib/flatMufRaster.test.ts src/components/map/hamclock/HamClockSpotsSidebar.test.tsx
npm run test:hamclock:browser -- http://127.0.0.1:5180
```

The browser command requires this checkout's managed local-profile server at the
specified URL. It uses disposable contexts and synthetic station/spot/log/radio
fixtures. It exercises 1280×800, 1920×1080, and 3840×2160; Flat/3D/AZ;
scaling and panel overflow; Observatory; and same-origin log and radio updates.
See [Local agent testing](../guides/LOCAL-AGENT-TESTING.md#hamclock-display-regression)
for setup and handoff details. CI and the PR record contain final validation results.

Remaining product validation: physical review on the owner's close-up 55-inch
screen and a distant display; warm/cold GPU traces against the stated frame budget;
one-hour continuous-use soak; signed-in cross-device log synchronization and paired
Display Wall assignment behavior. The new operating monitor currently covers windows
at the same browser origin. It does not introduce a cross-device radio transport.
AZ retains its existing station-centered activity projection. Its contact-map
choices are disabled until a logged-contact overlay is available; the list stays
usable and Flat/3D retain the selected contact-map preference.
Flat uses a letterboxed world overview when the requested home region crosses the
dateline, so both sides remain visible. The globe retains regional centering across
the dateline; seamless wrapping of Flat's imagery and overlays remains future work.
