/**
 * SelectedSpotArc Component
 *
 * Renders a highlighted arc from spotter to DX station for the currently
 * selected DX spot. Stays visible as long as a spot is selected in dxStore.
 *
 * Uses plasma-orange color with a subtle breathing animation and glow effect.
 */

import { useRef, useMemo, useEffect } from "react";
import { Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { getPathPoints } from "@/lib/utils/path";
import { useDXStore } from "@/stores/dxStore";
import { gridToLatLon, isValidGrid } from "@/lib/utils/grid";
import {
  extractPrefixFromCallsign,
  getLocationFromPrefix,
} from "@/lib/data/prefixLocations";

/** Plasma orange for the selected arc */
const PLASMA_ORANGE = "#FF6B35";

/**
 * Convert lat/lon to 3D position on sphere
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
 * Try to get location from a grid locator
 */
function getLocationFromGrid(
  grid: string | undefined,
): { lat: number; lon: number } | null {
  if (!grid || !isValidGrid(grid)) {
    return null;
  }
  try {
    return gridToLatLon(grid);
  } catch {
    return null;
  }
}

/**
 * Try to get location from a callsign using prefix lookup
 */
function getLocationFromCallsign(
  callsign: string,
): { lat: number; lon: number } | null {
  const prefix = extractPrefixFromCallsign(callsign);
  const location = getLocationFromPrefix(prefix);
  if (location) {
    return { lat: location.lat, lon: location.lon };
  }
  return null;
}

/**
 * SelectedSpotArc renders a highlighted arc for the selected DX spot.
 *
 * Displays a plasma-orange arc from spotter to DX station with:
 * - Main arc line with breathing opacity animation
 * - Glow line (additive blending) for halo effect
 * - Endpoint spheres at spotter and DX positions
 */
export function SelectedSpotArc() {
  const selectedSpot = useDXStore((s) => s.selectedSpot);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mainLineRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const glowLineRef = useRef<any>(null);

  // Resolve coordinates for the selected spot
  const resolved = useMemo(() => {
    if (!selectedSpot) {
      return null;
    }

    // Resolve spotter location: lat/lon fields > grid > callsign prefix
    const spotterLoc =
      selectedSpot.spotterLat !== undefined &&
      selectedSpot.spotterLon !== undefined
        ? { lat: selectedSpot.spotterLat, lon: selectedSpot.spotterLon }
        : getLocationFromGrid(selectedSpot.spotterGrid) ||
          getLocationFromCallsign(selectedSpot.spotter);

    // Resolve DX location: lat/lon fields > grid > callsign prefix
    const dxLoc =
      selectedSpot.dxLat !== undefined && selectedSpot.dxLon !== undefined
        ? { lat: selectedSpot.dxLat, lon: selectedSpot.dxLon }
        : getLocationFromGrid(selectedSpot.dxGrid) ||
          getLocationFromCallsign(selectedSpot.dx);

    if (!spotterLoc || !dxLoc) {
      return null;
    }

    // Validate all coordinates are finite
    if (
      !Number.isFinite(spotterLoc.lat) ||
      !Number.isFinite(spotterLoc.lon) ||
      !Number.isFinite(dxLoc.lat) ||
      !Number.isFinite(dxLoc.lon)
    ) {
      return null;
    }

    return {
      spotterLat: spotterLoc.lat,
      spotterLon: spotterLoc.lon,
      dxLat: dxLoc.lat,
      dxLon: dxLoc.lon,
    };
  }, [selectedSpot]);

  // Compute great circle path points
  const mainPoints = useMemo(() => {
    if (!resolved) {
      return [];
    }
    try {
      const pathPoints = getPathPoints(
        resolved.spotterLat,
        resolved.spotterLon,
        resolved.dxLat,
        resolved.dxLon,
        40,
      );
      const result = pathPoints.map((p) =>
        latLonTo3D(p.lat, p.lon, 1.009),
      ) as Array<[number, number, number]>;
      // Validate all points are finite
      for (const pt of result) {
        if (
          !Number.isFinite(pt[0]) ||
          !Number.isFinite(pt[1]) ||
          !Number.isFinite(pt[2])
        ) {
          return [];
        }
      }
      return result;
    } catch {
      return [];
    }
  }, [resolved]);

  // Glow line points at slightly higher radius
  const glowPoints = useMemo(() => {
    if (!resolved) {
      return [];
    }
    try {
      const pathPoints = getPathPoints(
        resolved.spotterLat,
        resolved.spotterLon,
        resolved.dxLat,
        resolved.dxLon,
        40,
      );
      const result = pathPoints.map((p) =>
        latLonTo3D(p.lat, p.lon, 1.011),
      ) as Array<[number, number, number]>;
      for (const pt of result) {
        if (
          !Number.isFinite(pt[0]) ||
          !Number.isFinite(pt[1]) ||
          !Number.isFinite(pt[2])
        ) {
          return [];
        }
      }
      return result;
    } catch {
      return [];
    }
  }, [resolved]);

  // Endpoint positions
  const spotterPos = useMemo(
    () =>
      resolved
        ? latLonTo3D(resolved.spotterLat, resolved.spotterLon, 1.009)
        : null,
    [resolved],
  );
  const dxPos = useMemo(
    () => (resolved ? latLonTo3D(resolved.dxLat, resolved.dxLon, 1.009) : null),
    [resolved],
  );

  // Glow endpoint positions (slightly above)
  const spotterGlowPos = useMemo(
    () =>
      resolved
        ? latLonTo3D(resolved.spotterLat, resolved.spotterLon, 1.011)
        : null,
    [resolved],
  );
  const dxGlowPos = useMemo(
    () => (resolved ? latLonTo3D(resolved.dxLat, resolved.dxLon, 1.011) : null),
    [resolved],
  );

  // Set additive blending on the glow line material after mount
  useEffect(() => {
    if (glowLineRef.current?.material) {
      const mat = glowLineRef.current.material;
      mat.blending = THREE.AdditiveBlending;
      mat.depthWrite = false;
      mat.needsUpdate = true;
    }
  });

  // Set depthWrite on the main line material after mount
  useEffect(() => {
    if (mainLineRef.current?.material) {
      const mat = mainLineRef.current.material;
      mat.depthWrite = false;
      mat.needsUpdate = true;
    }
  });

  // Breathing animation for the main arc line
  useFrame((state) => {
    if (mainLineRef.current?.material) {
      const t = state.clock.getElapsedTime();
      mainLineRef.current.material.opacity = 0.8 + 0.2 * Math.sin(t * 2);
    }
  });

  // Nothing to render
  if (!resolved || mainPoints.length < 2 || glowPoints.length < 2) {
    return null;
  }

  return (
    <group name="selected-spot-arc">
      {/* Glow halo line — additive blending for glow effect */}
      <Line
        ref={glowLineRef}
        points={glowPoints}
        color={PLASMA_ORANGE}
        lineWidth={6}
        transparent
        opacity={0.15}
      />

      {/* Main arc line — plasma orange with breathing animation */}
      <Line
        ref={mainLineRef}
        points={mainPoints}
        color={PLASMA_ORANGE}
        lineWidth={3}
        transparent
        opacity={0.9}
      />

      {/* Spotter endpoint sphere */}
      {spotterPos && (
        <mesh position={spotterPos}>
          <sphereGeometry args={[0.008, 12, 12]} />
          <meshBasicMaterial
            color={PLASMA_ORANGE}
            transparent
            opacity={0.9}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* Spotter glow sphere */}
      {spotterGlowPos && (
        <mesh position={spotterGlowPos}>
          <sphereGeometry args={[0.013, 10, 10]} />
          <meshBasicMaterial
            color={PLASMA_ORANGE}
            transparent
            opacity={0.12}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      )}

      {/* DX endpoint sphere (slightly larger) */}
      {dxPos && (
        <mesh position={dxPos}>
          <sphereGeometry args={[0.01, 12, 12]} />
          <meshBasicMaterial
            color={PLASMA_ORANGE}
            transparent
            opacity={0.9}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* DX glow sphere */}
      {dxGlowPos && (
        <mesh position={dxGlowPos}>
          <sphereGeometry args={[0.016, 10, 10]} />
          <meshBasicMaterial
            color={PLASMA_ORANGE}
            transparent
            opacity={0.12}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      )}
    </group>
  );
}
