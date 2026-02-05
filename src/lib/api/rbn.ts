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
 * HamQTH RBN response format: object keyed by callsign
 * Each entry has: dxcall, freq (string with spaces), mode, age, lsn (listeners)
 */
interface HamQTHRBNEntry {
  dxcall: string;
  freq: string;
  mode: string;
  age: number;
  lsn: Record<string, number>;
}

/**
 * Transform a HamQTH RBN entry to LiveSpot format
 */
function transformHamQTHRBNEntry(
  callsign: string,
  entry: HamQTHRBNEntry,
): LiveSpot {
  // Parse frequency: "14 004.3" -> 14004.3
  const freq = parseFloat(entry.freq.replace(/\s/g, "")) || 0;
  const frequency = Math.round(freq);
  const band = getBandFromFrequency(frequency);

  // Get highest SNR spotter from lsn object
  let maxSnr = 0;
  let bestSpotter = "";
  if (entry.lsn && typeof entry.lsn === "object") {
    for (const [spotter, snr] of Object.entries(entry.lsn)) {
      if (snr > maxSnr) {
        maxSnr = snr;
        bestSpotter = spotter;
      }
    }
  }

  // Derive time from age (seconds since spot)
  const timeUnix = Math.floor(Date.now() / 1000) - (entry.age || 0);

  // Get spotter location from prefix
  const spotterPrefix = extractPrefixFromCallsign(bestSpotter);
  const spotterLocation = getLocationFromPrefix(spotterPrefix);

  // Get DX location from callsign prefix
  const dxPrefix = extractPrefixFromCallsign(callsign);
  const dxLocation = getLocationFromPrefix(dxPrefix);

  const mode = entry.mode === "CW" ? "CW" : "RTTY";

  return {
    id: `rbn_${callsign}_${timeUnix}`,
    spotter: bestSpotter || "RBN",
    dx: callsign,
    frequency,
    mode,
    band,
    time: new Date(timeUnix * 1000),
    source: "RBN",
    snr: maxSnr,
    comment: `${maxSnr} dB`,
    spotterLat: spotterLocation?.lat,
    spotterLon: spotterLocation?.lon,
    dxLat: dxLocation?.lat,
    dxLon: dxLocation?.lon,
  };
}

/**
 * Get band name from frequency in kHz
 */
function getBandFromFrequency(frequencyKHz: number): string {
  const bands: { name: string; min: number; max: number }[] = [
    { name: "160m", min: 1800, max: 2000 },
    { name: "80m", min: 3500, max: 4000 },
    { name: "60m", min: 5330, max: 5405 },
    { name: "40m", min: 7000, max: 7300 },
    { name: "30m", min: 10100, max: 10150 },
    { name: "20m", min: 14000, max: 14350 },
    { name: "17m", min: 18068, max: 18168 },
    { name: "15m", min: 21000, max: 21450 },
    { name: "12m", min: 24890, max: 24990 },
    { name: "10m", min: 28000, max: 29700 },
    { name: "6m", min: 50000, max: 54000 },
    { name: "2m", min: 144000, max: 148000 },
  ];
  const band = bands.find(
    (b) => frequencyKHz >= b.min && frequencyKHz <= b.max,
  );
  return band?.name || "Unknown";
}

/**
 * Fetch spots from RBN via our Edge Function proxy.
 * Handles both Edge Function JSON responses (production) and HamQTH
 * callsign-keyed object format (dev mode via Vite proxy).
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
      return [];
    }

    // HamQTH may return JSON with non-standard content-type headers
    // (e.g., text/html). Parse as text first, then try JSON.
    const text = await response.text();
    if (!text.trim()) return [];

    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return [];
    }

    // Detect format:
    // 1. Edge Function format: { spots: [...] }
    // 2. Edge Function format: flat array of RBNSpot
    // 3. HamQTH format: object keyed by callsign { "WA8VTD": { dxcall, freq, ... } }
    if (Array.isArray(data)) {
      // Flat array of RBNSpot (Edge Function)
      return data.map((spot: RBNSpot) => transformRBNSpot(spot));
    }

    if (
      data &&
      typeof data === "object" &&
      "spots" in data &&
      Array.isArray((data as Record<string, unknown>).spots)
    ) {
      // Wrapped array (Edge Function)
      return ((data as Record<string, unknown>).spots as RBNSpot[]).map(
        (spot: RBNSpot) => transformRBNSpot(spot),
      );
    }

    // HamQTH object format: keys are callsigns, values have dxcall/freq/mode/age/lsn
    if (data && typeof data === "object" && !Array.isArray(data)) {
      const entries = Object.entries(data) as [string, HamQTHRBNEntry][];
      if (entries.length === 0) return [];

      // Verify it looks like HamQTH data by checking first entry
      const [, firstEntry] = entries[0];
      if (
        firstEntry &&
        typeof firstEntry === "object" &&
        "freq" in firstEntry
      ) {
        const spots = entries.map(([callsign, entry]) =>
          transformHamQTHRBNEntry(callsign, entry),
        );
        // Return only up to limit spots
        return spots.slice(0, limit);
      }
    }

    return [];
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
