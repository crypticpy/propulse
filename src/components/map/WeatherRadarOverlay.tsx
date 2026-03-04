/**
 * WeatherRadarOverlay Component
 *
 * Renders animated RainViewer precipitation radar data on the 3D globe.
 * Loads all available frames (past + nowcast) as separate CanvasTexture objects,
 * auto-cycles through them, and exports animation control state for an
 * external scrubber UI rendered outside the R3F Canvas.
 *
 * Frame loading strategy:
 * 1. Load the latest past frame first for immediate display
 * 2. Load remaining frames progressively in background batches
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
  setFrame: (idx: number) => void;
  togglePlay: () => void;
}

interface WeatherRadarOverlayProps {
  manifest: RadarManifest;
  /** Called when animation state changes */
  onAnimationState?: (state: RadarAnimationState) => void;
}

/** Zoom level 4: 2^4 = 16 tiles per axis, 256 total */
const ZOOM_LEVEL = 4;
const TILES_PER_AXIS = 2 ** ZOOM_LEVEL; // 16
const TILE_SIZE = 256;
/** Canvas size — 16 tiles * 256px = 4096px per axis */
const CANVAS_SIZE = TILES_PER_AXIS * TILE_SIZE; // 4096
/** Number of tiles to load concurrently */
const TILE_BATCH_SIZE = 32;
/** Number of frames to load concurrently */
const FRAME_BATCH_SIZE = 3;

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
 * Load all z=4 radar tiles for a specific frame and composite them onto a canvas.
 *
 * Tile layout at z=4: 16x16 grid (x: 0..15, y: 0..15)
 * The canvas represents lon -180..180 left-to-right, lat ~85..-85 top-to-bottom.
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

  // Boost color vibrancy after compositing all tiles
  boostRadarColors(ctx, CANVAS_SIZE, CANVAS_SIZE);

  return canvas;
}

function WeatherRadarOverlayInner({
  manifest,
  onAnimationState,
}: WeatherRadarOverlayProps) {
  // Frame textures indexed by their position in the allFrames array
  const framesRef = useRef<Map<number, THREE.CanvasTexture>>(new Map());
  const [loadedCount, setLoadedCount] = useState(0);
  const [activeFrameIndex, setActiveFrameIndex] = useState(-1);
  const activeFrameRef = useRef(activeFrameIndex);
  activeFrameRef.current = activeFrameIndex;
  const [isPlaying, setIsPlaying] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  const materialRef = useRef<THREE.MeshBasicMaterial>(null);

  // Get all frames in chronological order
  const allFrames = useMemo(() => getAllRadarFrames(manifest), [manifest]);
  const pastCount = manifest.radar.past.length;

  // Stable callbacks for external control
  const setFrame = useCallback((idx: number) => {
    setActiveFrameIndex(idx);
    setIsPlaying(false);
  }, []);

  const togglePlay = useCallback(() => {
    setIsPlaying((p) => !p);
  }, []);

  // Load frames progressively: latest past frame first, then rest in batches
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

      map.set(idx, tex);
      setLoadedCount(map.size);
      return tex;
    };

    // Load latest past frame first for immediate display
    const latestIdx = pastCount - 1;
    loadFrame(latestIdx)
      .then(() => {
        if (cancelled) return;
        setActiveFrameIndex(latestIdx);
        setIsLoading(false);

        // Then load remaining frames in batches
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
        // Radar overlay is non-critical — silently fail
      });

    return () => {
      cancelled = true;
      // Dispose all textures
      map.forEach((tex) => tex.dispose());
      map.clear();
    };
  }, [manifest, allFrames, pastCount]);

  // Animation timer: auto-advance frames
  useEffect(() => {
    if (!isPlaying || loadedCount < 2 || activeFrameRef.current < 0) return;

    let timeoutId: ReturnType<typeof setTimeout>;

    const advance = () => {
      setActiveFrameIndex((prev) => {
        const totalFrames = allFrames.length;
        let next = (prev + 1) % totalFrames;

        // Skip unloaded frames
        let attempts = 0;
        while (!framesRef.current.has(next) && attempts < totalFrames) {
          next = (next + 1) % totalFrames;
          attempts++;
        }

        // If we couldn't find a loaded frame, stay put
        if (!framesRef.current.has(next)) return prev;

        // Pause longer on the latest past frame (most current data)
        const isLatest = next === pastCount - 1;
        timeoutId = setTimeout(advance, isLatest ? 2000 : 500);
        return next;
      });
    };

    timeoutId = setTimeout(advance, 500);
    return () => clearTimeout(timeoutId);
  }, [isPlaying, loadedCount, allFrames.length, pastCount]);

  // Update material texture when active frame changes
  useEffect(() => {
    const mat = materialRef.current;
    const tex = framesRef.current.get(activeFrameIndex);
    if (mat && tex) {
      mat.map = tex;
      mat.needsUpdate = true;
    }
  }, [activeFrameIndex, loadedCount]);

  // Export animation state for scrubber UI
  useEffect(() => {
    onAnimationState?.({
      frameCount: allFrames.length,
      activeIndex: activeFrameIndex,
      isPlaying,
      isLoading,
      timestamps: allFrames.map((f) => f.time),
      isNowcast: allFrames.map((_, i) => i >= pastCount),
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

  /**
   * Sphere geometry slightly above Earth (radius 1.007).
   *
   * phiStart = Math.PI rotates the UV mapping by 180 degrees so that
   * u=0 maps to lon=-180 (matching the tile grid where x=0 is the
   * western hemisphere).
   */
  const geometry = useMemo(
    () => new THREE.SphereGeometry(1.007, 128, 64, Math.PI),
    [],
  );

  if (activeFrameIndex < 0 || !framesRef.current.has(activeFrameIndex))
    return null;

  return (
    <mesh geometry={geometry} renderOrder={6}>
      <meshBasicMaterial
        ref={materialRef}
        transparent
        opacity={0.88}
        depthWrite={false}
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
