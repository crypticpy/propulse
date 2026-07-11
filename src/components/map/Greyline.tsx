/**
 * Greyline Component
 *
 * Renders the greyline band on the 3D globe.
 * The greyline is the twilight zone +/- 15 degrees from the terminator,
 * which provides enhanced propagation conditions.
 *
 * Enhanced version includes:
 * - Golden glow effect for enhanced propagation zone
 * - Visual highlighting for paths in the gray zone
 * - Tooltip support for enhancement values
 */

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { getGreylineBand } from "@/lib/utils/sun";

interface GreylineProps {
  /** Current display time */
  date: Date;
  /** Greyline band width in degrees from terminator */
  offsetDegrees?: number;
  /** Band color */
  color?: string;
  /** Band opacity */
  opacity?: number;
  /** Enable glow animation effect */
  enableGlow?: boolean;
  /** Show enhanced propagation zone (inner band) */
  showEnhancedZone?: boolean;
}

/**
 * Convert lat/lon to 3D position on sphere
 */
function latLonToVector3(
  lat: number,
  lon: number,
  radius: number = 1.001,
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
 * Create a mesh from inner and outer ring points
 */
function createGreylineMesh(
  inner: Array<{ lat: number; lon: number }>,
  outer: Array<{ lat: number; lon: number }>,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];

  const numPoints = inner.length;

  // Add all vertices
  for (let i = 0; i < numPoints; i++) {
    const innerVec = latLonToVector3(inner[i].lat, inner[i].lon);
    const outerVec = latLonToVector3(outer[i].lat, outer[i].lon);

    positions.push(innerVec.x, innerVec.y, innerVec.z);
    positions.push(outerVec.x, outerVec.y, outerVec.z);
  }

  // Create triangles connecting inner and outer rings
  for (let i = 0; i < numPoints; i++) {
    const nextI = (i + 1) % numPoints;

    const innerIdx = i * 2;
    const outerIdx = i * 2 + 1;
    const nextInnerIdx = nextI * 2;
    const nextOuterIdx = nextI * 2 + 1;

    // Two triangles per quad
    indices.push(innerIdx, outerIdx, nextInnerIdx);
    indices.push(nextInnerIdx, outerIdx, nextOuterIdx);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
}

/**
 * Create a gradient mesh with varying opacity from inner to outer
 */
function createGradientGreylineMesh(
  inner: Array<{ lat: number; lon: number }>,
  outer: Array<{ lat: number; lon: number }>,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const numPoints = inner.length;

  // Golden color for enhanced zone
  const innerColor = new THREE.Color(0xffd700); // Gold
  const outerColor = new THREE.Color(0xff8800); // Orange

  // Add all vertices with colors
  for (let i = 0; i < numPoints; i++) {
    const innerVec = latLonToVector3(inner[i].lat, inner[i].lon, 1.0015);
    const outerVec = latLonToVector3(outer[i].lat, outer[i].lon, 1.001);

    positions.push(innerVec.x, innerVec.y, innerVec.z);
    positions.push(outerVec.x, outerVec.y, outerVec.z);

    // Inner is brighter (enhanced zone)
    colors.push(innerColor.r, innerColor.g, innerColor.b);
    // Outer fades to orange
    colors.push(outerColor.r, outerColor.g, outerColor.b);
  }

  // Create triangles connecting inner and outer rings
  for (let i = 0; i < numPoints; i++) {
    const nextI = (i + 1) % numPoints;

    const innerIdx = i * 2;
    const outerIdx = i * 2 + 1;
    const nextInnerIdx = nextI * 2;
    const nextOuterIdx = nextI * 2 + 1;

    // Two triangles per quad
    indices.push(innerIdx, outerIdx, nextInnerIdx);
    indices.push(nextInnerIdx, outerIdx, nextOuterIdx);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
}

/**
 * Inner enhanced zone mesh (peak propagation area)
 */
function createEnhancedZoneMesh(
  inner: Array<{ lat: number; lon: number }>,
  outer: Array<{ lat: number; lon: number }>,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];

  const numPoints = inner.length;

  // Create a narrower band for the enhanced zone
  for (let i = 0; i < numPoints; i++) {
    // Inner ring at terminator
    const innerVec = latLonToVector3(inner[i].lat, inner[i].lon, 1.002);

    // Outer ring at midpoint between inner and outer
    const midLat = (inner[i].lat + outer[i].lat) / 2;
    const midLon = (inner[i].lon + outer[i].lon) / 2;
    const outerVec = latLonToVector3(midLat, midLon, 1.0018);

    positions.push(innerVec.x, innerVec.y, innerVec.z);
    positions.push(outerVec.x, outerVec.y, outerVec.z);
  }

  for (let i = 0; i < numPoints; i++) {
    const nextI = (i + 1) % numPoints;

    const innerIdx = i * 2;
    const outerIdx = i * 2 + 1;
    const nextInnerIdx = nextI * 2;
    const nextOuterIdx = nextI * 2 + 1;

    indices.push(innerIdx, outerIdx, nextInnerIdx);
    indices.push(nextInnerIdx, outerIdx, nextOuterIdx);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
}

/**
 * Animated Greyline with glow effect
 */
export function Greyline({
  date,
  offsetDegrees = 15,
  color = "#ffaa00",
  opacity = 0.35,
  enableGlow = true,
  showEnhancedZone = true,
}: GreylineProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const enhancedMeshRef = useRef<THREE.Mesh>(null);

  // Calculate greyline band geometries
  const { mainGeometry, enhancedGeometry, gradientGeometry } = useMemo(() => {
    const { inner, outer } = getGreylineBand(date, offsetDegrees, 90);

    return {
      mainGeometry: createGreylineMesh(inner, outer),
      enhancedGeometry: createEnhancedZoneMesh(inner, outer),
      gradientGeometry: createGradientGreylineMesh(inner, outer),
    };
  }, [date, offsetDegrees]);

  // Animate opacity for glow effect
  useFrame((state) => {
    if (enableGlow && enhancedMeshRef.current) {
      const material = enhancedMeshRef.current
        .material as THREE.MeshBasicMaterial;
      // Subtle pulsing glow
      const pulse = 0.4 + Math.sin(state.clock.elapsedTime * 2) * 0.1;
      material.opacity = pulse;
    }
  });

  return (
    <group>
      {/* Main greyline band */}
      <mesh geometry={mainGeometry} ref={meshRef}>
        <meshBasicMaterial
          color={color}
          opacity={opacity}
          transparent
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Enhanced propagation zone (inner golden band) */}
      {showEnhancedZone && (
        <mesh geometry={enhancedGeometry} ref={enhancedMeshRef}>
          <meshBasicMaterial
            color="#ffd700"
            opacity={0.4}
            transparent
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* Gradient overlay for smooth transition */}
      {enableGlow && (
        <mesh geometry={gradientGeometry}>
          <meshBasicMaterial
            vertexColors
            opacity={0.2}
            transparent
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
}

/**
 * Props for the enhanced path indicator
 */
interface EnhancedPathIndicatorProps {
  /** Start position [lat, lon] */
  start: [number, number];
  /** End position [lat, lon] */
  end: [number, number];
  /** Enhancement value in dB */
  enhancement: number;
  /** Enhancement type */
  type: "grayline" | "tep";
}

/**
 * Visual indicator for paths with enhanced propagation
 *
 * Shows a golden glow along paths that benefit from gray line
 * or TEP propagation conditions.
 */
export function EnhancedPathIndicator({
  start,
  end,
  enhancement,
  type,
}: EnhancedPathIndicatorProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  // Create path as a tube geometry for better visibility
  const geometry = useMemo(() => {
    const points: THREE.Vector3[] = [];
    const numPoints = 50;

    for (let i = 0; i <= numPoints; i++) {
      const t = i / numPoints;
      const lat = start[0] + (end[0] - start[0]) * t;
      const lon = start[1] + (end[1] - start[1]) * t;
      points.push(latLonToVector3(lat, lon, 1.003));
    }

    // Create a curve from the points
    const curve = new THREE.CatmullRomCurve3(points);
    // Create tube geometry along the curve
    return new THREE.TubeGeometry(curve, 50, 0.002, 8, false);
  }, [start, end]);

  // Animate glow intensity based on enhancement
  useFrame((state) => {
    if (meshRef.current) {
      const material = meshRef.current.material as THREE.MeshBasicMaterial;
      // More enhancement = brighter glow
      const baseOpacity = Math.min(0.8, 0.3 + enhancement / 20);
      const pulse = Math.sin(state.clock.elapsedTime * 3) * 0.1;
      material.opacity = baseOpacity + pulse;
    }
  });

  const color = type === "grayline" ? "#ffd700" : "#aa44ff";

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <meshBasicMaterial
        color={color}
        opacity={0.5}
        transparent
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

/**
 * Polar region overlay for absorption visualization
 */
interface PolarOverlayProps {
  /** Absorption severity level */
  severity: "minor" | "moderate" | "severe" | "blackout";
  /** Which pole: 'north', 'south', or 'both' */
  pole: "north" | "south" | "both";
}

/**
 * Polar absorption overlay
 *
 * Shows red/orange coloring over polar regions to indicate
 * absorption conditions.
 */
export function PolarOverlay({ severity, pole }: PolarOverlayProps) {
  const color = useMemo(() => {
    switch (severity) {
      case "blackout":
        return "#ff0000";
      case "severe":
        return "#ff4400";
      case "moderate":
        return "#ff8800";
      case "minor":
        return "#ffaa00";
      default:
        return "#ffaa00";
    }
  }, [severity]);

  const opacity = useMemo(() => {
    switch (severity) {
      case "blackout":
        return 0.4;
      case "severe":
        return 0.3;
      case "moderate":
        return 0.2;
      case "minor":
        return 0.1;
      default:
        return 0.1;
    }
  }, [severity]);

  // Create polar cap geometry
  const geometry = useMemo(() => {
    const geo = new THREE.SphereGeometry(1.001, 64, 32, 0, Math.PI * 2, 0, 0.5);
    return geo;
  }, []);

  const renderCap = (isNorth: boolean) => (
    <mesh geometry={geometry} rotation={isNorth ? [0, 0, 0] : [Math.PI, 0, 0]}>
      <meshBasicMaterial
        color={color}
        opacity={opacity}
        transparent
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );

  return (
    <group>
      {(pole === "north" || pole === "both") && renderCap(true)}
      {(pole === "south" || pole === "both") && renderCap(false)}
    </group>
  );
}

export default Greyline;
