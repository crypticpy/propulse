/**
 * GOESCloudOverlay3D Component
 *
 * Renders GOES satellite cloud imagery as a CanvasTexture mapped onto a
 * slightly-larger sphere above the globe surface. Loads GIBS WMTS tiles
 * at zoom level 2 (4x4 = 16 tiles) and composites them onto a single
 * 1024x1024 canvas.
 *
 * Radius: 1.015 (globe is r=1.0)
 * renderOrder: GLOBE_LAYER_ORDER.surfaceTexture
 * NormalBlending, opacity 0.55
 */

import { useRef, useMemo, useEffect } from "react";
import * as THREE from "three";
import { useGOESImagery } from "@/hooks/useGOESImagery";
import { GOES_EAST_Z2_TILE_LIMITS } from "@/lib/api/goes";
import { drawMercatorAsEquirect } from "@/lib/map/mercatorReproject";
import { GLOBE_LAYER_ORDER } from "@/lib/map/globeRenderOrder";
import {
  resolveCloudImageryStatus,
  type CloudImageryStatus,
} from "@/lib/map/cloudImageryStatus";
import {
  createCloudOverlayMaterial,
  replaceCloudOverlayTexture,
} from "@/lib/map/cloudOverlayMaterial";

// =============================================================================
// CONSTANTS
// =============================================================================

const GLOBE_RADIUS = 1.015;
const ZOOM = 2;
const TILES_PER_AXIS = 4; // 2^2
const TILE_SIZE = 256;
const CANVAS_SIZE = TILES_PER_AXIS * TILE_SIZE; // 1024

// =============================================================================
// HELPERS
// =============================================================================

function loadTileImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/** Retry a single tile once after a short backoff before giving up on it. */
async function loadTileImageWithRetry(url: string): Promise<HTMLImageElement> {
  try {
    return await loadTileImage(url);
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 250));
    return loadTileImage(url);
  }
}

// =============================================================================
// COMPONENT
// =============================================================================

interface GOESCloudOverlay3DProps {
  onStatusChange?: (status: CloudImageryStatus) => void;
}

export function GOESCloudOverlay3D({
  onStatusChange,
}: GOESCloudOverlay3DProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const { tileUrl } = useGOESImagery();

  // Sphere geometry slightly larger than globe (default UV matches the basemap)
  const geometry = useMemo(
    () => new THREE.SphereGeometry(GLOBE_RADIUS, 64, 32),
    [],
  );

  // Material: NormalBlending, transparent, opacity 0.55.
  // FrontSide + depthTest:false (via GLOBE_OVERLAY_MATERIAL) per the globe
  // stacking contract — with depthTest left at its default (true), this
  // sphere loses the depth contest against the opaque tile globe and is
  // discarded everywhere except the limb.
  const material = useMemo(() => createCloudOverlayMaterial(), []);

  // Load tiles into canvas and create texture
  useEffect(() => {
    onStatusChange?.("loading");
    material.visible = false;
    if (!tileUrl || !meshRef.current) return;

    // Tiles are Web Mercator (GIBS EPSG:3857): composite them as-is, then
    // resample onto the equirect canvas the sphere's default UVs expect.
    const mercator = document.createElement("canvas");
    mercator.width = CANVAS_SIZE;
    mercator.height = CANVAS_SIZE;
    const ctx = mercator.getContext("2d")!;

    let disposed = false;

    // Load only the tiles inside NASA's advertised GOES-East matrix limits.
    // The uncovered eastern column remains transparent instead of producing
    // four predictable 404 responses on every activation.
    const promises: Promise<boolean>[] = [];
    for (
      let y = GOES_EAST_Z2_TILE_LIMITS.minY;
      y <= GOES_EAST_Z2_TILE_LIMITS.maxY;
      y++
    ) {
      for (
        let x = GOES_EAST_Z2_TILE_LIMITS.minX;
        x <= GOES_EAST_Z2_TILE_LIMITS.maxX;
        x++
      ) {
        const url = tileUrl
          .replace("{z}", String(ZOOM))
          .replace("{y}", String(y))
          .replace("{x}", String(x));
        promises.push(
          loadTileImageWithRetry(url)
            .then((img) => {
              if (disposed) return false;
              ctx.drawImage(img, x * TILE_SIZE, y * TILE_SIZE);
              return true;
            })
            .catch(() => false),
        );
      }
    }

    Promise.all(promises).then((tileResults) => {
      if (disposed || !meshRef.current) return;
      const status = resolveCloudImageryStatus(tileResults);
      onStatusChange?.(status);
      if (status === "unavailable") {
        replaceCloudOverlayTexture(material, null);
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = CANVAS_SIZE;
      canvas.height = CANVAS_SIZE;
      drawMercatorAsEquirect(
        canvas.getContext("2d")!,
        mercator,
        CANVAS_SIZE,
        CANVAS_SIZE,
      );
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.needsUpdate = true;
      replaceCloudOverlayTexture(material, texture);
    });

    return () => {
      disposed = true;
    };
  }, [material, onStatusChange, tileUrl]);

  // Cleanup geometry, material, and texture on unmount
  useEffect(
    () => () => {
      geometry.dispose();
      if (material.map) material.map.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      renderOrder={GLOBE_LAYER_ORDER.surfaceTexture}
    />
  );
}

export default GOESCloudOverlay3D;
