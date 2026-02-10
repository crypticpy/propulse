/**
 * SpotCluster Component
 *
 * Renders an elevated pin-style beacon on the 3D globe representing multiple
 * DX spots in the same geographic area. Features include:
 * - Vertical stem with hexagonal head (distinct from cone-style individual pins)
 * - Count badge floating above the head
 * - Base glow ring and head glow with pulsing animation
 * - Gentle bobbing motion along the surface normal
 * - Globe occlusion (fades on far side of globe)
 * - Click/hover callbacks for external popover handling
 */

import { useRef, useMemo, useState, useCallback, useEffect } from "react";
import { useFrame, ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { SpotCluster as SpotClusterType } from "@/hooks/useSpotClustering";
import { getModeColor } from "@/lib/utils/spotColors";
import { useGlobeOcclusion } from "@/hooks/useGlobeOcclusion";

/** Radius offset to prevent z-fighting with globe surface */
const SURFACE_OFFSET = 1.02;

/** Height of the pin stem above the globe surface */
const STEM_HEIGHT = 0.08;

/** Base radius for the hexagonal head */
const HEAD_SIZE = 0.02;

export interface SpotClusterProps {
  /** The cluster data to render */
  cluster: SpotClusterType;
  /** Click handler for cluster expansion */
  onClick?: (
    cluster: SpotClusterType,
    screenPos: { x: number; y: number },
  ) => void;
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
 * Get the "up" direction at a given lat/lon (normal to the sphere surface)
 */
function getUpDirection(lat: number, lon: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);

  return new THREE.Vector3(
    -Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta),
  ).normalize();
}

/**
 * Get screen position from native mouse/pointer event
 */
function getScreenPositionFromEvent(
  event: ThreeEvent<MouseEvent | PointerEvent>,
): { x: number; y: number } {
  const { nativeEvent } = event;
  return {
    x: nativeEvent.clientX,
    y: nativeEvent.clientY,
  };
}

/**
 * Create hexagon geometry for cluster marker head
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
 * SpotCluster renders an elevated pin-style beacon on the globe surface
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
  const groupRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Mesh>(null);
  const headGlowMeshRef = useRef<THREE.Mesh>(null);
  const baseGlowMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const stemMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const hexMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const headGlowMaterialRef = useRef<THREE.MeshBasicMaterial>(null);

  const [isHovered, setIsHovered] = useState(false);

  // Globe occlusion - fade out clusters on the far side
  const { opacityRef: occlusionRef } = useGlobeOcclusion(
    cluster.center.lat,
    cluster.center.lon,
  );

  // Calculate base position on globe surface
  const basePosition = useMemo(() => {
    return latLonToVector3(
      cluster.center.lat,
      cluster.center.lon,
      SURFACE_OFFSET,
    );
  }, [cluster.center.lat, cluster.center.lon]);

  // Calculate up direction for orienting the pin
  const upDirection = useMemo(() => {
    return getUpDirection(cluster.center.lat, cluster.center.lon);
  }, [cluster.center.lat, cluster.center.lon]);

  // Get color from primary spot's mode
  const color = useMemo(() => {
    return getModeColor(cluster.primarySpot.mode);
  }, [cluster.primarySpot.mode]);

  // Calculate dynamic size based on cluster count
  const sizeMultiplier = Math.min(1 + (cluster.count - 3) * 0.05, 1.5);

  // Create hexagon geometry for the head (memoized with cleanup)
  const hexGeometry = useMemo(() => {
    return createHexagonGeometry(HEAD_SIZE);
  }, []);

  // Create stem geometry
  const stemGeometry = useMemo(() => {
    return new THREE.CylinderGeometry(0.003, 0.003, STEM_HEIGHT, 8);
  }, []);

  // Dispose geometries on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      hexGeometry.dispose();
      stemGeometry.dispose();
    };
  }, [hexGeometry, stemGeometry]);

  // Pre-allocate reusable vectors to avoid per-frame GC pressure
  const tempBobVec = useMemo(() => new THREE.Vector3(), []);
  const tempScaleVec = useMemo(() => new THREE.Vector3(), []);

  // Calculate rotation to align pin with surface normal
  const rotation = useMemo(() => {
    const quaternion = new THREE.Quaternion();
    const defaultUp = new THREE.Vector3(0, 1, 0);
    quaternion.setFromUnitVectors(defaultUp, upDirection);
    return new THREE.Euler().setFromQuaternion(quaternion);
  }, [upDirection]);

  // Handle click event
  const handleClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
      const screenPos = getScreenPositionFromEvent(event);
      onClick?.(cluster, screenPos);
    },
    [cluster, onClick],
  );

  // Handle pointer enter
  const handlePointerEnter = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      setIsHovered(true);

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
    onHover?.(null, { x: 0, y: 0 });
  }, [onHover]);

  // Animate pin (bobbing, pulsing, hover) and apply globe occlusion
  useFrame(({ clock, camera }) => {
    const occlusion = occlusionRef.current;
    const time = clock.elapsedTime;

    // Gentle bob animation along the up direction
    if (groupRef.current) {
      const bobOffset = Math.sin(time * 1.5) * 0.003;
      tempBobVec.copy(upDirection).multiplyScalar(bobOffset);
      groupRef.current.position.copy(basePosition).add(tempBobVec);
    }

    // Hover: lerp head scale to 1.2
    if (headRef.current) {
      const targetScale = isHovered ? 1.2 * sizeMultiplier : sizeMultiplier;
      tempScaleVec.set(targetScale, targetScale, 1);
      headRef.current.scale.lerp(tempScaleVec, 0.1);

      // Billboard: always face the camera so the head is clickable from any angle
      headRef.current.lookAt(camera.position);
    }

    // Billboard: head glow also faces the camera
    if (headGlowMeshRef.current) {
      headGlowMeshRef.current.lookAt(camera.position);
    }

    // Pulsing glow on base ring
    if (baseGlowMaterialRef.current) {
      const pulse = 0.5 + Math.sin(time * 2) * 0.3;
      const baseOpacity = isHovered ? 0.5 * pulse : 0.3 * pulse;
      baseGlowMaterialRef.current.opacity = baseOpacity * occlusion;
    }

    // Stem material occlusion
    if (stemMaterialRef.current) {
      stemMaterialRef.current.opacity = 0.6 * occlusion;
    }

    // Hexagonal head material occlusion + hover brighten
    if (hexMaterialRef.current) {
      hexMaterialRef.current.opacity = (isHovered ? 1 : 0.9) * occlusion;
    }

    // Pulsing head glow
    if (headGlowMaterialRef.current) {
      const headPulse = 0.5 + Math.sin(time * 2 + 1) * 0.3;
      const headGlowOpacity = isHovered ? 0.5 * headPulse : 0.3 * headPulse;
      headGlowMaterialRef.current.opacity = headGlowOpacity * occlusion;
    }
  });

  return (
    <group ref={groupRef} position={basePosition} rotation={rotation}>
      {/* 1. Base glow ring — flat on surface, pulsing */}
      <mesh
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, 0.001, 0]}
        renderOrder={0}
      >
        <ringGeometry args={[HEAD_SIZE * 0.8, HEAD_SIZE * 1.5, 6]} />
        <meshBasicMaterial
          ref={baseGlowMaterialRef}
          color={color}
          transparent
          opacity={0.3}
          side={THREE.DoubleSide}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>

      {/* 2. Stem — thin cylinder from surface to head */}
      <mesh position={[0, STEM_HEIGHT / 2, 0]} renderOrder={1}>
        <primitive object={stemGeometry} attach="geometry" />
        <meshBasicMaterial
          ref={stemMaterialRef}
          color={color}
          transparent
          opacity={0.6}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>

      {/* 3. Hexagonal head — scaled by cluster count */}
      <mesh
        ref={headRef}
        geometry={hexGeometry}
        position={[0, STEM_HEIGHT, 0]}
        onClick={handleClick}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        renderOrder={3}
        scale={[sizeMultiplier, sizeMultiplier, 1]}
      >
        <meshBasicMaterial
          ref={hexMaterialRef}
          color={color}
          transparent
          opacity={0.9}
          depthTest={false}
        />
      </mesh>

      {/* 4. Head glow — circle behind the hexagonal head */}
      <mesh
        ref={headGlowMeshRef}
        position={[0, STEM_HEIGHT, 0]}
        renderOrder={2}
      >
        <circleGeometry args={[HEAD_SIZE * 2, 32]} />
        <meshBasicMaterial
          ref={headGlowMaterialRef}
          color={color}
          transparent
          opacity={0.3}
          side={THREE.DoubleSide}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>

      {/* Count badge — floating above the head */}
      <Html
        position={[0, STEM_HEIGHT + HEAD_SIZE * 3, 0]}
        center
        zIndexRange={[1, 0]}
        style={{
          pointerEvents: "none",
          transition: "opacity 0.2s ease",
        }}
      >
        <div
          className="px-2 py-0.5 rounded-full text-[12px] font-bold whitespace-nowrap"
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
    </group>
  );
}

SpotCluster.displayName = "SpotCluster";

export default SpotCluster;
