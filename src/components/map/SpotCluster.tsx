/**
 * SpotCluster Component
 *
 * Renders a cluster marker on the 3D globe representing multiple DX spots
 * in the same geographic area. Features include:
 * - Larger marker than individual spots
 * - Count badge showing number of spots
 * - Hexagonal shape for visual distinction
 * - Hover tooltip with callsign list
 * - Click to expand/zoom functionality
 */

import { useRef, useMemo, useState, useCallback } from "react";
import { useFrame, ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { SpotCluster as SpotClusterType } from "@/hooks/useSpotClustering";
import {
  getClusterCallsignSummary,
  getClusterModes,
} from "@/hooks/useSpotClustering";
import { getModeColor } from "./LiveSpotArcs";

/** Radius offset to prevent z-fighting with globe surface */
const SURFACE_OFFSET = 1.025;

/** Base size for cluster markers (larger than regular spots) */
const CLUSTER_SIZE = 0.035;

/** Maximum spots to show in tooltip */
const MAX_TOOLTIP_CALLSIGNS = 10;

export interface SpotClusterProps {
  /** The cluster data to render */
  cluster: SpotClusterType;
  /** Click handler for cluster expansion */
  onClick?: (cluster: SpotClusterType) => void;
  /** Hover handler for tooltip display */
  onHover?: (
    cluster: SpotClusterType | null,
    position: { x: number; y: number },
  ) => void;
}

/**
 * Convert lat/lon to 3D position on sphere
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

/**
 * Get screen position from native mouse/pointer event
 */
function getScreenPositionFromEvent(
  event: ThreeEvent<MouseEvent | PointerEvent>,
): { x: number; y: number } {
  const nativeEvent = event.nativeEvent;
  return {
    x: nativeEvent.clientX,
    y: nativeEvent.clientY,
  };
}

/**
 * Create hexagon geometry for cluster marker
 */
function createHexagonGeometry(
  radius: number,
  depth: number = 0.005,
): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  const sides = 6;

  for (let i = 0; i <= sides; i++) {
    const angle = (i / sides) * Math.PI * 2 - Math.PI / 2; // Start at top
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;

    if (i === 0) {
      shape.moveTo(x, y);
    } else {
      shape.lineTo(x, y);
    }
  }

  const extrudeSettings = {
    depth,
    bevelEnabled: false,
  };

  return new THREE.ExtrudeGeometry(shape, extrudeSettings);
}

/**
 * SpotCluster renders a cluster marker on the globe surface
 *
 * @example
 * ```tsx
 * <SpotCluster
 *   cluster={clusterData}
 *   onClick={(cluster) => console.log('Expand:', cluster)}
 *   onHover={(cluster) => setHoveredCluster(cluster)}
 * />
 * ```
 */
export function SpotCluster({ cluster, onClick, onHover }: SpotClusterProps) {
  const markerRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);

  const [isHovered, setIsHovered] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  // Calculate 3D position from cluster center
  const position = useMemo(() => {
    return latLonToVector3(
      cluster.center.lat,
      cluster.center.lon,
      SURFACE_OFFSET,
    );
  }, [cluster.center.lat, cluster.center.lon]);

  // Get color from primary spot's mode
  const color = useMemo(() => {
    return getModeColor(cluster.primarySpot.mode);
  }, [cluster.primarySpot.mode]);

  // Get modes in cluster for tooltip
  const modes = useMemo(() => {
    return getClusterModes(cluster);
  }, [cluster]);

  // Get callsign summary for tooltip
  const callsignSummary = useMemo(() => {
    return getClusterCallsignSummary(cluster, MAX_TOOLTIP_CALLSIGNS);
  }, [cluster]);

  // Create hexagon geometry (memoized)
  const hexGeometry = useMemo(() => {
    return createHexagonGeometry(CLUSTER_SIZE);
  }, []);

  // Handle click event
  const handleClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
      onClick?.(cluster);
    },
    [cluster, onClick],
  );

  // Handle pointer enter
  const handlePointerEnter = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      setIsHovered(true);
      setShowTooltip(true);

      if (onHover) {
        const screenPos = getScreenPositionFromEvent(event);
        onHover(cluster, screenPos);
      }
    },
    [cluster, onHover],
  );

  // Handle pointer leave
  const handlePointerLeave = useCallback(() => {
    setIsHovered(false);
    setShowTooltip(false);
    onHover?.(null, { x: 0, y: 0 });
  }, [onHover]);

  // Animate glow effect
  useFrame(({ clock }) => {
    if (glowRef.current && materialRef.current) {
      // Pulsing glow effect
      const time = clock.elapsedTime * 2;
      const pulse = 0.5 + Math.sin(time) * 0.3;
      const baseOpacity = 0.6 * pulse;

      materialRef.current.opacity = isHovered ? baseOpacity * 1.5 : baseOpacity;

      // Scale glow when hovered
      const glowScale = isHovered ? 1.5 : 1;
      glowRef.current.scale.setScalar(glowScale);
    }
  });

  const glowSize = CLUSTER_SIZE * 2.5;

  // Calculate dynamic size based on cluster count
  const sizeMultiplier = Math.min(1 + (cluster.count - 3) * 0.05, 1.5);

  return (
    <group position={position}>
      {/* Glow effect behind marker */}
      <mesh ref={glowRef} renderOrder={0}>
        <circleGeometry args={[glowSize, 32]} />
        <meshBasicMaterial
          ref={materialRef}
          color={color}
          transparent
          opacity={0.4}
          side={THREE.DoubleSide}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>

      {/* Main hexagonal marker */}
      <mesh
        ref={markerRef}
        geometry={hexGeometry}
        onClick={handleClick}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        renderOrder={2}
        scale={[sizeMultiplier, sizeMultiplier, 1]}
        rotation={[0, 0, 0]}
      >
        <meshBasicMaterial
          color={color}
          transparent
          opacity={isHovered ? 1 : 0.9}
          depthTest={false}
        />
      </mesh>

      {/* Outer ring for emphasis */}
      <mesh renderOrder={1} scale={[sizeMultiplier, sizeMultiplier, 1]}>
        <ringGeometry args={[CLUSTER_SIZE * 1.1, CLUSTER_SIZE * 1.3, 6]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={isHovered ? 0.8 : 0.5}
          side={THREE.DoubleSide}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>

      {/* Count badge using Html overlay */}
      <Html
        position={[0, CLUSTER_SIZE * 2.5, 0]}
        center
        style={{
          pointerEvents: "none",
          transition: "opacity 0.2s ease",
        }}
      >
        <div
          className="px-1.5 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap"
          style={{
            backgroundColor: color,
            color: "#0A0A1A",
            boxShadow: `0 0 10px ${color}80`,
            transform: isHovered ? "scale(1.2)" : "scale(1)",
            transition: "all 0.2s ease",
          }}
        >
          {cluster.count}
        </div>
      </Html>

      {/* Tooltip on hover */}
      {showTooltip && (
        <Html
          position={[0, CLUSTER_SIZE * 5, 0]}
          center
          style={{
            pointerEvents: "none",
            zIndex: 1000,
          }}
        >
          <div
            className="px-3 py-2 rounded-lg text-xs max-w-[200px]"
            style={{
              backgroundColor: "rgba(10, 10, 26, 0.95)",
              border: `1px solid ${color}`,
              boxShadow: `0 0 15px ${color}40`,
            }}
          >
            <div className="font-bold mb-1" style={{ color }}>
              {cluster.count} Spots
            </div>
            {modes.length > 0 && (
              <div className="text-gray-400 text-[10px] mb-1">
                {modes.join(", ")}
              </div>
            )}
            <div className="text-gray-300 text-[10px] leading-relaxed break-words">
              {callsignSummary}
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

export default SpotCluster;
