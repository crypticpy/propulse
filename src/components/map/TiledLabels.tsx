/**
 * TiledLabels Component
 *
 * Renders a transparent vector label tile layer (CartoDB dark_only_labels)
 * on top of the satellite tiles. Provides zoom-dependent city names,
 * roads, and country/state boundaries from OpenStreetMap data.
 *
 * Uses the same coordinate alignment and scale as TiledGlobe.
 */

import { useRef, useMemo } from "react";
import {
  TilesRenderer as TilesRendererR3F,
  TilesPlugin,
} from "3d-tiles-renderer/r3f";
import {
  XYZTilesPlugin,
  TilesFadePlugin,
  UpdateOnChangePlugin,
} from "3d-tiles-renderer/plugins";
import { TilesRenderer as TilesRendererImpl } from "3d-tiles-renderer/three";
import { WGS84_RADIUS } from "3d-tiles-renderer/core";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const ALIGN_ROTATION_X = -Math.PI / 2;
const UNIT_SCALE = 1 / WGS84_RADIUS;

/** CartoDB dark_only_labels tile URL */
const LABEL_TILE_URL =
  "https://basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}@2x.png";

export function TiledLabels() {
  const tilesRef = useRef<TilesRendererImpl>(null);

  const groupProps = useMemo(
    () => ({
      scale: [UNIT_SCALE, UNIT_SCALE, UNIT_SCALE] as [number, number, number],
      rotation: [ALIGN_ROTATION_X, 0, 0] as [number, number, number],
    }),
    [],
  );

  // Force transparency on tile materials as they load.
  // CartoDB tiles are PNGs with transparent backgrounds but
  // the tile renderer may not auto-detect this.
  useFrame(() => {
    const renderer = tilesRef.current;
    if (!renderer) return;

    renderer.group.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const mat = mesh.material as THREE.MeshBasicMaterial;
        if (mat && !mat.transparent) {
          mat.transparent = true;
          mat.depthWrite = false;
          mat.needsUpdate = true;
        }
        // Ensure label tiles render above base tiles (0) but below borders (5)
        if (mesh.renderOrder !== 4) {
          mesh.renderOrder = 4;
        }
      }
    });
  });

  return (
    <TilesRendererR3F
      ref={tilesRef}
      errorTarget={4}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      group={groupProps as any}
    >
      <TilesPlugin
        plugin={XYZTilesPlugin}
        args={
          {
            url: LABEL_TILE_URL,
            shape: "ellipsoid",
            useRecommendedSettings: true,
          } as any // eslint-disable-line @typescript-eslint/no-explicit-any
        }
      />
      <TilesPlugin
        plugin={TilesFadePlugin}
        args={{ fadeDuration: 200 } as any} // eslint-disable-line @typescript-eslint/no-explicit-any
      />
      <TilesPlugin plugin={UpdateOnChangePlugin} />
    </TilesRendererR3F>
  );
}
