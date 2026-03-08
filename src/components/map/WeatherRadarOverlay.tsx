/**
 * WeatherRadarOverlay Component
 *
 * Renders animated dual-source precipitation radar data on the 3D globe:
 * - RainViewer global base layer at zoom 4 (4096x4096 canvas, 256 tiles)
 * - IEM NEXRAD US overlay at zoom 5 composited on top (~56 tiles per frame)
 *
 * NEXRAD provides 1km resolution for the US, while RainViewer fills globally.
 * Falls back to RainViewer-only at zoom 3 (2048px) on GPUs with small max texture size.
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
import {
  NEXRAD_FRAME_PRODUCTS,
  NEXRAD_FRAME_COUNT,
  NEXRAD_US_BOUNDS_Z5,
  getNexradTileUrl,
} from "@/lib/api/nexrad";
import type { NexradProduct } from "@/lib/api/nexrad";

/** Radar animation control state, exported for scrubber UI */
export interface RadarAnimationState {
  frameCount: number;
  activeIndex: number;
  isPlaying: boolean;
  isLoading: boolean;
  timestamps: number[];
  isNowcast: boolean[];
  /** Whether NEXRAD tiles were composited for this session */
  hasNexrad: boolean;
  setFrame: (idx: number) => void;
  togglePlay: () => void;
}

interface WeatherRadarOverlayProps {
  manifest: RadarManifest;
  /** Called when animation state changes */
  onAnimationState?: (state: RadarAnimationState) => void;
  /** Whether to load NEXRAD US overlay tiles (default: true) */
  enableNexrad?: boolean;
}

/* ── Resolution tiers ────────────────────────────────────────────── */

/** Check WebGL max texture size to determine if we can use 4096px canvas */
function getMaxTextureSize(): number {
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl");
    if (!gl) return 2048;
    const size = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    // Lose context immediately to free resources
    const ext = gl.getExtension("WEBGL_lose_context");
    ext?.loseContext();
    return size ?? 2048;
  } catch {
    return 2048;
  }
}

/** High-res tier (zoom 4, 4096px) — used when GPU supports it */
const ZOOM_HIGH = 4;
const TILES_HIGH = 2 ** ZOOM_HIGH; // 16
const CANVAS_HIGH = TILES_HIGH * 256; // 4096

/** Low-res fallback (zoom 3, 2048px) — for weak GPUs */
const ZOOM_LOW = 3;
const TILES_LOW = 2 ** ZOOM_LOW; // 8
const CANVAS_LOW = TILES_LOW * 256; // 2048

/** NEXRAD zoom level */
const NEXRAD_ZOOM = 5;

const TILE_SIZE = 256;
/** Number of tiles to load concurrently */
const TILE_BATCH_SIZE = 48;
/** Number of frames to load concurrently */
const FRAME_BATCH_SIZE = 2;
/** Maximum number of loaded frame textures to keep in GPU memory */
const MAX_LOADED_FRAMES = 12;

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
 * Tuned down slightly for NEXRAD blending (already vivid colors).
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
    const satBoost = 1.4;
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
    data[i + 3] = Math.min(255, Math.round(a * 1.3));
  }

  ctx.putImageData(imageData, 0, 0);
}

/* ── NEXRAD tile grid ────────────────────────────────────────────── */

interface NexradTile {
  x: number;
  y: number;
}

/** Build the list of NEXRAD zoom-5 tiles covering the US bounding box */
function buildNexradTileList(): NexradTile[] {
  const { xMin, xMax, yMin, yMax } = NEXRAD_US_BOUNDS_Z5;
  const tiles: NexradTile[] = [];
  for (let y = yMin; y <= yMax; y++) {
    for (let x = xMin; x <= xMax; x++) {
      tiles.push({ x, y });
    }
  }
  return tiles;
}

const NEXRAD_TILES = buildNexradTileList();

/**
 * For a given RainViewer frame timestamp, find the closest NEXRAD product.
 * NEXRAD products are at 5-min intervals going back 55 minutes.
 */
function findClosestNexradProduct(frameTimestamp: number): NexradProduct {
  const now = Math.floor(Date.now() / 1000);
  const ageSeconds = now - frameTimestamp;
  const ageMinutes = Math.max(0, Math.round(ageSeconds / 60));

  // NEXRAD products: 0, 5, 10, ..., 55 minutes ago
  // Snap to nearest 5-minute interval
  const snapped = Math.min(55, Math.round(ageMinutes / 5) * 5);
  const idx = NEXRAD_FRAME_COUNT - 1 - snapped / 5;
  const clampedIdx = Math.max(0, Math.min(NEXRAD_FRAME_COUNT - 1, idx));
  return NEXRAD_FRAME_PRODUCTS[clampedIdx];
}

/* ── Frame compositing ───────────────────────────────────────────── */

/**
 * Composite RainViewer tiles onto a canvas, then overlay NEXRAD US tiles.
 *
 * RainViewer layer: zoom-level tiles covering the full globe.
 * NEXRAD layer: zoom-5 tiles for the US, drawn on top of RainViewer pixels.
 *
 * At zoom 4 canvas (4096px):
 *   - Each zoom-4 tile = 256px
 *   - Each zoom-5 tile covers half a zoom-4 tile = 128px in the canvas
 *   - Zoom-5 tile (x5, y5) maps to canvas position: (x5 * 128, y5 * 128)
 */
async function compositeRadarFrame(
  manifest: RadarManifest,
  frame: { time: number; path: string },
  zoomLevel: number,
  tilesPerAxis: number,
  canvasSize: number,
  includeNexrad: boolean,
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = canvasSize;
  canvas.height = canvasSize;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Failed to get 2d context");

  // 1) Load and composite RainViewer global tiles
  const rvTiles: { x: number; y: number }[] = [];
  for (let y = 0; y < tilesPerAxis; y++) {
    for (let x = 0; x < tilesPerAxis; x++) {
      rvTiles.push({ x, y });
    }
  }

  const rvTasks = rvTiles.map((t) => {
    const url = getRadarTileUrlForFrame(manifest, frame, zoomLevel, t.x, t.y);
    return () => loadImage(url);
  });

  const rvResults = await loadInBatches(rvTasks, TILE_BATCH_SIZE);

  rvResults.forEach((result, i) => {
    if (result.status === "fulfilled") {
      const tile = rvTiles[i];
      ctx.drawImage(
        result.value,
        tile.x * TILE_SIZE,
        tile.y * TILE_SIZE,
        TILE_SIZE,
        TILE_SIZE,
      );
    }
  });

  // 2) Overlay NEXRAD US tiles (zoom 5) on top of RainViewer
  if (includeNexrad && zoomLevel === ZOOM_HIGH) {
    const product = findClosestNexradProduct(frame.time);

    const nxTasks = NEXRAD_TILES.map((t) => {
      const url = getNexradTileUrl(product, NEXRAD_ZOOM, t.x, t.y);
      return () => loadImage(url);
    });

    const nxResults = await loadInBatches(nxTasks, TILE_BATCH_SIZE);

    // Each zoom-5 tile at 256px original drawn into 128x128 on the zoom-4 canvas
    const scaledSize = canvasSize / 2 ** NEXRAD_ZOOM; // 4096 / 32 = 128
    nxResults.forEach((result, i) => {
      if (result.status === "fulfilled") {
        const tile = NEXRAD_TILES[i];
        ctx.drawImage(
          result.value,
          tile.x * scaledSize,
          tile.y * scaledSize,
          scaledSize,
          scaledSize,
        );
      }
    });
  }

  // 3) Post-process colors
  boostRadarColors(ctx, canvasSize, canvasSize);

  return canvas;
}

/* ── R3F Component ───────────────────────────────────────────────── */

function WeatherRadarOverlayInner({
  manifest,
  onAnimationState,
  enableNexrad = true,
}: WeatherRadarOverlayProps) {
  // Determine resolution tier once on mount
  const tier = useMemo(() => {
    const maxTex = getMaxTextureSize();
    if (maxTex >= 4096) {
      return {
        zoom: ZOOM_HIGH,
        tiles: TILES_HIGH,
        canvas: CANVAS_HIGH,
        nexrad: enableNexrad,
      };
    }
    // Fallback: zoom 3, no NEXRAD
    return {
      zoom: ZOOM_LOW,
      tiles: TILES_LOW,
      canvas: CANVAS_LOW,
      nexrad: false,
    };
    // enableNexrad is a prop, but we only read it once at mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

      const canvas = await compositeRadarFrame(
        manifest,
        frame,
        tier.zoom,
        tier.tiles,
        tier.canvas,
        tier.nexrad,
      );
      if (cancelled) return null;

      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.needsUpdate = true;

      // Evict oldest texture BEFORE adding new one to stay within GPU memory cap
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
  }, [manifest, allFrames, pastCount, tier]);

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
      hasNexrad: tier.nexrad,
      setFrame,
      togglePlay,
    });
  }, [
    allFrames,
    activeFrameIndex,
    isPlaying,
    isLoading,
    pastCount,
    tier.nexrad,
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

  // Dispose sphere geometry on unmount
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
    prev.onAnimationState === next.onAnimationState &&
    prev.enableNexrad === next.enableNexrad,
);
