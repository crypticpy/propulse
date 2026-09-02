export type FlatMapRetainedLayer = "base" | "science" | "live" | "effects";

export interface FlatMapTileRangeSnapshot {
  zoom: number;
  visible: { xStart: number; xEnd: number; yStart: number; yEnd: number };
  requested: { xStart: number; xEnd: number; yStart: number; yEnd: number };
  navigationActive: boolean;
}

export interface FlatMapDiagnosticsSnapshot {
  paints: Record<FlatMapRetainedLayer, number>;
  tiles: FlatMapTileRangeSnapshot | null;
  debugTileBounds: boolean;
}

const paints: Record<FlatMapRetainedLayer, number> = {
  base: 0,
  science: 0,
  live: 0,
  effects: 0,
};

let tileRange: FlatMapTileRangeSnapshot | null = null;
let debugTileBounds = false;

/** Record a retained-surface paint without coupling production rendering to UI state. */
export function recordFlatMapLayerPaint(layer: FlatMapRetainedLayer): void {
  if (!import.meta.env.DEV) return;
  paints[layer] += 1;
}

/** Keep the most recent visible/requested tile window available to dev tooling. */
export function recordFlatMapTileRange(
  snapshot: FlatMapTileRangeSnapshot,
): void {
  if (!import.meta.env.DEV) return;
  tileRange = snapshot;
}

export function shouldDrawFlatMapTileBounds(): boolean {
  return import.meta.env.DEV && debugTileBounds;
}

export function getFlatMapDiagnosticsSnapshot(): FlatMapDiagnosticsSnapshot {
  return {
    paints: { ...paints },
    tiles: tileRange
      ? {
          ...tileRange,
          visible: { ...tileRange.visible },
          requested: { ...tileRange.requested },
        }
      : null,
    debugTileBounds,
  };
}

export function resetFlatMapDiagnostics(): void {
  paints.base = 0;
  paints.science = 0;
  paints.live = 0;
  paints.effects = 0;
  tileRange = null;
}

export function setFlatMapTileBoundsDebug(enabled: boolean): void {
  debugTileBounds = enabled;
}

declare global {
  interface Window {
    __propulseFlatMapDiagnostics?: {
      snapshot: typeof getFlatMapDiagnosticsSnapshot;
      reset: typeof resetFlatMapDiagnostics;
      setTileBounds: typeof setFlatMapTileBoundsDebug;
    };
  }
}

if (import.meta.env.DEV && typeof window !== "undefined") {
  window.__propulseFlatMapDiagnostics = {
    snapshot: getFlatMapDiagnosticsSnapshot,
    reset: resetFlatMapDiagnostics,
    setTileBounds: setFlatMapTileBoundsDebug,
  };
}
