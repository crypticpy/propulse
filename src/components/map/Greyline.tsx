/**
 * Greyline Component
 *
 * Renders the greyline band on the 3D globe.
 * The greyline is the twilight zone ±15° from the terminator,
 * which provides enhanced propagation conditions.
 */

import { useMemo } from "react";
import * as THREE from "three";
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

export function Greyline({
  date,
  offsetDegrees = 15,
  color = "#ffaa00",
  opacity = 0.35,
}: GreylineProps) {
  // Calculate greyline band
  const geometry = useMemo(() => {
    const { inner, outer } = getGreylineBand(date, offsetDegrees, 90);
    return createGreylineMesh(inner, outer);
  }, [date, offsetDegrees]);

  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial
        color={color}
        opacity={opacity}
        transparent
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}
