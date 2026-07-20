/**
 * Stacking contract for the 3D globe scene (GlobeView).
 *
 * Every transparent overlay must:
 *   1. Disable depth WRITING always. Disable depth TESTING for
 *      surface-conforming geometry — tangent discs/patches, draped sphere
 *      textures, surface-hugging lines. Those dip below the sphere chord
 *      and lose the depth contest against the opaque tile globe, getting
 *      discarded everywhere except the limb (the "red ring" bug).
 *      PROTRUDING 3D geometry (marker spheres, field-line tubes, anything
 *      whose visible half sits clearly above the surface) should KEEP
 *      depthTest: true — the depth buffer only ever holds the opaque globe
 *      (every overlay is depthWrite: false), so depth testing costs nothing
 *      and culls the far side for free.
 *   2. Take an explicit renderOrder from GLOBE_LAYER_ORDER. An unset
 *      renderOrder defaults to 0 and paints before the ladder, losing to
 *      every other overlay regardless of geometry. Paint order comes ONLY
 *      from renderOrder for depthTest:false overlays — geometric altitude
 *      does NOT decide visibility between them, so slot assignment must
 *      reflect intended visual stacking.
 *   3. Handle far-side visibility. Protruding geometry gets it from rule 1
 *      (depth test). Surface-conforming geometry must handle it
 *      geometrically: outward-facing discs/patches use FrontSide (backface
 *      culling removes the far hemisphere); camera-facing/billboarded
 *      geometry must cull by dot(cameraDir, surfaceNormal) — see
 *      useGlobeOcclusion / useGlobeOcclusionBatch.
 *
 * Slots (higher paints later, i.e. on top):
 *   base            opaque tile globe — depth-tested, no explicit renderOrder
 *   tileLabels      OSM label tiles draped on the globe
 *   surfaceTexture  full-sphere data textures (MUF/TEC/SST/GOES/radar/DRAP/
 *                   noise floor) — mutually exclusive, so they share one slot
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
 *   nightShade      terminator darkening (dims everything beneath it)
 *   nightLights     additive city lights
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
  surfaceArea: 6,
  referenceLines: 7,
  arcs: 8,
  volumes: 9,
  markers: 10,
  nightShade: 11,
  nightLights: 12,
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
  "surfaceArea",
  "referenceLines",
  "arcs",
  "volumes",
  "markers",
  "nightShade",
  "nightLights",
  "hud",
];

/**
 * Shared material flags for transparent overlays (rule 1 above). Spread into
 * JSX materials (`<meshBasicMaterial {...GLOBE_OVERLAY_MATERIAL} />`) or
 * imperative material params.
 */
export const GLOBE_OVERLAY_MATERIAL = {
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
