/**
 * DX Cluster API
 *
 * Provides utilities for DX spot data including:
 * - Band/frequency lookups
 * - Grid locator conversion
 * - DX Spider spot parsing
 * - REST proxy fetching (Vercel Edge Function)
 * - Bridge payload conversion
 */

import type { DXSpot, BandColorConfig } from "@/types/dxcluster";
import type { ClusterSpotPayload } from "@/types/bridge";

/**
 * Amateur radio band definitions with frequency ranges
 */
const BANDS = [
  { name: "160m", min: 1800, max: 2000, center: 1900 },
  { name: "80m", min: 3500, max: 4000, center: 3750 },
  { name: "60m", min: 5330, max: 5405, center: 5357 },
  { name: "40m", min: 7000, max: 7300, center: 7150 },
  { name: "30m", min: 10100, max: 10150, center: 10125 },
  { name: "20m", min: 14000, max: 14350, center: 14175 },
  { name: "17m", min: 18068, max: 18168, center: 18118 },
  { name: "15m", min: 21000, max: 21450, center: 21225 },
  { name: "12m", min: 24890, max: 24990, center: 24940 },
  { name: "10m", min: 28000, max: 29700, center: 28850 },
  { name: "6m", min: 50000, max: 54000, center: 52000 },
  { name: "2m", min: 144000, max: 148000, center: 146000 },
] as const;

/**
 * Band colors for UI display
 */
export const BAND_COLORS: BandColorConfig[] = [
  { band: "160m", color: "#ff6b6b", bgColor: "rgba(255, 107, 107, 0.2)" },
  { band: "80m", color: "#ff9f43", bgColor: "rgba(255, 159, 67, 0.2)" },
  { band: "60m", color: "#feca57", bgColor: "rgba(254, 202, 87, 0.2)" },
  { band: "40m", color: "#48dbfb", bgColor: "rgba(72, 219, 251, 0.2)" },
  { band: "30m", color: "#1dd1a1", bgColor: "rgba(29, 209, 161, 0.2)" },
  { band: "20m", color: "#00d2d3", bgColor: "rgba(0, 210, 211, 0.2)" },
  { band: "17m", color: "#54a0ff", bgColor: "rgba(84, 160, 255, 0.2)" },
  { band: "15m", color: "#5f27cd", bgColor: "rgba(95, 39, 205, 0.2)" },
  { band: "12m", color: "#a55eea", bgColor: "rgba(165, 94, 234, 0.2)" },
  { band: "10m", color: "#ff6b35", bgColor: "rgba(255, 107, 53, 0.2)" },
  { band: "6m", color: "#ff9ff3", bgColor: "rgba(255, 159, 243, 0.2)" },
  { band: "2m", color: "#c8d6e5", bgColor: "rgba(200, 214, 229, 0.2)" },
];

/**
 * Get band color configuration by band name
 */
export function getBandColor(band: string): BandColorConfig {
  return (
    BAND_COLORS.find((b) => b.band === band) || {
      band,
      color: "#ffffff",
      bgColor: "rgba(255, 255, 255, 0.2)",
    }
  );
}

/**
 * Convert grid locator to approximate lat/lon
 */
export function gridToLatLon(
  grid: string,
): { lat: number; lon: number } | null {
  if (!grid || grid.length < 4) {
    return null;
  }

  const upperGrid = grid.toUpperCase();
  const lonField = upperGrid.charCodeAt(0) - 65; // A=0
  const latField = upperGrid.charCodeAt(1) - 65;
  const lonSquare = parseInt(upperGrid[2], 10);
  const latSquare = parseInt(upperGrid[3], 10);

  if (isNaN(lonSquare) || isNaN(latSquare)) {
    return null;
  }

  let lon = lonField * 20 + lonSquare * 2 - 180;
  let lat = latField * 10 + latSquare - 90;

  // Add subsquare if present
  if (grid.length >= 6) {
    const lonSubsq = upperGrid.charCodeAt(4) - 65;
    const latSubsq = upperGrid.charCodeAt(5) - 65;
    lon += (lonSubsq * 2) / 24 + 1 / 24;
    lat += latSubsq / 24 + 1 / 48;
  } else {
    // Center of square
    lon += 1;
    lat += 0.5;
  }

  return { lat, lon };
}

/**
 * Get band designation from frequency in kHz
 */
export function getBandFromFrequency(frequencyKHz: number): string {
  const band = BANDS.find(
    (b) => frequencyKHz >= b.min && frequencyKHz <= b.max,
  );
  return band?.name || "Unknown";
}

/**
 * Get center frequency for a band
 */
export function getBandCenterFrequency(band: string): number {
  const bandDef = BANDS.find((b) => b.name === band);
  return bandDef?.center || 14175;
}

/**
 * Parse a DX Spider format spot line
 * Format: DX de SPOTTER: FREQ DX comment time
 * Example: "DX de W1AW:    14025.0  JA1YYY      CQ CQ CQ              1423Z"
 */
export function parseDXSpiderSpot(line: string): DXSpot | null {
  const regex =
    /^DX de\s+([A-Z0-9/]+):\s+(\d+\.?\d*)\s+([A-Z0-9/]+)\s+(.+?)\s+(\d{4})Z?$/i;
  const match = line.match(regex);

  if (!match) {
    return null;
  }

  const [, spotter, freqStr, dx, comment, timeStr] = match;
  const frequency = Math.round(parseFloat(freqStr));

  // Parse time (HHMM format)
  const hours = parseInt(timeStr.substring(0, 2), 10);
  const minutes = parseInt(timeStr.substring(2, 4), 10);
  const now = new Date();
  const spotTime = new Date(now);
  spotTime.setUTCHours(hours, minutes, 0, 0);

  // If the time is in the future, it's from yesterday
  if (spotTime > now) {
    spotTime.setDate(spotTime.getDate() - 1);
  }

  const band = getBandFromFrequency(frequency);

  // Try to detect mode from frequency position or comment
  let mode: string | undefined;
  if (comment.toLowerCase().includes("ft8")) {
    mode = "FT8";
  } else if (comment.toLowerCase().includes("ft4")) {
    mode = "FT4";
  } else if (comment.toLowerCase().includes("cw") || frequency % 1000 < 100) {
    mode = "CW";
  } else if (comment.toLowerCase().includes("ssb")) {
    mode = "SSB";
  } else if (comment.toLowerCase().includes("rtty")) {
    mode = "RTTY";
  }

  return {
    id: `spot_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    spotter: spotter.toUpperCase(),
    dx: dx.toUpperCase(),
    frequency,
    mode,
    comment: comment.trim(),
    time: spotTime,
    band,
  };
}

/**
 * Fetch real spots from the DX cluster REST proxy (Vercel Edge Function).
 * Falls back gracefully if the proxy is unavailable.
 */
export async function fetchClusterSpots(limit = 50): Promise<DXSpot[]> {
  try {
    const res = await fetch(`/api/spots/dxcluster?limit=${limit}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const contentType = res.headers.get("content-type");
    if (!contentType?.includes("application/json")) {
      return [];
    }

    const data = await res.json();

    // Handle both Edge Function format ({ spots: [...] }) and raw
    // DXHeat format (flat array) for dev proxy compatibility
    const items: Record<string, unknown>[] = Array.isArray(data)
      ? data
      : Array.isArray(data?.spots)
        ? data.spots
        : [];

    return items.map((item: Record<string, unknown>) => {
      // Frequency: Edge Function uses "frequency" (number), DXHeat raw uses "freq" (string)
      const rawFreq = item.frequency ?? item.freq;
      const frequency =
        typeof rawFreq === "number"
          ? rawFreq
          : parseFloat(String(rawFreq)) || 0;

      // Time: Edge Function gives ISO string, DXHeat raw gives HHMM
      const rawTime = String(item.time || "");
      let time: Date;
      if (/^\d{4}$/.test(rawTime)) {
        const h = parseInt(rawTime.substring(0, 2), 10);
        const m = parseInt(rawTime.substring(2, 4), 10);
        time = new Date();
        time.setUTCHours(h, m, 0, 0);
        if (time.getTime() > Date.now() + 60_000) {
          time.setDate(time.getDate() - 1);
        }
      } else {
        time = new Date(rawTime);
      }

      const comment = String(item.comment ?? item.info ?? "");

      // Mode: Edge Function provides it, DXHeat raw needs extraction from comment
      let mode = item.mode as string | undefined;
      if (!mode && comment) {
        const upper = comment.toUpperCase();
        for (const m of ["FT8", "FT4", "CW", "SSB", "RTTY"]) {
          if (upper.includes(m)) {
            mode = m;
            break;
          }
        }
      }

      return {
        id: (item.id as string) || crypto.randomUUID(),
        spotter: String(item.spotter ?? item.de ?? ""),
        dx: String(item.dx ?? ""),
        frequency,
        mode,
        comment,
        time,
        band: String(item.band ?? "") || getBandFromFrequency(frequency),
        spotterGrid: item.spotterGrid as string | undefined,
        dxGrid: item.dxGrid as string | undefined,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Convert a bridge ClusterSpotPayload to a DXSpot.
 */
export function clusterPayloadToSpot(payload: ClusterSpotPayload): DXSpot {
  return {
    id: payload.id,
    spotter: payload.spotter,
    spotterGrid: payload.spotterGrid,
    dx: payload.dx,
    dxGrid: payload.dxGrid,
    frequency: payload.frequency,
    mode: payload.mode,
    comment: payload.comment,
    time: new Date(payload.time),
    band: payload.band || getBandFromFrequency(payload.frequency),
  };
}
