/**
 * Spot fetch budget.
 *
 * `mapStore.displayDensity` (10-200, default 50) is the map's render cap and
 * already has a slider in the Layers popover, but every source was fetched with
 * a hardcoded limit of 50 -- so raising the slider past 50 could never show
 * more spots, because more were never requested. This derives the fetch limit
 * from the same setting so the control works end to end.
 */

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
    Math.max(MIN_SPOT_FETCH_LIMIT, displayDensity as number),
  );
}
