/**
 * SSTOverlay3D Component
 *
 * Renders a Sea Surface Temperature heatmap on the 3D globe using a GLSL shader
 * sphere (same approach as TECOverlay3D). Scattered SST grid points are rasterized
 * into a DataTexture and sampled in the fragment shader with GPU bilinear
 * interpolation for smooth color gradients.
 *
 * Color mapping (Celsius):
 *   deep blue  (< 5)   — cold waters
 *   cyan       (5-10)   — cool
 *   green      (10-20)  — temperate
 *   yellow     (20-25)  — warm
 *   orange     (25-30)  — tropical
 *   red        (> 30)   — extreme heat
 *
 * Data comes from the useSST hook which provides an array of SSTDataPoint.
 */

import React, { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useSST } from "@/hooks/useSST";
import type { SSTDataPoint } from "@/lib/api/sst";

// =============================================================================
// CONSTANTS
// =============================================================================

/** Radius above globe surface (below TEC at 1.02) */
const GLOBE_RADIUS = 1.01;

/** Resolution of the equirectangular raster grid */
const TEX_WIDTH = 72; // 5-degree longitude bins
const TEX_HEIGHT = 36; // 5-degree latitude bins

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Build a DataTexture from scattered SST grid points.
 *
 * Rasterizes scattered (lat, lon, sst) points into an equirectangular grid
 * (72 x 36 = 5-degree resolution). Each texel stores the normalized SST value
 * in the red channel (mapped from -2..35 C to 0..1). The texture uses
 * LinearFilter so the GPU automatically bilinear-interpolates between grid
 * points, producing a smooth heatmap.
 */
function buildSSTTexture(grid: ReadonlyArray<SSTDataPoint>): THREE.DataTexture {
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
    // Normalize SST: -2C to 35C -> 0 to 1
    const normalized = Math.max(0, Math.min(1, (point.sst + 2) / 37));

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
  uniform sampler2D sstMap;
  uniform float uOpacity;
  uniform float uTime;

  varying vec3 vPosition;

  // Map SST (normalized 0-1 where 0=-2C, 1=35C) to color
  // deep blue -> cyan -> green -> yellow -> orange -> red
  vec3 sstToColor(float t) {
    vec3 c1 = vec3(0.0, 0.1, 0.5);   // deep blue  (cold)
    vec3 c2 = vec3(0.0, 0.7, 0.9);   // cyan
    vec3 c3 = vec3(0.1, 0.8, 0.2);   // green
    vec3 c4 = vec3(1.0, 0.9, 0.0);   // yellow
    vec3 c5 = vec3(1.0, 0.5, 0.0);   // orange
    vec3 c6 = vec3(0.9, 0.1, 0.0);   // red (warm)

    if (t < 0.2) return mix(c1, c2, t / 0.2);
    if (t < 0.4) return mix(c2, c3, (t - 0.2) / 0.2);
    if (t < 0.6) return mix(c3, c4, (t - 0.4) / 0.2);
    if (t < 0.8) return mix(c4, c5, (t - 0.6) / 0.2);
    return mix(c5, c6, (t - 0.8) / 0.2);
  }

  void main() {
    // Extract lat/lon from world-space position
    float lat = asin(vPosition.y) * 57.29578; // rad to deg, -90 to +90
    float lon = atan(vPosition.z, -vPosition.x) * 57.29578 - 180.0; // -180 to +180

    // Normalize to UV coordinates
    float u = (lon + 180.0) / 360.0;
    float v = (lat + 90.0) / 180.0;

    // Sample the SST texture (GPU bilinear interpolation)
    float sstVal = texture2D(sstMap, vec2(u, v)).r;

    // Skip near-zero values (no data — land or missing)
    if (sstVal < 0.005) discard;

    vec3 color = sstToColor(sstVal);

    // Subtle pulse animation
    float pulse = 0.45 + 0.05 * sin(uTime * 0.4);

    gl_FragColor = vec4(color, uOpacity * pulse / 0.45);
  }
`;

// =============================================================================
// COMPONENT
// =============================================================================

export const SSTOverlay3D = React.memo(function SSTOverlay3D() {
  const { data } = useSST();
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  // Build SST DataTexture from grid data
  const sstTexture = useMemo(() => {
    if (data.length === 0) return null;
    return buildSSTTexture(data);
  }, [data]);

  // Create shader material with uniforms
  const material = useMemo(() => {
    if (!sstTexture) return null;
    return new THREE.ShaderMaterial({
      uniforms: {
        sstMap: { value: sstTexture },
        uOpacity: { value: 0.4 },
        uTime: { value: 0 },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
  }, [sstTexture]);

  // Dispose texture and material on unmount or when data changes
  useEffect(() => {
    return () => {
      sstTexture?.dispose();
      material?.dispose();
    };
  }, [sstTexture, material]);

  // Animate time uniform for subtle opacity pulse
  useFrame(({ clock }) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = clock.getElapsedTime();
    }
  });

  if (!sstTexture || !material || data.length === 0) {
    return null;
  }

  return (
    <group name="sst-overlay">
      <mesh renderOrder={5}>
        <sphereGeometry args={[GLOBE_RADIUS, 64, 64]} />
        <primitive object={material} attach="material" ref={materialRef} />
      </mesh>
    </group>
  );
});

export default SSTOverlay3D;
