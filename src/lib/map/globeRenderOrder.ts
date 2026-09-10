/**
 * Stacking contract for the 3D globe scene (GlobeView).
 *
 * Every transparent overlay must:
 *   1. Disable depth WRITING always. Keep depth TESTING ON. The depth
 *      buffer holds only the base globe plus the GlobeDepthDome — an
 *      invisible depth-only sphere at GLOBE_DEPTH_DOME_RADIUS (just above
 *      the tile meshes, below GLOBE_MIN_OVERLAY_RADIUS). The dome renders
 *      transparent-pass at renderOrder 1: after the basemap (the XYZ tile
 *      meshes are transparent-pass at renderOrder 0), before every ladder
 *      overlay — see GlobeDepthDome.tsx for why. The dome gives
 *      every overlay a clean analytic surface to test against: near-side
 *      geometry at >= GLOBE_MIN_OVERLAY_RADIUS always wins the contest
 *      (no tile-mesh z-fighting, no "red ring" discards), and far-side
 *      geometry is occluded per-fragment by the GPU for free.
 *      depthTest: false is reserved for exactly three cases:
 *        a. invisible hit-target geometry (opacity 0 / colorWrite false);
 *        b. tile-hugging markers placed BELOW the dome (r = 1.000002 so
 *           deep-zoom markers sit on the tiles) — these must CPU-fade the
 *           far side via useGlobeOcclusion / useGlobeOcclusionBatch;
 *        c. FrontSide full-sphere texture drapes (GLOBE_OVERLAY_MATERIAL
 *           spreaders) — backface culling already removes the far
 *           hemisphere, so they never bleed.
 *   2. Take an explicit renderOrder from GLOBE_LAYER_ORDER. An unset
 *      renderOrder defaults to 0 and paints before the ladder, losing to
 *      every other overlay regardless of geometry. Because overlays never
 *      write depth, paint order BETWEEN overlays comes ONLY from
 *      renderOrder — geometric altitude does NOT decide visibility between
 *      them, so slot assignment must reflect intended visual stacking.
 *   3. Far-side visibility is handled by rule 1: the depth test against
 *      the dome culls it. Only the depthTest:false exceptions above need
 *      geometric handling (FrontSide culling or the occlusion hooks).
 *
 * Slots (higher paints later, i.e. on top):
 *   base            opaque tile globe — depth-tested, no explicit renderOrder
 *   tileLabels      OSM label tiles draped on the globe
 *   surfaceTexture  full-sphere data textures (MUF/TEC/SST/GOES/radar/DRAP/
 *                   noise floor) — mutually exclusive, so they share one slot
 *   nightShade      terminator darkening. Deliberately LOW in the ladder: it
 *                   dims the planet — basemap, its labels and the draped
 *                   geophysical fields — and nothing else. Everything the user
 *                   is actually reading (grid highlights, borders, arcs and
 *                   traces, markers) paints on top at full strength, so the
 *                   night half stays as legible as the day half. This matches
 *                   how the 2D map already behaves.
 *   nightLights     additive city lights
 *   surfaceArea     tangent patches and discs (ReachMap cells, grid activity,
 *                   hazard footprints, sporadic-E/ducting patches, satellite
 *                   footprints)
 *   referenceLines  graticule, country/state borders — above data so the map
 *                   stays readable
 *   arcs            great-circle arcs, traces, ray paths, WSPR/FT8 lines
 *   volumes         ionospheric shells, geomagnetic field lines, aurora band,
 *                   meteor showers
 *   markers         spot/beacon/satellite/station markers — always clickable
 *                   and visible above data layers
 *   hud             globe-anchored widgets: NVIS dome, spectrum ring, compass
 *
 * Intra-component layering (e.g. glow behind ring behind core) uses
 * fractional offsets within the slot — `GLOBE_LAYER_ORDER.markers + 0.1` —
 * so internal ordering never collides with the next slot. renderOrder is a
 * plain number in Three.js; floats are valid.
 */
export const GLOBE_LAYER_ORDER = {
  base: 0,
  tileLabels: 4,
  surfaceTexture: 5,
  nightShade: 6,
  nightLights: 7,
  surfaceArea: 8,
  referenceLines: 9,
  arcs: 10,
  volumes: 11,
  markers: 12,
  hud: 13,
} as const;

export type GlobeLayerSlot = keyof typeof GLOBE_LAYER_ORDER;

/**
 * Paint-order sequence, lowest first. Kept explicit so the test can assert
 * the numeric values stay unique and monotonic when slots are added.
 */
export const GLOBE_LAYER_SLOTS: readonly GlobeLayerSlot[] = [
  "base",
  "tileLabels",
  "surfaceTexture",
  "nightShade",
  "nightLights",
  "surfaceArea",
  "referenceLines",
  "arcs",
  "volumes",
  "markers",
  "hud",
];

/** Resolve fractional component orders back to their owning diagnostic slot. */
export function getGlobeLayerSlotForRenderOrder(
  renderOrder: number,
): GlobeLayerSlot {
  let owner = GLOBE_LAYER_SLOTS[0];
  let ownerDistance = Math.abs(renderOrder - GLOBE_LAYER_ORDER[owner]);
  for (let index = 1; index < GLOBE_LAYER_SLOTS.length; index += 1) {
    const slot = GLOBE_LAYER_SLOTS[index];
    const distance = Math.abs(renderOrder - GLOBE_LAYER_ORDER[slot]);
    if (distance < ownerDistance) {
      owner = slot;
      ownerDistance = distance;
    }
  }
  return owner;
}

/**
 * DOM overlays use a separate stacking context from WebGL. Keep the Drei HTML
 * ranges and the map-owned preview portal in this same contract so a future UI
 * edit cannot accidentally place an opaque tooltip beneath a canvas label.
 */
/**
 * DOM stacking bands, lowest first. Every band is 1000 wide so drei's
 * per-element camera-distance mapping still has room to order elements
 * within a family; bands never touch, so two overlays from different
 * families can never land on the same paint order regardless of mount
 * timing or distance. Add a `<Html>` overlay under `src/components/map`?
 * Take the band matching its family below — never a bare numeric tuple.
 *
 * These bands are portal-local to `<Canvas>`'s own stacking context, not
 * globally meaningful. Drei's `<Html>` renders into `gl.domElement`'s parent
 * div by default (r3f's own Canvas wrapper) -- see `GlobeView.tsx`, which
 * gives that wrapper `className="relative isolate z-0"` specifically so
 * this 0-6999 range is scoped inside it and can never compare directly
 * against `MapSurface`'s other z-indexed siblings (the status chip, image
 * attribution, radar scrubber, `Ft8SpotterHUD`, all fixed z-10/z-20/z-30
 * chrome). `mapOverlayPortal` must stay a sibling of that wrapper, not a
 * descendant, so its 10000 keeps outranking the chrome the same way it
 * outranks every in-scene band -- see `globeDomZBands.test.ts`'s
 * "GlobeView's Canvas wrapper isolates the DOM bands from map chrome" guard.
 *
 *   placeLabel        tile-draped place/city labels and country/state
 *                      names (`LabelsOverlay`) — pure reference text, reads
 *                      under everything that represents live data.
 *   clusterChip        spot-cluster count chips (`SpotCluster`).
 *   passiveSpotLabel    at-rest callsign/frequency tags for individual
 *                      spots and generic markers (`SpotLabel`, `SpotMarker`
 *                      labels) — the bulk of what's on screen.
 *   marker              location, weather, satellite and other non-spot
 *                      marker glyphs/tooltips (`LocationMarker`,
 *                      `WeatherAlerts3D`, `SatelliteOverlay` name labels,
 *                      `BeaconNetworkOverlay3D`/`TimeStationsOverlay3D`
 *                      callsign labels, `MeteorShowerOverlay3D` radiant
 *                      label, `NVISOverlay3D` distance labels and
 *                      unselected band labels, `ISSTrackerOverlay`'s
 *                      clickable ISS label, `CompassRose`'s cardinal and
 *                      bearing-degree labels, `SpectrumWaterfallRing3D`'s
 *                      band labels — every passive/reference/at-rest label
 *                      lives here, whether or not it's clickable, so it can
 *                      never paint over a detail popup/card in `hud`. The
 *                      test is paint order, not click order: a
 *                      `pointerEvents: "none"` label can still visually cover
 *                      popup content if it shares `hud`'s band).
 *   pinLabel            saved pins, and any spot tag that is selected,
 *                      hovered or otherwise promoted above the passive
 *                      pile-up — must outrank every marker/cluster/label
 *                      band so the thing the user is looking at never
 *                      reads as "under" a chip. Also the promoted state
 *                      for `NVISOverlay3D`'s selected band label (its
 *                      unselected siblings live in `marker`, below).
 *   hud                 globe-anchored detail popups/cards only: ISS tracker
 *                      info card, satellite detail popup,
 *                      `BeaconNetworkOverlay3D`/`TimeStationsOverlay3D` info
 *                      popups. Reserved exclusively for this class — every
 *                      passive/reference label (clickable or not, including
 *                      the compass rose and the spectrum-ring band labels)
 *                      lives in `marker` instead, per the paint criterion:
 *                      a label sharing `hud` with a popup can paint over
 *                      that popup's content whenever it happens to sit
 *                      closer to the camera, regardless of pointer-events.
 *                      If a future widget needs a passive label to float
 *                      above a popup, split `hud` into a passive-HUD band
 *                      below a detail-popup band rather than reusing this
 *                      one for both.
 *   rayPathInspector    the ray-path point inspector portal (`RayPathArc.tsx`,
 *                      `<Html portal={overlayPortal}>`). This band is
 *                      portal-local: it only orders elements against each
 *                      other inside `mapOverlayPortal`'s own stacking
 *                      context, not against in-scene labels directly — its
 *                      effective position above them comes from
 *                      `mapOverlayPortal` itself being the top slot.
 *   mapOverlayPortal    single top value (not a range): the map's shared
 *                      DOM overlay portal, above all `<Html>` bands.
 */
export const GLOBE_DOM_LAYER_ORDER = {
  placeLabel: [999, 0] as [number, number],
  clusterChip: [1999, 1000] as [number, number],
  passiveSpotLabel: [2999, 2000] as [number, number],
  marker: [3999, 3000] as [number, number],
  pinLabel: [4999, 4000] as [number, number],
  hud: [5999, 5000] as [number, number],
  rayPathInspector: [6999, 6000] as [number, number],
  mapOverlayPortal: 10000,
} as const;

/**
 * Paint-order sequence for the DOM bands, lowest first. Kept explicit so a
 * test can assert the ranges stay non-overlapping when bands are added.
 */
export const GLOBE_DOM_LAYER_BANDS: readonly (keyof typeof GLOBE_DOM_LAYER_ORDER)[] =
  [
    "placeLabel",
    "clusterChip",
    "passiveSpotLabel",
    "marker",
    "pinLabel",
    "hud",
    "rayPathInspector",
    "mapOverlayPortal",
  ];

/**
 * Shared material flags for FrontSide full-sphere texture drapes (rule 1c
 * above). Spread into JSX materials
 * (`<meshBasicMaterial {...GLOBE_OVERLAY_MATERIAL} />`) or imperative
 * material params. Drapes keep depthTest: false — backface culling already
 * handles the far side, and skipping the depth test keeps them immune to
 * tile-fade depth artifacts.
 */
export const GLOBE_OVERLAY_MATERIAL = {
  transparent: true,
  depthTest: false,
  depthWrite: false,
} as const;

/**
 * Shared flags for tile-hugging markers that sit below the depth dome.
 *
 * These markers use CPU occlusion because depth testing against the dome would
 * hide their near-side geometry too. Disabling depth writes is just as
 * important: a transparent marker that writes depth can mask a later marker or
 * arc, making visibility depend on which layer happened to render first.
 */
export const GLOBE_SURFACE_MARKER_MATERIAL = {
  transparent: true,
  depthTest: false,
  depthWrite: false,
} as const;

/**
 * Radius guidance (unit globe = 1.0). Offsets no longer resolve depth — that
 * is renderOrder's job — but they keep geometry from intersecting the tile
 * surface at deep zoom and preserve parallax between bands.
 *
 *   tile globe/base          exactly 1.0 (perfect sphere — getUnitGlobeProjection
 *                            builds [r,r,r]; NOT an oblate ellipsoid)
 *   surface-hugging markers  1.000002 (SpotMarker/SpotCluster/PinMarker/
 *                            StationMarker3D) — deliberately below
 *                            GLOBE_MIN_OVERLAY_RADIUS so deep-zoom markers hug
 *                            the tiles; safe only because they are depthTest:false
 *   surface textures         1.007–1.02 (MUF 1.007, radar 1.007, SST 1.01,
 *                            noise floor 1.012, GOES/DRAP 1.015, TEC 1.02)
 *   area patches             1.005–1.012 (ReachMap cells 1.008, satellite
 *                            footprints 1.01, sporadic-E 1.025)
 *   reference lines          1.008–1.009
 *   arcs                     base 1.003–1.009, apex dynamic
 *   volumes                  aurora 1.015, ionospheric shells ~1.067–1.24
 *   night shade / lights     nightShade 1.02, nightLights 1.021
 *   hud                      NVIS dome 1.008+, spectrum ring 1.18–1.40
 */
export const GLOBE_MIN_OVERLAY_RADIUS = 1.003;

/**
 * Radius of the GlobeDepthDome — an invisible, depth-only sphere rendered
 * right after the basemap (colorWrite: false, depthWrite: true). It sits above
 * the tile meshes (exactly 1.0, with chords dipping below) and below
 * GLOBE_MIN_OVERLAY_RADIUS, so depth-tested overlays win the near-side
 * contest and get exact far-side occlusion from the GPU.
 */
export const GLOBE_DEPTH_DOME_RADIUS = 1.001;
