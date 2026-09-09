import type { DXSpot } from "@/types/dxcluster";
import { getDistance } from "@/lib/utils/path";
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
 * Configurable radius; default 500 km. Skips spots without a locator-derived position.
 */
export function nearbySpots(input: NearbySpotsInput): NearbySpotsResult {
  const radiusKm = input.radiusKm ?? DEFAULT_NEARBY_RADIUS_KM;
  const ranked: NearbySpotHit[] = [];

  for (const spot of input.spots) {
    if (spot.dxLat == null || spot.dxLon == null) continue;
    if (!Number.isFinite(spot.dxLat) || !Number.isFinite(spot.dxLon)) continue;
    const distanceKm = getDistance(
      input.targetLat,
      input.targetLon,
      spot.dxLat,
      spot.dxLon,
    );
    if (distanceKm > radiusKm) continue;
    const observedMs = spotObservedMs(spot);
    ranked.push({
      id: spot.id,
      dx: spot.dx,
      band: spot.band ?? null,
      frequencyKHz: spot.frequency,
      distanceKm: Math.round(distanceKm),
      observedAt:
        observedMs != null
          ? new Date(observedMs).toISOString()
          : new Date(0).toISOString(),
    });
  }

  ranked.sort((a, b) => {
    if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
    return b.observedAt.localeCompare(a.observedAt);
  });

  const byBand: Record<string, number> = {};
  for (const hit of ranked) {
    const band = hit.band ?? "unknown";
    byBand[band] = (byBand[band] ?? 0) + 1;
  }

  const newest = ranked.reduce<string | null>((acc, hit) => {
    if (!acc || hit.observedAt > acc) return hit.observedAt;
    return acc;
  }, null);

  return {
    radiusKm,
    count: ranked.length,
    byBand,
    hits: ranked.slice(0, MAX_HITS),
    evidence: {
      basis: `Observed spots within ${radiusKm} km of the target (spot store)`,
      observedAt: newest ?? isoOrNull(input.spotsObservedAt),
      fetchedAt: isoOrNull(input.spotsFetchedAt) ?? input.now?.toISOString() ?? null,
    },
  };
}
