import type { LiveSpot, SpotSource } from "@/types/livespot";
import type { SpotFilters } from "@/types/operatingProfile";

export interface MapSpotCandidateOptions {
  sources?: SpotSource[];
  spotFilters?: SpotFilters;
  maxSpots?: number;
}

/**
 * Select the one ordered spot list every map renderer should use.
 *
 * Missing band or mode metadata remains visible: a source that cannot provide
 * one of those fields should not silently disappear when a profile is active.
 */
export function selectMapSpotCandidates(
  spots: LiveSpot[],
  { sources, spotFilters, maxSpots }: MapSpotCandidateOptions = {},
): LiveSpot[] {
  const sourceSet =
    sources && sources.length > 0 ? new Set<SpotSource>(sources) : null;
  const bandSet =
    spotFilters && spotFilters.bands.length > 0
      ? new Set(spotFilters.bands.map((band) => band.toLowerCase()))
      : null;
  const modeSet =
    spotFilters && spotFilters.modes.length > 0
      ? new Set(spotFilters.modes.map((mode) => mode.toLowerCase()))
      : null;

  const filtered = spots.filter((spot) => {
    if (sourceSet && !sourceSet.has(spot.source)) return false;

    const band = spot.band?.toLowerCase();
    if (bandSet && band && !bandSet.has(band)) return false;

    const mode = spot.mode?.toLowerCase();
    if (modeSet && mode && !modeSet.has(mode)) return false;

    return true;
  });

  if (maxSpots === undefined) return filtered;
  return filtered.slice(0, Math.max(0, maxSpots));
}
