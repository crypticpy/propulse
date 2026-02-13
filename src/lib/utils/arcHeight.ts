/**
 * Band-dependent arc height mapping for 3D globe visualization.
 *
 * Each band's peak arc radius corresponds to the ionospheric layer it
 * reflects off, using the same 5x height exaggeration as IonosphericShells:
 *   radius = 1.0 + (heightKm / 6371) * 5
 *
 * Layer reference heights:
 *   E layer  ~110 km → radius 1.086
 *   F1 layer ~180 km → radius 1.141
 *   F2 layer ~300 km → radius 1.235
 *
 * Multi-hop arcs: getMultiHopArcPoints() computes the number of ionospheric
 * bounces based on great-circle distance and band-typical hop distance, then
 * generates parabolic arc segments per hop that touch the ground between hops.
 */

import { getPathPoints } from "@/lib/utils/path";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EARTH_RADIUS_KM = 6371;
const DEG_TO_RAD = Math.PI / 180;

/** Peak arc radius by band name (globe radius = 1.0) */
export const BAND_ARC_HEIGHTS: Record<string, number> = {
  // LF/MF — E layer reflection (~110 km)
  "2200m": 1.086,
  "630m": 1.086,
  // 160m — E layer night, absorbed day (~110 km)
  "160m": 1.086,
  // 80m — F1 layer (~180 km)
  "80m": 1.141,
  // 60m — Low F2 (~200 km)
  "60m": 1.157,
  // 40m — F2 lower (~250 km)
  "40m": 1.196,
  // 30m — F2 (~270 km)
  "30m": 1.212,
  // 20m — F2 middle (~300 km)
  "20m": 1.235,
  // 17m — F2 (~320 km)
  "17m": 1.251,
  // 15m — F2 upper (~330 km)
  "15m": 1.259,
  // 12m — F2 upper (~350 km)
  "12m": 1.275,
  // 10m — F2 high (~360 km)
  "10m": 1.283,
  // 6m — Sporadic E (~110 km)
  "6m": 1.086,
  // VHF/UHF — tropospheric / line of sight
  "2m": 1.015,
  "70cm": 1.01,
  "23cm": 1.01,
};

/** Typical single-hop distance in km by band (determines bounce count) */
const BAND_HOP_DISTANCES: Record<string, number> = {
  "2200m": 1000,
  "630m": 1000,
  "160m": 1500,
  "80m": 2000,
  "60m": 2500,
  "40m": 2500,
  "30m": 3000,
  "20m": 3000,
  "17m": 3000,
  "15m": 3500,
  "12m": 3500,
  "10m": 3500,
  "6m": 2000,
  "2m": 500,
  "70cm": 300,
  "23cm": 300,
};

const DEFAULT_ARC_HEIGHT = 1.235;
const DEFAULT_HOP_DISTANCE = 3000;
const MAX_HOPS = 6;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get the peak arc radius for a given band name */
export function getArcHeightForBand(band: string): number {
  return BAND_ARC_HEIGHTS[band] ?? DEFAULT_ARC_HEIGHT;
}

function latLonTo3D(
  lat: number,
  lon: number,
  radius: number,
): [number, number, number] {
  const phi = (90 - lat) * DEG_TO_RAD;
  const theta = (lon + 180) * DEG_TO_RAD;
  return [
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  ];
}

/** Haversine great-circle distance in km */
function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = (lat2 - lat1) * DEG_TO_RAD;
  const dLon = (lon2 - lon1) * DEG_TO_RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG_TO_RAD) *
      Math.cos(lat2 * DEG_TO_RAD) *
      Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------------------------------------------------------------------------
// Single-arc (legacy) — used when multi-hop is disabled
// ---------------------------------------------------------------------------

/**
 * Generate arc points with parabolic height profile.
 * The arc starts and ends at baseRadius and peaks at peakRadius at the midpoint.
 */
export function getArcPointsWithHeight(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  peakRadius: number,
  baseRadius: number = 1.005,
  segments: number = 30,
): Array<[number, number, number]> {
  const pathPoints = getPathPoints(lat1, lon1, lat2, lon2, segments);
  return pathPoints.map((p, i) => {
    const t = i / (segments - 1);
    // Parabolic height profile: peaks at t=0.5
    const heightFactor = 4 * t * (1 - t); // 0 at ends, 1 at midpoint
    const radius = baseRadius + (peakRadius - baseRadius) * heightFactor;
    return latLonTo3D(p.lat, p.lon, radius);
  });
}

// ---------------------------------------------------------------------------
// Multi-hop arc — proper ionospheric skip visualization
// ---------------------------------------------------------------------------

/**
 * Generate multi-hop arc points that bounce between the ground and the
 * ionospheric reflection layer appropriate for the band.
 *
 * Each hop is a parabolic arc from ground to the layer height and back down.
 * Number of hops is derived from great-circle distance / band hop distance.
 *
 * @param band - Band name (e.g. "20m") for layer height + hop distance lookup
 * @param baseRadius - Globe surface radius (arc endpoints touch here)
 * @param segmentsPerHop - Curve resolution per hop (default 16)
 */
export function getMultiHopArcPoints(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  band: string,
  baseRadius: number = 1.005,
  segmentsPerHop: number = 16,
): Array<[number, number, number]> {
  const peakRadius = getArcHeightForBand(band);
  const hopDistKm = BAND_HOP_DISTANCES[band] ?? DEFAULT_HOP_DISTANCE;
  const distKm = haversineKm(lat1, lon1, lat2, lon2);

  // Determine number of hops (at least 1, capped at MAX_HOPS)
  const numHops = Math.max(
    1,
    Math.min(MAX_HOPS, Math.ceil(distKm / hopDistKm)),
  );

  // Get a fine-grained great circle path, then sample ground-bounce points
  const totalSegments = numHops * segmentsPerHop;
  const pathPoints = getPathPoints(lat1, lon1, lat2, lon2, totalSegments);

  const allPoints: Array<[number, number, number]> = [];

  for (let hop = 0; hop < numHops; hop++) {
    const hopStart = hop * segmentsPerHop;

    // For each point within this hop, apply parabolic height
    for (let i = 0; i <= segmentsPerHop; i++) {
      // Skip duplicate point at hop boundary (except first point of first hop)
      if (hop > 0 && i === 0) continue;

      const globalIdx = hopStart + i;
      if (globalIdx >= pathPoints.length) break;

      const t = i / segmentsPerHop; // 0→1 within this hop
      const heightFactor = 4 * t * (1 - t); // parabola: 0 at ends, 1 at peak
      const radius = baseRadius + (peakRadius - baseRadius) * heightFactor;

      const p = pathPoints[globalIdx];
      allPoints.push(latLonTo3D(p.lat, p.lon, radius));
    }
  }

  return allPoints;
}
