/**
 * GOESCloudOverlay3D Component
 *
 * Renders GOES satellite cloud imagery as a CanvasTexture mapped onto a
 * slightly-larger sphere above the globe surface. Loads GIBS WMTS tiles
 * at zoom level 2 (4x4 = 16 tiles) and composites them onto a single
 * 1024x1024 canvas.
 *
 * Radius: 1.015 (globe is r=1.0)
 * renderOrder: 5
 * NormalBlending, opacity 0.35
 */

import { useRef, useMemo, useEffect } from "react";
import * as THREE from "three";
import { useGOESImagery } from "@/hooks/useGOESImagery";

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

// =============================================================================
// COMPONENT
// =============================================================================

export function GOESCloudOverlay3D() {
  const meshRef = useRef<THREE.Mesh>(null);
  const { tileUrl } = useGOESImagery();

  // Sphere geometry slightly larger than globe (phiStart = Math.PI to align UV)
  const geometry = useMemo(
    () => new THREE.SphereGeometry(GLOBE_RADIUS, 64, 32, Math.PI),
    [],
  );

  // Material: NormalBlending, transparent, opacity 0.35
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.35,
        blending: THREE.NormalBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    [],
  );

  // Load tiles into canvas and create texture
  useEffect(() => {
    if (!tileUrl || !meshRef.current) return;

    const canvas = document.createElement("canvas");
    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;
    const ctx = canvas.getContext("2d")!;

    let disposed = false;

    // Load all tiles for zoom level 2 (4x4 grid)
    const promises: Promise<void>[] = [];
    for (let y = 0; y < TILES_PER_AXIS; y++) {
      for (let x = 0; x < TILES_PER_AXIS; x++) {
        const url = tileUrl
          .replace("{z}", String(ZOOM))
          .replace("{y}", String(y))
          .replace("{x}", String(x));
        promises.push(
          loadTileImage(url)
            .then((img) => {
              if (!disposed) ctx.drawImage(img, x * TILE_SIZE, y * TILE_SIZE);
            })
            .catch(() => {
              // Skip failed tiles silently
            }),
        );
      }
    }

    Promise.all(promises).then(() => {
      if (disposed || !meshRef.current) return;
      const texture = new THREE.CanvasTexture(canvas);
      texture.needsUpdate = true;
      const mat = meshRef.current!.material as THREE.MeshBasicMaterial;
      if (mat.map) mat.map.dispose();
      mat.map = texture;
      mat.needsUpdate = true;
    });

    return () => {
      disposed = true;
    };
  }, [tileUrl]);

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
      renderOrder={5}
    />
  );
}

export default GOESCloudOverlay3D;
