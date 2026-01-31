/**
 * Reverse Beacon Network API Client
 *
 * Fetches real-time CW/RTTY spots from RBN
 * Uses Vercel Edge Function as proxy to handle CORS
 */

import type { LiveSpot, RBNSpot } from "@/types/livespot";
import {
  getLocationFromPrefix,
  getLocationFromContinent,
  extractPrefixFromCallsign,
} from "@/lib/data/prefixLocations";

/**
 * Fetch spots from RBN via our Edge Function proxy
 *
 * @param limit - Maximum number of spots to return
 * @returns Array of LiveSpot objects
 */
export async function fetchRBNSpots(limit: number = 50): Promise<LiveSpot[]> {
  try {
    const params = new URLSearchParams();
    params.set("limit", limit.toString());

    const response = await fetch(`/api/spots/rbn?${params}`);

    if (!response.ok) {
      console.warn("RBN API error:", response.status);
      return [];
    }

    const data = await response.json();

    if (!data.spots || !Array.isArray(data.spots)) {
      return [];
    }

    return data.spots.map((spot: RBNSpot) => transformRBNSpot(spot));
  } catch (error) {
    console.warn("Failed to fetch RBN spots:", error);
    return [];
  }
}

/**
 * Transform RBN API response to LiveSpot format
 */
function transformRBNSpot(spot: RBNSpot): LiveSpot {
  const band = getBandFromRBNBand(spot.band);

  // Get spotter location from prefix or continent fallback
  const spotterLocation =
    getLocationFromPrefix(spot.de_pfx) ||
    getLocationFromContinent(spot.de_cont);

  // Get DX location from callsign prefix or continent fallback
  const dxPrefix = extractPrefixFromCallsign(spot.callsign);
  const dxLocation =
    getLocationFromPrefix(dxPrefix) || getLocationFromContinent(spot.dx_cont);

  return {
    id: `rbn_${spot.callsign}_${spot.time}`,
    spotter: spot.de_pfx || "RBN",
    dx: spot.callsign,
    frequency: Math.round(spot.freq),
    mode: spot.mode === "CW" ? "CW" : "RTTY",
    band,
    time: new Date(spot.time * 1000),
    source: "RBN",
    snr: spot.db,
    wpm: spot.wpm,
    comment: `${spot.db} dB ${spot.wpm} WPM`,
    // Geolocation from prefix/continent lookup
    spotterLat: spotterLocation?.lat,
    spotterLon: spotterLocation?.lon,
    dxLat: dxLocation?.lat,
    dxLon: dxLocation?.lon,
  };
}

/**
 * Convert RBN band number to band name
 */
function getBandFromRBNBand(band: number): string {
  const bandMap: Record<number, string> = {
    160: "160m",
    80: "80m",
    60: "60m",
    40: "40m",
    30: "30m",
    20: "20m",
    17: "17m",
    15: "15m",
    12: "12m",
    10: "10m",
    6: "6m",
    2: "2m",
  };
  return bandMap[band] || "Unknown";
}
