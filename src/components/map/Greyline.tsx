/**
 * Greyline Component
 *
 * Renders the greyline band on the 3D globe with intensity-based visualization.
 * The greyline is the twilight zone around the terminator which provides
 * enhanced propagation conditions, especially for low-band DX.
 *
 * Intensity Levels:
 * - Normal: Standard greyline rendering
 * - Enhanced: Wider band, higher opacity (30 min before/after sunrise/sunset)
 * - Peak: Widest band, highest opacity with pulsing animation (15 min window)
 */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { getGreylineBand } from "@/lib/utils/sun";
import {
  type GreylineIntensity,
  getGreylineVisualParams,
} from "@/lib/utils/greyline";

interface GreylineProps {
  /** Current display time */
  date: Date;
  /** Greyline intensity level */
  intensity?: GreylineIntensity;
  /** Override band width in degrees from terminator */
  offsetDegrees?: number;
  /** Override band color */
  color?: string;
  /** Override band opacity */
  opacity?: number;
  /** Enable pulsing animation (auto-enabled for peak intensity) */
  pulsing?: boolean;
}

/**
 * Convert lat/lon to 3D position on sphere
 */
function latLonToVector3(
  lat: number,
  lon: number,
  radius: number = 1.005,
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

export function Greyline({
  date,
  intensity = "normal",
  offsetDegrees,
  color,
  opacity,
  pulsing,
}: GreylineProps) {
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);

  // Get visual parameters based on intensity
  const visualParams = useMemo(
    () => getGreylineVisualParams(intensity),
    [intensity],
  );

  // Use provided values or fall back to intensity-based defaults
  const actualOffset = offsetDegrees ?? visualParams.widthDegrees;
  const actualColor = color ?? visualParams.color;
  const actualOpacity = opacity ?? visualParams.opacity;
  const shouldPulse = pulsing ?? visualParams.pulsing;

  // Calculate greyline band geometry
  const geometry = useMemo(() => {
    const { inner, outer } = getGreylineBand(date, actualOffset, 90);
    return createGreylineMesh(inner, outer);
  }, [date, actualOffset]);

  // Animate pulsing effect
  useFrame((state) => {
    if (!materialRef.current || !shouldPulse) {
      return;
    }

    // Create smooth pulsing animation
    const time = state.clock.getElapsedTime();
    const { pulseSpeed } = visualParams;
    const pulse = Math.sin(time * pulseSpeed * 2) * 0.15 + 1; // Oscillate between 0.85 and 1.15

    materialRef.current.opacity = actualOpacity * pulse;
  });

  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial
        ref={materialRef}
        color={actualColor}
        opacity={actualOpacity}
        transparent
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}
