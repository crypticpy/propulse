/**
 * WeatherRadarOverlay Component
 *
 * Renders RainViewer precipitation radar data on the 3D globe.
 * Composites z=1 tiles (4 tiles covering the full world) onto a canvas,
 * then maps the equirectangular texture onto a transparent sphere slightly
 * above the Earth surface.
 */

import React, { useRef, useMemo, useEffect, useState } from "react";
import * as THREE from "three";
import type { RadarManifest } from "@/lib/api/radar";
import { getRadarTileUrl } from "@/lib/api/radar";

interface WeatherRadarOverlayProps {
  manifest: RadarManifest;
}

/** Canvas size — 2 tiles wide x 2 tiles tall at 256px each */
const CANVAS_SIZE = 512;
const TILE_SIZE = 256;

/**
 * Load a single image from a URL, returning a promise.
 * Uses THREE.ImageLoader for correct cross-origin handling.
 */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const loader = new THREE.ImageLoader();
    loader.setCrossOrigin("anonymous");
    loader.load(url, resolve, undefined, reject);
  });
}

/**
 * Load all 4 z=1 radar tiles and composite them onto a canvas.
 *
 * Tile layout at z=1:
 *   (x=0,y=0) | (x=1,y=0)   ← northern hemisphere
 *   (x=0,y=1) | (x=1,y=1)   ← southern hemisphere
 *
 * The canvas represents lon -180..180 left-to-right, lat ~85..-85 top-to-bottom.
 */
async function compositeRadarTiles(
  manifest: RadarManifest,
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const ctx = canvas.getContext("2d", { willReadFrequently: false });
  if (!ctx) throw new Error("Failed to get 2d context");

  // z=1 tiles: 2x2 grid
  const tiles: { x: number; y: number }[] = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: 1, y: 1 },
  ];

  const urls = tiles.map((t) => getRadarTileUrl(manifest, 1, t.x, t.y));

  // Load all tiles in parallel — skip any that fail (radar may have gaps)
  const results = await Promise.allSettled(urls.map((url) => loadImage(url)));

  results.forEach((result, i) => {
    if (result.status === "fulfilled") {
      const tile = tiles[i];
      ctx.drawImage(
        result.value,
        tile.x * TILE_SIZE,
        tile.y * TILE_SIZE,
        TILE_SIZE,
        TILE_SIZE,
      );
    }
  });

  return canvas;
}

function WeatherRadarOverlayInner({ manifest }: WeatherRadarOverlayProps) {
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);
  const textureRef = useRef<THREE.CanvasTexture | null>(null);

  // Load tiles and create texture when manifest changes
  useEffect(() => {
    let cancelled = false;

    compositeRadarTiles(manifest)
      .then((canvas) => {
        if (cancelled) return;

        // Dispose previous texture
        if (textureRef.current) {
          textureRef.current.dispose();
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.needsUpdate = true;

        textureRef.current = tex;
        setTexture(tex);
      })
      .catch(() => {
        // Silently fail — radar overlay is non-critical
      });

    return () => {
      cancelled = true;
    };
  }, [manifest]);

  // Clean up texture on unmount
  useEffect(() => {
    return () => {
      if (textureRef.current) {
        textureRef.current.dispose();
        textureRef.current = null;
      }
    };
  }, []);

  /**
   * Sphere geometry slightly above Earth (radius 1.002).
   *
   * phiStart = Math.PI rotates the UV mapping by 180 degrees so that
   * u=0 maps to lon=-180 (matching the tile grid where x=0 is the
   * western hemisphere).
   */
  const geometry = useMemo(
    () => new THREE.SphereGeometry(1.002, 64, 32, Math.PI),
    [],
  );

  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        blending: THREE.NormalBlending,
        side: THREE.FrontSide,
      }),
    [],
  );

  // Update the material map when texture is ready
  useEffect(() => {
    if (texture) {
      material.map = texture;
      material.needsUpdate = true;
    }
  }, [texture, material]);

  if (!texture) return null;

  return <mesh geometry={geometry} material={material} />;
}

export const WeatherRadarOverlay = React.memo(
  WeatherRadarOverlayInner,
  (prev, next) => prev.manifest === next.manifest,
);
