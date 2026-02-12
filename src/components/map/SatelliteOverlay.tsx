/**
 * SatelliteOverlay Component
 *
 * Renders amateur radio satellites on the 3D globe using React Three Fiber.
 * Each satellite appears as a small diamond marker above the globe surface
 * with an Html label. Uses useGlobeOcclusion for far-side fading.
 *
 * Selected satellites show their orbital ground track.
 */

import { useMemo, useRef, useCallback } from "react";
import { useFrame } from "@react-three/fiber";
import { Html, Line } from "@react-three/drei";
import * as THREE from "three";
import { useGlobeOcclusion } from "@/hooks/useGlobeOcclusion";
import { useSatellites } from "@/hooks/useSatellites";
import { useMapStore } from "@/stores/mapStore";
import { calculateGroundTrack } from "@/lib/api/satellites";
import type { SatelliteInfo, SatelliteCategory } from "@/types/satellite";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Globe radius (matching EarthSphere) */
const GLOBE_RADIUS = 1.0;

/** Earth radius in km (for altitude scaling) */
const EARTH_RADIUS_KM = 6371.0;

/**
 * Visual altitude scale factor.
 * True altitude would place ISS at r = 1 + 408/6371 = ~1.064
 * We scale up a bit so satellites are clearly above the surface.
 */
const ALT_SCALE = 3.0;

/** Base surface offset to prevent z-fighting */
const SURFACE_OFFSET = 0.015;

/** Size of the diamond marker */
const MARKER_SIZE = 0.012;

/** Category colors for satellite markers */
const CATEGORY_COLORS: Record<SatelliteCategory, string> = {
  iss: "#ffffff",
  fm: "#00ff88",
  linear: "#00ccff",
  digital: "#ff9933",
  weather: "#cc88ff",
  other: "#888888",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert lat/lon/alt to a 3D position on the globe.
 * Uses the same coordinate system as SpotMarker and GlobeView.
 */
function latLonAltToVector3(
  lat: number,
  lon: number,
  altKm: number,
): THREE.Vector3 {
  const visualAlt = (altKm / EARTH_RADIUS_KM) * ALT_SCALE;
  const radius = GLOBE_RADIUS + SURFACE_OFFSET + visualAlt;

  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);

  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

/**
 * Convert lat/lon to surface position (for ground track lines).
 */
function latLonToSurface(lat: number, lon: number): THREE.Vector3 {
  const radius = GLOBE_RADIUS + 0.002; // Tiny offset above surface
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);

  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

// ---------------------------------------------------------------------------
// Individual Satellite Marker
// ---------------------------------------------------------------------------

interface SatelliteMarkerProps {
  satellite: SatelliteInfo;
  isSelected: boolean;
  onSelect: (noradId: number) => void;
}

function SatelliteMarker({
  satellite,
  isSelected,
  onSelect,
}: SatelliteMarkerProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const glowMaterialRef = useRef<THREE.MeshBasicMaterial>(null);

  const color = CATEGORY_COLORS[satellite.category];
  const { lat, lon, alt } = satellite.position;

  // Globe occlusion for far-side fading
  const { opacityRef, opacity: occlusionOpacity } = useGlobeOcclusion(lat, lon);

  // 3D position
  const position = useMemo(() => {
    return latLonAltToVector3(lat, lon, alt);
  }, [lat, lon, alt]);

  // Diamond geometry — rotated cube
  const diamondRotation = useMemo(() => {
    return new THREE.Euler(0, 0, Math.PI / 4);
  }, []);

  // Animate pulsing glow and apply occlusion
  useFrame(({ clock }) => {
    const occlusion = opacityRef.current;

    if (materialRef.current) {
      materialRef.current.opacity = (isSelected ? 1.0 : 0.85) * occlusion;
    }

    if (glowMaterialRef.current) {
      const pulse = 0.4 + Math.sin(clock.elapsedTime * 3) * 0.2;
      glowMaterialRef.current.opacity =
        (isSelected ? pulse * 1.5 : pulse) * occlusion;
    }
  });

  const handleClick = useCallback(
    (e: THREE.Event) => {
      if ("stopPropagation" in e && typeof e.stopPropagation === "function") {
        e.stopPropagation();
      }
      onSelect(satellite.noradId);
    },
    [satellite.noradId, onSelect],
  );

  const markerScale = isSelected ? 1.5 : 1.0;

  return (
    <group position={position}>
      {/* Glow circle behind marker */}
      <mesh rotation={diamondRotation} renderOrder={0}>
        <planeGeometry args={[MARKER_SIZE * 3, MARKER_SIZE * 3]} />
        <meshBasicMaterial
          ref={glowMaterialRef}
          color={color}
          transparent
          opacity={0.3}
          side={THREE.DoubleSide}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>

      {/* Diamond marker — small rotated box */}
      <mesh
        ref={meshRef}
        rotation={diamondRotation}
        scale={[markerScale, markerScale, markerScale]}
        onClick={handleClick}
        renderOrder={1}
      >
        <boxGeometry args={[MARKER_SIZE, MARKER_SIZE, MARKER_SIZE * 0.3]} />
        <meshBasicMaterial
          ref={materialRef}
          color={color}
          transparent
          opacity={0.85}
          depthTest={false}
        />
      </mesh>

      {/* Selection ring */}
      {isSelected && (
        <mesh renderOrder={0}>
          <ringGeometry args={[MARKER_SIZE * 1.8, MARKER_SIZE * 2.2, 32]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.6 * occlusionOpacity}
            side={THREE.DoubleSide}
            depthTest={false}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* Html label */}
      <Html
        position={[0, MARKER_SIZE * 4, 0]}
        center
        zIndexRange={[1, 0]}
        style={{
          pointerEvents: "none",
          transition: "opacity 0.2s ease",
          opacity: (isSelected ? 1.0 : 0.7) * occlusionOpacity,
        }}
      >
        <div
          className="px-1.5 py-0.5 rounded text-[10px] font-mono whitespace-nowrap"
          style={{
            backgroundColor: "rgba(10, 10, 26, 0.85)",
            color,
            border: `1px solid ${color}50`,
            boxShadow: isSelected ? `0 0 12px ${color}40` : "none",
            transform: isSelected ? "scale(1.1)" : "scale(1)",
            transition: "all 0.2s ease",
          }}
        >
          {satellite.name}
        </div>
      </Html>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Ground Track Line
// ---------------------------------------------------------------------------

interface GroundTrackProps {
  satellite: SatelliteInfo;
}

function GroundTrack({ satellite }: GroundTrackProps) {
  const color = CATEGORY_COLORS[satellite.category];

  // Calculate ground track — 90 minutes forward (typical LEO orbit period)
  const trackPoints = useMemo(() => {
    const track = calculateGroundTrack(satellite, new Date(), 90, 1);

    // Convert to 3D positions, splitting on large longitude jumps (antimeridian crossing)
    const segments: THREE.Vector3[][] = [];
    let currentSegment: THREE.Vector3[] = [];

    for (let i = 0; i < track.length; i++) {
      const point = track[i];
      const vec = latLonToSurface(point.lat, point.lon);

      if (i > 0) {
        const prevLon = track[i - 1].lon;
        const lonDiff = Math.abs(point.lon - prevLon);
        // Split at antimeridian crossing
        if (lonDiff > 180) {
          if (currentSegment.length > 1) {
            segments.push(currentSegment);
          }
          currentSegment = [];
        }
      }

      currentSegment.push(vec);
    }

    if (currentSegment.length > 1) {
      segments.push(currentSegment);
    }

    return segments;
  }, [satellite]);

  return (
    <>
      {trackPoints.map((segment, idx) => (
        <Line
          key={idx}
          points={segment}
          color={color}
          lineWidth={1.5}
          transparent
          opacity={0.4}
          depthTest={false}
        />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main Overlay Component
// ---------------------------------------------------------------------------

/**
 * SatelliteOverlay renders all tracked amateur radio satellites on the globe.
 *
 * Usage inside GlobeScene (within a <Canvas>):
 * ```tsx
 * <SatelliteOverlay />
 * ```
 */
export function SatelliteOverlay() {
  const { satellites, selectedSatellite, selectSatellite } = useSatellites();
  const issTrackerActive = useMapStore((s) => s.layers.issTracker);

  // Filter out ISS (NORAD ID 25544) when the dedicated ISS Tracker layer is active
  const filteredSatellites = useMemo(() => {
    if (issTrackerActive) {
      return satellites.filter((s) => s.noradId !== 25544);
    }
    return satellites;
  }, [satellites, issTrackerActive]);

  const handleSelect = useCallback(
    (noradId: number) => {
      // Toggle selection
      if (selectedSatellite?.noradId === noradId) {
        selectSatellite(null);
      } else {
        selectSatellite(noradId);
      }
    },
    [selectedSatellite, selectSatellite],
  );

  if (filteredSatellites.length === 0) {
    return null;
  }

  // Skip ISS ground track if issTracker is active and selected satellite is ISS
  const showGroundTrack =
    selectedSatellite &&
    !(issTrackerActive && selectedSatellite.noradId === 25544);

  return (
    <group>
      {/* Ground track for selected satellite */}
      {showGroundTrack && <GroundTrack satellite={selectedSatellite} />}

      {/* Satellite markers */}
      {filteredSatellites.map((sat) => (
        <SatelliteMarker
          key={sat.noradId}
          satellite={sat}
          isSelected={sat.noradId === selectedSatellite?.noradId}
          onSelect={handleSelect}
        />
      ))}
    </group>
  );
}

export default SatelliteOverlay;
