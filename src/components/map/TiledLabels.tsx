/**
 * TiledLabels Component
 *
 * Renders a transparent, theme-matched raster label tile layer
 * on top of the satellite tiles. Provides zoom-dependent city names,
 * roads, and country/state boundaries from OpenStreetMap data.
 *
 * Uses the same coordinate alignment and scale as TiledGlobe.
 */

import { useContext, useMemo, useEffect } from "react";
import { cartoTileUrl } from "@/lib/tiles/carto";
import {
  TilesRenderer as TilesRendererR3F,
  TilesPlugin,
  TilesRendererContext,
} from "3d-tiles-renderer/r3f";
import {
  TilesFadePlugin,
  UpdateOnChangePlugin,
} from "3d-tiles-renderer/plugins";
import { CompatibleXYZTilesPlugin } from "@/lib/tiles/CompatibleXYZTilesPlugin";
import { VisibleHemisphereTilesPlugin } from "@/lib/tiles/VisibleHemisphereTilesPlugin";
import {
  UNIT_GLOBE_ELLIPSOID,
  UNIT_GLOBE_SCALE,
} from "@/lib/map/globeGeometry";
import { GLOBE_LAYER_ORDER } from "@/lib/map/globeRenderOrder";
import * as THREE from "three";
import { useThemeStore } from "@/stores/themeStore";
import { useDisplayQualityStore } from "@/stores/displayQualityStore";
import { useResolvedDisplayQuality } from "@/hooks/useResolvedDisplayQuality";
import { GlobeTileRuntimeController } from "./GlobeTileRuntimeController";

const ALIGN_ROTATION_X = -Math.PI / 2;

const DARK_LABEL_TILE_URL = cartoTileUrl("dark_only_labels");
const LIGHT_LABEL_TILE_URL = cartoTileUrl("light_only_labels");

function LabelTileMaterialPolicy() {
  const renderer = useContext(TilesRendererContext);

  // Patch each model once at load time. Applying the policy to models that
  // arrived before this effect closes the ref/effect timing gap during a
  // renderer swap without returning to an expensive per-frame traversal.
  useEffect(() => {
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

    renderer.forEachLoadedModel((scene) => patchScene({ scene }));
    renderer.addEventListener("load-model", patchScene);
    return () => renderer.removeEventListener("load-model", patchScene);
  }, [renderer]);

  return null;
}

export function TiledLabels() {
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

  return (
    <TilesRendererR3F
      key={labelTileUrl}
      errorTarget={qualitySettings.globeErrorTarget * 3}
      ellipsoid={UNIT_GLOBE_ELLIPSOID}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      group={groupProps as any}
    >
      <GlobeTileRuntimeController layer="labels" settings={qualitySettings} />
      <LabelTileMaterialPolicy />
      <TilesPlugin
        plugin={CompatibleXYZTilesPlugin}
        args={
          {
            url: labelTileUrl,
            shape: "ellipsoid",
            // Do not let ImageFormatPlugin replace the app-owned error target.
            useRecommendedSettings: false,
            levels: 20,
            tileDimension: 512,
          } as any // eslint-disable-line @typescript-eslint/no-explicit-any
        }
      />
      <TilesPlugin plugin={VisibleHemisphereTilesPlugin} />
      <TilesPlugin
        plugin={TilesFadePlugin}
        args={
          {
            fadeDuration: Math.max(100, qualitySettings.settleDelayMs),
          } as any // eslint-disable-line @typescript-eslint/no-explicit-any
        }
      />
      <TilesPlugin plugin={UpdateOnChangePlugin} />
    </TilesRendererR3F>
  );
}
