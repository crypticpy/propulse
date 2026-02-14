/**
 * BeaconNetworkOverlay3D
 *
 * Renders the 18 NCDXF/IARU International Beacon Network stations on the
 * 3D globe as diamond-shaped markers. The currently transmitting beacon is
 * highlighted with a pulsing green/white glow and shows its active frequency
 * in the label. All other beacons display a steady golden yellow marker.
 *
 * Accepts all data as props -- no direct hook imports.
 */

import React, { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BeaconData {
  /** Beacon callsign (e.g. "4U1UN") */
  callsign: string;
  /** Latitude in decimal degrees */
  lat: number;
  /** Longitude in decimal degrees */
  lon: number;
  /** Position in the 3-minute rotation (0-17) */
  slotIndex: number;
}

interface BeaconNetworkOverlay3DProps {
  /** All 18 beacon stations */
  beacons: BeaconData[];
  /** Index of the currently transmitting beacon (primary band) */
  currentBeaconIndex: number;
  /** Active frequency in MHz for display */
  activeFrequencyMHz: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Marker diamond size (radius of octahedron) */
const MARKER_SIZE = 0.008;

/** Surface placement radius to avoid z-fighting */
const SURFACE_RADIUS = 1.012;

/** Steady-state golden yellow for inactive beacons */
const BEACON_COLOR_INACTIVE = "#f0c040";

/** Active beacon base color: bright green */
const BEACON_COLOR_ACTIVE = "#00ff88";

/** Active glow color: white-green */
const BEACON_GLOW_COLOR = "#aaffcc";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert lat/lon to a 3D position on the globe.
 */
function latLonToVector3(
  lat: number,
  lon: number,
  radius: number,
): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const BeaconNetworkOverlay3D = React.memo(
  function BeaconNetworkOverlay3D({
    beacons,
    currentBeaconIndex,
    activeFrequencyMHz,
  }: BeaconNetworkOverlay3DProps) {
    // Refs for the active beacon's marker and glow ring (for animation)
    const activeMarkerRef = useRef<THREE.Mesh>(null);
    const activeGlowRef = useRef<THREE.Mesh>(null);

    // Early-out: nothing to render
    if (!beacons || beacons.length === 0) return null;

    // Pre-compute positions for all beacons
    const beaconPositions = useMemo(() => {
      return beacons.map((b) => latLonToVector3(b.lat, b.lon, SURFACE_RADIUS));
    }, [beacons]);

    // Shared geometries -- reused across all beacon markers
    const diamondGeo = useMemo(
      () => new THREE.OctahedronGeometry(MARKER_SIZE, 0),
      [],
    );
    const activeGlowGeo = useMemo(
      () => new THREE.OctahedronGeometry(MARKER_SIZE * 1.8, 0),
      [],
    );

    // Animate the active beacon: pulsing scale + opacity
    useFrame(({ clock }) => {
      const t = clock.getElapsedTime();
      const pulse = 1.0 + 0.25 * Math.sin(t * 4);

      if (activeMarkerRef.current) {
        activeMarkerRef.current.scale.setScalar(pulse);
      }

      if (activeGlowRef.current) {
        const glowMat = activeGlowRef.current
          .material as THREE.MeshBasicMaterial;
        glowMat.opacity = 0.15 + 0.2 * Math.sin(t * 4);
        activeGlowRef.current.scale.setScalar(pulse * 1.1);
      }
    });

    return (
      <group>
        {beacons.map((beacon, i) => {
          const pos = beaconPositions[i];
          const isActive = beacon.slotIndex === currentBeaconIndex;

          return (
            <group key={beacon.callsign} position={pos}>
              {/* Diamond marker */}
              <mesh
                ref={isActive ? activeMarkerRef : undefined}
                geometry={diamondGeo}
                renderOrder={isActive ? 3 : 1}
              >
                <meshBasicMaterial
                  color={isActive ? BEACON_COLOR_ACTIVE : BEACON_COLOR_INACTIVE}
                  transparent
                  opacity={isActive ? 1 : 0.8}
                  depthTest={false}
                  depthWrite={false}
                />
              </mesh>

              {/* Active beacon glow */}
              {isActive && (
                <mesh
                  ref={activeGlowRef}
                  geometry={activeGlowGeo}
                  renderOrder={0}
                >
                  <meshBasicMaterial
                    color={BEACON_GLOW_COLOR}
                    transparent
                    opacity={0.2}
                    depthTest={false}
                    depthWrite={false}
                    blending={THREE.AdditiveBlending}
                  />
                </mesh>
              )}

              {/* Callsign label (+ frequency for active beacon) */}
              <Html
                position={[0, MARKER_SIZE * 3, 0]}
                center
                zIndexRange={[1, 0]}
                style={{ pointerEvents: "none" }}
              >
                <div
                  className="flex flex-col items-center gap-0"
                  style={{ opacity: isActive ? 1 : 0.75 }}
                >
                  <div
                    className="px-1.5 py-0.5 rounded text-[9px] font-mono whitespace-nowrap"
                    style={{
                      backgroundColor: "rgba(10, 10, 26, 0.88)",
                      color: isActive
                        ? BEACON_COLOR_ACTIVE
                        : BEACON_COLOR_INACTIVE,
                      border: `1px solid ${isActive ? BEACON_COLOR_ACTIVE : BEACON_COLOR_INACTIVE}50`,
                      boxShadow: isActive
                        ? `0 0 8px ${BEACON_COLOR_ACTIVE}60`
                        : "none",
                      fontWeight: isActive ? 700 : 400,
                    }}
                  >
                    {beacon.callsign}
                    {isActive && (
                      <span style={{ marginLeft: 4, fontSize: "8px" }}>
                        {activeFrequencyMHz.toFixed(3)}
                      </span>
                    )}
                  </div>
                </div>
              </Html>
            </group>
          );
        })}
      </group>
    );
  },
);

export default BeaconNetworkOverlay3D;
