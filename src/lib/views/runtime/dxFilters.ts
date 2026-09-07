import { intersectAuthorizedSources } from "@/lib/spots/presentation/pipeline";
import { modeMatchesSelection, normalizeMode, normalizeModeSelection } from "@/lib/spots/presentation/modes";
import type { SpotSource } from "@/types/livespot";
import type { DXClusterFilters, DXSpot } from "@/types/dxcluster";
import type { NormalizedMode, SpotPresentationPreferences } from "../spotContracts";

const ALL_SOURCES: readonly SpotSource[] = ["PSKReporter", "RBN", "Cluster", "WSJT-X"];

type ViewDxSpot = DXSpot & {
  source?: SpotSource;
  modeProvenance?: NormalizedMode["provenance"];
};

/**
 * Filters safe to forward into legacy `useDXCluster`. Modes and sources are
 * omitted so exact-match ingest cannot drop USB/LSB/FT-8 aliases, category
 * members, or authorized-source rows that SP-04 would keep.
 */
export function dxFiltersFromViewSpots(
  spots: SpotPresentationPreferences,
): DXClusterFilters {
  return {
    bands: spots.filters.bands.length > 0 ? [...spots.filters.bands] : undefined,
    modes: undefined,
    sources: undefined,
    maxAge: spots.filters.maxAgeMinutes,
  };
}

function reportedSource(spot: DXSpot): SpotSource {
  const raw = (spot as ViewDxSpot).source;
  if (raw === "PSKReporter" || raw === "RBN" || raw === "Cluster" || raw === "WSJT-X") {
    return raw;
  }
  return "Cluster";
}

function reportedMode(spot: DXSpot): ReturnType<typeof normalizeMode> {
  return normalizeMode(spot.mode, (spot as ViewDxSpot).modeProvenance ?? "reported");
}

function spotTimeMs(spot: DXSpot): number {
  return spot.time instanceof Date ? spot.time.getTime() : new Date(spot.time).getTime();
}

/** FILTER-06: newest first, then stable report-ID. */
function compareNewestThenId(left: DXSpot, right: DXSpot): number {
  const delta = spotTimeMs(right) - spotTimeMs(left);
  if (delta !== 0) return delta;
  if (left.id < right.id) return -1;
  if (left.id > right.id) return 1;
  return 0;
}

function observedAtMs(spot: DXSpot): number | null {
  const ms = spotTimeMs(spot);
  if (!Number.isFinite(ms) || ms < 0) return null;
  return ms;
}

/** SP-04 matching against a DX row. Does not rewrite shared ingest snapshots. */
export function dxSpotMatchesViewFilters(
  spot: DXSpot,
  preferences: SpotPresentationPreferences,
  nowMs = Date.now(),
  futureToleranceMs = 0,
): boolean {
  const filters = preferences.filters;
  if (!modeMatchesSelection(reportedMode(spot), normalizeModeSelection(filters.modes))) {
    return false;
  }
  const bands = new Set(filters.bands.map((band) => band.toLowerCase()));
  if (bands.size > 0 && !bands.has((spot.band ?? "").toLowerCase())) return false;
  const observedAt = observedAtMs(spot);
  if (observedAt === null) return false;
  if (observedAt > nowMs + futureToleranceMs) return false;
  if (nowMs - observedAt > filters.maxAgeMinutes * 60_000) return false;
  const allowed = new Set(intersectAuthorizedSources(filters.sources, ALL_SOURCES));
  return allowed.has(reportedSource(spot));
}

/**
 * Full matching list vs map budget. `matching` is the list total; `mapBudgeted`
 * is the newest `spotLimit` rows (clamped 10–200), distinct from ingest size.
 */
export function filterDxSpotsForView(
  spots: readonly DXSpot[],
  preferences: SpotPresentationPreferences,
  nowMs = Date.now(),
  futureToleranceMs = 0,
): { matching: DXSpot[]; mapBudgeted: DXSpot[] } {
  const matching = spots.filter((spot) => (
    dxSpotMatchesViewFilters(spot, preferences, nowMs, futureToleranceMs)
  ));
  const sorted = [...matching].sort(compareNewestThenId);
  const limit = Math.min(200, Math.max(10, preferences.filters.spotLimit));
  return { matching, mapBudgeted: sorted.slice(0, limit) };
}
