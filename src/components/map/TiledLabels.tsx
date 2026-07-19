/**
 * TiledLabels Component
 *
 * Renders a transparent vector label tile layer (CartoDB dark_only_labels)
 * on top of the satellite tiles. Provides zoom-dependent city names,
 * roads, and country/state boundaries from OpenStreetMap data.
 *
 * Uses the same coordinate alignment and scale as TiledGlobe.
 */

import { useRef, useMemo, useEffect } from "react";
import {
  TilesRenderer as TilesRendererR3F,
  TilesPlugin,
} from "3d-tiles-renderer/r3f";
import { TilesFadePlugin } from "3d-tiles-renderer/plugins";
import { TilesRenderer as TilesRendererImpl } from "3d-tiles-renderer/three";
import { CompatibleXYZTilesPlugin } from "@/lib/tiles/CompatibleXYZTilesPlugin";
import {
  UNIT_GLOBE_ELLIPSOID,
  UNIT_GLOBE_SCALE,
} from "@/lib/map/globeGeometry";
import { GLOBE_LAYER_ORDER } from "@/lib/map/globeRenderOrder";
import * as THREE from "three";

const ALIGN_ROTATION_X = -Math.PI / 2;

/** CartoDB dark_only_labels tile URL */
const LABEL_TILE_URL =
  "https://basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}@2x.png";

export function TiledLabels() {
  const tilesRef = useRef<TilesRendererImpl>(null);

  const groupProps = useMemo(
    () => ({
      scale: UNIT_GLOBE_SCALE,
      rotation: [ALIGN_ROTATION_X, 0, 0] as [number, number, number],
    }),
    [],
  );

  // Patch tile materials once on load via the renderer's event system.
  // This avoids per-frame traversal which fights with TilesFadePlugin.
  useEffect(() => {
    const renderer = tilesRef.current;
    if (!renderer) return;

    const patchScene = (event: { scene: THREE.Object3D }) => {
      event.scene.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          const mat = mesh.material as THREE.MeshBasicMaterial;
          if (mat) {
            mat.transparent = true;
            mat.depthWrite = false;
            mat.needsUpdate = true;
          }
          mesh.renderOrder = GLOBE_LAYER_ORDER.tileLabels;
        }
      });
    };

    renderer.addEventListener("load-model", patchScene);
    return () => {
      renderer.removeEventListener("load-model", patchScene);
    };
  }, []);

  return (
    <TilesRendererR3F
      ref={tilesRef}
      errorTarget={6}
      ellipsoid={UNIT_GLOBE_ELLIPSOID}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      group={groupProps as any}
    >
      <TilesPlugin
        plugin={CompatibleXYZTilesPlugin}
        args={
          {
            url: LABEL_TILE_URL,
            shape: "ellipsoid",
            useRecommendedSettings: true,
            levels: 20,
            tileDimension: 512,
          } as any // eslint-disable-line @typescript-eslint/no-explicit-any
        }
      />
      <TilesPlugin
        plugin={TilesFadePlugin}
        args={{ fadeDuration: 200 } as any} // eslint-disable-line @typescript-eslint/no-explicit-any
      />
    </TilesRendererR3F>
  );
}
