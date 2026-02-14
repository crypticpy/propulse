/**
 * WeatherRadarOverlay Component
 *
 * Renders RainViewer precipitation radar data on the 3D globe.
 * Composites z=3 tiles (8x8 = 64 tiles covering the full world) onto a canvas,
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

/** Zoom level 3: 2^3 = 8 tiles per axis */
const ZOOM_LEVEL = 3;
const TILES_PER_AXIS = 2 ** ZOOM_LEVEL; // 8
const TILE_SIZE = 256;
/** Canvas size — 8 tiles * 256px = 2048px per axis */
const CANVAS_SIZE = TILES_PER_AXIS * TILE_SIZE; // 2048
/** Number of tiles to load concurrently to avoid overwhelming the browser */
const BATCH_SIZE = 16;

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
 * Load promises in batches to limit concurrency.
 * Each batch of `batchSize` tasks runs in parallel via Promise.allSettled,
 * then the next batch starts.
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
 * Load all 64 z=3 radar tiles and composite them onto a canvas.
 *
 * Tile layout at z=3: 8x8 grid (x: 0..7, y: 0..7)
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

  // z=3 tiles: 8x8 grid
  const tiles: { x: number; y: number }[] = [];
  for (let y = 0; y < TILES_PER_AXIS; y++) {
    for (let x = 0; x < TILES_PER_AXIS; x++) {
      tiles.push({ x, y });
    }
  }

  // Create lazy-evaluated load tasks for batched loading
  const tasks = tiles.map((t) => {
    const url = getRadarTileUrl(manifest, ZOOM_LEVEL, t.x, t.y);
    return () => loadImage(url);
  });

  // Load tiles in batches of BATCH_SIZE — skip any that fail (radar may have gaps)
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
