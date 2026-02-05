/**
 * OverlayLayers3D
 *
 * Renders renderer-agnostic overlay layers on the 3D globe.
 * Used for contest overlays (needed mult markers, targeting, etc.).
 */

import { useMemo } from "react";
import { Line } from "@react-three/drei";
import * as THREE from "three";
import { useMapStore } from "@/stores/mapStore";
import { getPathPoints } from "@/lib/utils/path";
import { latLonToPosition3D } from "@/hooks/useSpotFocus";
import type { OverlayArc, OverlayMarker } from "@/types/mapOverlays";

const DEFAULT_MARKER_SIZE = 0.006;

function markerToPosition(marker: OverlayMarker): THREE.Vector3 {
  const pos = latLonToPosition3D(marker.lat, marker.lon, 1.03);
  return new THREE.Vector3(pos.x, pos.y, pos.z);
}

function arcToPoints(arc: OverlayArc): THREE.Vector3[] {
  const path = getPathPoints(
    arc.fromLat,
    arc.fromLon,
    arc.toLat,
    arc.toLon,
    64,
  );
  return path.map((p) => {
    const pos = latLonToPosition3D(p.lat, p.lon, 1.02);
    return new THREE.Vector3(pos.x, pos.y, pos.z);
  });
}

export function OverlayLayers3D() {
  const overlayLayers = useMapStore((s) => s.overlayLayers);

  const { markers, arcs } = useMemo(() => {
    const markers: OverlayMarker[] = [];
    const arcs: OverlayArc[] = [];

    for (const layer of Object.values(overlayLayers)) {
      if (layer.type === "markers") {
        markers.push(...layer.markers);
      } else if (layer.type === "arcs") {
        arcs.push(...layer.arcs);
      } else {
        markers.push(...layer.markers);
        arcs.push(...layer.arcs);
      }
    }

    return { markers, arcs };
  }, [overlayLayers]);

  if (markers.length === 0 && arcs.length === 0) {
    return null;
  }

  return (
    <>
      {arcs.map((arc) => (
        <Line
          key={arc.id}
          points={arcToPoints(arc)}
          color={arc.color}
          lineWidth={arc.width ?? 1}
          transparent
          opacity={arc.opacity ?? 0.7}
          depthWrite={false}
        />
      ))}

      {markers.map((marker) => {
        const size = marker.size ? DEFAULT_MARKER_SIZE * (marker.size / 6) : DEFAULT_MARKER_SIZE;
        return (
          <mesh key={marker.id} position={markerToPosition(marker)}>
            <sphereGeometry args={[size, 10, 10]} />
            <meshBasicMaterial
              color={marker.color}
              transparent
              opacity={marker.opacity ?? 0.9}
              depthTest={false}
              depthWrite={false}
            />
          </mesh>
        );
      })}
    </>
  );
}

export default OverlayLayers3D;

