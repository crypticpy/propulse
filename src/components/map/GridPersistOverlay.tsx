/**
 * GridPersistOverlay Component
 *
 * Renders persistent Maidenhead grid-square highlights on the 3D globe using
 * a single THREE.InstancedMesh for efficient draw-call batching. Active grids
 * glow with a density-driven color and soft radial falloff.
 *
 * Technical approach:
 * - Single InstancedMesh with a pool of 500 instances (only active grids draw)
 * - Shared subdivided quad geometry (3x3) — vertex shader projects onto sphere
 * - Per-instance attributes: bounds (vec4), color (vec3), intensity (float)
 * - Vertex shader maps UV → lat/lon via instance bounds → 3D sphere position
 * - Fragment shader applies radial gradient with soft glow and bloom halo
 * - Additive blending, no depth write — layers naturally with the globe
 *
 * Follows the same coordinate system and rendering patterns as GridGlowOverlay.
 */

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { GridActivity } from "@/hooks/useGridActivityMap";

// =============================================================================
// CONSTANTS
// =============================================================================

/** Maximum number of grid instances in the pool */
const MAX_INSTANCES = 500;

/** Sphere radius — sits between the greyline overlay and glow pulses */
const PERSIST_RADIUS = 1.0025;

/** Subdivisions per axis for the shared quad geometry */
const SUBDIVISIONS = 3;

// =============================================================================
// COORDINATE HELPERS
// =============================================================================

/**
 * Decode a 4-char Maidenhead grid square to geographic bounding box.
 *
 * Grid encoding:
 * - Char 1 (A-R): longitude field, each 20deg wide, starting at -180
 * - Char 2 (A-R): latitude field, each 10deg tall, starting at -90
 * - Char 3 (0-9): longitude square, each 2deg wide within field
 * - Char 4 (0-9): latitude square, each 1deg tall within field
 */
function grid4ToBounds(grid: string): {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
} {
  const lonField = grid.charCodeAt(0) - 65; // A=0, R=17
  const latField = grid.charCodeAt(1) - 65;
  const lonSquare = parseInt(grid[2], 10);
  const latSquare = parseInt(grid[3], 10);

  const minLon = lonField * 20 - 180 + lonSquare * 2;
  const minLat = latField * 10 - 90 + latSquare * 1;

  return {
    minLon,
    minLat,
    maxLon: minLon + 2,
    maxLat: minLat + 1,
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

const PERSIST_VERTEX_SHADER = /* glsl */ `
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
    float r = ${PERSIST_RADIUS.toFixed(4)};

    vec3 pos = vec3(
      -r * sin(phi) * cos(theta),
       r * cos(phi),
       r * sin(phi) * sin(theta)
    );

    gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
  }
`;

const PERSIST_FRAGMENT_SHADER = /* glsl */ `
  varying vec2 vUv;
  varying float vIntensity;
  varying vec3 vColor;

  void main() {
    // Distance from center of the grid quad (UV 0.5, 0.5)
    vec2 center = vec2(0.5, 0.5);
    float dist = distance(vUv, center);

    // Normalize: 0 = center, 1 = corner (~0.707 diagonal)
    float maxDist = 0.707;
    float normalizedDist = clamp(dist / maxDist, 0.0, 1.0);

    // Radial gradient: strong at center, soft fade at edges
    float radial = 1.0 - smoothstep(0.0, 0.85, normalizedDist);
    radial = pow(radial, 1.5);

    // Final alpha combines radial shape with instance intensity
    float alpha = radial * vIntensity * 0.5;

    // Subtle bloom halo at the center
    float bloom = exp(-dist * 6.0) * vIntensity * 0.2;
    alpha += bloom;

    gl_FragColor = vec4(vColor, alpha);
  }
`;

// =============================================================================
// PROPS
// =============================================================================

export interface GridPersistOverlayProps {
  /** Active grid activity map from useGridActivityMap */
  activityMap: Map<string, GridActivity>;
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function GridPersistOverlay({ activityMap }: GridPersistOverlayProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  // Build shared geometry and material once
  const { geometry, material } = useMemo(() => {
    const geo = buildSharedQuadGeometry();
    const mat = new THREE.ShaderMaterial({
      vertexShader: PERSIST_VERTEX_SHADER,
      fragmentShader: PERSIST_FRAGMENT_SHADER,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    return { geometry: geo, material: mat };
  }, []);

  // Pre-allocate instance buffer attributes
  const { boundsAttr, intensityAttr } = useMemo(() => {
    const boundsArray = new Float32Array(MAX_INSTANCES * 4);
    const intensityArray = new Float32Array(MAX_INSTANCES);

    const bounds = new THREE.InstancedBufferAttribute(boundsArray, 4);
    bounds.setUsage(THREE.DynamicDrawUsage);

    const intensity = new THREE.InstancedBufferAttribute(intensityArray, 1);
    intensity.setUsage(THREE.DynamicDrawUsage);

    geometry.setAttribute("instanceBounds", bounds);
    geometry.setAttribute("instanceIntensity", intensity);

    return { boundsAttr: bounds, intensityAttr: intensity };
  }, [geometry]);

  // Temp color object for setColorAt
  const tempColor = useMemo(() => new THREE.Color(), []);

  // Update instance data each frame
  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const boundsArray = boundsAttr.array as Float32Array;
    const intensityArray = intensityAttr.array as Float32Array;

    let idx = 0;
    const dummyMatrix = new THREE.Matrix4();
    // Identity matrix — positioning is handled entirely by the vertex shader
    dummyMatrix.identity();

    for (const [, activity] of activityMap) {
      if (idx >= MAX_INSTANCES) break;

      // Decode grid bounds
      const bounds = grid4ToBounds(activity.gridSquare);

      // Set instance bounds attribute (minLon, minLat, maxLon, maxLat)
      boundsArray[idx * 4] = bounds.minLon;
      boundsArray[idx * 4 + 1] = bounds.minLat;
      boundsArray[idx * 4 + 2] = bounds.maxLon;
      boundsArray[idx * 4 + 3] = bounds.maxLat;

      // Set instance intensity based on spot count
      intensityArray[idx] = Math.min(0.5, 0.2 + activity.spotCount * 0.01);

      // Set instance transform (identity — shader handles positioning)
      mesh.setMatrixAt(idx, dummyMatrix);

      // Set instance color from the activity's density-derived color
      tempColor.set(activity.color);
      mesh.setColorAt(idx, tempColor);

      idx++;
    }

    // Update instance count to only render active grids
    mesh.count = idx;

    // Mark attributes as needing GPU upload
    boundsAttr.needsUpdate = true;
    intensityAttr.needsUpdate = true;

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
    />
  );
}
