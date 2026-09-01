/**
 * TiledLabels Component
 *
 * Renders a transparent, theme-matched vector label tile layer
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
import { useThemeStore } from "@/stores/themeStore";
import { useDisplayQualityStore } from "@/stores/displayQualityStore";
import { useResolvedDisplayQuality } from "@/hooks/useResolvedDisplayQuality";

const ALIGN_ROTATION_X = -Math.PI / 2;

const DARK_LABEL_TILE_URL =
  "https://basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}@2x.png";
const LIGHT_LABEL_TILE_URL =
  "https://basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}@2x.png";

export function TiledLabels() {
  const tilesRef = useRef<TilesRendererImpl>(null);
  const themeId = useThemeStore((s) => s.themeId);
  const displayQuality = useDisplayQualityStore((s) => s.displayQuality);
  const qualitySettings = useResolvedDisplayQuality(displayQuality);
  const labelTileUrl =
    themeId === "light" ? LIGHT_LABEL_TILE_URL : DARK_LABEL_TILE_URL;

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
            // Label tiles drape at the tile-surface radius, BELOW the
            // GlobeDepthDome — they must skip the depth test or the dome
            // would occlude them. FrontSide culling handles the far side.
            mat.depthTest = false;
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
  }, [labelTileUrl]);

  return (
    <TilesRendererR3F
      key={labelTileUrl}
      ref={tilesRef}
      errorTarget={qualitySettings.globeErrorTarget * 3}
      ellipsoid={UNIT_GLOBE_ELLIPSOID}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      group={groupProps as any}
    >
      <TilesPlugin
        plugin={CompatibleXYZTilesPlugin}
        args={
          {
            url: labelTileUrl,
            shape: "ellipsoid",
            useRecommendedSettings: true,
            levels: 20,
            tileDimension: 512,
          } as any // eslint-disable-line @typescript-eslint/no-explicit-any
        }
      />
      <TilesPlugin
        plugin={TilesFadePlugin}
        args={
          {
            fadeDuration: Math.max(100, qualitySettings.settleDelayMs),
          } as any // eslint-disable-line @typescript-eslint/no-explicit-any
        }
      />
    </TilesRendererR3F>
  );
}
