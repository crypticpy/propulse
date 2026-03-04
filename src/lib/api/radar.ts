/**
 * RainViewer Weather Radar API client
 * Free global precipitation radar tiles with 10-minute update interval
 */

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
 * Tile scheme: {host}{path}/256/{z}/{x}/{y}/6/1_1.png
 * Color scheme 6 = universal blue, style 1_1 = smooth + snow
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
  return `${manifest.host}${latest.path}/256/${z}/${x}/${y}/6/1_1.png`;
}

/** Get tile URL for a specific frame */
export function getRadarTileUrlForFrame(
  manifest: RadarManifest,
  frame: { time: number; path: string },
  z: number,
  x: number,
  y: number,
): string {
  return `${manifest.host}${frame.path}/256/${z}/${x}/${y}/6/1_1.png`;
}

/** Get all frames in chronological order (past + nowcast) */
export function getAllRadarFrames(
  manifest: RadarManifest,
): { time: number; path: string }[] {
  return [...manifest.radar.past, ...manifest.radar.nowcast];
}
