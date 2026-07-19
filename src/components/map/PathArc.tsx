/**
 * PathArc Component
 *
 * Renders an animated great circle path arc between two points on the globe.
 * Used to visualize the propagation path between home and target.
 * Supports both short path (default) and long path visualization.
 *
 * Features:
 * - Animated dash pattern flowing from source to target
 * - Subtle pulsing glow effect
 * - Direction indicators (chevrons) along the path
 * - Respects prefers-reduced-motion for accessibility
 * - Performance-optimized with proper cleanup
 */

import { useMemo, useRef, useState, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import * as THREE from "three";
import { getPathPoints, getLongPathPoints } from "@/lib/utils/path";
import { GLOBE_LAYER_ORDER } from "@/lib/map/globeRenderOrder";

// Animation constants
const ANIMATION_SPEED = 0.5; // Speed of dash flow animation
const PULSE_SPEED = 2; // Speed of glow pulse
const CHEVRON_COUNT_SHORT = 3; // Number of direction indicators on short path
const CHEVRON_COUNT_LONG = 5; // Number of direction indicators on long path
const CHEVRON_SIZE = 0.012; // Size of chevron indicators

interface PathArcProps {
  /** Start latitude */
  startLat: number;
  /** Start longitude */
  startLon: number;
  /** End latitude */
  endLat: number;
  /** End longitude */
  endLon: number;
  /** Arc color */
  color?: string;
  /** Line width */
  lineWidth?: number;
  /** Number of points along the arc */
  segments?: number;
  /** Path mode - short (default) or long */
  pathMode?: "short" | "long";
  /** Disable animations (useful for performance) */
  disableAnimation?: boolean;
}

/**
 * Convert lat/lon to 3D position on sphere
 */
function latLonTo3D(
  lat: number,
  lon: number,
  radius: number = 1.003,
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
 * Hook to detect reduced motion preference
 */
function useReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    // Check on mount
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mediaQuery.matches);

    // Listen for changes
    const handler = (event: MediaQueryListEvent) => {
      setReducedMotion(event.matches);
    };

    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  return reducedMotion;
}

/**
 * Animated dashed line component
 * Animates the dash offset to create flowing effect
 */
function AnimatedDashedLine({
  points,
  color,
  lineWidth,
  dashSize,
  gapSize,
  opacity,
  animationSpeed,
  shouldAnimate,
}: {
  points: Array<[number, number, number]>;
  color: string;
  lineWidth: number;
  dashSize: number;
  gapSize: number;
  opacity: number;
  animationSpeed: number;
  shouldAnimate: boolean;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lineRef = useRef<any>(null);
  const dashOffsetRef = useRef(0);

  useFrame((_, delta) => {
    if (!shouldAnimate || !lineRef.current) {
      return;
    }

    // Update dash offset for flowing animation
    dashOffsetRef.current -= delta * animationSpeed;

    // Access the material and update dashOffset
    const material = lineRef.current.material as THREE.LineDashedMaterial;
    if (material && "dashOffset" in material) {
      material.dashOffset = dashOffsetRef.current;
    }
  });

  return (
    <Line
      ref={lineRef}
      points={points}
      color={color}
      lineWidth={lineWidth}
      opacity={opacity}
      transparent
      dashed
      dashSize={dashSize}
      gapSize={gapSize}
      depthTest={false}
      depthWrite={false}
      renderOrder={GLOBE_LAYER_ORDER.arcs + 0.1}
    />
  );
}

/**
 * Pulsing glow line effect
 * Creates a subtle breathing glow around the main path
 */
function GlowLine({
  points,
  color,
  baseOpacity,
  shouldAnimate,
}: {
  points: Array<[number, number, number]>;
  color: string;
  baseOpacity: number;
  shouldAnimate: boolean;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lineRef = useRef<any>(null);

  useFrame(({ clock }) => {
    if (!shouldAnimate || !lineRef.current) {
      return;
    }

    const material = lineRef.current.material as THREE.Material;
    if (material && "opacity" in material) {
      // Subtle pulse effect
      const pulse = Math.sin(clock.elapsedTime * PULSE_SPEED) * 0.15 + 0.85;
      (material as { opacity: number }).opacity = baseOpacity * pulse;
    }
  });

  return (
    <Line
      ref={lineRef}
      points={points}
      color={color}
      lineWidth={8}
      opacity={baseOpacity}
      transparent
      depthWrite={false}
      depthTest={false}
      renderOrder={GLOBE_LAYER_ORDER.arcs}
    />
  );
}

/**
 * Direction indicator chevron
 * Shows propagation direction along the path
 */
function DirectionChevron({
  position,
  direction,
  normal,
  color,
  opacity,
  shouldAnimate,
}: {
  position: THREE.Vector3;
  direction: THREE.Vector3;
  normal: THREE.Vector3;
  color: string;
  opacity: number;
  shouldAnimate: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);

  useFrame(({ clock }) => {
    if (!shouldAnimate || !materialRef.current) {
      return;
    }

    // Subtle fade pulse synchronized with glow
    const pulse =
      Math.sin(clock.elapsedTime * PULSE_SPEED + Math.PI / 4) * 0.2 + 0.8;
    materialRef.current.opacity = opacity * pulse;
  });

  // Create chevron geometry pointing in the direction
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    const size = CHEVRON_SIZE;

    // Chevron arrow shape (pointing right initially)
    shape.moveTo(-size * 0.5, size * 0.4);
    shape.lineTo(0, 0);
    shape.lineTo(-size * 0.5, -size * 0.4);
    shape.lineTo(-size * 0.3, 0);
    shape.closePath();

    return new THREE.ShapeGeometry(shape);
  }, []);

  // Calculate rotation to align chevron with path direction
  const rotation = useMemo(() => {
    const quaternion = new THREE.Quaternion();

    // Create a matrix that aligns Z with normal (outward from globe)
    // and X with direction (along path)
    const matrix = new THREE.Matrix4();
    const up = normal.clone();
    const forward = direction.clone().normalize();
    const right = new THREE.Vector3().crossVectors(up, forward).normalize();
    forward.crossVectors(right, up).normalize();

    matrix.makeBasis(forward, right, up);
    quaternion.setFromRotationMatrix(matrix);

    return new THREE.Euler().setFromQuaternion(quaternion);
  }, [direction, normal]);

  return (
    <mesh
      ref={meshRef}
      position={position}
      rotation={rotation}
      geometry={geometry}
      renderOrder={GLOBE_LAYER_ORDER.arcs + 0.2}
    >
      <meshBasicMaterial
        ref={materialRef}
        color={color}
        transparent
        opacity={opacity}
        side={THREE.DoubleSide}
        depthWrite={false}
        depthTest={false}
      />
    </mesh>
  );
}

/**
 * PathArc renders an animated great circle path between two points
 *
 * The animation includes:
 * - Flowing dashes moving from source to destination
 * - Subtle pulsing glow effect
 * - Chevron direction indicators
 *
 * Animation respects prefers-reduced-motion accessibility setting.
 */
export function PathArc({
  startLat,
  startLon,
  endLat,
  endLon,
  color = "#ff6b35",
  lineWidth = 3,
  segments = 50,
  pathMode = "short",
  disableAnimation = false,
}: PathArcProps) {
  const reducedMotion = useReducedMotion();
  const shouldAnimate = !reducedMotion && !disableAnimation;

  // Calculate path points along great circle (short or long path)
  const points = useMemo(() => {
    // Use more segments for long path since it's longer
    const numSegments =
      pathMode === "long" ? Math.max(segments, 150) : segments;

    const pathPoints =
      pathMode === "long"
        ? getLongPathPoints(startLat, startLon, endLat, endLon, numSegments)
        : getPathPoints(startLat, startLon, endLat, endLon, numSegments);

    return pathPoints.map((p) => latLonTo3D(p.lat, p.lon)) as Array<
      [number, number, number]
    >;
  }, [startLat, startLon, endLat, endLon, segments, pathMode]);

  // Calculate chevron positions and directions
  const chevrons = useMemo(() => {
    if (points.length < 3) {
      return [];
    }

    const count =
      pathMode === "long" ? CHEVRON_COUNT_LONG : CHEVRON_COUNT_SHORT;
    const result: Array<{
      position: THREE.Vector3;
      direction: THREE.Vector3;
      normal: THREE.Vector3;
    }> = [];

    for (let i = 0; i < count; i++) {
      // Distribute chevrons along the path (skip start and end)
      const fraction = (i + 1) / (count + 1);
      const index = Math.floor(fraction * (points.length - 1));

      if (index > 0 && index < points.length - 1) {
        const pos = new THREE.Vector3(...points[index]);
        const prev = new THREE.Vector3(...points[index - 1]);
        const next = new THREE.Vector3(
          ...points[Math.min(index + 1, points.length - 1)],
        );

        // Direction along the path
        const direction = new THREE.Vector3()
          .subVectors(next, prev)
          .normalize();

        // Normal (outward from globe center)
        const normal = pos.clone().normalize();

        result.push({ position: pos, direction, normal });
      }
    }

    return result;
  }, [points, pathMode]);

  if (points.length < 2) {
    return null;
  }

  // Determine dash configuration based on path mode
  const isLongPath = pathMode === "long";
  const dashSize = isLongPath ? 0.04 : 0.025;
  const gapSize = isLongPath ? 0.025 : 0.015;
  const baseOpacity = isLongPath ? 0.7 : 0.9;
  const glowOpacity = isLongPath ? 0.15 : 0.2;

  return (
    <group name={`path-arc-${pathMode}`}>
      {/* Background glow layer - subtle pulsing effect */}
      {shouldAnimate && (
        <GlowLine
          points={points}
          color={color}
          baseOpacity={glowOpacity}
          shouldAnimate={shouldAnimate}
        />
      )}

      {/* Main animated dashed line */}
      {shouldAnimate ? (
        <AnimatedDashedLine
          points={points}
          color={color}
          lineWidth={lineWidth}
          dashSize={dashSize}
          gapSize={gapSize}
          opacity={baseOpacity}
          animationSpeed={ANIMATION_SPEED}
          shouldAnimate={shouldAnimate}
        />
      ) : (
        // Static fallback for reduced motion
        <Line
          points={points}
          color={color}
          lineWidth={lineWidth}
          opacity={baseOpacity}
          transparent
          dashed={isLongPath}
          dashSize={isLongPath ? 0.03 : undefined}
          gapSize={isLongPath ? 0.02 : undefined}
          depthTest={false}
          depthWrite={false}
          renderOrder={GLOBE_LAYER_ORDER.arcs + 0.1}
        />
      )}

      {/* Direction indicator chevrons */}
      {chevrons.map((chevron, index) => (
        <DirectionChevron
          key={`chevron-${index}`}
          position={chevron.position}
          direction={chevron.direction}
          normal={chevron.normal}
          color={color}
          opacity={baseOpacity * 0.8}
          shouldAnimate={shouldAnimate}
        />
      ))}
    </group>
  );
}

PathArc.displayName = "PathArc";

export default PathArc;
