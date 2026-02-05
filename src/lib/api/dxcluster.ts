/**
 * DX Cluster API (Demo/Simulated)
 *
 * Real DX clusters use Telnet protocol which browsers can't access directly.
 * This module provides simulated data for demonstration purposes.
 *
 * In production, you would need a backend proxy to connect to:
 * - dxc.ve7cc.net:7300
 * - dx.k1rfi.org:7300
 * - dxfun.com:8000
 * - etc.
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
 * Common operating modes
 */
const MODES = [
  "CW",
  "SSB",
  "FT8",
  "FT4",
  "RTTY",
  "PSK31",
  "JS8",
  "FM",
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
 * Sample callsign prefixes by region for realistic demo data
 */
const CALLSIGN_PREFIXES = {
  // North America
  NA: [
    "W1",
    "W2",
    "W3",
    "W4",
    "W5",
    "W6",
    "W7",
    "W8",
    "W9",
    "W0",
    "K",
    "N",
    "AA",
    "VE",
    "VA",
    "XE",
  ],
  // Europe
  EU: [
    "G",
    "GM",
    "GW",
    "DL",
    "DJ",
    "DK",
    "F",
    "I",
    "EA",
    "CT",
    "PA",
    "ON",
    "OZ",
    "SM",
    "LA",
    "OH",
    "SP",
    "OK",
    "HA",
    "YO",
    "LZ",
    "SV",
    "9A",
    "S5",
  ],
  // Asia
  AS: ["JA", "JH", "JR", "HL", "BV", "BY", "VU", "9M", "9V", "HS", "YB", "DU"],
  // Oceania
  OC: ["VK", "ZL", "FK", "KH6", "KL7", "YJ", "A3"],
  // South America
  SA: ["LU", "PY", "CE", "HC", "OA", "YV", "HK", "CP"],
  // Africa
  AF: ["ZS", "5Z", "5H", "9J", "7Q", "5X", "CN", "EA8", "CT3", "3B8"],
};

/**
 * Sample grid locators by region for realistic positioning
 */
const GRID_LOCATORS = {
  NA: [
    "FN31",
    "FN42",
    "EM73",
    "DM79",
    "CN87",
    "FM18",
    "EN91",
    "DM04",
    "EL96",
    "DN70",
  ],
  EU: [
    "JO21",
    "IO91",
    "JN48",
    "JN58",
    "JN65",
    "JN47",
    "KO85",
    "KN95",
    "JN99",
    "KM17",
  ],
  AS: [
    "PM95",
    "PM96",
    "QM05",
    "PL04",
    "OL72",
    "OM29",
    "PK04",
    "NM83",
    "OL92",
    "PN11",
  ],
  OC: ["QF56", "RF80", "RH91", "BL11", "BP51", "QG62", "RK29", "RE78"],
  SA: ["GF05", "GG87", "FH17", "FI09", "FF46", "FJ01", "FI18", "FH95"],
  AF: ["KF25", "KI88", "JG71", "KH43", "KH62", "IM75", "IL38", "MG54"],
};

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
 * Generate a random callsign
 */
function generateCallsign(region: keyof typeof CALLSIGN_PREFIXES): string {
  const prefixes = CALLSIGN_PREFIXES[region];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const suffix =
    Math.random() > 0.5
      ? String.fromCharCode(65 + Math.floor(Math.random() * 26)) +
        String.fromCharCode(65 + Math.floor(Math.random() * 26))
      : String.fromCharCode(65 + Math.floor(Math.random() * 26)) +
        String.fromCharCode(65 + Math.floor(Math.random() * 26)) +
        String.fromCharCode(65 + Math.floor(Math.random() * 26));

  const number = Math.floor(Math.random() * 10);
  return `${prefix}${number}${suffix}`;
}

/**
 * Generate a random grid locator
 */
function getRandomGrid(region: keyof typeof GRID_LOCATORS): string {
  const grids = GRID_LOCATORS[region];
  return grids[Math.floor(Math.random() * grids.length)];
}

/**
 * Generate random frequency within a band
 */
function generateFrequency(band: (typeof BANDS)[number]): number {
  const range = band.max - band.min;
  return Math.round(band.min + Math.random() * range);
}

/**
 * Spot comments for realistic demo data
 */
const SPOT_COMMENTS = [
  "CQ CQ CQ",
  "5/9 in EU",
  "Loud signal",
  "Up 1",
  "Up 2",
  "599",
  "59+10",
  "QSX 14195",
  "Good copy",
  "TNX QSO",
  "Nice signal",
  "Weak but readable",
  "DXCC needed",
  "New one!",
  "ATNO",
  "Calling CQ DX",
  "Pileup",
  "Split up",
  "Working NA",
  "Working EU",
  "Working JA",
];

/**
 * Generate a unique ID for a spot
 */
function generateSpotId(): string {
  return `spot_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Generate realistic demo DX spots
 */
export function generateDemoSpots(count: number = 20): DXSpot[] {
  const spots: DXSpot[] = [];
  const regions = Object.keys(CALLSIGN_PREFIXES) as Array<
    keyof typeof CALLSIGN_PREFIXES
  >;
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    // Random region for DX station
    const dxRegion = regions[Math.floor(Math.random() * regions.length)];
    // Spotter usually from NA or EU
    const spotterRegion =
      Math.random() > 0.3
        ? Math.random() > 0.5
          ? "NA"
          : "EU"
        : regions[Math.floor(Math.random() * regions.length)];

    // Random band weighted towards popular bands
    const bandWeights = [
      0.02, 0.15, 0.02, 0.25, 0.05, 0.25, 0.05, 0.12, 0.02, 0.05, 0.02, 0,
    ];
    let bandIndex = 0;
    let cumWeight = 0;
    const randWeight = Math.random();
    for (let j = 0; j < bandWeights.length; j++) {
      cumWeight += bandWeights[j];
      if (randWeight <= cumWeight) {
        bandIndex = j;
        break;
      }
    }
    const band = BANDS[bandIndex];

    // Random mode weighted towards common modes
    const modeWeights = [0.25, 0.25, 0.35, 0.05, 0.05, 0.02, 0.02, 0.01];
    let modeIndex = 0;
    cumWeight = 0;
    const randModeWeight = Math.random();
    for (let j = 0; j < modeWeights.length; j++) {
      cumWeight += modeWeights[j];
      if (randModeWeight <= cumWeight) {
        modeIndex = j;
        break;
      }
    }
    const mode = MODES[modeIndex];

    // Generate callsigns and grids
    const dx = generateCallsign(dxRegion);
    const spotter = generateCallsign(spotterRegion);
    const dxGrid = getRandomGrid(dxRegion);
    const spotterGrid = getRandomGrid(spotterRegion);

    // Calculate positions
    const dxPos = gridToLatLon(dxGrid);
    const spotterPos = gridToLatLon(spotterGrid);

    // Random time within last 20 minutes (ensures spots aren't filtered by 30min maxAge)
    const spotTime = new Date(now - Math.random() * 20 * 60 * 1000);

    // Random comment
    const comment =
      SPOT_COMMENTS[Math.floor(Math.random() * SPOT_COMMENTS.length)];

    spots.push({
      id: generateSpotId(),
      spotter,
      spotterGrid,
      dx,
      dxGrid,
      frequency: generateFrequency(band),
      mode,
      comment,
      time: spotTime,
      band: band.name,
      dxLat: dxPos?.lat,
      dxLon: dxPos?.lon,
      spotterLat: spotterPos?.lat,
      spotterLon: spotterPos?.lon,
    });
  }

  // Sort by time, newest first
  return spots.sort((a, b) => b.time.getTime() - a.time.getTime());
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
    id: generateSpotId(),
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
 * Simulate fetching new spots (for demo purposes)
 * In production, this would connect to a backend WebSocket or API
 */
export async function fetchDemoSpots(count: number = 20): Promise<DXSpot[]> {
  // Simulate network delay
  await new Promise((resolve) =>
    setTimeout(resolve, 300 + Math.random() * 200),
  );
  return generateDemoSpots(count);
}

/**
 * Add a new simulated spot (for real-time demo)
 */
export function generateNewSpot(): DXSpot {
  const spots = generateDemoSpots(1);
  spots[0].time = new Date(); // Just now
  return spots[0];
}

/**
 * Fetch real spots from the DX cluster REST proxy (Vercel Edge Function).
 * Falls back gracefully if the proxy is unavailable.
 */
export async function fetchClusterSpots(limit = 50): Promise<DXSpot[]> {
  try {
    const res = await fetch(`/api/spots/dxcluster?limit=${limit}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return (data as Record<string, unknown>[]).map(
      (item: Record<string, unknown>) => ({
        id: (item.id as string) || crypto.randomUUID(),
        spotter: (item.spotter as string) || (item.de as string) || "",
        dx: (item.dx as string) || "",
        frequency:
          typeof item.frequency === "number"
            ? item.frequency
            : parseFloat(item.frequency as string) || 0,
        mode: (item.mode as string) || undefined,
        comment: (item.comment as string) || (item.info as string) || "",
        time: new Date(item.time as string),
        band:
          (item.band as string) ||
          getBandFromFrequency(
            typeof item.frequency === "number"
              ? item.frequency
              : parseFloat(item.frequency as string) || 0,
          ),
        spotterGrid: item.spotterGrid as string | undefined,
        dxGrid: item.dxGrid as string | undefined,
      }),
    );
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
