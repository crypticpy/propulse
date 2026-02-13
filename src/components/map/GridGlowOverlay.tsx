/**
 * GridGlowOverlay Component
 *
 * Renders pulsing glow effects on Maidenhead grid fields when live spots arrive.
 * Each 2-char grid prefix (e.g., "EM", "FN", "JO") triggers a brief radial glow
 * on the globe surface, creating a visual heartbeat of propagation activity.
 *
 * Technical approach:
 * - Pre-allocated pool of 20 mesh instances (no create/destroy per pulse)
 * - Custom ShaderMaterial with radial gradient and animated intensity uniform
 * - 5x5 subdivided quads projected onto sphere at r=1.003
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

/** Maximum number of simultaneously active glow meshes */
const POOL_SIZE = 20;

/** Sphere radius for glow overlay (between greyline at 1.002 and labels) */
const GLOW_RADIUS = 1.003;

/** Number of subdivisions along each axis of a grid quad */
const SUBDIVISIONS = 5;

/** Duration of the rise phase in seconds (ease-out) */
const RISE_DURATION = 0.8;

/** Duration of the fade phase in seconds (ease-in) */
const FADE_DURATION = 1.2;

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
 * Convert geographic lat/lon to 3D cartesian position on a sphere.
 * Uses the same coordinate convention as the rest of the globe scene.
 */
function latLonTo3D(
  lat: number,
  lon: number,
  radius: number,
): [number, number, number] {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return [
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  ];
}

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
 * Build a subdivided quad geometry for one grid field, projected onto the sphere.
 * Returns a BufferGeometry with (SUBDIVISIONS+1)^2 vertices and SUBDIVISIONS^2*2 triangles.
 * Also includes UV coordinates for the fragment shader's radial gradient.
 */
function buildGridFieldGeometry(): THREE.BufferGeometry {
  const vertsPerSide = SUBDIVISIONS + 1;
  const vertexCount = vertsPerSide * vertsPerSide;
  const triCount = SUBDIVISIONS * SUBDIVISIONS * 2;

  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices = new Uint16Array(triCount * 3);

  // Pre-fill UVs (grid-relative 0..1) — positions set per-activation
  let vi = 0;
  for (let row = 0; row <= SUBDIVISIONS; row++) {
    const v = row / SUBDIVISIONS;
    for (let col = 0; col <= SUBDIVISIONS; col++) {
      const u = col / SUBDIVISIONS;
      uvs[vi * 2] = u;
      uvs[vi * 2 + 1] = v;
      vi++;
    }
  }

  // Index buffer — same for every grid field
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

/**
 * Update the position attribute of a grid field geometry to match a specific
 * Maidenhead grid field, projecting onto the sphere surface.
 */
function updateGeometryForField(
  geometry: THREE.BufferGeometry,
  gridField: string,
): void {
  const bounds = gridFieldToBounds(gridField);
  const posAttr = geometry.getAttribute("position") as THREE.BufferAttribute;
  const posArray = posAttr.array as Float32Array;

  let vi = 0;
  for (let row = 0; row <= SUBDIVISIONS; row++) {
    const v = row / SUBDIVISIONS;
    const lat = bounds.minLat + v * (bounds.maxLat - bounds.minLat);
    for (let col = 0; col <= SUBDIVISIONS; col++) {
      const u = col / SUBDIVISIONS;
      const lon = bounds.minLon + u * (bounds.maxLon - bounds.minLon);
      const [x, y, z] = latLonTo3D(lat, lon, GLOW_RADIUS);
      posArray[vi * 3] = x;
      posArray[vi * 3 + 1] = y;
      posArray[vi * 3 + 2] = z;
      vi++;
    }
  }

  posAttr.needsUpdate = true;
  // Note: normals are not used by the glow shader — skip computeVertexNormals()
}

// =============================================================================
// SHADER
// =============================================================================

const GLOW_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const GLOW_FRAGMENT_SHADER = /* glsl */ `
  uniform float uIntensity;
  uniform vec3 uColor;

  varying vec2 vUv;

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
    float alpha = radial * uIntensity * 0.65;

    // Add a subtle bloom halo at the very center
    float bloom = exp(-dist * 6.0) * uIntensity * 0.3;
    alpha += bloom;

    gl_FragColor = vec4(uColor, alpha);
  }
`;

/**
 * Create a ShaderMaterial instance for the glow effect.
 */
function createGlowMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uIntensity: { value: 0.0 },
      uColor: { value: new THREE.Color(1, 1, 1) },
    },
    vertexShader: GLOW_VERTEX_SHADER,
    fragmentShader: GLOW_FRAGMENT_SHADER,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

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
  // Refs for the pre-allocated pool — meshes, materials, geometries, and state
  const meshRefs = useRef<Array<THREE.Mesh | null>>(
    Array.from({ length: POOL_SIZE }, () => null),
  );
  const materialsRef = useRef<THREE.ShaderMaterial[]>([]);
  const geometriesRef = useRef<THREE.BufferGeometry[]>([]);
  const slotsRef = useRef<GlowSlot[]>([]);

  // Track which spots we have already processed (by index in the spots array)
  const processedCountRef = useRef(0);

  // Track the previous spots array reference to detect prop changes
  const prevSpotsRef = useRef<GridGlowSpot[]>([]);

  // One-time initialization of pool resources
  const _poolInit = useMemo(() => {
    const materials: THREE.ShaderMaterial[] = [];
    const geometries: THREE.BufferGeometry[] = [];
    const slots: GlowSlot[] = [];

    for (let i = 0; i < POOL_SIZE; i++) {
      materials.push(createGlowMaterial());
      geometries.push(buildGridFieldGeometry());
      slots.push({
        active: false,
        gridField: "",
        startTime: 0,
        intensity: 0,
        peakIntensity: 1.0,
      });
    }

    materialsRef.current = materials;
    geometriesRef.current = geometries;
    slotsRef.current = slots;

    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Prevent unused-variable lint warning
  void _poolInit;

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
   * Activate a glow for a given grid field and color.
   */
  function activateGlow(
    gridField: string,
    color: string,
    clockTime: number,
  ): void {
    const slots = slotsRef.current;
    const materials = materialsRef.current;
    const geometries = geometriesRef.current;

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
    const material = materials[idx];
    const geometry = geometries[idx];
    const mesh = meshRefs.current[idx];

    // Configure the slot
    slot.active = true;
    slot.gridField = gridField;
    slot.startTime = clockTime;
    slot.intensity = 0;
    slot.peakIntensity = 1.0;

    // Update geometry to match the grid field bounds
    updateGeometryForField(geometry, gridField);

    // Set the color uniform (reuse the uniform's existing Color to avoid allocation)
    (material.uniforms.uColor.value as THREE.Color).set(color);
    material.uniforms.uIntensity.value = 0;

    // Make the mesh visible
    if (mesh) {
      mesh.visible = true;
    }
  }

  // Main animation loop — updates all active glows, processes new spots
  useFrame((state) => {
    const clockTime = state.clock.getElapsedTime();
    const slots = slotsRef.current;
    const materials = materialsRef.current;

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
    for (let i = 0; i < POOL_SIZE; i++) {
      const slot = slots[i];
      const material = materials[i];
      const mesh = meshRefs.current[i];

      if (!slot.active) {
        // Ensure hidden
        if (mesh) mesh.visible = false;
        continue;
      }

      const elapsed = clockTime - slot.startTime;

      if (elapsed >= TOTAL_DURATION) {
        // Animation complete — deactivate
        slot.active = false;
        slot.intensity = 0;
        material.uniforms.uIntensity.value = 0;
        if (mesh) mesh.visible = false;
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
      material.uniforms.uIntensity.value = intensity;
    }
  });

  // Render the pre-allocated pool of meshes
  return (
    <group>
      {Array.from({ length: POOL_SIZE }, (_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            meshRefs.current[i] = el;
          }}
          geometry={geometriesRef.current[i]}
          material={materialsRef.current[i]}
          visible={false}
          frustumCulled={false}
        />
      ))}
    </group>
  );
}
