/**
 * WSPR (Weak Signal Propagation Reporter) API client
 * Fetches recent WSPR spots from the past 30 minutes via wspr.live
 */

/**
 * Represents a single WSPR spot (TX/RX propagation path)
 */
export interface WsprSpot {
  /** Transmitter callsign */
  txCallsign: string;
  /** Transmitter latitude in degrees */
  txLat: number;
  /** Transmitter longitude in degrees */
  txLon: number;
  /** Receiver callsign */
  rxCallsign: string;
  /** Receiver latitude in degrees */
  rxLat: number;
  /** Receiver longitude in degrees */
  rxLon: number;
  /** Band in MHz */
  band: number;
  /** Frequency in Hz */
  frequency: number;
  /** Signal-to-noise ratio in dB */
  snr: number;
  /** Transmit power in dBm */
  power: number;
  /** ISO timestamp of the spot */
  time: string;
}

/**
 * API response shape from the WSPR proxy endpoint
 */
interface WsprSpotsResponse {
  spots: WsprSpot[];
  error?: string;
}

const WSPR_SPOTS_URL = "/api/wspr/spots";

/**
 * Fetch recent WSPR spots from the past 30 minutes
 * Uses the Vercel edge function proxy to query wspr.live
 *
 * @returns Promise<WsprSpot[]> - Array of WSPR spot events
 */
export async function fetchWsprSpots(
  signal?: AbortSignal,
): Promise<WsprSpot[]> {
  const response = await fetch(WSPR_SPOTS_URL, { signal });

  if (!response.ok) {
    throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
  }

  const data: WsprSpotsResponse = await response.json();

  if (!Array.isArray(data.spots)) {
    return [];
  }

  return data.spots;
}
