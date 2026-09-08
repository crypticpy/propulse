import type { SpotFilters } from "@/types/operatingProfile";
import type { ModeSelection } from "@/lib/views/spotContracts";
import { modeMatchesSelection, normalizeMode, normalizeModeSelection } from "./modes";

/**
 * Pure helpers for later SP-09 adapters. This module does not import or wrap
 * `src/lib/map/filterMapSpots.ts`.
 */
export function modeSelectionFromLegacyModes(modes: readonly string[]): ModeSelection {
  const names = [...new Set(
    modes
      .map((mode) => normalizeMode(mode).name)
      .filter((name) => name !== "UNKNOWN"),
  )];
  return normalizeModeSelection({
    all: names.length === 0,
    categories: [],
    modes: names,
    includeUnknown: names.length === 0,
    includeInferred: true,
  });
}

export function legacyDisplayFiltersMatch(
  spot: { band?: string; mode?: string },
  filters: SpotFilters,
): boolean {
  const bands = new Set(filters.bands.map((band) => band.toLowerCase()));
  if (bands.size > 0 && !bands.has((spot.band ?? "").toLowerCase())) return false;
  if (filters.modes.length === 0) return true;
  const selection = modeSelectionFromLegacyModes(filters.modes);
  return modeMatchesSelection(normalizeMode(spot.mode), selection);
}
