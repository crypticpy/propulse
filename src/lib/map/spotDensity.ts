/** Shared limits for spot rendering and bounded source requests. */
export const DEFAULT_SPOT_DENSITY = 150;
export const MIN_SPOT_DENSITY = 10;
export const MAX_SPOT_DENSITY = 200;

/** Invalid persisted/integration values must never disable rendering with NaN. */
export function normalizeSpotDensity(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SPOT_DENSITY;
  return Math.max(MIN_SPOT_DENSITY, Math.min(MAX_SPOT_DENSITY, Math.floor(value)));
}

/**
 * Spots every source must supply regardless of the display setting.
 *
 * `useLiveSpots` is shared with analysis consumers that have nothing to do with
 * the map -- `useBandOpeningFeed` (band-opening detection) and `useAlerts`
 * (alert monitoring) both mount it outside any map view. A display preference
 * must never starve them, so lowering the slider caps what is *drawn* without
 * shrinking what is *fetched* below the long-standing 50.
 */
export const MIN_SPOT_FETCH_LIMIT = 50;

/**
 * Ceiling enforced by the spot edge routes (`api/_lib/handlers/spots.ts`), which
 * clamp `limit` to 200. Asking for more would silently return the same 200.
 */
export const MAX_SPOT_FETCH_LIMIT = 200;

/**
 * Spots to request from each source for a given render cap.
 *
 * Tolerates a missing value so a partially-migrated store degrades to the
 * previous behaviour instead of requesting `undefined` spots.
 */
export function getSpotFetchLimit(displayDensity: number | undefined): number {
  if (!Number.isFinite(displayDensity)) {
    return MIN_SPOT_FETCH_LIMIT;
  }
  return Math.min(
    MAX_SPOT_FETCH_LIMIT,
    Math.max(MIN_SPOT_FETCH_LIMIT, Math.floor(displayDensity as number)),
  );
}
