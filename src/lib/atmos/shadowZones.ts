/**
 * Shadow Zone Estimation — geometric coverage gap analysis
 *
 * Creates a coarse grid around a station and identifies cells
 * that lack both VHF repeater coverage and NVIS HF coverage.
 * This is a rough geometric estimate with no terrain model.
 */

import type { Repeater } from "@/lib/api/repeaters";

export interface ShadowZoneResult {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: {
      type: "Polygon";
      coordinates: number[][][];
    };
    properties: {
      coverageType: "none";
    };
  }>;
}

const VHF_RANGE_KM = 50;
const GRID_STEP = 0.5; // degrees
const GRID_RADIUS = 3; // degrees from station (~300 km)
const MAX_FEATURES = 500;

/** Earth radius in km */
const R_EARTH = 6371;

/** Haversine distance between two points in km */
function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.sqrt(a));
}

/**
 * Estimate communications shadow zones around a station.
 *
 * Creates a coarse grid (0.5-degree cells) in a bounding box around the station.
 * For each cell center, checks if it's within VHF repeater range (~50 km) or
 * NVIS HF coverage radius. Cells with neither are shadow zones.
 *
 * @param stationLat - Station latitude in degrees
 * @param stationLon - Station longitude in degrees
 * @param repeaters - Nearby repeaters with lat/lon
 * @param nvisCoverageKm - NVIS coverage radius in km, or null if NVIS not viable
 * @returns GeoJSON FeatureCollection of shadow zone polygons
 */
export function estimateShadowZones(
  stationLat: number,
  stationLon: number,
  repeaters: Repeater[],
  nvisCoverageKm: number | null,
): ShadowZoneResult {
  const features: ShadowZoneResult["features"] = [];

  const latMin = stationLat - GRID_RADIUS;
  const latMax = stationLat + GRID_RADIUS;
  const lonMin = stationLon - GRID_RADIUS;
  const lonMax = stationLon + GRID_RADIUS;

  // Pre-filter to operational repeaters with valid coordinates
  const activeRepeaters = repeaters.filter(
    (r) => r.operational && r.lat !== 0 && r.lon !== 0,
  );

  for (let lat = latMin; lat < latMax; lat += GRID_STEP) {
    for (let lon = lonMin; lon < lonMax; lon += GRID_STEP) {
      if (features.length >= MAX_FEATURES) break;

      const cellCenterLat = lat + GRID_STEP / 2;
      const cellCenterLon = lon + GRID_STEP / 2;

      // Check VHF repeater coverage
      const hasVhfCoverage = activeRepeaters.some(
        (r) =>
          haversineKm(cellCenterLat, cellCenterLon, r.lat, r.lon) <=
          VHF_RANGE_KM,
      );
      if (hasVhfCoverage) continue;

      // Check NVIS HF coverage
      if (nvisCoverageKm !== null && nvisCoverageKm > 0) {
        const distToStation = haversineKm(
          cellCenterLat,
          cellCenterLon,
          stationLat,
          stationLon,
        );
        if (distToStation <= nvisCoverageKm) continue;
      }

      // No coverage — this cell is a shadow zone
      features.push({
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [lon, lat],
              [lon + GRID_STEP, lat],
              [lon + GRID_STEP, lat + GRID_STEP],
              [lon, lat + GRID_STEP],
              [lon, lat], // close ring
            ],
          ],
        },
        properties: {
          coverageType: "none",
        },
      });
    }
    if (features.length >= MAX_FEATURES) break;
  }

  return {
    type: "FeatureCollection",
    features,
  };
}
