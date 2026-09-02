/**
 * GridPersistOverlay Component
 *
 * Renders adaptive Maidenhead grid-cell highlights on the 3D globe using
 * a single THREE.InstancedMesh for efficient draw-call batching. Each active
 * grid is drawn as a filled square with a bordered edge, tinted by the density
 * colour ramp — the square is the point, so the fill and border persist for as
 * long as the grid stays inside the activity window.
 *
 * Technical approach:
 * - Single InstancedMesh with a pool of 500 ranked instances
 * - Shared subdivided quad geometry (3x3) — vertex shader projects onto sphere
 * - Per-instance attributes: bounds (vec4), color (vec3), intensity (float),
 *   last-spot time (float, seconds relative to a component-local epoch)
 * - Vertex shader maps UV → lat/lon via instance bounds → 3D sphere position
 * - Fragment shader fills the cell, strokes a border, and adds a decaying
 *   short recency accent (clock sleeps after the accent settles)
 * - Normal blending and depth testing against the GlobeDepthDome, so the
 *   square reads over satellite imagery and does not bleed through the globe
 *
 * Follows the same coordinate system and rendering patterns as GridGlowOverlay.
 */

import { useRef, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  GRID_ACTIVITY_RECENCY_PULSE_MS,
  gridActivityBounds,
  rankGridActivityCells,
  type GridActivityCell,
} from "@/lib/map/gridActivityModel";
import { GLOBE_LAYER_ORDER } from "@/lib/map/globeRenderOrder";

// =============================================================================
// CONSTANTS
// =============================================================================

/** Maximum number of grid instances in the pool */
const MAX_INSTANCES = 500;

/** Sphere radius — sits between the greyline overlay and glow pulses */
const PERSIST_RADIUS = 1.005;

/** Subdivisions per axis for the shared quad geometry */
const SUBDIVISIONS = 3;

// =============================================================================
// GEOMETRY BUILDER
// =============================================================================

/**
 * Build a shared subdivided quad geometry with UV coordinates.
 * Vertex positions are set to a unit quad (0..1 in x and y) — the vertex
 * shader will use per-instance bounds to project each vertex onto the sphere.
 */
function buildSharedQuadGeometry(): THREE.BufferGeometry {
  const vertsPerSide = SUBDIVISIONS + 1;
  const vertexCount = vertsPerSide * vertsPerSide;
  const triCount = SUBDIVISIONS * SUBDIVISIONS * 2;

  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices = new Uint16Array(triCount * 3);

  // Generate vertex positions and UVs — unit quad in XY plane
  let vi = 0;
  for (let row = 0; row <= SUBDIVISIONS; row++) {
    const v = row / SUBDIVISIONS;
    for (let col = 0; col <= SUBDIVISIONS; col++) {
      const u = col / SUBDIVISIONS;
      // Position: unit quad (needed as fallback; shader overrides)
      positions[vi * 3] = u;
      positions[vi * 3 + 1] = v;
      positions[vi * 3 + 2] = 0;
      // UV: same as position for a unit quad
      uvs[vi * 2] = u;
      uvs[vi * 2 + 1] = v;
      vi++;
    }
  }

  // Index buffer — two triangles per subdivision cell
  let ii = 0;
  for (let row = 0; row < SUBDIVISIONS; row++) {
    for (let col = 0; col < SUBDIVISIONS; col++) {
      const topLeft = row * vertsPerSide + col;
      const topRight = topLeft + 1;
      const bottomLeft = (row + 1) * vertsPerSide + col;
      const bottomRight = bottomLeft + 1;

      // Winding is CCW-outward under the lat/lon->XYZ mapping in the vertex
      // shader below (verified numerically: (v1-v0)x(v2-v0) points along the
      // outward radial direction with this order) — required for FrontSide
      // to cull the far hemisphere instead of the near one.
      indices[ii++] = topLeft;
      indices[ii++] = topRight;
      indices[ii++] = bottomLeft;

      indices[ii++] = topRight;
      indices[ii++] = bottomRight;
      indices[ii++] = bottomLeft;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));

  return geometry;
}

// =============================================================================
// SHADERS
// =============================================================================

const PERSIST_VERTEX_SHADER = /* glsl */ `
  // Per-instance attributes
  attribute vec4 instanceBounds;    // x=minLon, y=minLat, z=maxLon, w=maxLat
  attribute float instanceIntensity;
  attribute float instanceLastSpotSec; // last spot time, epoch-relative seconds

  varying vec2 vUv;
  varying float vIntensity;
  varying vec3 vColor;
  varying float vLastSpotSec;

  void main() {
    vUv = uv;
    vIntensity = instanceIntensity;
    vLastSpotSec = instanceLastSpotSec;

    // instanceColor is automatically provided by THREE.InstancedMesh
    // when setColorAt() is used — accessed via the built-in attribute
    #ifdef USE_INSTANCING_COLOR
      vColor = instanceColor;
    #else
      vColor = vec3(1.0);
    #endif

    // Map UV to lat/lon using per-instance bounds
    float lon = instanceBounds.x + uv.x * (instanceBounds.z - instanceBounds.x);
    float lat = instanceBounds.y + uv.y * (instanceBounds.w - instanceBounds.y);

    // Convert lat/lon to 3D sphere position
    float phi = (90.0 - lat) * 0.01745329; // deg to rad
    float theta = (lon + 180.0) * 0.01745329;
    float r = ${PERSIST_RADIUS.toFixed(4)};

    vec3 pos = vec3(
      -r * sin(phi) * cos(theta),
       r * cos(phi),
       r * sin(phi) * sin(theta)
    );

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

/**
 * Appearance constants for the highlighted square, injected into the fragment
 * shader as #defines so the whole look is tunable from one place.
 */
const APPEARANCE = {
  /** Fill alpha for a grid with a single spot */
  FILL_MIN: 0.26,
  /** Fill alpha for a grid at the canonical model's saturation density */
  FILL_MAX: 0.62,
  /** Border is solid within this many degrees of the cell edge */
  BORDER_CORE_DEG: 0.07,
  /** ...and fades to nothing by this many degrees */
  BORDER_SOFT_DEG: 0.16,
  /** Base border alpha, held for as long as the grid stays active */
  BORDER_ALPHA: 0.78,
  /** Extra border alpha immediately after a spot lands */
  FRESH_BORDER_LIFT: 0.3,
  /** Extra fill alpha immediately after a spot lands */
  FRESH_FILL_LIFT: 0.1,
  /** Seconds over which the recency accent decays */
  FRESH_FADE_SEC: GRID_ACTIVITY_RECENCY_PULSE_MS / 1000,
  /** Ceiling so a dense square never fully hides the map beneath it */
  MAX_ALPHA: 0.9,
} as const;

const SHADER_DEFINES = Object.entries(APPEARANCE)
  .map(([name, value]) => `#define ${name} ${value.toFixed(4)}`)
  .join("\n");

const PERSIST_FRAGMENT_SHADER = /* glsl */ `
  ${SHADER_DEFINES}

  uniform float uNowSec; // current time, epoch-relative seconds

  varying vec2 vUv;
  varying float vIntensity;
  varying vec3 vColor;
  varying float vLastSpotSec;

  void main() {
    // Flat fill across the whole cell. This is a highlighted square, not a
    // glow: a radial falloff reads as a blurry dot and disappears entirely
    // over a bright (satellite) basemap. Density is carried by hue via the
    // colour ramp, so alpha only has to give the square visual weight.
    float fill = mix(FILL_MIN, FILL_MAX, vIntensity);

    // Cell border. The cell spans 2 deg of longitude by 1 deg of latitude,
    // so scale UV distances into degrees for a uniform-width stroke on all
    // four sides.
    float edgeDeg = min(
      min(vUv.x, 1.0 - vUv.x) * 2.0,
      min(vUv.y, 1.0 - vUv.y)
    );
    float border = 1.0 - smoothstep(BORDER_CORE_DEG, BORDER_SOFT_DEG, edgeDeg);

    // Recency accent. The border and fill both persist for as long as the
    // grid stays in the activity window — only this extra lift decays, so a
    // square that was hot a minute ago still reads as a square.
    float age = max(uNowSec - vLastSpotSec, 0.0);
    float fresh = 1.0 - smoothstep(0.0, FRESH_FADE_SEC, age);

    float alpha = fill
                + fresh * FRESH_FILL_LIFT
                + border * (BORDER_ALPHA + FRESH_BORDER_LIFT * fresh);

    gl_FragColor = vec4(vColor, clamp(alpha, 0.0, MAX_ALPHA));
  }
`;

// =============================================================================
// PROPS
// =============================================================================

export interface GridPersistOverlayProps {
  /** Canonical activity cells shared by every projection. */
  cells: readonly GridActivityCell[];
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function GridPersistOverlay({ cells }: GridPersistOverlayProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const camera = useThree((state) => state.camera);

  // Component-local epoch — spot times and the clock uniform are stored as
  // seconds relative to this, keeping values small enough for float32 in
  // the shader (raw epoch-ms would lose all sub-second precision).
  const epochMs = useMemo(() => Date.now(), []);

  // Build shared geometry and material once
  const { geometry, material } = useMemo(() => {
    const geo = buildSharedQuadGeometry();
    const mat = new THREE.ShaderMaterial({
      vertexShader: PERSIST_VERTEX_SHADER,
      fragmentShader: PERSIST_FRAGMENT_SHADER,
      uniforms: {
        uNowSec: { value: 0 },
      },
      transparent: true,
      // Normal, not additive. Additive blending adds toward white, so over a
      // bright satellite basemap the square washed out to nothing — which is
      // why the layer looked inert on imagery. Normal blending tints the
      // surface instead, and reads on both light and dark basemaps.
      blending: THREE.NormalBlending,
      // Depth-tested against the GlobeDepthDome per the stacking contract
      // (PERSIST_RADIUS is above GLOBE_MIN_OVERLAY_RADIUS), so squares on the
      // far side of the globe are occluded instead of showing through.
      depthTest: true,
      depthWrite: false,
      side: THREE.FrontSide,
    });
    return { geometry: geo, material: mat };
  }, []);

  // Pre-allocate instance buffer attributes
  const { boundsAttr, intensityAttr, lastSpotAttr } = useMemo(() => {
    const boundsArray = new Float32Array(MAX_INSTANCES * 4);
    const intensityArray = new Float32Array(MAX_INSTANCES);
    const lastSpotArray = new Float32Array(MAX_INSTANCES);

    const bounds = new THREE.InstancedBufferAttribute(boundsArray, 4);
    bounds.setUsage(THREE.DynamicDrawUsage);

    const intensity = new THREE.InstancedBufferAttribute(intensityArray, 1);
    intensity.setUsage(THREE.DynamicDrawUsage);

    const lastSpot = new THREE.InstancedBufferAttribute(lastSpotArray, 1);
    lastSpot.setUsage(THREE.DynamicDrawUsage);

    geometry.setAttribute("instanceBounds", bounds);
    geometry.setAttribute("instanceIntensity", intensity);
    geometry.setAttribute("instanceLastSpotSec", lastSpot);

    return {
      boundsAttr: bounds,
      intensityAttr: intensity,
      lastSpotAttr: lastSpot,
    };
  }, [geometry]);

  // Pre-allocate reusable objects (avoid per-frame GC pressure)
  const identityMatrix = useMemo(() => new THREE.Matrix4().identity(), []);
  // Cache parsed CSS colors to avoid re-parsing strings every rebuild
  const colorCacheRef = useRef(new Map<string, THREE.Color>());
  // Track both facts and camera pose. Re-rank when the visible hemisphere
  // changes, but do not rebuild buffers for sub-pixel orbit-control jitter.
  const prevCellsRef = useRef<readonly GridActivityCell[] | null>(null);
  const prevCameraRef = useRef(new THREE.Vector3(Number.NaN, 0, 0));
  const cameraDirection = useMemo(() => new THREE.Vector3(), []);
  const cameraWorld = useMemo(() => new THREE.Vector3(), []);
  const cameraLocal = useMemo(() => new THREE.Vector3(), []);
  const cellDirection = useMemo(() => new THREE.Vector3(), []);
  const freshClockActiveRef = useRef(true);

  // Update instance data only when activityMap reference changes
  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const now = Date.now();
    const freshUntil = cells.reduce(
      (latest, cell) =>
        Math.max(
          latest,
          cell.newestTimestamp + GRID_ACTIVITY_RECENCY_PULSE_MS,
        ),
      0,
    );
    // The shader clock advances only while a recency accent is changing. Once
    // every border has settled, persistent density remains entirely static.
    if (now <= freshUntil) {
      material.uniforms.uNowSec.value = (now - epochMs) / 1000;
      freshClockActiveRef.current = true;
    } else if (freshClockActiveRef.current) {
      material.uniforms.uNowSec.value = (freshUntil - epochMs) / 1000;
      freshClockActiveRef.current = false;
    }

    camera.getWorldPosition(cameraWorld);
    // The Earth group applies its axial rotation outside this component. Rank
    // in mesh-local coordinates so "visible" describes the same hemisphere
    // the shader renders, regardless of that parent transform.
    mesh.worldToLocal(cameraLocal.copy(cameraWorld));
    cameraDirection.copy(cameraLocal).normalize();
    const cameraChanged =
      !Number.isFinite(prevCameraRef.current.x) ||
      cameraDirection.distanceToSquared(prevCameraRef.current) > 0.000004;
    if (cells === prevCellsRef.current && !cameraChanged) return;
    prevCellsRef.current = cells;
    prevCameraRef.current.copy(cameraDirection);

    const boundsArray = boundsAttr.array as Float32Array;
    const intensityArray = intensityAttr.array as Float32Array;
    const lastSpotArray = lastSpotAttr.array as Float32Array;

    let idx = 0;

    const horizonThreshold = 1 / Math.max(1.0001, cameraLocal.length());
    const rankedCells = rankGridActivityCells(cells, {
      budget: MAX_INSTANCES,
      isVisible: (cell) => {
        const bounds = gridActivityBounds(cell.grid);
        const lat = (bounds.minLat + bounds.maxLat) / 2;
        const lon = (bounds.minLon + bounds.maxLon) / 2;
        const phi = THREE.MathUtils.degToRad(90 - lat);
        const theta = THREE.MathUtils.degToRad(lon + 180);
        cellDirection.set(
          -Math.sin(phi) * Math.cos(theta),
          Math.cos(phi),
          Math.sin(phi) * Math.sin(theta),
        );
        return cellDirection.dot(cameraDirection) >= horizonThreshold;
      },
    });

    for (const activity of rankedCells) {
      if (idx >= MAX_INSTANCES) break;

      // Decode grid bounds
      const bounds = gridActivityBounds(activity.grid);

      // Set instance bounds attribute (minLon, minLat, maxLon, maxLat)
      boundsArray[idx * 4] = bounds.minLon;
      boundsArray[idx * 4 + 1] = bounds.minLat;
      boundsArray[idx * 4 + 2] = bounds.maxLon;
      boundsArray[idx * 4 + 3] = bounds.maxLat;

      // Canonical density 0..1 drives fill alpha in every projection. A single
      // report still reads at FILL_MIN; saturated cells sit at FILL_MAX.
      intensityArray[idx] = activity.densityScore;

      // Set last-spot time (epoch-relative seconds) for the edge stroke
      lastSpotArray[idx] = (activity.newestTimestamp - epochMs) / 1000;

      // Set instance transform (identity — shader handles positioning)
      mesh.setMatrixAt(idx, identityMatrix);

      // Set instance color — use cache to avoid CSS string parsing per instance
      let cached = colorCacheRef.current.get(activity.color);
      if (!cached) {
        cached = new THREE.Color(activity.color);
        colorCacheRef.current.set(activity.color, cached);
        // Cap cache size to prevent unbounded growth
        if (colorCacheRef.current.size > 100) {
          const first = colorCacheRef.current.keys().next().value;
          if (first) colorCacheRef.current.delete(first);
        }
      }
      mesh.setColorAt(idx, cached);

      idx++;
    }

    // Update instance count to only render active grids
    mesh.count = idx;

    // Mark attributes as needing GPU upload
    boundsAttr.needsUpdate = true;
    intensityAttr.needsUpdate = true;
    lastSpotAttr.needsUpdate = true;

    if (mesh.instanceMatrix) {
      mesh.instanceMatrix.needsUpdate = true;
    }
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, MAX_INSTANCES]}
      frustumCulled={false}
      count={0}
      renderOrder={GLOBE_LAYER_ORDER.surfaceArea}
    />
  );
}
