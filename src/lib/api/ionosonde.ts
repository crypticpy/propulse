/**
 * Ionosonde Data Client
 *
 * Provides real-time ionosonde measurements from global ionosonde networks.
 * Ionosondes measure the actual state of the ionosphere by sending radio pulses
 * and analyzing their reflections.
 *
 * Key measurements:
 * - foF2: Critical frequency of F2 layer (MHz) - highest frequency reflected vertically
 * - MUF3000: Maximum Usable Frequency for a 3000km path
 * - hmF2: Peak height of F2 layer (km)
 *
 * Data source: prop.kc2g.com (aggregates GIRO network data)
 */

import type { ApiError } from "./types";

/**
 * Ionosonde station with current readings
 */
export interface IonosondeStation {
  /** Unique station identifier */
  id: string;
  /** Station name/location */
  name: string;
  /** Latitude in decimal degrees */
  lat: number;
  /** Longitude in decimal degrees */
  lon: number;
}

/**
 * Individual ionosonde reading with all measurements
 */
export interface IonosondeReading {
  /** Station identifier */
  id: string;
  /** Station name */
  name: string;
  /** Station latitude */
  lat: number;
  /** Station longitude */
  lon: number;
  /** F2 layer critical frequency in MHz */
  foF2: number;
  /** Maximum Usable Frequency for 3000km path in MHz */
  muf3000: number;
  /** F2 layer peak height in km (optional) */
  hmF2?: number;
  /** Data confidence score (0-100) */
  confidence: number;
  /** ISO 8601 timestamp of measurement */
  timestamp: string;
}

/**
 * Complete ionosonde data response
 */
export interface IonosondeData {
  /** Array of station readings */
  stations: IonosondeReading[];
  /** Last data update timestamp */
  lastUpdate: Date;
  /** Data source identifier */
  source: string;
}

/**
 * API response structure from our proxy
 */
interface IonosondeApiResponse {
  stations: IonosondeReading[];
  lastUpdate: string;
  source: string;
}

/**
 * Fetch ionosonde data from our API proxy
 *
 * @returns Promise<IonosondeData> - Station readings with metadata
 * @throws ApiError if the request fails
 *
 * @example
 * ```typescript
 * const data = await fetchIonosondeData();
 * console.log(`${data.stations.length} stations reporting`);
 * ```
 */
export async function fetchIonosondeData(): Promise<IonosondeData> {
  const url = "/api/solar/ionosonde";

  try {
    const response = await fetch(url);

    if (!response.ok) {
      const error: ApiError = {
        message: `HTTP error ${response.status}: ${response.statusText}`,
        status: response.status,
        endpoint: "ionosonde",
      };
      throw error;
    }

    const data: IonosondeApiResponse = await response.json();

    return {
      stations: data.stations,
      lastUpdate: new Date(data.lastUpdate),
      source: data.source,
    };
  } catch (error) {
    if ((error as ApiError).endpoint) {
      throw error;
    }

    const apiError: ApiError = {
      message:
        error instanceof Error ? error.message : "Unknown error occurred",
      endpoint: "ionosonde",
    };
    throw apiError;
  }
}

/**
 * Calculate distance between two points using Haversine formula
 *
 * @param lat1 - First point latitude
 * @param lon1 - First point longitude
 * @param lat2 - Second point latitude
 * @param lon2 - Second point longitude
 * @returns Distance in kilometers
 */
function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Find the closest ionosonde station to a given location
 *
 * @param lat - Target latitude
 * @param lon - Target longitude
 * @param stations - Array of ionosonde readings
 * @param maxDistance - Maximum distance in km (default 3000)
 * @returns Closest station or null if none within range
 *
 * @example
 * ```typescript
 * const closest = getClosestStation(45.0, -93.0, readings, 2000);
 * if (closest) {
 *   console.log(`Closest station: ${closest.name} at ${closest.foF2} MHz`);
 * }
 * ```
 */
export function getClosestStation(
  lat: number,
  lon: number,
  stations: IonosondeReading[],
  maxDistance: number = 3000,
): IonosondeReading | null {
  if (!stations.length) return null;

  let closest: IonosondeReading | null = null;
  let minDistance = Infinity;

  for (const station of stations) {
    const distance = haversineDistance(lat, lon, station.lat, station.lon);
    if (distance < minDistance && distance <= maxDistance) {
      minDistance = distance;
      closest = station;
    }
  }

  return closest;
}

/**
 * Get measured MUF for a propagation path using nearby ionosonde data
 *
 * This function finds ionosonde stations near the path midpoint and
 * returns the measured MUF value. For long paths, it interpolates
 * between multiple stations.
 *
 * @param lat1 - Transmitter latitude
 * @param lon1 - Transmitter longitude
 * @param lat2 - Receiver latitude
 * @param lon2 - Receiver longitude
 * @param stations - Array of ionosonde readings
 * @returns Measured MUF in MHz or null if no data available
 *
 * @example
 * ```typescript
 * const muf = getMeasuredMUF(45, -93, 51.5, -0.1, readings);
 * if (muf !== null) {
 *   console.log(`Measured MUF for path: ${muf.toFixed(1)} MHz`);
 * }
 * ```
 */
export function getMeasuredMUF(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  stations: IonosondeReading[],
): number | null {
  if (!stations.length) return null;

  // Calculate path midpoint
  const midLat = (lat1 + lat2) / 2;
  const midLon = (lon1 + lon2) / 2;

  // Calculate path distance
  const pathDistance = haversineDistance(lat1, lon1, lat2, lon2);

  // For short paths (< 500km), use NVIS-style vertical incidence
  if (pathDistance < 500) {
    const closest = getClosestStation(midLat, midLon, stations, 1000);
    if (closest) {
      // For NVIS, MUF is approximately foF2
      return closest.foF2;
    }
    return null;
  }

  // For medium paths (500-3000km), use the closest station's MUF3000
  if (pathDistance <= 3000) {
    const closest = getClosestStation(midLat, midLon, stations, 2000);
    if (closest) {
      return closest.muf3000;
    }
    return null;
  }

  // For long paths (> 3000km), sample multiple points along the path
  // and use the minimum MUF (limiting factor)
  const numSamples = Math.min(5, Math.ceil(pathDistance / 2000));
  const mufValues: number[] = [];

  for (let i = 0; i <= numSamples; i++) {
    const t = i / numSamples;
    const sampleLat = lat1 + t * (lat2 - lat1);
    const sampleLon = lon1 + t * (lon2 - lon1);

    const closest = getClosestStation(sampleLat, sampleLon, stations, 2500);
    if (closest) {
      mufValues.push(closest.muf3000);
    }
  }

  if (mufValues.length === 0) return null;

  // Return the minimum MUF along the path (the limiting factor)
  return Math.min(...mufValues);
}

/**
 * Interpolate ionosonde readings to estimate foF2 at any location
 *
 * Uses inverse distance weighting (IDW) to blend readings from
 * multiple nearby stations.
 *
 * @param lat - Target latitude
 * @param lon - Target longitude
 * @param stations - Array of ionosonde readings
 * @param maxDistance - Maximum distance to consider (km)
 * @param power - IDW power parameter (default 2)
 * @returns Interpolated foF2 value or null if insufficient data
 */
export function interpolateFoF2(
  lat: number,
  lon: number,
  stations: IonosondeReading[],
  maxDistance: number = 3000,
  power: number = 2,
): number | null {
  if (!stations.length) return null;

  // Find all stations within range
  const nearbyStations: Array<{ station: IonosondeReading; distance: number }> =
    [];

  for (const station of stations) {
    const distance = haversineDistance(lat, lon, station.lat, station.lon);
    if (distance <= maxDistance) {
      nearbyStations.push({ station, distance });
    }
  }

  if (nearbyStations.length === 0) return null;

  // If only one station, return its value
  if (nearbyStations.length === 1) {
    return nearbyStations[0].station.foF2;
  }

  // Inverse distance weighting
  let weightSum = 0;
  let valueSum = 0;

  for (const { station, distance } of nearbyStations) {
    // Avoid division by zero for very close stations
    const effectiveDistance = Math.max(distance, 1);
    const weight = 1 / Math.pow(effectiveDistance, power);

    // Weight by confidence as well
    const confidenceWeight = station.confidence / 100;
    const totalWeight = weight * confidenceWeight;

    weightSum += totalWeight;
    valueSum += station.foF2 * totalWeight;
  }

  return weightSum > 0 ? valueSum / weightSum : null;
}

/**
 * Get color for foF2 value visualization
 *
 * @param foF2 - Critical frequency in MHz
 * @returns CSS color string
 */
export function getFoF2Color(foF2: number): string {
  // Color scale based on foF2:
  // < 3 MHz: Red (poor ionization)
  // 3-5 MHz: Orange
  // 5-7 MHz: Yellow
  // 7-10 MHz: Green (good conditions)
  // > 10 MHz: Blue (excellent conditions)

  if (foF2 < 3) return "#ef4444"; // Red
  if (foF2 < 5) return "#f97316"; // Orange
  if (foF2 < 7) return "#eab308"; // Yellow
  if (foF2 < 10) return "#22c55e"; // Green
  return "#3b82f6"; // Blue
}

/**
 * Calculate data freshness indicator
 *
 * @param timestamp - ISO timestamp of the reading
 * @returns "fresh" | "stale" | "old"
 */
export function getDataFreshness(timestamp: string): "fresh" | "stale" | "old" {
  const age = Date.now() - new Date(timestamp).getTime();
  const minutes = age / (1000 * 60);

  if (minutes < 20) return "fresh";
  if (minutes < 60) return "stale";
  return "old";
}
