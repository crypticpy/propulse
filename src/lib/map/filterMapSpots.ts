import type { SpotFilters } from "@/types/operatingProfile";

/** Display filtering only: the underlying reports remain available to analysis. */
export function filterMapSpots<T extends { band?: string; mode?: string }>(
  spots: T[],
  filters: SpotFilters,
): T[] {
  const bands = new Set(filters.bands.map((band) => band.toLowerCase()));
  const modes = new Set(filters.modes.map((mode) => mode.toLowerCase()));
  if (!bands.size && !modes.size) return spots;
  return spots.filter(
    (spot) =>
      (!bands.size || bands.has((spot.band ?? "").toLowerCase())) &&
      (!modes.size || modes.has((spot.mode ?? "").toLowerCase())),
  );
}
