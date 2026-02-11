/**
 * Lightning Strike API client
 * Fetches recent global lightning strikes via Blitzortung proxy
 */

/**
 * Represents a single lightning strike event
 */
export interface LightningStrike {
  /** Latitude in degrees */
  lat: number;
  /** Longitude in degrees */
  lon: number;
  /** Unix timestamp in milliseconds */
  time: number;
  /** Peak current in kilo-amperes */
  currentKA: number;
}

/**
 * Raw strike shape from the proxy endpoint
 */
interface ProxyStrike {
  lat: number;
  lon: number;
  time: number;
  current_kA: number;
}

/**
 * Proxy response structure
 */
interface LightningProxyResponse {
  strikes: ProxyStrike[];
  error?: string;
}

/**
 * Fetch recent global lightning strikes from Blitzortung via proxy
 * Returns an empty array on failure to keep UI resilient
 *
 * @returns Promise<LightningStrike[]> - Array of lightning strike events
 */
export async function fetchLightningStrikes(
  signal?: AbortSignal,
): Promise<LightningStrike[]> {
  const response = await fetch("/api/lightning/strikes", { signal });

  if (!response.ok) {
    throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
  }

  const data: LightningProxyResponse = await response.json();

  if (!Array.isArray(data.strikes)) {
    return [];
  }

  return data.strikes.map((s) => ({
    lat: s.lat,
    lon: s.lon,
    time: s.time,
    currentKA: s.current_kA,
  }));
}
