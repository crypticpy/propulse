import {
  minDistanceToRing,
  pointInPolygonWithHoles,
  ringArea,
} from "./pointInPolygon";
import { wrapLongitude } from "./maidenhead";

export interface PolygonForAnchor {
  exterior: readonly (readonly [number, number])[];
  holes?: readonly (readonly (readonly [number, number])[])[];
}

const GRID = 28;
const ANCHOR_DECIMALS = 3;

function round(n: number, decimals = ANCHOR_DECIMALS): number {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

function ringBbox(ring: readonly (readonly [number, number])[]): {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
  wrap: boolean;
} | null {
  if (ring.length < 3) return null;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const [lat, lon] of ring) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  }
  if (maxLon - minLon > 180) {
    minLon = Infinity;
    maxLon = -Infinity;
    for (const [, lon] of ring) {
      const shifted = lon < 0 ? lon + 360 : lon;
      if (shifted < minLon) minLon = shifted;
      if (shifted > maxLon) maxLon = shifted;
    }
    return { minLat, maxLat, minLon, maxLon, wrap: true };
  }
  return { minLat, maxLat, minLon, maxLon, wrap: false };
}

function interior(
  lat: number,
  lon: number,
  polygon: PolygonForAnchor,
): boolean {
  return pointInPolygonWithHoles(lat, lon, polygon.exterior, polygon.holes ?? []);
}

function clearance(lat: number, lon: number, polygon: PolygonForAnchor): number {
  let dist = minDistanceToRing(lat, lon, polygon.exterior);
  for (const hole of polygon.holes ?? []) {
    dist = Math.min(dist, minDistanceToRing(lat, lon, hole));
  }
  return dist;
}

function fallbackInterior(polygon: PolygonForAnchor): { lat: number; lon: number } | null {
  const bbox = ringBbox(polygon.exterior);
  if (!bbox) return null;
  const centerLat = (bbox.minLat + bbox.maxLat) / 2;
  const centerLon = wrapLongitude((bbox.minLon + bbox.maxLon) / 2);
  if (interior(centerLat, centerLon, polygon)) return { lat: centerLat, lon: centerLon };
  for (const [lat, lon] of polygon.exterior) {
    const lat2 = lat + (centerLat - lat) * 0.2;
    const lon2 = wrapLongitude(lon + (centerLon - lon) * 0.2);
    if (interior(lat2, lon2, polygon)) return { lat: lat2, lon: lon2 };
  }
  return null;
}

/**
 * Deterministic interior representative: max clearance on a fixed grid of the
 * largest polygon. Mean-of-vertices is not used.
 */
export function representativePoint(
  polygons: readonly PolygonForAnchor[],
): { lat: number; lon: number } | null {
  if (polygons.length === 0) return null;
  let bestPoly = polygons[0]!;
  let bestArea = -1;
  for (const polygon of polygons) {
    const area = ringArea(polygon.exterior);
    if (area > bestArea) {
      bestArea = area;
      bestPoly = polygon;
    }
  }
  const bbox = ringBbox(bestPoly.exterior);
  if (!bbox) return fallbackInterior(bestPoly);

  let winner: { lat: number; lon: number; dist: number } | null = null;
  const dLat = (bbox.maxLat - bbox.minLat) / GRID;
  const dLon = (bbox.maxLon - bbox.minLon) / GRID;
  for (let i = 0; i < GRID; i += 1) {
    for (let j = 0; j < GRID; j += 1) {
      const lat = bbox.minLat + (i + 0.5) * dLat;
      const lon = wrapLongitude(bbox.minLon + (j + 0.5) * dLon);
      if (!interior(lat, lon, bestPoly)) continue;
      const dist = clearance(lat, lon, bestPoly);
      if (!winner || dist > winner.dist) winner = { lat, lon, dist };
    }
  }
  const raw = winner ?? fallbackInterior(bestPoly);
  if (!raw) return null;
  const rounded = { lat: round(raw.lat), lon: round(raw.lon) };
  if (interior(rounded.lat, rounded.lon, bestPoly)) return rounded;
  return raw;
}

export function representativePointFromRings(
  rings: readonly (readonly (readonly [number, number])[])[],
): { lat: number; lon: number } | null {
  return representativePoint(rings.map((exterior) => ({ exterior, holes: [] })));
}
