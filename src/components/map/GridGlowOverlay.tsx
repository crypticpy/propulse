/**
 * GridGlowOverlay Component
 *
 * Renders pulsing glow effects on Maidenhead grid fields when live spots arrive.
 * Each 2-char grid prefix (e.g., "EM", "FN", "JO") triggers a brief radial glow
 * on the globe surface, creating a visual heartbeat of propagation activity.
 *
 * Technical approach:
 * - Single InstancedMesh with a pool of 20 instances (one draw call)
 * - Shared subdivided quad geometry (5x5) — vertex shader projects onto sphere
 * - Per-instance attributes: bounds (vec4), intensity (float)
 * - Per-instance color via InstancedMesh.setColorAt()
 * - Animation driven entirely by useFrame (no React state in render loop)
 */

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

// =============================================================================
// TYPES
// =============================================================================

export interface GridGlowSpot {
  /** 2-char Maidenhead grid field prefix (e.g., "EM", "FN") */
  gridField: string;
  /** CSS color string for the glow */
  color: string;
  /** Timestamp when the spot arrived */
  timestamp: number;
}

export interface GridGlowOverlayProps {
  /** Recently arrived spots to trigger glows for */
  spots: GridGlowSpot[];
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** Maximum number of simultaneously active glow instances */
const POOL_SIZE = 20;

/** Sphere radius for glow overlay (between greyline at 1.002 and labels) */
const GLOW_RADIUS = 1.003;

/** Number of subdivisions along each axis of a grid quad */
const SUBDIVISIONS = 5;

/** Duration of the rise phase in seconds (ease-out) */
const RISE_DURATION = 0.3;

/** Duration of the fade phase in seconds (ease-in) */
const FADE_DURATION = 0.7;

/** Total animation cycle in seconds */
const TOTAL_DURATION = RISE_DURATION + FADE_DURATION;

// =============================================================================
// GLOW STATE (mutable, no React state — only touched in useFrame)
// =============================================================================

interface GlowSlot {
  /** Whether this slot is currently animating */
  active: boolean;
  /** 2-char grid field this slot is rendering */
  gridField: string;
  /** Time (clock seconds) when the glow started */
  startTime: number;
  /** Current computed intensity (0..1) */
  intensity: number;
  /** Peak intensity — boosted when same-field spots arrive mid-glow */
  peakIntensity: number;
}

// =============================================================================
// COORDINATE HELPERS
// =============================================================================

/**
 * Decode a 2-char Maidenhead grid field to geographic bounding box.
 *
 * Grid fields:
 * - First char (A-R): longitude field, each 20deg wide, starting at -180
 * - Second char (A-R): latitude field, each 10deg tall, starting at -90
 */
function gridFieldToBounds(field: string): {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
} {
  const lonField = field.charCodeAt(0) - 65; // A=0, R=17
  const latField = field.charCodeAt(1) - 65;
  return {
    minLon: lonField * 20 - 180,
    maxLon: (lonField + 1) * 20 - 180,
    minLat: latField * 10 - 90,
    maxLat: (latField + 1) * 10 - 90,
  };
}

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

      indices[ii++] = topLeft;
      indices[ii++] = bottomLeft;
      indices[ii++] = topRight;

      indices[ii++] = topRight;
      indices[ii++] = bottomLeft;
      indices[ii++] = bottomRight;
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

const GLOW_VERTEX_SHADER = /* glsl */ `
  // Per-instance attributes
  attribute vec4 instanceBounds;    // x=minLon, y=minLat, z=maxLon, w=maxLat
  attribute float instanceIntensity;

  varying vec2 vUv;
  varying float vIntensity;
  varying vec3 vColor;

  void main() {
    vUv = uv;
    vIntensity = instanceIntensity;

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
    float r = ${GLOW_RADIUS.toFixed(4)};

    vec3 pos = vec3(
      -r * sin(phi) * cos(theta),
       r * cos(phi),
       r * sin(phi) * sin(theta)
    );

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const GLOW_FRAGMENT_SHADER = /* glsl */ `
  varying vec2 vUv;
  varying float vIntensity;
  varying vec3 vColor;

  void main() {
    // Distance from center of the grid field (UV 0.5, 0.5)
    vec2 center = vec2(0.5, 0.5);
    float dist = distance(vUv, center);

    // Normalize to 0..1 where 0 = center, 1 = corner (~0.707 diagonal)
    float maxDist = 0.707; // sqrt(0.5^2 + 0.5^2)
    float normalizedDist = clamp(dist / maxDist, 0.0, 1.0);

    // Radial gradient: strong at center, fading smoothly at edges
    float radial = 1.0 - smoothstep(0.0, 0.85, normalizedDist);

    // Apply a soft power curve for a more natural glow falloff
    radial = pow(radial, 1.5);

    // Final alpha combines radial shape with animated intensity
    float alpha = radial * vIntensity * 0.65;

    // Add a subtle bloom halo at the very center
    float bloom = exp(-dist * 6.0) * vIntensity * 0.3;
    alpha += bloom;

    gl_FragColor = vec4(vColor, alpha);
  }
`;

// =============================================================================
// EASING FUNCTIONS
// =============================================================================

/** Ease-out: decelerating curve for the rise phase */
function easeOutCubic(t: number): number {
  const inv = 1 - t;
  return 1 - inv * inv * inv;
}

/** Ease-in: accelerating curve for the fade phase */
function easeInCubic(t: number): number {
  return t * t * t;
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function GridGlowOverlay({ spots }: GridGlowOverlayProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  // Slot state — mutable, only touched in useFrame
  const slotsRef = useRef<GlowSlot[]>([]);

  // Track which spots we have already processed (by index in the spots array)
  const processedCountRef = useRef(0);

  // Track the previous spots array reference to detect prop changes
  const prevSpotsRef = useRef<GridGlowSpot[]>([]);

  // Cache parsed CSS colors to avoid re-parsing strings every activation
  const colorCacheRef = useRef(new Map<string, THREE.Color>());

  // Pre-allocate reusable objects
  const identityMatrix = useMemo(() => new THREE.Matrix4().identity(), []);

  // Build shared geometry and material once
  const { geometry, material } = useMemo(() => {
    const geo = buildSharedQuadGeometry();
    const mat = new THREE.ShaderMaterial({
      vertexShader: GLOW_VERTEX_SHADER,
      fragmentShader: GLOW_FRAGMENT_SHADER,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    return { geometry: geo, material: mat };
  }, []);

  // Pre-allocate instance buffer attributes and slot state
  const { boundsAttr, intensityAttr } = useMemo(() => {
    const boundsArray = new Float32Array(POOL_SIZE * 4);
    const intensityArray = new Float32Array(POOL_SIZE);

    const bounds = new THREE.InstancedBufferAttribute(boundsArray, 4);
    bounds.setUsage(THREE.DynamicDrawUsage);

    const intensity = new THREE.InstancedBufferAttribute(intensityArray, 1);
    intensity.setUsage(THREE.DynamicDrawUsage);

    geometry.setAttribute("instanceBounds", bounds);
    geometry.setAttribute("instanceIntensity", intensity);

    // Initialize slot state
    const slots: GlowSlot[] = [];
    for (let i = 0; i < POOL_SIZE; i++) {
      slots.push({
        active: false,
        gridField: "",
        startTime: 0,
        intensity: 0,
        peakIntensity: 1.0,
      });
    }
    slotsRef.current = slots;

    return { boundsAttr: bounds, intensityAttr: intensity };
  }, [geometry]);

  /**
   * Find a free or recyclable slot index.
   * Prefers inactive slots; falls back to the slot with lowest remaining intensity.
   */
  function acquireSlot(): number {
    const slots = slotsRef.current;

    // First pass: find an inactive slot
    for (let i = 0; i < POOL_SIZE; i++) {
      if (!slots[i].active) return i;
    }

    // Second pass: recycle the slot with lowest intensity (most faded)
    let minIdx = 0;
    let minIntensity = Infinity;
    for (let i = 0; i < POOL_SIZE; i++) {
      if (slots[i].intensity < minIntensity) {
        minIntensity = slots[i].intensity;
        minIdx = i;
      }
    }
    return minIdx;
  }

  /**
   * Resolve a CSS color string to a THREE.Color, using a cache to avoid
   * repeated string parsing. Cache is capped at 50 entries.
   */
  function resolveColor(cssColor: string): THREE.Color {
    let cached = colorCacheRef.current.get(cssColor);
    if (!cached) {
      cached = new THREE.Color(cssColor);
      colorCacheRef.current.set(cssColor, cached);
      // Cap cache size to prevent unbounded growth
      if (colorCacheRef.current.size > 50) {
        const first = colorCacheRef.current.keys().next().value;
        if (first) colorCacheRef.current.delete(first);
      }
    }
    return cached;
  }

  /**
   * Activate a glow for a given grid field and color.
   */
  function activateGlow(
    gridField: string,
    color: string,
    clockTime: number,
  ): void {
    const slots = slotsRef.current;
    const mesh = meshRef.current;
    if (!mesh) return;

    const boundsArray = boundsAttr.array as Float32Array;

    // Check if this grid field already has an active glow — boost it instead
    for (let i = 0; i < POOL_SIZE; i++) {
      if (slots[i].active && slots[i].gridField === gridField) {
        // Boost peak intensity (capped at 1.0)
        slots[i].peakIntensity = Math.min(1.0, slots[i].peakIntensity + 0.25);
        // Restart the animation to extend visibility
        slots[i].startTime = clockTime;
        return;
      }
    }

    const idx = acquireSlot();
    const slot = slots[idx];

    // Configure the slot
    slot.active = true;
    slot.gridField = gridField;
    slot.startTime = clockTime;
    slot.intensity = 0;
    slot.peakIntensity = 1.0;

    // Set instance bounds for this slot
    const bounds = gridFieldToBounds(gridField);
    boundsArray[idx * 4] = bounds.minLon;
    boundsArray[idx * 4 + 1] = bounds.minLat;
    boundsArray[idx * 4 + 2] = bounds.maxLon;
    boundsArray[idx * 4 + 3] = bounds.maxLat;

    // Set instance transform (identity — shader handles positioning)
    mesh.setMatrixAt(idx, identityMatrix);

    // Set instance color
    const threeColor = resolveColor(color);
    mesh.setColorAt(idx, threeColor);

    // Mark attributes for GPU upload
    boundsAttr.needsUpdate = true;
    if (mesh.instanceMatrix) {
      mesh.instanceMatrix.needsUpdate = true;
    }
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
  }

  // Main animation loop — updates all active glows, processes new spots
  useFrame((state) => {
    const clockTime = state.clock.getElapsedTime();
    const slots = slotsRef.current;
    const mesh = meshRef.current;
    if (!mesh) return;

    const intensityArray = intensityAttr.array as Float32Array;

    // --- Process newly arrived spots ---
    // Detect when the spots array reference changes (new data from parent)
    if (spots !== prevSpotsRef.current) {
      prevSpotsRef.current = spots;
      processedCountRef.current = 0;
    }

    // Process any unprocessed spots in the current array
    const unprocessedStart = processedCountRef.current;
    if (unprocessedStart < spots.length) {
      for (let i = unprocessedStart; i < spots.length; i++) {
        const spot = spots[i];
        // Validate grid field: must be exactly 2 uppercase letters A-R
        if (
          spot.gridField.length === 2 &&
          spot.gridField.charCodeAt(0) >= 65 &&
          spot.gridField.charCodeAt(0) <= 82 &&
          spot.gridField.charCodeAt(1) >= 65 &&
          spot.gridField.charCodeAt(1) <= 82
        ) {
          activateGlow(spot.gridField, spot.color, clockTime);
        }
      }
      processedCountRef.current = spots.length;
    }

    // --- Update all active glow slots ---
    let needsUpdate = false;
    for (let i = 0; i < POOL_SIZE; i++) {
      const slot = slots[i];

      if (!slot.active) {
        // Ensure intensity is zero for inactive slots (shader outputs alpha=0)
        if (intensityArray[i] !== 0) {
          intensityArray[i] = 0;
          needsUpdate = true;
        }
        continue;
      }

      const elapsed = clockTime - slot.startTime;

      if (elapsed >= TOTAL_DURATION) {
        // Animation complete — deactivate
        slot.active = false;
        slot.intensity = 0;
        intensityArray[i] = 0;
        needsUpdate = true;
        continue;
      }

      // Compute intensity based on phase
      let intensity: number;

      if (elapsed < RISE_DURATION) {
        // Rise phase: ease-out (fast start, slow finish)
        const t = elapsed / RISE_DURATION;
        intensity = easeOutCubic(t) * slot.peakIntensity;
      } else {
        // Fade phase: ease-in (slow start, fast finish)
        const fadeElapsed = elapsed - RISE_DURATION;
        const t = fadeElapsed / FADE_DURATION;
        intensity = (1 - easeInCubic(t)) * slot.peakIntensity;
      }

      slot.intensity = intensity;
      intensityArray[i] = intensity;
      needsUpdate = true;
    }

    // Only flag GPU upload when intensity values actually changed
    if (needsUpdate) {
      intensityAttr.needsUpdate = true;
    }
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, POOL_SIZE]}
      frustumCulled={false}
    />
  );
}
