/**
 * RainViewer Weather Radar API client
 * Free global precipitation radar tiles with 10-minute update interval
 * Used as global fallback when IEM NEXRAD (US-only) is unavailable.
 */

/** Active radar data source */
export type RadarSource = "nexrad" | "rainviewer";

/**
 * RainViewer color/options path segment.
 * Color 6 = universal blue. Options `0_1` = original (no smooth) + snow —
 * sharper precip edges than the previous `1_1` smooth style.
 */
export const RAINVIEWER_TILE_STYLE = "6/0_1" as const;

export interface RadarManifest {
  /** Base host for tile URLs */
  host: string;
  /** Available radar frames (newest last) */
  radar: {
    past: { time: number; path: string }[];
    nowcast: { time: number; path: string }[];
  };
}

/**
 * Fetch the latest RainViewer manifest to get tile URLs
 */
export async function fetchRadarManifest(
  signal?: AbortSignal,
): Promise<RadarManifest> {
  const response = await fetch(
    "https://api.rainviewer.com/public/weather-maps.json",
    { signal },
  );
  if (!response.ok)
    throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
  return response.json();
}

/**
 * Get the tile URL for the latest radar frame
 * Tile scheme: {host}{path}/{size}/{z}/{x}/{y}/{color}/{options}.png
 */
export function getRadarTileUrl(
  manifest: RadarManifest,
  z: number,
  x: number,
  y: number,
): string {
  const frames = manifest.radar.past;
  const latest = frames[frames.length - 1];
  if (!latest) return "";
  return `${manifest.host}${latest.path}/256/${z}/${x}/${y}/${RAINVIEWER_TILE_STYLE}.png`;
}

/** Get tile URL for a specific frame */
export function getRadarTileUrlForFrame(
  manifest: RadarManifest,
  frame: { time: number; path: string },
  z: number,
  x: number,
  y: number,
  tileSize: 256 | 512 = 256,
): string {
  return `${manifest.host}${frame.path}/${tileSize}/${z}/${x}/${y}/${RAINVIEWER_TILE_STYLE}.png`;
}

/** Get all frames in chronological order (past + nowcast) */
export function getAllRadarFrames(
  manifest: RadarManifest,
): { time: number; path: string }[] {
  return [...manifest.radar.past, ...manifest.radar.nowcast];
}
