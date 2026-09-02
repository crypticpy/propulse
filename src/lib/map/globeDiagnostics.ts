import type {
  GlobeTileLayer,
  GlobeTileRuntimeSnapshot,
} from "@/lib/map/globeTileRuntime";

export type GlobeCameraPhase = "moving" | "settling" | "stationary";

export interface GlobeFrameDiagnostic {
  timestampMs: number;
  frameTimeMs: number;
  cameraPhase: GlobeCameraPhase;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  sceneVisibleLayers: Record<string, number>;
}

export interface GlobeDiagnosticsSnapshot {
  frameTimeMs: { samples: number; p50: number; p95: number };
  cameraPhase: GlobeCameraPhase;
  webgl: {
    drawCalls: number;
    triangles: number;
    geometries: number;
    textures: number;
  };
  sceneVisibleLayers: Record<string, number>;
  rendererInvalidationsPerSecond: Record<GlobeTileLayer, number>;
  tiles: Partial<Record<GlobeTileLayer, GlobeTileRuntimeSnapshot>>;
}

type TileReader = () => GlobeTileRuntimeSnapshot;

const MAX_FRAME_SAMPLES = 600;
const frameSamples: number[] = [];
const invalidations: Record<GlobeTileLayer, number[]> = {
  imagery: [],
  labels: [],
};
const tileReaders = new Map<GlobeTileLayer, TileReader>();
let latestFrame: GlobeFrameDiagnostic | null = null;

function percentile(values: readonly number[], value: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(
    0,
    Math.min(sorted.length - 1, Math.ceil((value / 100) * sorted.length) - 1),
  );
  return sorted[index];
}

export function recordGlobeFrame(sample: GlobeFrameDiagnostic): void {
  if (!Number.isFinite(sample.frameTimeMs) || sample.frameTimeMs <= 0) return;
  latestFrame = sample;
  frameSamples.push(sample.frameTimeMs);
  if (frameSamples.length > MAX_FRAME_SAMPLES) frameSamples.shift();
}

export function recordGlobeTileInvalidation(
  layer: GlobeTileLayer,
  timestampMs = performance.now(),
): void {
  const cutoff = timestampMs - 1000;
  const timestamps = invalidations[layer];
  let firstRecent = 0;
  while (
    firstRecent < timestamps.length &&
    timestamps[firstRecent] <= cutoff
  ) {
    firstRecent += 1;
  }
  if (firstRecent > 0) timestamps.splice(0, firstRecent);
  timestamps.push(timestampMs);
}

export function registerGlobeTileDiagnostics(
  layer: GlobeTileLayer,
  reader: TileReader,
): () => void {
  tileReaders.set(layer, reader);
  return () => {
    if (tileReaders.get(layer) === reader) tileReaders.delete(layer);
  };
}

export function resetGlobeDiagnostics(): void {
  frameSamples.length = 0;
  invalidations.imagery.length = 0;
  invalidations.labels.length = 0;
  latestFrame = null;
}

export function getGlobeDiagnosticsSnapshot(
  timestampMs = performance.now(),
): GlobeDiagnosticsSnapshot {
  const invalidationRates = {} as Record<GlobeTileLayer, number>;
  for (const layer of ["imagery", "labels"] as const) {
    const recent = invalidations[layer].filter(
      (timestamp) => timestamp > timestampMs - 1000 && timestamp <= timestampMs,
    );
    invalidations[layer] = recent;
    invalidationRates[layer] = recent.length;
  }

  const tiles: Partial<Record<GlobeTileLayer, GlobeTileRuntimeSnapshot>> = {};
  for (const [layer, reader] of tileReaders) tiles[layer] = reader();

  return {
    frameTimeMs: {
      samples: frameSamples.length,
      p50: percentile(frameSamples, 50),
      p95: percentile(frameSamples, 95),
    },
    cameraPhase: latestFrame?.cameraPhase ?? "stationary",
    webgl: {
      drawCalls: latestFrame?.drawCalls ?? 0,
      triangles: latestFrame?.triangles ?? 0,
      geometries: latestFrame?.geometries ?? 0,
      textures: latestFrame?.textures ?? 0,
    },
    sceneVisibleLayers: { ...(latestFrame?.sceneVisibleLayers ?? {}) },
    rendererInvalidationsPerSecond: invalidationRates,
    tiles,
  };
}

export interface PropulseGlobeDiagnosticsApi {
  snapshot: typeof getGlobeDiagnosticsSnapshot;
  reset: typeof resetGlobeDiagnostics;
}

declare global {
  interface Window {
    __propulseGlobeDiagnostics?: PropulseGlobeDiagnosticsApi;
  }
}

if (import.meta.env.DEV && typeof window !== "undefined") {
  window.__propulseGlobeDiagnostics = {
    snapshot: getGlobeDiagnosticsSnapshot,
    reset: resetGlobeDiagnostics,
  };
}
