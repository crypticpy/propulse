/**
 * GrayLineZone Component
 *
 * Renders the enhanced gray line propagation zone on the 3D globe.
 * This visualizes the +/-5 degree region around the solar terminator
 * where HF propagation is enhanced due to ionospheric conditions at
 * the day/night boundary.
 *
 * The zone appears as a translucent amber/gold band straddling the
 * terminator line, sitting slightly above the globe surface to avoid
 * z-fighting with other overlays.
 */

import { useMemo, useEffect } from "react";
import * as THREE from "three";
import { getGrayLineZone } from "@/lib/utils/grayline";

interface GrayLineZoneProps {
  /** Current display time */
  date: Date;
  /** Whether the zone is visible */
  visible?: boolean;
}

/** Globe radius offset to prevent z-fighting with the earth surface */
const ZONE_RADIUS = 1.006;

/**
 * Convert lat/lon to a 3D position on a sphere of the given radius.
 * Uses the same coordinate convention as the existing Greyline component.
 */
function latLonToVector3(
  lat: number,
  lon: number,
  radius: number = ZONE_RADIUS,
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
 * Build a BufferGeometry representing a band between two rings of
 * lat/lon points on the globe surface.
 *
 * Each ring must have the same number of points. Consecutive points
 * on the inner and outer rings are connected with triangle pairs to
 * form a continuous strip.
 */
function createZoneGeometry(
  inner: Array<{ lat: number; lon: number }>,
  outer: Array<{ lat: number; lon: number }>,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const numPoints = inner.length;

  // Interleave inner/outer vertices: [inner0, outer0, inner1, outer1, ...]
  for (let i = 0; i < numPoints; i++) {
    const innerVec = latLonToVector3(inner[i].lat, inner[i].lon);
    const outerVec = latLonToVector3(outer[i].lat, outer[i].lon);

    positions.push(innerVec.x, innerVec.y, innerVec.z);
    positions.push(outerVec.x, outerVec.y, outerVec.z);
  }

  // Create triangle pairs connecting adjacent inner/outer vertices
  for (let i = 0; i < numPoints; i++) {
    const nextI = (i + 1) % numPoints;

    const innerIdx = i * 2;
    const outerIdx = i * 2 + 1;
    const nextInnerIdx = nextI * 2;
    const nextOuterIdx = nextI * 2 + 1;

    // First triangle: inner[i] -> outer[i] -> inner[i+1]
    indices.push(innerIdx, outerIdx, nextInnerIdx);
    // Second triangle: inner[i+1] -> outer[i] -> outer[i+1]
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
 * Renders the gray line propagation zone as a translucent amber band
 * on the 3D globe between the inner (85 deg) and outer (95 deg)
 * boundaries of the terminator.
 */
export function GrayLineZone({ date, visible = true }: GrayLineZoneProps) {
  // Memoize geometry computation -- only recompute when the minute changes
  // to avoid unnecessary recalculations on every render frame.
  const minuteKey = `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}-${date.getUTCHours()}-${date.getUTCMinutes()}`;

  const geometry = useMemo(() => {
    const { innerBound, outerBound } = getGrayLineZone(date, 180);
    return createZoneGeometry(innerBound, outerBound);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minuteKey]);

  // Dispose old geometry when the memo recalculates
  useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  if (!visible) {
    return null;
  }

  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial
        color="#ffaa00"
        transparent
        opacity={0.15}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

export default GrayLineZone;
