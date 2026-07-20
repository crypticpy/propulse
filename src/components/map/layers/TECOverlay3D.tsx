/**
 * TECOverlay3D Component
 *
 * Renders an ionospheric Total Electron Content (TEC) heatmap on the 3D globe
 * using a GLSL shader sphere (same approach as NoiseFloorOverlay3D). Scattered
 * TEC grid points are rasterized into a DataTexture and sampled in the fragment
 * shader with GPU bilinear interpolation for smooth color gradients.
 *
 * Color mapping (TECU):
 *   blue   (0-20)   — low TEC
 *   green  (20-40)  — moderate
 *   yellow (40-60)  — elevated
 *   orange (60-80)  — high
 *   red    (80+)    — very high
 *
 * Data comes from the useTEC hook which provides a TECData object
 * with grid[], timestamp, and available fields.
 */

import React, { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useTEC } from "@/hooks/useTEC";
import { GLOBE_LAYER_ORDER } from "@/lib/map/globeRenderOrder";

// =============================================================================
// CONSTANTS
// =============================================================================

/** Radius above globe surface (above GOES at 1.015) */
const GLOBE_RADIUS = 1.02;

/** Resolution of the equirectangular raster grid */
const TEX_WIDTH = 72; // 5-degree longitude bins
const TEX_HEIGHT = 36; // 5-degree latitude bins

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Build a DataTexture from scattered TEC grid points.
 *
 * Rasterizes scattered (lat, lon, tec) points into an equirectangular grid
 * (72 x 36 = 5-degree resolution). Each texel stores the TEC value in the
 * red channel (normalized to 0-1 using 0-100 TECU range). The texture uses
 * LinearFilter so the GPU automatically bilinear-interpolates between grid
 * points, producing a smooth heatmap.
 */
function buildTECTexture(
  grid: ReadonlyArray<{ lat: number; lon: number; tec: number }>,
): THREE.DataTexture {
  const data = new Float32Array(TEX_WIDTH * TEX_HEIGHT * 4);
  // Track counts for averaging when multiple points fall in the same cell
  const counts = new Float32Array(TEX_WIDTH * TEX_HEIGHT);

  for (const point of grid) {
    // Map lon [-180, 180] -> x [0, TEX_WIDTH-1]
    const x = Math.floor(((point.lon + 180) / 360) * TEX_WIDTH);
    // Map lat [-90, 90] -> y [0, TEX_HEIGHT-1] (bottom-to-top = south-to-north)
    const y = Math.floor(((point.lat + 90) / 180) * TEX_HEIGHT);

    const cx = Math.max(0, Math.min(TEX_WIDTH - 1, x));
    const cy = Math.max(0, Math.min(TEX_HEIGHT - 1, y));

    const idx = cy * TEX_WIDTH + cx;
    const pixelIdx = idx * 4;
    const normalized = Math.max(0, Math.min(1, point.tec / 100));

    // Accumulate for averaging
    data[pixelIdx] += normalized;
    counts[idx] += 1;
  }

  // Average accumulated values
  for (let i = 0; i < TEX_WIDTH * TEX_HEIGHT; i++) {
    if (counts[i] > 0) {
      data[i * 4] /= counts[i];
    }
    data[i * 4 + 3] = 1; // Alpha = full
  }

  const texture = new THREE.DataTexture(
    data,
    TEX_WIDTH,
    TEX_HEIGHT,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.RepeatWrapping; // Wrap longitude
  texture.wrapT = THREE.ClampToEdgeWrapping; // Clamp latitude
  texture.needsUpdate = true;

  return texture;
}

// =============================================================================
// GLSL SHADERS
// =============================================================================

const vertexShader = /* glsl */ `
  varying vec3 vPosition;

  void main() {
    // World-space position (normalized sphere = unit vectors for lat/lon extraction)
    vPosition = normalize((modelMatrix * vec4(position, 1.0)).xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D tecMap;
  uniform float uOpacity;
  uniform float uTime;

  varying vec3 vPosition;

  // Map TEC (normalized 0-1 where 0=0 TECU, 1=100 TECU) to color
  // blue (0-20) -> green (20-40) -> yellow (40-60) -> orange (60-80) -> red (80+)
  vec3 tecToColor(float n) {
    float tecu = n * 100.0;

    vec3 blue   = vec3(0.133, 0.400, 1.000); // #2266ff
    vec3 green  = vec3(0.133, 0.800, 0.400); // #22cc66
    vec3 yellow = vec3(0.867, 0.800, 0.133); // #ddcc22
    vec3 orange = vec3(0.933, 0.533, 0.133); // #ee8822
    vec3 red    = vec3(0.933, 0.200, 0.133); // #ee3322

    if (tecu < 20.0) {
      float t = tecu / 20.0;
      return mix(blue, green, t);
    } else if (tecu < 40.0) {
      float t = (tecu - 20.0) / 20.0;
      return mix(green, yellow, t);
    } else if (tecu < 60.0) {
      float t = (tecu - 40.0) / 20.0;
      return mix(yellow, orange, t);
    } else {
      float t = clamp((tecu - 60.0) / 40.0, 0.0, 1.0);
      return mix(orange, red, t);
    }
  }

  void main() {
    // Extract lat/lon from world-space position
    float lat = asin(vPosition.y) * 57.29578; // rad to deg, -90 to +90
    float lon = atan(vPosition.z, -vPosition.x) * 57.29578 - 180.0; // -180 to +180

    // Normalize to UV coordinates
    float u = (lon + 180.0) / 360.0;
    float v = (lat + 90.0) / 180.0;

    // Sample the TEC texture (GPU bilinear interpolation)
    float tecVal = texture2D(tecMap, vec2(u, v)).r;

    // Skip near-zero values (no data)
    if (tecVal < 0.005) discard;

    vec3 color = tecToColor(tecVal);

    // Subtle pulse animation
    float pulse = 0.45 + 0.05 * sin(uTime * 0.4);

    gl_FragColor = vec4(color, uOpacity * pulse / 0.45);
  }
`;

// =============================================================================
// COMPONENT
// =============================================================================

export const TECOverlay3D = React.memo(function TECOverlay3D() {
  const { tecData } = useTEC();
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  // Build TEC DataTexture from grid data
  const tecTexture = useMemo(() => {
    if (!tecData.available || tecData.grid.length === 0) return null;
    return buildTECTexture(tecData.grid);
  }, [tecData]);

  // Create shader material with uniforms
  const material = useMemo(() => {
    if (!tecTexture) return null;
    return new THREE.ShaderMaterial({
      uniforms: {
        tecMap: { value: tecTexture },
        uOpacity: { value: 0.4 },
        uTime: { value: 0 },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      side: THREE.FrontSide,
      depthWrite: false,
      depthTest: false,
    });
  }, [tecTexture]);

  // Dispose texture and material on unmount or when data changes
  useEffect(() => {
    return () => {
      tecTexture?.dispose();
      material?.dispose();
    };
  }, [tecTexture, material]);

  // Animate time uniform for subtle opacity pulse
  useFrame(({ clock }) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = clock.getElapsedTime();
    }
  });

  if (
    !tecTexture ||
    !material ||
    !tecData.available ||
    tecData.grid.length === 0
  ) {
    return null;
  }

  return (
    <group name="tec-overlay">
      <mesh renderOrder={GLOBE_LAYER_ORDER.surfaceTexture}>
        <sphereGeometry args={[GLOBE_RADIUS, 64, 64]} />
        <primitive object={material} attach="material" ref={materialRef} />
      </mesh>
    </group>
  );
});

export default TECOverlay3D;
