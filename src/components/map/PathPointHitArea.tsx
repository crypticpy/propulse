/**
 * Invisible mesh for path-point pointer/touch hits.
 * Far-side points omit the mesh so they cannot receive clicks.
 */
import { useCallback, useMemo, useRef } from "react";
import { ThreeEvent, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { getScreenSpaceScale } from "@/lib/map/screenSpaceScale";
import { pathPointAcceptsPointer } from "@/lib/spots/pathPoints";
import type { ScreenAnchor } from "@/lib/map/anchoredOverlay";

const DEFAULT_HIT_RADIUS = 0.03;

export interface PathPointHitAreaProps {
  pointId: string;
  lat: number;
  lon: number;
  radius: number;
  occlusionOpacity?: number;
  hitRadius?: number;
  onHover?: (pointId: string, screenPos: ScreenAnchor) => void;
  onHoverEnd?: (pointId: string) => void;
  onSelect?: (pointId: string, screenPos: ScreenAnchor) => void;
}

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

function screenPos(event: { nativeEvent: Pick<MouseEvent, "clientX" | "clientY"> }): ScreenAnchor {
  return { x: event.nativeEvent.clientX, y: event.nativeEvent.clientY };
}

export function PathPointHitArea({
  pointId,
  lat,
  lon,
  radius,
  occlusionOpacity = 1,
  hitRadius = DEFAULT_HIT_RADIUS,
  onHover,
  onHoverEnd,
  onSelect,
}: PathPointHitAreaProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const worldPosition = useMemo(() => new THREE.Vector3(), []);
  const position = useMemo(() => latLonTo3D(lat, lon, radius), [lat, lon, radius]);

  const stop = useCallback((event: ThreeEvent<PointerEvent | MouseEvent>) => {
    event.stopPropagation();
  }, []);

  const handlePointerEnter = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      onHover?.(pointId, screenPos(event));
    },
    [onHover, pointId],
  );

  const handlePointerLeave = useCallback(() => {
    onHoverEnd?.(pointId);
  }, [onHoverEnd, pointId]);

  const handleClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
      onSelect?.(pointId, screenPos(event));
    },
    [onSelect, pointId],
  );

  useFrame(({ camera }) => {
    if (!meshRef.current) return;
    meshRef.current.getWorldPosition(worldPosition);
    meshRef.current.scale.setScalar(
      getScreenSpaceScale(camera.position.distanceTo(worldPosition)),
    );
  });

  if (!pathPointAcceptsPointer(occlusionOpacity)) return null;

  return (
    <mesh
      ref={meshRef}
      name={`path-point-hit-${pointId}`}
      position={position}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onPointerDown={stop}
      onPointerUp={stop}
      onClick={handleClick}
      onDoubleClick={stop}
    >
      <sphereGeometry args={[hitRadius, 8, 8]} />
      <meshBasicMaterial transparent opacity={0} depthTest={false} depthWrite={false} />
    </mesh>
  );
}
