/**
 * WeatherRadarOverlay Component
 *
 * Renders RainViewer precipitation radar data on the 3D globe.
 * Composites z=4 tiles (16x16 = 256 tiles covering the full world) onto a canvas,
 * then boosts color saturation/brightness so radar pops against the dark globe,
 * and maps the equirectangular texture onto a transparent sphere slightly
 * above the Earth surface.
 */

import React, { useRef, useMemo, useEffect, useState } from "react";
import * as THREE from "three";
import type { RadarManifest } from "@/lib/api/radar";
import { getRadarTileUrl } from "@/lib/api/radar";

interface WeatherRadarOverlayProps {
  manifest: RadarManifest;
}

/** Zoom level 4: 2^4 = 16 tiles per axis, 256 total */
const ZOOM_LEVEL = 4;
const TILES_PER_AXIS = 2 ** ZOOM_LEVEL; // 16
const TILE_SIZE = 256;
/** Canvas size — 16 tiles * 256px = 4096px per axis */
const CANVAS_SIZE = TILES_PER_AXIS * TILE_SIZE; // 4096
/** Number of tiles to load concurrently */
const BATCH_SIZE = 32;

/**
 * Load a single image from a URL, returning a promise.
 */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const loader = new THREE.ImageLoader();
    loader.setCrossOrigin("anonymous");
    loader.load(url, resolve, undefined, reject);
  });
}

/**
 * Load promises in batches to limit concurrency.
 */
async function loadInBatches<T>(
  tasks: (() => Promise<T>)[],
  batchSize: number,
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = [];
  for (let i = 0; i < tasks.length; i += batchSize) {
    const batch = tasks.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(batch.map((fn) => fn()));
    results.push(...batchResults);
  }
  return results;
}

/**
 * Post-process the radar canvas to boost color vibrancy.
 * RainViewer tiles are subtle — we saturate and brighten precipitation pixels
 * so they stand out against the dark globe.
 */
function boostRadarColors(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    // Skip fully transparent pixels (no precipitation)
    if (a < 10) continue;

    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    // Boost saturation: increase distance from gray
    const gray = (r + g + b) / 3;
    const satBoost = 1.6;
    r = Math.min(255, Math.round(gray + (r - gray) * satBoost));
    g = Math.min(255, Math.round(gray + (g - gray) * satBoost));
    b = Math.min(255, Math.round(gray + (b - gray) * satBoost));

    // Boost brightness for dim pixels
    const brightness = Math.max(r, g, b);
    if (brightness < 140) {
      const lift = 1.4;
      r = Math.min(255, Math.round(r * lift));
      g = Math.min(255, Math.round(g * lift));
      b = Math.min(255, Math.round(b * lift));
    }

    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;

    // Boost alpha so thin precipitation layers are more visible
    data[i + 3] = Math.min(255, Math.round(a * 1.5));
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * Load all z=4 radar tiles and composite them onto a canvas.
 *
 * Tile layout at z=4: 16x16 grid (x: 0..15, y: 0..15)
 * The canvas represents lon -180..180 left-to-right, lat ~85..-85 top-to-bottom.
 */
async function compositeRadarTiles(
  manifest: RadarManifest,
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Failed to get 2d context");

  const tiles: { x: number; y: number }[] = [];
  for (let y = 0; y < TILES_PER_AXIS; y++) {
    for (let x = 0; x < TILES_PER_AXIS; x++) {
      tiles.push({ x, y });
    }
  }

  const tasks = tiles.map((t) => {
    const url = getRadarTileUrl(manifest, ZOOM_LEVEL, t.x, t.y);
    return () => loadImage(url);
  });

  const results = await loadInBatches(tasks, BATCH_SIZE);

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

  // Boost color vibrancy after compositing all tiles
  boostRadarColors(ctx, CANVAS_SIZE, CANVAS_SIZE);

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
    () => new THREE.SphereGeometry(1.002, 128, 64, Math.PI),
    [],
  );

  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.88,
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
