# PropSphere path-point selection motion (#933)

Design sheet. Nothing is built until the owner approves this file.

## 1. The problem

A selected bounce point on PropSphere shows two treatments at once: the
always-on `IonosphereBounceHighlight` keeps running its endless sine in the
ionosphere layer colour while selection adds its own emphasis on top. Two
colours and two rhythms compete in the same few pixels, which reads low-tech
next to the rest of the station UI. There is in fact no in-scene selected
state at all today, because `selectedId` and `hoveredId`
(`src/components/map/RayPathArc.tsx:527-528`) are read only by the DOM
inspector, so the competing rhythm is the ambient pulse against the user's
expectation rather than against a real selection ring.

## 2. Which primitive to reuse

| Primitive                              | What it animates                                                                                                              | Clock source                              | Colour input                                       | Reduced motion                                           | Mounted where                                      |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------- |
| `src/components/map/FlashPulse.tsx`    | One ring, scale 1 to 5 and opacity 0.75 to 0 over `FLASH_POINT_DURATION_MS`, one shot, driven by `Date.now() - flashPoint.at` | raw `useFrame`                            | Module constant `PULSE_COLOR` (`#FFB000`), no prop | None. It runs whenever `useFlashPoint()` returns a point | Self-mounted on the globe, reads `useFlashPoint()` |
| `src/components/map/LoggedPulse.tsx`   | Same ring maths, `JUST_LOGGED_PULSE_DURATION_MS`, one shot                                                                    | raw `useFrame`                            | Module constant `#00FF88`, no prop                 | None                                                     | Self-mounted, reads `useJustLoggedMarker()`        |
| `src/components/map/SpotHighlight.tsx` | Five elements: three staggered rings on an endless sine, a breathing core sphere, a rotating halo                             | raw `useFrame`, one consolidated callback | `color` prop, default `#FF6B35`                    | None. Endless while `isFocusing`                         | Self-mounted, reads `useViewSpotFocus()`           |

**Recommendation: extend `FlashPulse`.** It is already the "the user picked
this point out of band" pulse, it already fires from a hop-table pick, its one
shot expanding ring is exactly the settle-in the direction asks for, and it is
the smallest of the three. `SpotHighlight` is the wrong shape twice over: it is
an endless sine, which is the rhythm we are removing, and it is five meshes
where we want two. `LoggedPulse` is semantically taken by "a QSO was just
logged" and must not be confused with a selection.

No fourth pulse component is added, and no component is renamed.

### Prop additions to `FlashPulse`

All optional, so the existing self-mounted globe instance keeps its current
behaviour byte for byte when no props are passed.

- `point?: { lat: number; lon: number; radius?: number }`. Explicit anchor that
  overrides `useFlashPoint()`. `radius` defaults to the current
  `SURFACE_OFFSET`, so a bounce point can sit at its shell altitude
  (`heightToRadius(point.displayHeightKm)`) instead of on the ground.
- `variant?: "flash" | "selected" | "hover"`, default `"flash"`. Picks the
  motion profile in the table below. Only the profile changes, not the meshes.
- `color?: string`, default the existing `PULSE_COLOR`. The selection mount
  passes a resolved `--su-accent`.
- `startAtMs?: number`. Origin for the settle-in, so re-selecting the same
  point restarts the one shot. Defaults to `flashPoint.at`. `selectedId` alone
  cannot produce this value: `handleSelect` calls `setSelectedId(id)` with the
  id that is already selected, React bails out of the update, and the mounted
  `FlashPulse` never sees a new prop. `RayPathArc` therefore stores a
  selection generation alongside the id (see §6) and passes it as `startAtMs`
  (and as the mount `key`), so a second click on an already-selected row or
  hit area re-fires the one shot.
- `hold?: boolean`, default `false`. Keeps the steady halo painted after the
  one shot instead of ending at opacity 0.
- `reducedMotion?: boolean`, default `false`. Skips the expansion and paints
  the hold halo immediately.
- `occlusionOpacity?: number`. Lets `RayPathArc` pass the value it already
  computes with `getOpacity(lat, lon)` rather than adding a second
  `useGlobeOcclusion` subscription per point. When absent, the component keeps
  its own `useGlobeOcclusion` call.

Clock: the choice is made at a component boundary, not inside one body.
`useFrame` subscribes to R3F on mount whatever its callback does, so a body
that early-returns still costs one subscription per instance and still runs a
callback under `prefers-reduced-motion`. `FlashPulse` stays the public
component and becomes a thin chooser: it reads `MapAnimationContext` with
`useContext` (the context is already exported from
`src/components/map/hooks/useMapAnimationFrame.ts`) and renders either
`FlashPulseClocked` (registers its callback with that context, no `useFrame`)
or `FlashPulseFrame` (the existing `useFrame` path) — never both. Each child
calls exactly one clock hook unconditionally, so there is no conditional-hook
hazard, and the selection instance mounted inside `RayPathArc`'s
`MapAnimationClock` (`RayPathArc.tsx:753`) adds no R3F subscription. With
`reducedMotion`, the chooser mounts the static hold meshes and neither child,
so there is no frame callback at all.

`IonosphereBounceHighlight` gains one prop: `suppressed?: boolean`.

## 3. State table

Radii are globe units, the same units as the existing constants: marker core
`0.012`, ambient torus `0.022`, ambient glow sphere `0.028`, `FlashPulse`
`RING_BASE_RADIUS` `0.025`.

| State                | Colour token                                        | Geometry                                                                                                               | Opacity                                                              | Motion                                                                                  | Ambient bounce pulse at that point              |
| -------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Idle                 | Layer colour (`IONOSPHERE_LAYER_COLORS`), unchanged | Core sphere `0.012`, torus `0.022`, glow `0.028`                                                                       | Core `pulse * 0.95`, ring `pulse * 0.4`                              | Endless sine, unchanged                                                                 | Runs, unchanged                                 |
| Hover                | `--su-accent`                                       | Ring outline, inner `0.026`, outer `0.030`                                                                             | `0.55` steady                                                        | Fade in over `120ms`, `ease-out`, then hold. No expansion, no sine                      | Runs. Hover is a pointer echo, not a commitment |
| Selected             | `--su-accent`                                       | Settle-in ring expands `0.030` to `0.075`; hold halo is a disc `0.042` plus a ring outline inner `0.026` outer `0.030` | Settle-in ring `0.85` to `0`; hold halo disc `0.22`, hold ring `0.9` | One shot `420ms`, `ease-out` cubic (`1 - (1 - p)^3`), then a static hold. No sine, ever | Suppressed. See below                           |
| Hover while selected | `--su-accent`                                       | Selected hold geometry, hold ring outer grows `0.030` to `0.033`                                                       | Hold disc `0.30`, hold ring `1.0`                                    | `120ms` `ease-out` on the delta only. The settle-in does not re-fire                    | Still suppressed                                |

Idle and hover-while-selected are deliberately the only two states that add
nothing new: idle is today's behaviour, and hover-while-selected is the
selected state nudged brighter so the pointer still reports where it is.

### Suppressed, not handed off

At the selected point the ambient pulse is **suppressed**: `suppressed` makes
`IonosphereBounceHighlight` skip its frame callback, drop its torus and its
glow sphere, and hold the core sphere at a flat `0.9` in the layer colour.

Justification. A handoff (fading the ambient sine's phase into the selection
ring) needs the two to share a clock phase and a colour ramp, which is exactly
the two-rhythm coupling the issue is removing, and it would make the visual
depend on where in the sine the click happened to land. Suppression is
deterministic, it is one boolean, and it keeps the marker readable: the core
sphere staying layer-coloured and static is the "layer colour may remain as
the static marker tint" allowance in the direction, so the point does not lose
its quality reading while selected. One animated colour, `--su-accent`. One
motion, the settle-in.

### Colour resolution

`--su-accent` is a CSS custom property and Three.js needs a string. A local
`resolveSelectionTone()` in `FlashPulse.tsx` reads `--su-accent` from
`getComputedStyle` with an `--su-accent-rgb` fallback and a final literal
fallback, the same pattern as `resolveLightningTone()` in
`src/lib/map/lightningGlyph.ts:165`. No new token is introduced. `--su-accent`
is theme-driven, so pulse, classic and brass each get their own selection
colour for free, and the token already carries the contrast guarantee the
legibility standard requires. Nothing here paints pure white.

## 4. Transitions

- **Idle to hover.** The layer-coloured ambient pulse keeps running. The
  accent hover ring fades in over `120ms`. Two colours are on screen for this
  state and that is accepted: hover is transient and unringed, and the sine
  under it is the same sine as on every other point.
- **Hover to selected.** `suppressed` flips on, so the torus and the glow stop
  in the same frame as the click. The hover ring is the settle-in's starting
  geometry, so it grows out of itself rather than cutting: the one shot starts
  at `0.030` with opacity `0.85`, expands to `0.075`, fades to `0` over
  `420ms`, and the hold halo cross-fades in over the last `140ms` of that
  window.
- **Selected to idle** (close, or trace click, both of which already clear
  `selectedId`). Hold halo fades out over `160ms`, `ease-in`. `suppressed`
  goes false on the same frame, so the ambient pulse resumes from the shared
  clock's current phase. It is already mid-sine on every other point, so there
  is no start-from-zero flicker.
- **Selection moves A to B.** A runs the `160ms` selected-to-idle fade and
  un-suppresses. B starts its `420ms` settle-in immediately, keyed on a fresh
  `startAtMs`, so the two overlap: A is dimming while B expands. The overlap is
  the point, because it is what makes the selection read as one thing moving
  rather than two things blinking.
- **Reduced motion, every transition above.** No expansion, no fade, no frame
  callback. Hover paints its ring at `0.55` and selection paints the hold halo
  at disc `0.22` plus ring `0.9`, applied on the state change. `suppressed`
  still applies, and the ambient sine is already off under reduced motion
  (`shouldAnimate` is false, `RayPathArc.tsx:154-167` plus `:530`), so the
  reduced-motion scene is a static layer-coloured core with a static accent
  halo on exactly one point.

## 5. Contact sheet

Monospace frames, one globe-unit grid square is roughly `0.01`. `o` is the
layer-coloured core, `.` and `:` are accent at low opacity, `#` is accent at
high opacity.

```
IDLE                      HOVER                     SELECTED t=0
+-------------+           +-------------+           +-------------+
|             |           |    .....    |           |    #####    |
|    .....    |           |   .     .   |           |   #     #   |
|   .  o  .   |           |   .  o  .   |           |   #  o  #   |
|    .....    |           |   .     .   |           |   #     #   |
|             |           |    .....    |           |    #####    |
+-------------+           +-------------+           +-------------+
 layer sine               accent ring 0.030          settle ring 0.030
 core+torus+glow          steady 0.55                opacity 0.85
                          ambient still running      ambient suppressed
```

```
SELECTED t=mid (210ms)    SELECTED t=hold           HOVER WHILE SELECTED
+-------------+           +-------------+           +-------------+
|  :::::::::  |           |    #####    |           |   #######   |
| :  .....  : |           |   #:::::#   |           |  #:::::::#  |
| :  .  o  . :|           |   #:  o :#  |           |  #::  o ::# |
| :  .....  : |           |   #:::::#   |           |  #:::::::#  |
|  :::::::::  |           |    #####    |           |   #######   |
+-------------+           +-------------+           +-------------+
 ring at 0.052             ring 0.030 at 0.9         ring 0.033 at 1.0
 opacity 0.38              disc 0.042 at 0.22        disc 0.042 at 0.30
 hold halo fading in       static, no frame work     120ms delta only
```

```
A TO B, FRAME AT 80ms     REDUCED MOTION, SELECTED
+-----------------------+ +-------------+
|   . .          #####  | |    #####    |
|  .   .        #     # | |   #:::::#   |
|  .  A .       #  B  # | |   #:  o :#  |
|  .   .        #     # | |   #:::::#   |
|   . .          #####  | |    #####    |
+-----------------------+ +-------------+
 A fading 160ms            painted on state change
 B expanding 420ms         no frame callback at all
```

## 6. Agreement with the inspector hop list (#931)

One source of truth: the `selectedId` state in `RayPathArc`
(`RayPathArc.tsx:527`), set only by `handleSelect` (`:715`) and cleared only by
`handleClose` (`:722`) and `handleTraceClick` (`:728`). Both surfaces read that
one value.

`selectedId` stays the semantic owner, but it cannot be the motion trigger on
its own: `handleSelect` re-selecting the current id calls `setSelectedId` with
an unchanged value, React bails out, and nothing re-renders. `handleSelect`
therefore also bumps a selection generation — one extra `useState`, e.g.
`selectedAt` set to `Date.now()` (or a monotonic counter) on **every** call,
including a repeat of the same id. That generation is what feeds `startAtMs`
and the `key` on the selection `FlashPulse`; `selectedId` still decides which
point is selected and is still what both surfaces compare against.

- The globe reads it inside the `pointSet.points.map` mount (`:818-839`) by
  comparing `point.id === selectedId`, and mounts exactly one selection
  `FlashPulse` for the match.
- The inspector reads it as the `selectedId` prop already passed to
  `PathPointInspector` (`:850`), and its rows call back through the same
  `onSelect` (`:856`), which is the same `handleSelect`.

The ids are the ones on `pointSet.points[].id`, so a list row and a hit area
name the same point with the same string. Nothing else stores a selected flag:
`PathPointHitArea` stays stateless and keeps carrying no visual treatment,
which is what makes a click on the globe and a click on a row produce the
identical scene. `hoveredId` (`:528`) follows the same rule for hover.

If #931 lands first, this issue rebases onto its header restructure and the
`selectedId` wiring is untouched by it. If this lands first, #931 inherits the
same single owner.

## 7. Render order

Everything stays inside the existing bands from
`src/lib/map/globeRenderOrder.ts`.

- Hop lines, the glow line and the ray path itself: `GLOBE_LAYER_ORDER.arcs`
  (`10`), unchanged.
- The suppressed marker's static core: `GLOBE_LAYER_ORDER.markers` (`12`),
  unchanged.
- The hold halo disc: `GLOBE_LAYER_ORDER.markers + 0.1`, the slot the ambient
  torus vacates when suppressed.
- The settle-in ring and the hold ring outline: `GLOBE_LAYER_ORDER.markers +
0.2`, which is the value `FlashPulse` already uses.

No value reaches `GLOBE_LAYER_ORDER.volumes` (`11`) from below or
`GLOBE_LAYER_ORDER.hud` (`13`) from above, so the treatment stays inside arcs
and markers as required. Materials keep `depthWrite: false`.

Depth testing splits by radius, because case (b) of the stacking contract is
scoped to tile-hugging markers below the depth dome (`r = 1.000002`, under
`GLOBE_MIN_OVERLAY_RADIUS = 1.003`) and its CPU fade is radius-blind:
`getGlobeOcclusionOpacity(lat, lon, frame)` builds a **unit** surface normal,
so it fades anything past the surface limb regardless of altitude.

- Surface points (`SURFACE_OFFSET`, today's `FlashPulse` mount): keep
  `depthTest: false` plus the `useGlobeOcclusion` fade — case (b), unchanged.
- Elevated points (ray apex, shell highlights, any
  `heightToRadius(displayHeightKm)` anchor): keep `depthTest: true`. They sit
  above `GLOBE_MIN_OVERLAY_RADIUS`, so the depth dome occludes the far side
  correctly and they stay visible where an elevated point genuinely clears the
  surface horizon. Reusing case (b) there would pop them out at the surface
  limb instead. No `occlusionOpacity` is applied to them.

Making the occlusion maths radius-aware is the alternative; it is a change to
`src/lib/map/globeOcclusion.ts` shared by every caller, so it is out of scope
for this sheet and not required by it.

## 8. Build plan

Files to touch, seven total, well under the fifteen cap:

1. `src/components/map/FlashPulse.tsx`: the optional props, the three motion
   profiles, `resolveSelectionTone()`, and the clock split (`FlashPulse`
   chooser plus `FlashPulseClocked` / `FlashPulseFrame` children in the same
   file).
2. `src/components/map/RayPathArc.tsx`: `suppressed` on
   `IonosphereBounceHighlight` (`:386-492`, mount `:809-818`), the selection
   generation bumped in `handleSelect` (`:710`), and one selection or hover
   `FlashPulse` mounted from `selectedId` / `hoveredId` inside the same
   `pointSet.points.map` block that already computes each point's radius and
   occlusion opacity.
3. `src/components/map/FlashPulse.test.tsx` (new): default props preserve
   today's behaviour, each variant's opacity and scale at `t=0`, `t=mid` and
   `t=hold`, `reducedMotion` mounting neither clock child (no `useFrame`
   subscription and no context registration), and a changed `startAtMs`
   restarting the one shot for an unchanged `point`.
4. `src/components/map/RayPathArc.mountShape.test.ts` (existing, source
   contract style): assert exactly one selection pulse is mounted, that it is
   keyed on the selection generation, that `handleSelect` bumps that
   generation even when the id is unchanged, and that the highlight at that id
   receives `suppressed`.
5. `src/components/map/PathPointInspector.test.tsx` (existing): assert the
   globe selection and the list row read the same `selectedId`.
6. `src/lib/map/globeRenderOrder.test.ts` (existing): assert every renderOrder
   the new meshes use falls inside `[arcs, markers + 0.5]`.
7. `docs/designs/path-point-selection-motion.md`: this sheet, marked approved.

Verification the build PR runs:

- `npm run test -- src/components/map/RayPathArc.mountShape.test.ts src/components/map/PathPointInspector.test.tsx src/lib/map/globeRenderOrder.test.ts src/components/map/FlashPulse.test.tsx`
- `npm run verify`

Rendered checks on the single shared dev server (`npm run dev:session`, never
an agent's own server), per `docs/guides/LOCAL-AGENT-TESTING.md`. Four
canvases: phone, tablet, workstation, wall. At each one, on a path with at
least three hops:

1. Idle. All bounce points pulse in the layer colour. Record that no accent
   ring is present.
2. Hover a bounce point. Accent ring appears, ambient sine on that point still
   runs, no other point changes.
3. Click it. Within one second: exactly one accent treatment on screen, the
   layer torus and glow gone at that point, the core still layer-coloured and
   static, and the inspector row for the same id highlighted.
4. Click a second bounce point. The first returns to the ambient sine and the
   second settles in. No frame shows two accent hold halos at full opacity.
5. Close the inspector. The ambient sine resumes at the previously selected
   point and no accent pixel remains.
6. Repeat 1 to 5 with `prefers-reduced-motion: reduce` emulated. Nothing on
   the globe animates, the selected point carries a static accent halo, and
   the layer core is static.

## 9. Owner questions

1. Selection colour: `--su-accent` or `--su-info`?
2. Keep the layer-coloured static core under the selected halo, or drop it to
   accent only: keep or drop?
3. Settle-in duration of `420ms`: yes, slower or faster?
4. Should hover also suppress the ambient pulse at that point: yes or no?
5. Selection moving A to B: fade A over `160ms`, or cut A instantly?
6. Reduced-motion halo: same size as the animated hold halo, or smaller?
7. Should hover-while-selected brighten at all, or stay identical to selected:
   brighten or identical?
