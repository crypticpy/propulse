/**
 * Ft8GridHeatmap
 *
 * Three.js InstancedMesh overlay that shows FT8/FT4 decode density per
 * Maidenhead grid square, creating a persistent "propagation glow" on the
 * globe. Each 4-char grid with recent activity gets a sphere instance whose
 * color and scale reflect decode density.
 *
 * Features:
 * - Rebuilds grid counts from scratch each time decodes changes (correct)
 * - Color ramp from dim blue (1 decode) to bright white (10+)
 * - Additive blending for ethereal glow effect
 * - Capped at 200 instances with count-based priority
 * - Dirty-flag optimized: only rebuilds instance matrices when data changes
 */

import React, { useRef, useMemo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Ft8SpotterDecode } from "@/hooks/useFt8SpotterData";
import { gridToLatLon } from "@/lib/utils/grid";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Globe surface radius for heatmap dots (slightly above surface) */
const SURFACE_RADIUS = 1.0035;

/** Maximum number of grid instances to render */
const MAX_GRIDS = 200;

/** Color ramp thresholds */
const COLOR_1 = new THREE.Color("#1a3a6a"); // 1 decode
const COLOR_2 = new THREE.Color("#2266aa"); // 2-4 decodes
const COLOR_3 = new THREE.Color("#44ddff"); // 5-9 decodes
const COLOR_4 = new THREE.Color("#eeffff"); // 10+ decodes

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Ft8GridHeatmapProps {
  /** All recent decoded stations (last ~5 min buffer) */
  decodes: Ft8SpotterDecode[];
}

interface GridAccum {
  count: number;
  peakSnr: number;
  lat: number;
  lon: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

/** Get the heatmap color for a given decode count */
function getGridColor(count: number): THREE.Color {
  if (count >= 10) return COLOR_4;
  if (count >= 5) return COLOR_3;
  if (count >= 2) return COLOR_2;
  return COLOR_1;
}

/** Get the scale multiplier for a given decode count */
function getGridScale(count: number): number {
  return 0.5 + Math.min(count, 10) * 0.15;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const Ft8GridHeatmap = React.memo(function Ft8GridHeatmap({
  decodes,
}: Ft8GridHeatmapProps) {
  // Accumulation map keyed by 4-char grid — rebuilt from scratch each time
  const accumRef = useRef<Map<string, GridAccum>>(new Map());
  // Dirty flag: set when accumulation map changes
  const dirtyRef = useRef(true);
  // Instanced mesh ref
  const meshRef = useRef<THREE.InstancedMesh>(null);

  // Shared geometry (created once, disposed on unmount)
  const geometry = useMemo(() => new THREE.SphereGeometry(0.003, 6, 6), []);

  // Reusable scratch objects for instance matrix updates
  const scratchObj = useMemo(() => new THREE.Object3D(), []);
  const scratchColor = useMemo(() => new THREE.Color(), []);

  // Dispose geometry on unmount
  useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  // Rebuild accumulation map from scratch when decodes changes.
  // This avoids the unbounded-count bug where re-processing the same
  // decodes array would increment existing grid counts again.
  useEffect(() => {
    const accum = new Map<string, GridAccum>();

    for (const decode of decodes) {
      if (!decode.grid || decode.grid.length < 4) continue;

      const gridKey = decode.grid.substring(0, 4).toUpperCase();
      const existing = accum.get(gridKey);

      if (existing) {
        existing.count += 1;
        existing.peakSnr = Math.max(existing.peakSnr, decode.snr);
      } else {
        // Resolve grid center coordinates
        let lat: number;
        let lon: number;
        try {
          const pos = gridToLatLon(gridKey);
          lat = pos.lat;
          lon = pos.lon;
        } catch {
          // Invalid grid — use decode's own lat/lon as fallback
          lat = decode.lat;
          lon = decode.lon;
        }

        accum.set(gridKey, {
          count: 1,
          peakSnr: decode.snr,
          lat,
          lon,
        });
      }
    }

    // Priority eviction: if over cap, keep highest-count grids
    if (accum.size > MAX_GRIDS) {
      const sorted = Array.from(accum.entries()).sort(
        (a, b) => b[1].count - a[1].count,
      );
      accum.clear();
      for (let i = 0; i < MAX_GRIDS; i++) {
        accum.set(sorted[i][0], sorted[i][1]);
      }
    }

    accumRef.current = accum;
    dirtyRef.current = true;
  }, [decodes]);

  // Update instance matrices and colors only when dirty
  useFrame(() => {
    if (!dirtyRef.current || !meshRef.current) return;
    dirtyRef.current = false;

    const mesh = meshRef.current;
    const accum = accumRef.current;
    let idx = 0;

    for (const [, entry] of accum) {
      if (idx >= MAX_GRIDS) break;

      const pos = latLonToVector3(entry.lat, entry.lon, SURFACE_RADIUS);
      const scale = getGridScale(entry.count);

      scratchObj.position.copy(pos);
      scratchObj.scale.setScalar(scale);
      scratchObj.updateMatrix();
      mesh.setMatrixAt(idx, scratchObj.matrix);

      scratchColor.copy(getGridColor(entry.count));
      mesh.setColorAt(idx, scratchColor);

      idx++;
    }

    // Hide unused instances by scaling them to zero
    for (let i = idx; i < MAX_GRIDS; i++) {
      scratchObj.position.set(0, 0, 0);
      scratchObj.scale.setScalar(0);
      scratchObj.updateMatrix();
      mesh.setMatrixAt(i, scratchObj.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
    mesh.count = idx;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, undefined, MAX_GRIDS]}
      frustumCulled={false}
    >
      <meshBasicMaterial
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        transparent
        toneMapped={false}
      />
    </instancedMesh>
  );
});

export default Ft8GridHeatmap;
