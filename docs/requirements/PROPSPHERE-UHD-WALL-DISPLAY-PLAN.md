# PropSphere UHD and Wall Display Plan

Status: core implementation complete; provider rollout and physical-display sign-off remain
Owner: PropSphere
Last updated: 2026-08-31

## Implementation record

The core product and engineering work in this roadmap is implemented:

- one display selector now reaches Normal, Lite, Pro, HamClock, Deep-Zoom,
  Photorealistic 3D, Wall Display, and paired-display configuration;
- Wall Display scenes support templates, launch/reorder/duplicate/disable,
  per-scene timing and transition, projection, quality, basemap, theme, live
  clouds, and globe rotation settings;
- Auto, Data Saver, UHD, and Extreme drive renderer DPR, tile refinement,
  cache size, fallback texture resolution, and provider zoom behavior;
- 4K Auto/UHD upgrades the global de-clouded surface to the existing
  5400×2700 monthly Blue Marble asset, while the bundled 4096×2048 surface
  remains the offline fallback and real XYZ tiles supply regional detail;
- imagery provenance, cloud freshness, authenticated flat tiles, server-side
  Pro entitlement, safe provider fallback, and bounded tile cleanup are in
  place;
- dedicated MapLibre deep zoom and gated Google Photorealistic 3D routes have
  dependable exits and do not compromise the satellite modes.

Validation completed on 2026-08-31: repository lint, TypeScript/production
build, 112 test files / 788 tests, and headless 3840×2160 smoke captures of
Pro/UHD and the Wall Display Center with no page errors. Final rollout still
requires physical-TV/GPU review and, for Google 3D, restricted production
credentials, billing/quota alerts, and provider-policy approval.

The concurrent `feat/hamclock-wall-basemap` worktree was not modified. It
touches several of the same renderer/store files, so integration should retain
both its night-darkness work and this roadmap's quality/provider changes via a
hunk-level merge rather than choosing either file wholesale.

## Outcome

PropSphere should feel purpose-built for a 4K wall, not merely enlarged to fill one. Normal, Lite, Pro, HamClock, and Wall Display must be easy to enter from every presentation, while the Earth imagery remains crisp, coherent, correctly attributed, and visually competitive with Geochron and HamClock.

The target experience combines three strengths:

- a beautiful de-clouded Earth surface that is dependable at global scale;
- progressive, real geographic detail when the operator zooms toward a region such as the continental United States;
- an optional, timestamped live-cloud layer that communicates current conditions without making the base surface muddy.

## Product decisions

### Wall Display is a display workflow, not a map projection

Wall Display stays backed by the existing kiosk scene system because a wall playlist can rotate through PropSphere, SolarPulse, HamClock, and other routes. It appears alongside the map layouts in the shared view selector, but selecting it opens the Wall Display launch/configuration workflow rather than adding a `wall` value to the PropSphere layout store.

### The surface and the weather are separate

The base Earth is always de-clouded. Current clouds are an optional layer with a visible observation timestamp, freshness state, opacity, and source attribution. This prevents duplicated clouds, preserves surface detail, and lets operators distinguish a polished basemap from live weather.

### Global beauty and local detail use different assets

A single giant raster is ideal for a whole-Earth wall presentation but is the wrong delivery mechanism for street-level detail. PropSphere uses:

- high-resolution global, de-clouded textures for the whole-Earth and wide flat-map views;
- tiled satellite imagery for progressive regional zoom;
- an optional photorealistic 3D tiles mode for terrain/building exploration.

### Quality is explicit and adaptive

Auto is the default. Data Saver, UHD, and Extreme are operator-selectable quality profiles. Auto measures screen density and interaction state, using high quality while stationary and temporarily reducing refinement during movement. Extreme is intentionally opt-in because its bandwidth and GPU costs can be substantial.

## Phase 1: one view switcher everywhere

Build a shared display-mode menu that provides:

- Normal;
- Lite;
- Pro;
- HamClock;
- Wall Display;
- Configure Displays.

The menu must be reachable from:

- the standard PropSphere toolbar;
- the Lite overlay;
- the expanded and collapsed Pro toolbars;
- HamClock;
- Wall Display's pointer-revealed chrome;
- future immersive map presentations without duplicating the option list.

Transitions must happen without a page reload. Moving among map layouts must retain the current projection, camera/center, layer choices, and applicable preset. Selecting Wall Display should offer a fast launch when a valid playlist exists and a direct path to configuration. Escape behavior must remain predictable:

- close an open popover first;
- leave a nested overlay second;
- return from Pro or HamClock to Normal next;
- leave Wall Display for its configurator rather than stranding the user.

Acceptance criteria:

- Wall Display and Configure Displays appear in the shared menu.
- Every immersive presentation provides a visible or pointer-revealed way to switch views.
- Keyboard-only operation can open the menu, select a view, and exit an immersive view.
- Direct URLs still load, and persisted layout state never produces an unrecoverable screen.

## Phase 2: turn the kiosk page into a Display Center

Unify local Wall Display configuration and paired-display management conceptually while preserving their existing routes and services. Improve scene editing with:

- add, remove, duplicate, enable/disable, and reorder;
- an accurate scene preview;
- per-scene duration and transition selection;
- crossfade and prefetch controls;
- save-current-view as a scene;
- unsaved-change protection;
- validation before launch.

Expand the scene contract to capture, where relevant:

- route and map layout;
- projection and camera/region;
- basemap and quality profile;
- layer preset and individual layer overrides;
- de-clouded surface selection;
- live-cloud visibility and opacity;
- labels, theme, color grade, text density, and panel visibility;
- auto-rotation and animation speed.

Ship useful starting templates:

- Geochron Earth;
- Observatory Globe;
- HamClock Operations;
- Continental US Detail;
- Greyline and Night Lights;
- Solar Conditions;
- Multi-view Operations.

Acceptance criteria:

- A first-time operator can launch a polished wall in under one minute.
- Existing saved scenes migrate safely with defaults for new fields.
- Invalid or unsupported scene combinations fail visibly before entering kiosk mode.
- Scene changes crossfade without a white or untextured frame.

## Phase 3: formalize the imagery catalog

Replace implicit provider assumptions with typed metadata:

- de-clouded or weather-bearing;
- global coverage and regional coverage bounds;
- native and allowed maximum zoom;
- approximate native ground resolution;
- raster tile size and retina variants;
- freshness/observation time;
- authorization and subscription requirements;
- required attribution;
- offline/cache policy;
- overzoom policy and fallback provider.

Recommended provider roles:

- NASA Blue Marble or equivalent licensed cloud-free imagery for the wide/global surface;
- Esri World Imagery as the high-quality no-key satellite default, subject to its terms and attribution;
- Mapbox Satellite for authenticated Pro/Extreme progressive detail;
- NAIP as an optional US-only high-resolution layer when its coverage and delivery mechanism are validated;
- NASA GIBS/GOES products only for live cloud/weather overlays, never as the base surface.

Correctness work in this phase includes:

- make authenticated flat-map tiles use the same authorized fetch path as the globe;
- enforce Pro entitlement consistently on client and server;
- expose attribution in every projection and immersive layout;
- cancel stale requests during fast pan/zoom and cap memory caches;
- show source, acquisition/freshness, and coverage limitations in the UI;
- preserve a lower-resolution fallback when a premium source is unavailable.

Acceptance criteria:

- No imagery request silently fails because one renderer omitted authorization.
- No premium provider is selectable without a valid entitlement/configuration.
- Attribution remains legible in Normal, Lite, Pro, HamClock, and Wall modes.
- Turning live clouds off always reveals a cloud-free surface.

## Phase 4: UHD and Extreme rendering profiles

Add a single quality-profile model shared by globe, flat map, and compatible overlays.

| Profile | Intended use | Behavior |
| --- | --- | --- |
| Data Saver | constrained network or older displays | lower DPR, conservative cache, lower tile ceiling, reduced animation |
| Auto | default | derives DPR/refinement from display, GPU hints, motion, and network conditions |
| UHD | 4K wall and modern desktop | retina tiles, larger cache, sharper labels, better texture filtering, measured prefetch |
| Extreme | operator-selected inspection | highest useful source zoom, aggressive stationary refinement, explicit bandwidth warning |

Profile-controlled renderer values include:

- effective device-pixel ratio cap;
- screen-space error/refinement target;
- concurrent tile requests and cache size;
- retina tile selection and image encoding quality;
- texture anisotropy and mipmapping;
- label density and collision behavior;
- overlay sampling resolution;
- neighboring-tile prefetch radius;
- post-motion settle/refine delay.

UHD and Extreme must prefer refinement after the camera stops rather than attempting maximum quality on every animation frame. A small diagnostics panel should expose provider, tile zoom, cache hit rate, frame time/FPS, and estimated bandwidth so performance claims can be verified on actual 4K hardware.

Acceptance criteria:

- Auto selects an appropriate high-density path on a 4K screen.
- Panning remains responsive while the stationary image resolves to full quality.
- Extreme displays an honest bandwidth/performance warning and can be disabled globally by an administrator.
- A failed high-resolution source degrades gracefully without a blank globe.

## Phase 5: improve global and flat-map presentation

Create or license an 8K minimum and preferably 16K de-clouded equirectangular master with:

- clean antimeridian wrapping;
- no visible polar or source seams;
- restrained ocean/bathymetry detail;
- calibrated land saturation and local contrast;
- a matching night-lights asset;
- optional monthly/seasonal variants with consistent grading.

Do not make one monolithic texture the sole flat-map source. Use it as an instant fallback and wide-view canvas, then blend into tiles as zoom increases. Improve the flat renderer with:

- projection-aware tile selection and overscan;
- decoded-image reuse and bounded caches;
- seamless level-of-detail transitions;
- theme-aware Light, Dark, and High Contrast cartography;
- theme-matched labels instead of a dark-only label source;
- graceful treatment of polar regions and the date line;
- synchronized day/night, terminator, and cloud crossfades.

Acceptance criteria:

- Whole-Earth imagery is crisp on a 3840×2160 display at normal wall distance.
- Local zoom uses real detail rather than scaling the global raster.
- Light mode is intentionally designed, not a recolored dark map.
- Projection changes do not flash a low-resolution or unstyled frame.

## Phase 6: dedicated regional explorer

Use the existing MapLibre capability for a focused deep-zoom 2D explorer rather than forcing unlimited zoom into the wall-oriented canvas renderer. Preserve PropSphere context while offering:

- satellite, light, dark, and high-contrast styles;
- saved regions such as Continental US and operator home;
- smooth zoom to the provider's useful native limit;
- selected PropSphere overlays whose scale remains meaningful;
- an obvious return to globe/flat/wall presentation;
- shareable URLs for center, zoom, bearing, and selected layers.

Acceptance criteria:

- A user can move from the global Earth to US regional detail and back without losing their operational context.
- UI density decreases as geographic detail increases.
- Unsupported global overlays are hidden or clearly marked rather than misleadingly stretched.

## Phase 7: optional Google Photorealistic 3D

Treat Photorealistic 3D Tiles as a separate, gated projection in Pro and Wall Display rather than replacing the satellite globe. Before release:

- validate billing, key restrictions, quotas, licensing, caching, and exact attribution requirements;
- proxy or scope credentials so no unrestricted key is exposed;
- define provider health, quota-exhaustion, and unsupported-browser fallbacks;
- measure time-to-first-meaningful-frame and sustained 4K frame time;
- confirm which PropSphere overlays can be positioned accurately on terrain/buildings;
- provide a safe transition back to Satellite Globe.

The first release may be marked experimental. It must never make the dependable 2D/globe modes contingent on Google availability.

Acceptance criteria:

- Missing credentials or exhausted quota produce a useful fallback, not a blank screen.
- Attribution is permanently visible.
- A configured performance ceiling prevents a wall display from repeatedly exhausting its GPU or quota.

## Phase 8: Geochron-grade wall polish

Polish the complete composition rather than only its basemap:

- physically coherent but visually restrained day/night shading;
- high-quality night lights with controlled bloom;
- cloud shadows/opacity tuned to preserve land detail;
- color grading per theme and display brightness;
- compact, legible typography designed for viewing distance;
- adaptive overlay density and prioritized labels;
- presentation-safe panel auto-hide and pointer wake-up;
- OLED burn-in mitigation and periodic subtle motion;
- preloaded scene assets and smooth crossfades;
- safe-area handling for TVs, browsers, and multi-monitor windows.

## Delivery sequence

Changes should land as reviewable slices to minimize collision with unrelated bug-fix work:

1. shared view menu and navigation/Escape semantics;
2. Display Center scene editing and templates;
3. imagery metadata, flat-map authorization, entitlement, and attribution fixes;
4. shared quality profiles and diagnostics;
5. global asset and flat-map renderer improvements;
6. regional explorer integration;
7. experimental Photorealistic 3D provider;
8. final wall polish, documentation, and performance tuning.

Each slice should limit edits to its feature area, re-check `git status` before patching, and never overwrite unrelated dirty files. Any overlap with concurrent work must be reviewed hunk-by-hunk.

## Validation matrix

Validate at 1920×1080, 2560×1440, and 3840×2160 where tooling permits.

Required combinations:

- Normal, Lite, Pro, HamClock, and Wall Display;
- globe, flat, azimuthal, regional explorer, and gated photorealistic 3D;
- Light, Dark, and High Contrast themes;
- clouds on/off, day/night on/off, and fresh/stale/unavailable weather;
- anonymous/free, Pro-authorized, and Pro-expired sessions;
- touch, mouse, keyboard, reduced-motion, and screen-reader navigation;
- online, slow network, temporary provider failure, and restored connectivity.

Minimum engineering checks per slice:

```sh
npm run lint
npm run build
```

Run relevant unit/component/browser tests when available, and manually verify the affected presentation through `npm run dev`. Record screenshots or short captures for visual changes, including at least one 4K viewport for UHD/Wall work.

## Success measures

- Every presentation offers an understandable route to every other presentation and back to Normal.
- No blank or unauthorized tile failures occur in supported subscription states.
- UHD reaches a crisp stationary result on a 4K display while retaining responsive interaction.
- Operators can tell what imagery and weather data they are seeing and how current it is.
- The wide Earth view is visually composed enough for an unattended wall, while local inspection reveals progressively real detail.
- The experience remains dependable when a premium imagery provider, network, credential, or GPU feature is unavailable.
