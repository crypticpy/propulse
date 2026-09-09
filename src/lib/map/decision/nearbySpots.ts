import type { DXSpot } from "@/types/dxcluster";
import { getDistance } from "@/lib/utils/path";
import { gridToLatLon, isValidGrid } from "@/lib/utils/grid";
import type { NearbySpotHit, NearbySpotsResult } from "./types";
import { DEFAULT_NEARBY_RADIUS_KM } from "./types";

const MAX_HITS = 8;

function spotObservedMs(spot: DXSpot): number | null {
  const raw = spot.time;
  if (raw instanceof Date) {
    const ms = raw.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof raw === "string" || typeof raw === "number") {
    const ms = new Date(raw).getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

function gridForLatLon(grid: string): string {
  const upper = grid.toUpperCase();
  return upper.length >= 8 ? upper.slice(0, 6) : upper;
}

export type DxLocatorSource = "coordinates" | "fourCharGrid" | "subsquareGrid";

/** Locator-derived DX position only. Prefix/continent centroids are skipped. */
export function dxLocatorPosition(
  spot: DXSpot,
): { lat: number; lon: number; source: DxLocatorSource } | null {
  if (spot.dxLocApprox) return null;
  if (
    spot.dxLat != null &&
    spot.dxLon != null &&
    Number.isFinite(spot.dxLat) &&
    Number.isFinite(spot.dxLon)
  ) {
    return { lat: spot.dxLat, lon: spot.dxLon, source: "coordinates" };
  }
  const grid = spot.dxGrid?.trim();
  if (!grid || grid.length < 4 || !isValidGrid(grid)) return null;
  try {
    const normalized = gridForLatLon(grid);
    const source: DxLocatorSource =
      normalized.length >= 6 ? "subsquareGrid" : "fourCharGrid";
    const { lat, lon } = gridToLatLon(normalized);
    return { lat, lon, source };
  } catch {
    return null;
  }
}

export interface NearbySpotsInput {
  targetLat: number;
  targetLon: number;
  spots: DXSpot[];
  radiusKm?: number;
  now?: Date;
  spotsObservedAt?: number | null;
  spotsFetchedAt?: number | null;
}

function isoOrNull(ms: number | null | undefined): string | null {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return null;
  return new Date(ms).toISOString();
}

/**
 * Spots whose DX end falls within `radiusKm` of the target.
 * Configurable radius; default 500 km. Skips approximate (prefix/continent)
 * positions and rows with no locator-derived coordinates or 4-char+ grid.
 */
export function nearbySpots(input: NearbySpotsInput): NearbySpotsResult {
  const radiusKm = input.radiusKm ?? DEFAULT_NEARBY_RADIUS_KM;
  const ranked: NearbySpotHit[] = [];
  let usedFourCharGrid = false;

  for (const spot of input.spots) {
    const located = dxLocatorPosition(spot);
    if (!located) continue;
    const distanceKm = getDistance(
      input.targetLat,
      input.targetLon,
      located.lat,
      located.lon,
    );
    if (distanceKm > radiusKm) continue;
    if (located.source === "fourCharGrid") {
      usedFourCharGrid = true;
    }
    const observedMs = spotObservedMs(spot);
    ranked.push({
      id: spot.id,
      dx: spot.dx,
      band: spot.band ?? null,
      frequencyKHz: spot.frequency,
      distanceKm: Math.round(distanceKm),
      observedAt:
        observedMs != null ? new Date(observedMs).toISOString() : null,
    });
  }

  ranked.sort((a, b) => {
    if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
    return (b.observedAt ?? "").localeCompare(a.observedAt ?? "");
  });

  const byBand: Record<string, number> = {};
  for (const hit of ranked) {
    const band = hit.band ?? "unknown";
    byBand[band] = (byBand[band] ?? 0) + 1;
  }

  const newest = ranked.reduce<string | null>((acc, hit) => {
    if (!hit.observedAt) return acc;
    if (!acc || hit.observedAt > acc) return hit.observedAt;
    return acc;
  }, null);

  let basis = `Observed spots within ${radiusKm} km of the target (spot store)`;
  if (usedFourCharGrid) {
    basis +=
      "; 4-char locators use square centres (±~125 km)";
  }

  return {
    radiusKm,
    count: ranked.length,
    byBand,
    hits: ranked.slice(0, MAX_HITS),
    evidence: {
      basis,
      observedAt: newest ?? isoOrNull(input.spotsObservedAt),
      fetchedAt:
        isoOrNull(input.spotsFetchedAt) ?? input.now?.toISOString() ?? null,
    },
  };
}
