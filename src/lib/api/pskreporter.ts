/**
 * PSKReporter API Client
 *
 * Fetches real-time digital mode spots from PSKReporter.info
 * Uses Vercel Edge Function as proxy to handle CORS
 */

import type { LiveSpot, PSKReporterSpot } from "@/types/livespot";
import { gridToLatLon } from "./dxcluster";

/**
 * Fetch spots from PSKReporter via our Edge Function proxy
 *
 * @param grid - Receiver grid locator to query (4 or 6 char)
 * @param mode - Optional mode filter (e.g., 'FT8', 'FT4')
 * @param limit - Maximum number of spots to return
 * @returns Array of LiveSpot objects
 */
export async function fetchPSKReporterSpots(
  grid?: string,
  mode?: string,
  limit: number = 50,
): Promise<LiveSpot[]> {
  try {
    const params = new URLSearchParams();
    if (grid) params.set("grid", grid);
    if (mode) params.set("mode", mode);
    params.set("limit", limit.toString());

    const response = await fetch(`/api/spots/pskreporter?${params}`);

    if (!response.ok) {
      // Silently fail in dev mode - API routes may not be available
      return [];
    }

    // Check content-type to avoid parsing non-JSON responses
    const contentType = response.headers.get("content-type");
    if (!contentType?.includes("application/json")) {
      // API route not available in dev mode
      return [];
    }

    const data = await response.json();

    if (!data.spots || !Array.isArray(data.spots)) {
      return [];
    }

    return data.spots.map((spot: PSKReporterSpot) =>
      transformPSKReporterSpot(spot),
    );
  } catch (error) {
    console.warn("Failed to fetch PSKReporter spots:", error);
    return [];
  }
}

/**
 * Transform PSKReporter API response to LiveSpot format
 */
function transformPSKReporterSpot(spot: PSKReporterSpot): LiveSpot {
  const dxPos = spot.senderLocator ? gridToLatLon(spot.senderLocator) : null;
  const spotterPos = spot.receiverLocator
    ? gridToLatLon(spot.receiverLocator)
    : null;

  // Determine band from frequency (in Hz from PSKReporter)
  const freqKHz = spot.frequency / 1000;
  const band = getBandFromFrequency(freqKHz);

  return {
    id: `psk_${spot.senderCallsign}_${spot.flowStartSeconds}`,
    spotter: spot.receiverCallsign,
    spotterGrid: spot.receiverLocator,
    dx: spot.senderCallsign,
    dxGrid: spot.senderLocator,
    frequency: Math.round(freqKHz),
    mode: spot.mode,
    band,
    time: new Date(spot.flowStartSeconds * 1000),
    dxLat: dxPos?.lat,
    dxLon: dxPos?.lon,
    spotterLat: spotterPos?.lat,
    spotterLon: spotterPos?.lon,
    comment: spot.sNR ? `SNR ${spot.sNR} dB` : "",
    source: "PSKReporter",
    snr: spot.sNR,
    receiverCallsign: spot.receiverCallsign,
    receiverGrid: spot.receiverLocator,
  };
}

/**
 * Get band name from frequency in kHz
 */
function getBandFromFrequency(freqKHz: number): string {
  if (freqKHz >= 1800 && freqKHz <= 2000) return "160m";
  if (freqKHz >= 3500 && freqKHz <= 4000) return "80m";
  if (freqKHz >= 5330 && freqKHz <= 5405) return "60m";
  if (freqKHz >= 7000 && freqKHz <= 7300) return "40m";
  if (freqKHz >= 10100 && freqKHz <= 10150) return "30m";
  if (freqKHz >= 14000 && freqKHz <= 14350) return "20m";
  if (freqKHz >= 18068 && freqKHz <= 18168) return "17m";
  if (freqKHz >= 21000 && freqKHz <= 21450) return "15m";
  if (freqKHz >= 24890 && freqKHz <= 24990) return "12m";
  if (freqKHz >= 28000 && freqKHz <= 29700) return "10m";
  if (freqKHz >= 50000 && freqKHz <= 54000) return "6m";
  if (freqKHz >= 144000 && freqKHz <= 148000) return "2m";
  return "Unknown";
}
