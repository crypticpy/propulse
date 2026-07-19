/**
 * WeatherRadarOverlay Component
 *
 * Renders animated RainViewer precipitation radar data on the 3D globe.
 * Loads frames (past + nowcast) as CanvasTexture objects, auto-cycles through
 * them, and exports animation control state for an external scrubber UI.
 *
 * Uses zoom 2 (4x4 = 16 tiles per frame, 1024px canvas). Five loaded frames
 * consume about 20 MiB of raw RGBA texture memory instead of hundreds of MiB.
 *
 * Frame loading strategy:
 * 1. Load the latest past frame first for immediate display
 * 2. Load remaining frames progressively one at a time
 *
 * Animation:
 * - 500ms per frame, with a 2s pause on the latest past frame before restart
 * - Swaps material.map to change frames (cheapest GPU approach)
 */

import React, {
  useRef,
  useMemo,
  useEffect,
  useState,
  useCallback,
} from "react";
import * as THREE from "three";
import type { RadarManifest } from "@/lib/api/radar";
import { getRadarTileUrlForFrame, getAllRadarFrames } from "@/lib/api/radar";
import {
  RADAR_TEXTURE_BUDGET,
  selectInitialRadarFrameIndex,
} from "@/lib/map/radarBudget";
import {
  GLOBE_LAYER_ORDER,
  GLOBE_OVERLAY_MATERIAL,
} from "@/lib/map/globeRenderOrder";

/** Radar animation control state, exported for scrubber UI */
export interface RadarAnimationState {
  frameCount: number;
  activeIndex: number;
  isPlaying: boolean;
  isLoading: boolean;
  timestamps: number[];
  isNowcast: boolean[];
  hasNexrad: boolean;
  setFrame: (idx: number) => void;
  togglePlay: () => void;
}

interface WeatherRadarOverlayProps {
  manifest: RadarManifest;
  onAnimationState?: (state: RadarAnimationState) => void;
}

const ZOOM_LEVEL = RADAR_TEXTURE_BUDGET.zoom;
const TILES_PER_AXIS = RADAR_TEXTURE_BUDGET.tilesPerAxis;
const TILE_SIZE = RADAR_TEXTURE_BUDGET.tileSize;
const CANVAS_SIZE = TILES_PER_AXIS * TILE_SIZE;
/** Tiles to load concurrently — keep low to avoid 429 rate limits */
const TILE_BATCH_SIZE = 8;
/** Load one frame at a time to avoid hammering the API */
const FRAME_BATCH_SIZE = 1;
/** Max loaded frame textures in GPU memory. */
const MAX_FRAMES = RADAR_TEXTURE_BUDGET.maxFrames;

function getLoadedFrameIndices(
  frames: ReadonlyMap<number, THREE.Texture>,
): number[] {
  return Array.from(frames.keys()).sort((a, b) => a - b);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const loader = new THREE.ImageLoader();
    loader.setCrossOrigin("anonymous");
    loader.load(url, resolve, undefined, reject);
  });
}

/** Retry a single tile once after a short backoff before giving up on it. */
async function loadImageWithRetry(url: string): Promise<HTMLImageElement> {
  try {
    return await loadImage(url);
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 250));
    return loadImage(url);
  }
}

async function loadInBatches<T>(
  tasks: (() => Promise<T>)[],
  batchSize: number,
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = [];
  for (let i = 0; i < tasks.length; i += batchSize) {
    const batch = tasks.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(batch.map((fn) => fn()));
    results.push(...batchResults);
    // Small delay between batches to avoid rate limits
    if (i + batchSize < tasks.length) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  return results;
}

/**
 * Post-process the radar canvas to boost color vibrancy.
 */
function boostRadarColors(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 10) continue;

    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    const gray = (r + g + b) / 3;
    const satBoost = 1.6;
    r = Math.min(255, Math.round(gray + (r - gray) * satBoost));
    g = Math.min(255, Math.round(gray + (g - gray) * satBoost));
    b = Math.min(255, Math.round(gray + (b - gray) * satBoost));

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
    data[i + 3] = Math.min(255, Math.round(a * 1.5));
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * Load the global radar tiles for a frame and composite them onto a canvas.
 */
async function compositeRadarTilesForFrame(
  manifest: RadarManifest,
  frame: { time: number; path: string },
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
    const url = getRadarTileUrlForFrame(
      manifest,
      frame,
      ZOOM_LEVEL,
      t.x,
      t.y,
      TILE_SIZE,
    );
    return () => loadImageWithRetry(url);
  });

  const results = await loadInBatches(tasks, TILE_BATCH_SIZE);

  const tilesTotal = tiles.length;
  const loadedTileCount = results.filter(
    (result) => result.status === "fulfilled",
  ).length;
  if (loadedTileCount === 0) {
    throw new Error("RainViewer returned no usable radar tiles");
  }

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

  if (loadedTileCount < tilesTotal) {
    // framesRef caches a frame's texture the first (and only) time it loads
    // — a partial composite here would pin transparent holes in the
    // animation rotation until the next RainViewer manifest refetch
    // (~10 min). Warn and drop the frame instead of caching a splotchy
    // result; loadFrame's caller already treats a rejected composite as a
    // skipped frame.
    console.warn(
      `[WeatherRadarOverlay] Incomplete tile coverage for frame ${frame.time}: ` +
        `${loadedTileCount}/${tilesTotal} tiles (` +
        `${Math.round((loadedTileCount / tilesTotal) * 100)}%). Dropping frame.`,
    );
    throw new Error(
      `Incomplete radar tile coverage: ${loadedTileCount}/${tilesTotal}`,
    );
  }

  boostRadarColors(ctx, CANVAS_SIZE, CANVAS_SIZE);
  return canvas;
}

function WeatherRadarOverlayInner({
  manifest,
  onAnimationState,
}: WeatherRadarOverlayProps) {
  const framesRef = useRef<Map<number, THREE.CanvasTexture>>(new Map());
  // loadedVersion bumps on each new frame load to trigger re-renders
  // without being in the animation effect's dependency array
  const [loadedVersion, setLoadedVersion] = useState(0);
  const [activeFrameIndex, setActiveFrameIndex] = useState(-1);
  const activeFrameRef = useRef(activeFrameIndex);
  activeFrameRef.current = activeFrameIndex;
  const [isPlaying, setIsPlaying] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  const materialRef = useRef<THREE.MeshBasicMaterial>(null);

  const allFrames = useMemo(() => getAllRadarFrames(manifest), [manifest]);
  const pastCount = manifest.radar.past.length;

  // Limit frames to MAX_FRAMES (take the latest ones)
  const framesToLoad = useMemo(() => {
    if (allFrames.length <= MAX_FRAMES) return allFrames.map((_, i) => i);
    // Take the last MAX_FRAMES frames (most recent)
    const startIdx = allFrames.length - MAX_FRAMES;
    return Array.from({ length: MAX_FRAMES }, (_, i) => startIdx + i);
  }, [allFrames]);

  const setFrame = useCallback((displayIndex: number) => {
    const loadedIndices = getLoadedFrameIndices(framesRef.current);
    const sourceIndex = loadedIndices[displayIndex];
    if (sourceIndex === undefined) return;
    setActiveFrameIndex(sourceIndex);
    setIsPlaying(false);
  }, []);

  const togglePlay = useCallback(() => {
    setIsPlaying((p) => !p);
  }, []);

  // Load frames progressively — NO eviction, just load up to MAX_FRAMES
  useEffect(() => {
    let cancelled = false;
    const map = new Map<number, THREE.CanvasTexture>();
    framesRef.current = map;
    setLoadedVersion(0);
    setActiveFrameIndex(-1);
    setIsLoading(true);

    const loadFrame = async (
      idx: number,
    ): Promise<THREE.CanvasTexture | null> => {
      if (cancelled) return null;
      const frame = allFrames[idx];
      if (!frame) return null;

      const canvas = await compositeRadarTilesForFrame(manifest, frame);
      if (cancelled) return null;

      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.needsUpdate = true;

      map.set(idx, tex);
      setLoadedVersion((v) => v + 1);
      return tex;
    };

    // Prefer the newest observation within the bounded set, then any latest
    // frame if a manifest contains nowcast data only.
    const latestIdx = selectInitialRadarFrameIndex(framesToLoad, pastCount);
    if (latestIdx === undefined) {
      setIsLoading(false);
      return;
    }

    const loadOrder = [
      latestIdx,
      ...framesToLoad.filter((index) => index !== latestIdx),
    ];
    const loadSequentially = async () => {
      let displayedFrame = false;
      for (let i = 0; i < loadOrder.length; i += FRAME_BATCH_SIZE) {
        if (cancelled) return;
        const batch = loadOrder.slice(i, i + FRAME_BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map((index) => loadFrame(index)),
        );

        if (!displayedFrame) {
          const firstLoaded = results.find(
            (result): result is PromiseFulfilledResult<THREE.CanvasTexture> =>
              result.status === "fulfilled" && result.value !== null,
          );
          if (firstLoaded && !cancelled) {
            const sourceIndex = batch[results.indexOf(firstLoaded)];
            setActiveFrameIndex(sourceIndex);
            setIsLoading(false);
            displayedFrame = true;
          }
        }

        if (!cancelled && i + FRAME_BATCH_SIZE < loadOrder.length) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
      if (!cancelled && !displayedFrame) setIsLoading(false);
    };

    void loadSequentially();

    return () => {
      cancelled = true;
      map.forEach((tex) => tex.dispose());
      map.clear();
    };
  }, [manifest, allFrames, pastCount, framesToLoad]);

  const hasAnimationFrames = framesRef.current.size >= 2;

  useEffect(() => {
    if (!isPlaying || activeFrameRef.current < 0) return;
    if (!hasAnimationFrames) return;

    let timeoutId: ReturnType<typeof setTimeout>;
    let stopped = false;

    const advance = () => {
      if (stopped) return;

      setActiveFrameIndex((prev) => {
        const frameMap = framesRef.current;
        if (frameMap.size < 2) return prev;

        const loadedIndices = getLoadedFrameIndices(frameMap);
        const currentPos = loadedIndices.indexOf(prev);
        const nextPos = (currentPos + 1) % loadedIndices.length;
        const next = loadedIndices[nextPos];

        const isLatest = next === pastCount - 1;
        if (!stopped) {
          timeoutId = setTimeout(advance, isLatest ? 2000 : 500);
        }
        return next;
      });
    };

    timeoutId = setTimeout(advance, 500);
    return () => {
      stopped = true;
      clearTimeout(timeoutId);
    };
  }, [isPlaying, pastCount, hasAnimationFrames]);

  // Update material texture when frame changes or new frames load
  useEffect(() => {
    const mat = materialRef.current;
    const tex = framesRef.current.get(activeFrameIndex);
    if (mat && tex) {
      mat.map = tex;
      mat.needsUpdate = true;
    }
  }, [activeFrameIndex, loadedVersion]);

  // Export animation state
  useEffect(() => {
    const loadedIndices = getLoadedFrameIndices(framesRef.current);
    onAnimationState?.({
      frameCount: loadedIndices.length,
      activeIndex: loadedIndices.indexOf(activeFrameIndex),
      isPlaying,
      isLoading,
      timestamps: loadedIndices.map((index) => allFrames[index].time),
      isNowcast: loadedIndices.map((index) => index >= pastCount),
      hasNexrad: false,
      setFrame,
      togglePlay,
    });
  }, [
    allFrames,
    activeFrameIndex,
    isPlaying,
    isLoading,
    pastCount,
    onAnimationState,
    setFrame,
    togglePlay,
    loadedVersion,
  ]);

  const geometry = useMemo(
    () => new THREE.SphereGeometry(1.007, 128, 64, Math.PI),
    [],
  );

  useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  if (activeFrameIndex < 0 || !framesRef.current.has(activeFrameIndex))
    return null;

  return (
    <mesh geometry={geometry} renderOrder={GLOBE_LAYER_ORDER.surfaceTexture}>
      <meshBasicMaterial
        ref={materialRef}
        opacity={0.88}
        blending={THREE.NormalBlending}
        side={THREE.FrontSide}
        map={framesRef.current.get(activeFrameIndex) ?? null}
        {...GLOBE_OVERLAY_MATERIAL}
      />
    </mesh>
  );
}

export const WeatherRadarOverlay = React.memo(
  WeatherRadarOverlayInner,
  (prev, next) =>
    prev.manifest === next.manifest &&
    prev.onAnimationState === next.onAnimationState,
);
