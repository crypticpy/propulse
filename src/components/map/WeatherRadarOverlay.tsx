/**
 * WeatherRadarOverlay Component
 *
 * Renders animated RainViewer precipitation radar data on the 3D globe.
 * Loads frames (past + nowcast) as CanvasTexture objects, auto-cycles through
 * them, and exports animation control state for an external scrubber UI.
 *
 * Uses zoom 3 (8×8 = 64 tiles per frame, 2048px canvas) to keep request
 * count manageable. Max 6 loaded frames to limit GPU memory.
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

/** Zoom 3: 8×8 = 64 tiles, 2048px canvas */
const ZOOM_LEVEL = 3;
const TILES_PER_AXIS = 8;
const TILE_SIZE = 256;
const CANVAS_SIZE = TILES_PER_AXIS * TILE_SIZE; // 2048
/** Tiles to load concurrently — keep low to avoid 429 rate limits */
const TILE_BATCH_SIZE = 16;
/** Load one frame at a time to avoid hammering the API */
const FRAME_BATCH_SIZE = 1;
/** Max loaded frame textures in GPU memory */
const MAX_LOADED_FRAMES = 6;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const loader = new THREE.ImageLoader();
    loader.setCrossOrigin("anonymous");
    loader.load(url, resolve, undefined, reject);
  });
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
 * Load all z=3 radar tiles for a frame and composite them onto a canvas.
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
    const url = getRadarTileUrlForFrame(manifest, frame, ZOOM_LEVEL, t.x, t.y);
    return () => loadImage(url);
  });

  const results = await loadInBatches(tasks, TILE_BATCH_SIZE);

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

  boostRadarColors(ctx, CANVAS_SIZE, CANVAS_SIZE);
  return canvas;
}

function WeatherRadarOverlayInner({
  manifest,
  onAnimationState,
}: WeatherRadarOverlayProps) {
  const framesRef = useRef<Map<number, THREE.CanvasTexture>>(new Map());
  const [loadedCount, setLoadedCount] = useState(0);
  const [activeFrameIndex, setActiveFrameIndex] = useState(-1);
  const activeFrameRef = useRef(activeFrameIndex);
  activeFrameRef.current = activeFrameIndex;
  const [isPlaying, setIsPlaying] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  const materialRef = useRef<THREE.MeshBasicMaterial>(null);

  const allFrames = useMemo(() => getAllRadarFrames(manifest), [manifest]);
  const pastCount = manifest.radar.past.length;

  const setFrame = useCallback((idx: number) => {
    setActiveFrameIndex(idx);
    setIsPlaying(false);
  }, []);

  const togglePlay = useCallback(() => {
    setIsPlaying((p) => !p);
  }, []);

  // Load frames progressively
  useEffect(() => {
    let cancelled = false;
    const map = new Map<number, THREE.CanvasTexture>();
    framesRef.current = map;
    setLoadedCount(0);
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

      // Evict oldest texture to stay within GPU memory cap
      if (map.size >= MAX_LOADED_FRAMES) {
        const protectedIndices = new Set([activeFrameRef.current, latestIdx]);
        let oldestKey: number | null = null;
        for (const key of map.keys()) {
          if (
            !protectedIndices.has(key) &&
            (oldestKey === null || key < oldestKey)
          ) {
            oldestKey = key;
          }
        }
        if (oldestKey !== null) {
          map.get(oldestKey)?.dispose();
          map.delete(oldestKey);
        }
      }

      map.set(idx, tex);
      setLoadedCount(map.size);
      return tex;
    };

    const latestIdx = pastCount - 1;
    loadFrame(latestIdx)
      .then(() => {
        if (cancelled) return;
        setActiveFrameIndex(latestIdx);
        setIsLoading(false);

        const remaining = allFrames
          .map((_, i) => i)
          .filter((i) => i !== latestIdx);

        const loadBatches = async () => {
          for (let i = 0; i < remaining.length; i += FRAME_BATCH_SIZE) {
            if (cancelled) return;
            const batch = remaining.slice(i, i + FRAME_BATCH_SIZE);
            await Promise.allSettled(batch.map((idx) => loadFrame(idx)));
          }
        };

        loadBatches();
      })
      .catch(() => {
        // Radar overlay is non-critical
      });

    return () => {
      cancelled = true;
      map.forEach((tex) => tex.dispose());
      map.clear();
    };
  }, [manifest, allFrames, pastCount]);

  // Animation timer
  useEffect(() => {
    if (!isPlaying || loadedCount < 2 || activeFrameRef.current < 0) return;

    let timeoutId: ReturnType<typeof setTimeout>;

    const advance = () => {
      setActiveFrameIndex((prev) => {
        const totalFrames = allFrames.length;
        let next = (prev + 1) % totalFrames;

        let attempts = 0;
        while (!framesRef.current.has(next) && attempts < totalFrames) {
          next = (next + 1) % totalFrames;
          attempts++;
        }

        if (!framesRef.current.has(next)) return prev;

        const isLatest = next === pastCount - 1;
        timeoutId = setTimeout(advance, isLatest ? 2000 : 500);
        return next;
      });
    };

    timeoutId = setTimeout(advance, 500);
    return () => clearTimeout(timeoutId);
  }, [isPlaying, loadedCount, allFrames.length, pastCount]);

  // Update material texture
  useEffect(() => {
    const mat = materialRef.current;
    const tex = framesRef.current.get(activeFrameIndex);
    if (mat && tex) {
      mat.map = tex;
      mat.needsUpdate = true;
    }
  }, [activeFrameIndex, loadedCount]);

  // Export animation state
  useEffect(() => {
    onAnimationState?.({
      frameCount: allFrames.length,
      activeIndex: activeFrameIndex,
      isPlaying,
      isLoading,
      timestamps: allFrames.map((f) => f.time),
      isNowcast: allFrames.map((_, i) => i >= pastCount),
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
    <mesh geometry={geometry} renderOrder={6}>
      <meshBasicMaterial
        ref={materialRef}
        transparent
        opacity={0.88}
        depthWrite={false}
        depthTest={false}
        blending={THREE.NormalBlending}
        side={THREE.FrontSide}
        map={framesRef.current.get(activeFrameIndex) ?? null}
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
