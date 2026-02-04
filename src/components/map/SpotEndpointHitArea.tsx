/**
 * SpotEndpointHitArea Component
 *
 * Invisible mesh for hover detection at DX spot locations on the globe.
 * Triggers hover callbacks when the user moves the cursor over a spot's
 * endpoint, enabling the SpotDetailsFlyout to display.
 *
 * Uses a transparent sphere geometry for raycasting without visual impact.
 */

import { useRef, useCallback, useMemo } from "react";
import { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import type { ResolvedSpot } from "./LiveSpotArcs";
import type { SpotDetailsData } from "./SpotDetailsFlyout";
import type { SpotSource } from "@/types/livespot";

/** Default hit radius for spot detection */
const DEFAULT_HIT_RADIUS = 0.025;

/** Radius offset from globe surface */
const SURFACE_OFFSET = 1.015;

export interface SpotEndpointHitAreaProps {
  /** Latitude in decimal degrees */
  lat: number;
  /** Longitude in decimal degrees */
  lon: number;
  /** The resolved spot data */
  spot: ResolvedSpot;
  /** Additional spot data (from original LiveSpot) */
  spotData: {
    spotter?: string;
    spotterGrid?: string;
    dxGrid?: string;
    band?: string;
    snr?: number;
    wpm?: number;
  };
  /** Hit detection radius (default: 0.025) */
  hitRadius?: number;
  /** Callback when spot is hovered */
  onHover?: (
    data: SpotDetailsData,
    screenPos: { x: number; y: number },
  ) => void;
  /** Callback when hover ends */
  onHoverEnd?: () => void;
}

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
 * Get screen position from native pointer event
 */
function getScreenPositionFromEvent(event: ThreeEvent<PointerEvent>): {
  x: number;
  y: number;
} {
  const {nativeEvent} = event;
  return {
    x: nativeEvent.clientX,
    y: nativeEvent.clientY,
  };
}

/**
 * SpotEndpointHitArea provides invisible hover detection for spots
 *
 * @example
 * ```tsx
 * <SpotEndpointHitArea
 *   lat={45.5}
 *   lon={-122.6}
 *   spot={resolvedSpot}
 *   spotData={{ spotter: "W1ABC", dxGrid: "CN85" }}
 *   onHover={(data, pos) => showFlyout(data, pos)}
 *   onHoverEnd={() => hideFlyout()}
 * />
 * ```
 */
export function SpotEndpointHitArea({
  lat,
  lon,
  spot,
  spotData,
  hitRadius = DEFAULT_HIT_RADIUS,
  onHover,
  onHoverEnd,
}: SpotEndpointHitAreaProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  // Calculate 3D position
  const position = useMemo(
    () => latLonTo3D(lat, lon, SURFACE_OFFSET),
    [lat, lon],
  );

  // Build spot details data for flyout
  const buildSpotDetails = useCallback((): SpotDetailsData => {
    return {
      callsign: spot.callsign,
      dxGrid: spotData.dxGrid,
      dxLat: spot.dxLat,
      dxLon: spot.dxLon,
      spotter: spotData.spotter,
      spotterGrid: spotData.spotterGrid,
      frequency: spot.frequency,
      band: spotData.band,
      mode: spot.mode,
      time: spot.time,
      source: spot.source as SpotSource,
      snr: spotData.snr,
      wpm: spotData.wpm,
    };
  }, [spot, spotData]);

  // Handle pointer enter
  const handlePointerEnter = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      if (onHover) {
        const screenPos = getScreenPositionFromEvent(event);
        const details = buildSpotDetails();
        onHover(details, screenPos);
      }
    },
    [onHover, buildSpotDetails],
  );

  // Handle pointer move (update position)
  const handlePointerMove = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      if (onHover) {
        const screenPos = getScreenPositionFromEvent(event);
        const details = buildSpotDetails();
        onHover(details, screenPos);
      }
    },
    [onHover, buildSpotDetails],
  );

  // Handle pointer leave
  const handlePointerLeave = useCallback(() => {
    onHoverEnd?.();
  }, [onHoverEnd]);

  return (
    <mesh
      ref={meshRef}
      position={position}
      onPointerEnter={handlePointerEnter}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      {/* Invisible sphere for hit detection */}
      <sphereGeometry args={[hitRadius, 8, 8]} />
      <meshBasicMaterial
        transparent
        opacity={0}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
}

export default SpotEndpointHitArea;
