/**
 * NASA FIRMS Fire Hotspot API client
 * Fetches active fire hotspots worldwide via FIRMS proxy
 */

/**
 * Represents a single active fire hotspot detected by VIIRS
 */
export interface FireHotspot {
  /** Latitude in degrees */
  lat: number;
  /** Longitude in degrees */
  lon: number;
  /** Brightness temperature in Kelvin */
  brightness: number;
  /** Detection confidence: "nominal", "low", or "high" */
  confidence: string;
  /** Fire radiative power in MW */
  frp: number;
}

/**
 * Proxy response structure
 */
interface FireProxyResponse {
  hotspots: FireHotspot[];
  error?: string;
}

/**
 * Fetch active fire hotspots from NASA FIRMS via proxy
 * Returns an empty array on failure to keep UI resilient
 *
 * @returns Promise<FireHotspot[]> - Array of fire hotspot detections
 */
export async function fetchFireHotspots(
  signal?: AbortSignal,
): Promise<FireHotspot[]> {
  const response = await fetch("/api/fires/hotspots", { signal });

  if (!response.ok) {
    throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
  }

  const data: FireProxyResponse = await response.json();

  if (!Array.isArray(data.hotspots)) {
    return [];
  }

  return data.hotspots;
}
