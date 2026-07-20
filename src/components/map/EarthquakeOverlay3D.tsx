/**
 * EarthquakeOverlay3D Component
 *
 * Renders earthquake markers on the 3D globe using React Three Fiber.
 * Each earthquake is displayed as a magnitude-scaled colored circle with
 * an animated glow ring. M5+ earthquakes show a floating magnitude label.
 *
 * Visual style matches the 2D FlatMapView drawEarthquakes() function:
 * - Size scaled by magnitude
 * - Color: green-yellow (< M4), yellow (M4+), orange (M5+), red (M7+)
 * - Outer glow ring with additive blending + pulse animation
 * - Magnitude labels for significant quakes (M5+)
 */

import React, { useRef, useMemo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard, Text } from "@react-three/drei";
import * as THREE from "three";
import type { EarthquakeEvent } from "@/lib/api/earthquakes";
import { latLonTo3D } from "@/components/map/lib/globeCoords";
import { GLOBE_LAYER_ORDER } from "@/lib/map/globeRenderOrder";

// =============================================================================
// TYPES
// =============================================================================

interface EarthquakeOverlay3DProps {
  /** Array of earthquake events to render */
  earthquakes: EarthquakeEvent[];
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Get marker color based on earthquake magnitude.
 * Matches the 2D FlatMapView color scheme exactly.
 */
function getEqColor(magnitude: number): string {
  if (magnitude >= 7) return "#ff2020"; // Major: red
  if (magnitude >= 5) return "#ff8800"; // Strong: orange
  if (magnitude >= 4) return "#ffcc00"; // Moderate: yellow
  return "#88cc44"; // Light: green-yellow
}

/**
 * Get 3D marker radius based on earthquake magnitude.
 * Scaled version of the 2D formula: Math.max(3, Math.min(20, (mag - 1) * 3))
 * mapped to globe-appropriate units.
 */
function getEqSize(magnitude: number): number {
  return Math.max(0.004, Math.min(0.025, (magnitude - 1) * 0.004));
}

// =============================================================================
// COMPONENT
// =============================================================================

export const EarthquakeOverlay3D = React.memo(
  function EarthquakeOverlay3D({ earthquakes }: EarthquakeOverlay3DProps) {
    const hasEarthquakes = earthquakes.length > 0;

    // Shared geometries — created once, reused across all earthquake meshes
    const circleGeo = useMemo(() => new THREE.CircleGeometry(1, 32), []);
    const ringGeo = useMemo(() => new THREE.RingGeometry(0.7, 1, 32), []);

    // Shared materials — created once, reused across all earthquake meshes
    // Individual colors are set per-marker via material.color below, but we
    // create one material per visual role (base vs glow) to avoid 100+ instances.
    // NOTE: Since each earthquake has a different color, we cannot share a single
    // material. Instead we pre-compute positions/quaternions to avoid per-render allocations.

    // Mutable refs array for glow ring meshes (for pulse animation)
    const glowRefs = useRef<(THREE.Mesh | null)[]>([]);
    // Base scale for each glow ring (set during render, read in useFrame)
    const glowBaseScales = useRef<number[]>([]);

    // Dispose shared geometries on unmount
    useEffect(() => {
      return () => {
        circleGeo.dispose();
        ringGeo.dispose();
      };
    }, [circleGeo, ringGeo]);

    // Pre-compute positions and quaternions to avoid per-render allocations
    const computed = useMemo(
      () =>
        earthquakes.map((eq) => {
          const pos = latLonTo3D(eq.lat, eq.lon, 1.006);
          const normal = new THREE.Vector3(...pos).normalize();
          const quat = new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 0, 1),
            normal,
          );
          const size = getEqSize(eq.magnitude);
          const color = getEqColor(eq.magnitude);
          return { pos, quat, size, color };
        }),
      [earthquakes],
    );

    // Single useFrame loop for all glow ring pulse animations
    useFrame(({ clock }) => {
      const t = clock.getElapsedTime();
      for (let i = 0; i < glowRefs.current.length; i++) {
        const mesh = glowRefs.current[i];
        if (mesh) {
          const base = glowBaseScales.current[i] ?? 0.01;
          const pulse = 1 + 0.15 * Math.sin(t * 2 + i * 0.5);
          const s = base * pulse;
          mesh.scale.set(s, s, s);
        }
      }
    });

    // Early return for empty data
    if (!hasEarthquakes) {
      return null;
    }

    return (
      <group>
        {earthquakes.map((eq, i) => {
          const { pos, quat, size, color } = computed[i];

          return (
            <group key={eq.id} position={pos} quaternion={quat}>
              {/* Solid base marker (filled circle) */}
              <mesh
                geometry={circleGeo}
                scale={[size, size, size]}
                renderOrder={GLOBE_LAYER_ORDER.surfaceArea}
              >
                <meshBasicMaterial
                  color={color}
                  transparent
                  opacity={0.7}
                  depthTest={true}
                  depthWrite={false}
                  side={THREE.FrontSide}
                />
              </mesh>

              {/* Glow ring with additive blending + pulse animation */}
              <mesh
                renderOrder={GLOBE_LAYER_ORDER.surfaceArea + 0.1}
                ref={(el: THREE.Mesh | null) => {
                  glowRefs.current[i] = el;
                  glowBaseScales.current[i] = size * 1.5;
                }}
                geometry={ringGeo}
                scale={[size * 1.5, size * 1.5, size * 1.5]}
              >
                <meshBasicMaterial
                  color={color}
                  transparent
                  opacity={0.15}
                  depthTest={true}
                  depthWrite={false}
                  blending={THREE.AdditiveBlending}
                  side={THREE.FrontSide}
                />
              </mesh>

              {/* Magnitude label for M5+ earthquakes */}
              {eq.magnitude >= 5 && (
                <Billboard position={[0, size * 3, 0]}>
                  <Text
                    fontSize={0.012}
                    color="#ffffff"
                    anchorX="center"
                    anchorY="bottom"
                    outlineWidth={0.002}
                    outlineColor="#000000"
                    font={undefined}
                  >
                    {`M${eq.magnitude.toFixed(1)}`}
                  </Text>
                </Billboard>
              )}
            </group>
          );
        })}
      </group>
    );
  },
  (prevProps, nextProps) => prevProps.earthquakes === nextProps.earthquakes,
);

export default EarthquakeOverlay3D;
