/**
 * Band-dependent arc height mapping for 3D globe visualization.
 *
 * Lower bands (160m) reflect off lower ionospheric layers and arc closer
 * to the surface. Higher bands (10m) reflect off the high F2 layer and
 * arc much higher. Heights are visually exaggerated (5x) for clarity.
 */

import { getPathPoints } from "@/lib/utils/path";

/** Peak arc radius by band name (globe radius = 1.0) */
export const BAND_ARC_HEIGHTS: Record<string, number> = {
  "2200m": 1.04,
  "630m": 1.045,
  "160m": 1.05,
  "80m": 1.06,
  "60m": 1.07,
  "40m": 1.09,
  "30m": 1.1,
  "20m": 1.12,
  "17m": 1.13,
  "15m": 1.15,
  "12m": 1.17,
  "10m": 1.2,
  "6m": 1.22,
  "2m": 1.03,
  "70cm": 1.03,
  "23cm": 1.03,
};

/** Default arc height when band is unknown */
const DEFAULT_ARC_HEIGHT = 1.1;

/** Get the peak arc radius for a given band name */
export function getArcHeightForBand(band: string): number {
  return BAND_ARC_HEIGHTS[band] ?? DEFAULT_ARC_HEIGHT;
}

function latLonTo3D(
  lat: number,
  lon: number,
  radius: number,
): [number, number, number] {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return [
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  ];
}

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
