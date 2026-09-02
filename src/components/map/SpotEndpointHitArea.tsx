/**
 * SpotEndpointHitArea Component
 *
 * Invisible mesh for hover detection at DX spot locations on the globe.
 * Triggers hover callbacks when the user moves the cursor over a spot's
 * endpoint, enabling the SpotDetailsFlyout to display.
 *
 * Uses a transparent sphere geometry for raycasting without visual impact.
 */

import { useRef, useCallback, useEffect, useId, useMemo } from "react";
import { ThreeEvent, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { ResolvedSpot } from "./LiveSpotArcs";
import type { LiveSpot } from "@/types/livespot";
import { getScreenSpaceScale } from "@/lib/map/screenSpaceScale";
import type { SpotHoverInteraction } from "@/hooks/useSpotHoverArbitration";

/** Default hit radius for spot detection */
const DEFAULT_HIT_RADIUS = 0.025;

/** Radius offset from globe surface */
const SURFACE_OFFSET = 1.000002;

export interface SpotEndpointHitAreaProps {
  /** Latitude in decimal degrees */
  lat: number;
  /** Longitude in decimal degrees */
  lon: number;
  /** The resolved spot data */
  spot: ResolvedSpot;
  /** Hit detection radius (default: 0.025) */
  hitRadius?: number;
  /** Current globe-occlusion opacity; hidden endpoints must not raycast. */
  occlusionOpacity?: number;
  /** Callback when spot is hovered */
  onHover?: (
    spot: LiveSpot,
    screenPos: { x: number; y: number },
    interaction: SpotHoverInteraction,
  ) => void;
  /** Callback when hover ends */
  onHoverEnd?: (
    spot: LiveSpot,
    interaction: SpotHoverInteraction,
  ) => void;
  /** Selects this endpoint's spot as the current map target. */
  onSelect?: (screenPos: { x: number; y: number }) => void;
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
function getScreenPositionFromEvent(event: {
  nativeEvent: Pick<MouseEvent, "clientX" | "clientY">;
}): {
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
 *   onHover={(spot, pos) => showPreview(spot, pos)}
 *   onHoverEnd={() => hideFlyout()}
 * />
 * ```
 */
export function SpotEndpointHitArea({
  lat,
  lon,
  spot,
  hitRadius = DEFAULT_HIT_RADIUS,
  occlusionOpacity = 1,
  onHover,
  onHoverEnd,
  onSelect,
}: SpotEndpointHitAreaProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const ownsHoverRef = useRef(false);
  const onHoverEndRef = useRef(onHoverEnd);
  const originalSpotRef = useRef(spot.originalSpot);
  const worldPosition = useMemo(() => new THREE.Vector3(), []);
  const surfaceInstanceId = useId();
  originalSpotRef.current = spot.originalSpot;
  // Live arcs and animated traces can render separate hit meshes for the same
  // endpoint. Report + coordinates preserve diagnostic identity, while the
  // React instance suffix keeps each concrete mesh independently referenceable
  // when one trace expires underneath another still-hovered live endpoint.
  const hoverInteraction = useMemo<SpotHoverInteraction>(
    () => ({
      surface: "endpoint",
      interactionId: [
        spot.originalSpot.source ?? "Cluster",
        spot.originalSpot.id,
        "endpoint",
        lat.toFixed(5),
        lon.toFixed(5),
        surfaceInstanceId,
      ].join(":"),
    }),
    [lat, lon, spot.originalSpot.id, spot.originalSpot.source, surfaceInstanceId],
  );

  useEffect(() => {
    onHoverEndRef.current = onHoverEnd;
  }, [onHoverEnd]);

  // A trace endpoint can unmount on its lifecycle timer without receiving a
  // pointer-leave event. Only the endpoint that opened the current preview may
  // close it; otherwise an unrelated expiring trace could dismiss another
  // endpoint's hover state.
  useEffect(
    () => () => {
      if (!ownsHoverRef.current) return;
      ownsHoverRef.current = false;
      onHoverEndRef.current?.(
        originalSpotRef.current,
        hoverInteraction,
      );
    },
    [hoverInteraction],
  );

  // Calculate 3D position
  const position = useMemo(
    () => latLonTo3D(lat, lon, SURFACE_OFFSET),
    [lat, lon],
  );

  // Handle pointer enter
  const handlePointerEnter = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      if (onHover) {
        ownsHoverRef.current = true;
        const screenPos = getScreenPositionFromEvent(event);
        onHover(spot.originalSpot, screenPos, hoverInteraction);
      }
    },
    [hoverInteraction, onHover, spot.originalSpot],
  );

  // Handle pointer leave
  const handlePointerLeave = useCallback(() => {
    if (!ownsHoverRef.current) return;
    ownsHoverRef.current = false;
    onHoverEndRef.current?.(spot.originalSpot, hoverInteraction);
  }, [hoverInteraction, spot.originalSpot]);

  const handlePointerInteraction = useCallback(
    (event: ThreeEvent<PointerEvent>) => event.stopPropagation(),
    [],
  );

  const handleClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
      onSelect?.(getScreenPositionFromEvent(event));
    },
    [onSelect],
  );

  const handleDoubleClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => event.stopPropagation(),
    [],
  );

  useFrame(({ camera }) => {
    if (!meshRef.current) return;
    meshRef.current.getWorldPosition(worldPosition);
    meshRef.current.scale.setScalar(
      getScreenSpaceScale(camera.position.distanceTo(worldPosition)),
    );
  });

  useEffect(() => {
    if (occlusionOpacity >= 0.05 || !ownsHoverRef.current) return;
    ownsHoverRef.current = false;
    onHoverEndRef.current?.(spot.originalSpot, hoverInteraction);
  }, [hoverInteraction, occlusionOpacity, spot.originalSpot]);

  if (occlusionOpacity < 0.05) return null;

  return (
    <mesh
      ref={meshRef}
      position={position}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onPointerDown={handlePointerInteraction}
      onPointerUp={handlePointerInteraction}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
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
