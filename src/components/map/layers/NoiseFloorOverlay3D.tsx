/**
 * NoiseFloorOverlay3D Component
 *
 * Renders an ITU-R P.372 noise floor heatmap on the 3D globe using a GLSL
 * shader sphere (same approach as MUFOverlay). The pre-computed noise grid
 * is packed into a DataTexture and sampled in the fragment shader with GPU
 * bilinear interpolation for smooth color gradients.
 *
 * Color mapping:
 *   blue  (<20 dB)  — quiet
 *   green (20-35 dB) — moderate
 *   yellow (35-50 dB) — loud
 *   red   (>50 dB)   — very noisy (urban/industrial)
 *
 * Data comes from the useNoiseFloor hook which provides a NoiseFloorGrid
 * with lats[], lons[], and values[][] (total noise in dB).
 */

import React, { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useActiveFrequency } from "@/hooks/useActiveBandMode";

// =============================================================================
// TYPES
// =============================================================================

interface NoiseFloorOverlay3DProps {
  grid: {
    lats: number[];
    lons: number[];
    values: number[][]; // [lat][lon] total noise dB
  };
  /** Optional frequency in Hz — falls back to useActiveFrequency() from operating store */
  frequencyHz?: number;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** Radius just above globe surface to avoid z-fighting */
const GLOBE_RADIUS = 1.012;

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Build a DataTexture from the noise grid.
 *
 * The texture is width=lons.length, height=lats.length. Each texel stores
 * the noise dB value in the red channel (normalized to 0-1 using a known
 * range of 0-80 dB). The texture uses LinearFilter so the GPU automatically
 * bilinear-interpolates between grid points, producing a smooth heatmap.
 */
function buildNoiseTexture(grid: {
  lats: number[];
  lons: number[];
  values: number[][];
}): THREE.DataTexture {
  const width = grid.lons.length;
  const height = grid.lats.length;
  const data = new Float32Array(width * height * 4);

  for (let latIdx = 0; latIdx < height; latIdx++) {
    const row = grid.values[latIdx];
    for (let lonIdx = 0; lonIdx < width; lonIdx++) {
      const db = row?.[lonIdx] ?? 0;
      // Normalize dB to 0-1 range (0 dB -> 0.0, 80 dB -> 1.0)
      const normalized = Math.max(0, Math.min(1, db / 80));

      // Flip latitude: texture row 0 is bottom (-90), row N is top (+90)
      // Grid lats go from -90 to +90 (south to north), which matches
      // texture bottom-to-top, so no flip needed.
      const pixelIdx = (latIdx * width + lonIdx) * 4;
      data[pixelIdx] = normalized; // R: noise value
      data[pixelIdx + 1] = 0; // G: unused
      data[pixelIdx + 2] = 0; // B: unused
      data[pixelIdx + 3] = 1; // A: full
    }
  }

  const texture = new THREE.DataTexture(
    data,
    width,
    height,
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
  uniform sampler2D noiseMap;
  uniform float uOpacity;
  uniform float uTime;

  varying vec3 vPosition;

  // Map noise dB (normalized 0-1 where 0=0dB, 1=80dB) to color
  // blue (<20dB) -> green (20-35dB) -> yellow (35-50dB) -> red (>50dB)
  vec3 noiseToColor(float n) {
    // Convert normalized back to dB for readable thresholds
    float db = n * 80.0;

    vec3 blue   = vec3(0.133, 0.400, 1.000); // #2266ff
    vec3 green  = vec3(0.133, 0.800, 0.400); // #22cc66
    vec3 yellow = vec3(0.867, 0.800, 0.133); // #ddcc22
    vec3 red    = vec3(0.933, 0.200, 0.133); // #ee3322

    if (db < 20.0) {
      return blue;
    } else if (db < 35.0) {
      float t = (db - 20.0) / 15.0;
      return mix(blue, green, t);
    } else if (db < 50.0) {
      float t = (db - 35.0) / 15.0;
      return mix(green, yellow, t);
    } else {
      float t = clamp((db - 50.0) / 20.0, 0.0, 1.0);
      return mix(yellow, red, t);
    }
  }

  void main() {
    // Extract lat/lon from world-space position
    // y = cos(phi) where phi = (90 - lat) in radians
    float lat = asin(vPosition.y) * 57.29578; // rad to deg, -90 to +90
    float lon = atan(vPosition.z, -vPosition.x) * 57.29578 - 180.0; // -180 to +180

    // Normalize to UV coordinates
    // U: longitude -180..+180 -> 0..1
    float u = (lon + 180.0) / 360.0;
    // V: latitude -90..+90 -> 0..1
    float v = (lat + 90.0) / 180.0;

    // Sample the noise texture (GPU bilinear interpolation gives smooth blending)
    float noiseVal = texture2D(noiseMap, vec2(u, v)).r;

    // Color from noise level
    vec3 color = noiseToColor(noiseVal);

    // Subtle pulse animation
    float pulse = 0.45 + 0.05 * sin(uTime * 0.5);

    gl_FragColor = vec4(color, uOpacity * pulse / 0.45);
  }
`;

// =============================================================================
// COMPONENT
// =============================================================================

export const NoiseFloorOverlay3D = React.memo(
  function NoiseFloorOverlay3D({
    grid,
    frequencyHz: frequencyHzProp,
  }: NoiseFloorOverlay3DProps) {
    // Active frequency from operating store (Hz), used when prop not provided.
    const storeFrequencyHz = useActiveFrequency();
    const activeFrequencyHz = frequencyHzProp ?? storeFrequencyHz;
    // activeFrequencyHz is available for future inline noise computation;
    // currently the grid is pre-computed upstream via useNoiseFloor(frequencyMHz).
    void activeFrequencyHz;

    const materialRef = useRef<THREE.ShaderMaterial>(null);

    // Build noise DataTexture from grid data
    const noiseTexture = useMemo(() => buildNoiseTexture(grid), [grid]);

    // Create shader material with uniforms
    const material = useMemo(() => {
      return new THREE.ShaderMaterial({
        uniforms: {
          noiseMap: { value: noiseTexture },
          uOpacity: { value: 0.45 },
          uTime: { value: 0 },
        },
        vertexShader,
        fragmentShader,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
    }, [noiseTexture]);

    // Dispose texture and material on unmount or when grid changes
    useEffect(() => {
      return () => {
        noiseTexture.dispose();
        material.dispose();
      };
    }, [noiseTexture, material]);

    // Animate time uniform for subtle opacity pulse
    useFrame(({ clock }) => {
      if (materialRef.current) {
        materialRef.current.uniforms.uTime.value = clock.getElapsedTime();
      }
    });

    if (!grid || grid.lats.length === 0 || grid.values.length === 0) {
      return null;
    }

    return (
      <group name="noise-floor-overlay">
        <mesh renderOrder={9}>
          <sphereGeometry args={[GLOBE_RADIUS, 64, 64]} />
          <primitive object={material} attach="material" ref={materialRef} />
        </mesh>
      </group>
    );
  },
  (prev, next) =>
    prev.grid === next.grid && prev.frequencyHz === next.frequencyHz,
);

export default NoiseFloorOverlay3D;
