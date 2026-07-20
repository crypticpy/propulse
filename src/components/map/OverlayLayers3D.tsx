/**
 * OverlayLayers3D
 *
 * Renders renderer-agnostic overlay layers on the 3D globe.
 * Used for contest overlays (needed mult markers, targeting, etc.).
 */

import { useLayoutEffect, useMemo, useRef } from "react";
import { Line } from "@react-three/drei";
import * as THREE from "three";
import { useMapStore } from "@/stores/mapStore";
import { getPathPoints } from "@/lib/utils/path";
import { latLonToPosition3D } from "@/hooks/useSpotFocus";
import { GLOBE_LAYER_ORDER } from "@/lib/map/globeRenderOrder";
import type { OverlayArc, OverlayCell, OverlayMarker } from "@/types/mapOverlays";

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

function OverlayCells({ cells }: { cells: OverlayCell[] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const normal = new THREE.Vector3(0, 0, 1);
    cells.forEach((cell, index) => {
      const position = markerToPosition({
        id: cell.id,
        lat: cell.lat,
        lon: cell.lon,
        color: cell.color,
      }).normalize().multiplyScalar(1.008);
      quaternion.setFromUnitVectors(normal, position.clone().normalize());
      const radius = Math.max(
        0.006,
        Math.min(cell.widthDeg, cell.heightDeg) * Math.PI / 360 * 0.92,
      );
      scale.setScalar(radius);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(index, new THREE.Color(cell.color));
    });
    mesh.count = cells.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [cells]);

  if (cells.length === 0) return null;
  // depthTest off: depth-buffer contention with the tile surface discards
  // the discs everywhere except the limb. FrontSide culls far-side cells
  // geometrically (discs face outward). Paint order comes from the shared
  // globe ladder (see globeRenderOrder.ts).
  // +0.05: paint ReachMap cells above satellite footprints (bare surfaceArea)
  // but below hazard glow dots (surfaceArea + 0.1) so the reach map stays visible.
  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, cells.length]}
      renderOrder={GLOBE_LAYER_ORDER.surfaceArea + 0.05}
      frustumCulled={false}
    >
      <circleGeometry args={[1, 20]} />
      <meshBasicMaterial
        transparent
        opacity={0.52}
        depthTest={false}
        depthWrite={false}
      />
    </instancedMesh>
  );
}

export function OverlayLayers3D() {
  const overlayLayers = useMapStore((s) => s.overlayLayers);

  const { markers, arcs, cells } = useMemo(() => {
    const markers: OverlayMarker[] = [];
    const arcs: OverlayArc[] = [];
    const cells: OverlayCell[] = [];

    for (const layer of Object.values(overlayLayers)) {
      if (layer.type === "markers") {
        markers.push(...layer.markers);
      } else if (layer.type === "arcs") {
        arcs.push(...layer.arcs);
      } else if (layer.type === "cells") {
        cells.push(...layer.cells);
      } else {
        markers.push(...layer.markers);
        arcs.push(...layer.arcs);
        cells.push(...(layer.cells ?? []));
      }
    }

    return { markers, arcs, cells };
  }, [overlayLayers]);

  if (markers.length === 0 && arcs.length === 0 && cells.length === 0) {
    return null;
  }

  return (
    <>
      <OverlayCells cells={cells} />
      {arcs.map((arc) => (
        <Line
          key={arc.id}
          points={arcToPoints(arc)}
          color={arc.color}
          lineWidth={arc.width ?? 1}
          transparent
          opacity={arc.opacity ?? 0.7}
          depthTest={false}
          depthWrite={false}
          renderOrder={GLOBE_LAYER_ORDER.arcs}
        />
      ))}

      {markers.map((marker) => {
        const size = marker.size ? DEFAULT_MARKER_SIZE * (marker.size / 6) : DEFAULT_MARKER_SIZE;
        return (
          <mesh
            key={marker.id}
            position={markerToPosition(marker)}
            renderOrder={GLOBE_LAYER_ORDER.markers}
          >
            <sphereGeometry args={[size, 10, 10]} />
            {/* depthTest stays on: protruding spheres get free far-side
                culling from the opaque globe's depth buffer. */}
            <meshBasicMaterial
              color={marker.color}
              transparent
              opacity={marker.opacity ?? 0.9}
              depthTest={true}
              depthWrite={false}
            />
          </mesh>
        );
      })}
    </>
  );
}

export default OverlayLayers3D;
