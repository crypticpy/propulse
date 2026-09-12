/**
 * useGridResearch Hook
 *
 * Provides comprehensive research data about a Maidenhead grid square,
 * including DXCC entity, distance/bearing, activity stats, and best contact time.
 */

import { useMemo } from "react";
import type { ResolvedSpot } from "@/components/map/LiveSpotArcs";
import { useResolvedMapSpots } from "@/components/map/hooks/useResolvedMapSpots";
import { useOptionalViewEffectiveSpots } from "@/hooks/useViewClusterSpots";
import { useSolarFlux } from "@/hooks/useSolarData";
import { useActiveLocation } from "@/hooks/useActiveLocation";
import { getBandFromFrequency } from "@/lib/api/dxcluster";
import {
  getEntityFromGrid,
  getDistanceBearing,
  getActivityStats,
  getBestContactTime,
  type EntityInfo,
  type ActivityStats,
  type TimeWindow,
} from "@/lib/utils/gridUtils";
import { isValidGrid } from "@/lib/utils/grid";
import { useMapStore } from "@/stores/mapStore";
import type { DXSpot } from "@/types/dxcluster";

const EMPTY_ACTIVITY: ActivityStats = {
  total: 0,
  byBand: {},
  byMode: {},
  recentCallsigns: [],
};

function resolvedSpotToActivitySpot(resolved: ResolvedSpot): DXSpot {
  const spot = resolved.originalSpot;
  return {
    id: spot.id,
    spotter: resolved.spotter ?? spot.spotter,
    spotterGrid: spot.spotterGrid,
    dx: resolved.callsign,
    dxGrid: spot.dxGrid,
    frequency: resolved.frequency,
    mode: resolved.mode,
    comment: spot.comment ?? "",
    time: resolved.time,
    band: spot.band ?? getBandFromFrequency(resolved.frequency),
    dxLat: resolved.dxLat,
    dxLon: resolved.dxLon,
    spotterLat: resolved.spotterLat,
    spotterLon: resolved.spotterLon,
    dxLocApprox: resolved.dxLocApprox,
    spotterLocApprox: resolved.spotterLocApprox,
  };
}

/**
 * Complete grid research data
 */
export interface GridResearchData {
  /** The grid being researched */
  grid: string;
  /** DXCC entity information, null if not found */
  entity: EntityInfo | null;
  /** Distance from home QTH, null if no home grid */
  distance: { km: number } | null;
  /** Bearing from home QTH, null if no home grid */
  bearing: { degrees: number; reverse: number } | null;
  /** Activity statistics from current DX spots */
  activity: ActivityStats;
  /** Best contact time prediction, null if cannot calculate */
  bestTime: TimeWindow | null;
  /** Whether data is still loading */
  isLoading: boolean;
  /** Whether the grid is valid */
  isValidGrid: boolean;
  /** Home grid used for calculations */
  homeGrid: string | null;
}

/**
 * Hook to get comprehensive research data about a grid square
 *
 * Combines entity lookup, distance/bearing calculations, activity analysis,
 * and propagation predictions into a single data structure.
 *
 * @param grid - Maidenhead grid locator to research
 * @param overrideHomeGrid - Optional grid to use instead of user's home location
 * @returns Complete research data for the grid
 *
 * @example
 * ```tsx
 * function GridInfo({ grid }: { grid: string }) {
 *   const research = useGridResearch(grid);
 *
 *   if (!research.isValidGrid) {
 *     return <div>Invalid grid format</div>;
 *   }
 *
 *   return (
 *     <div>
 *       <h2>{research.grid}</h2>
 *       {research.entity && (
 *         <p>{research.entity.name} ({research.entity.prefix})</p>
 *       )}
 *       {research.distance && (
 *         <p>Distance: {research.distance.km} km</p>
 *       )}
 *     </div>
 *   );
 * }
 * ```
 */
export function useGridResearch(
  grid: string,
  overrideHomeGrid?: string,
): GridResearchData {
  // Get user's active location for home grid
  const activeLocation = useActiveLocation();
  const homeGrid = overrideHomeGrid ?? activeLocation?.grid ?? null;

  const spotPrefs = useOptionalViewEffectiveSpots();
  const gridActivityEndpoint = useMapStore((state) => state.gridActivityEndpoint);
  const spotSources =
    spotPrefs.filters.sources.length > 0
      ? [...spotPrefs.filters.sources]
      : undefined;
  const { allResolvedSpots } = useResolvedMapSpots({
    grid: homeGrid ?? undefined,
    enabled: true,
    resolveEnabled: true,
    sources: spotSources,
  });
  const activitySpots = useMemo(
    () => allResolvedSpots.map(resolvedSpotToActivitySpot),
    [allResolvedSpots],
  );

  // Get solar flux for propagation predictions
  const { data: solarFluxData, isLoading: isSolarLoading } = useSolarFlux();

  // Calculate the current SFI (use latest value or default)
  const currentSfi = useMemo(() => {
    if (!solarFluxData || solarFluxData.length === 0) {
      return 100; // Default moderate SFI
    }
    // Get the most recent value
    const latest = solarFluxData[solarFluxData.length - 1];
    return latest.flux ?? latest.adjusted_flux ?? 100;
  }, [solarFluxData]);

  // Validate grid
  const validGrid = useMemo((): boolean => {
    return Boolean(grid && grid.length >= 4 && isValidGrid(grid));
  }, [grid]);

  // Normalize grid to uppercase
  const normalizedGrid = useMemo(() => {
    return grid?.toUpperCase() ?? "";
  }, [grid]);

  // Get entity information
  const entity = useMemo(() => {
    if (!validGrid) {
      return null;
    }
    return getEntityFromGrid(normalizedGrid);
  }, [validGrid, normalizedGrid]);

  // Calculate distance and bearing
  const distanceBearing = useMemo(() => {
    if (!validGrid || !homeGrid || !isValidGrid(homeGrid)) {
      return null;
    }
    return getDistanceBearing(homeGrid, normalizedGrid);
  }, [validGrid, homeGrid, normalizedGrid]);

  // Parse distance
  const distance = useMemo(() => {
    if (!distanceBearing) {
      return null;
    }
    return {
      km: distanceBearing.distanceKm,
    };
  }, [distanceBearing]);

  // Parse bearing
  const bearing = useMemo(() => {
    if (!distanceBearing) {
      return null;
    }
    return {
      degrees: distanceBearing.bearing,
      reverse: distanceBearing.reverseBearing,
    };
  }, [distanceBearing]);

  const activity = useMemo(() => {
    if (!validGrid) {
      return EMPTY_ACTIVITY;
    }
    const precision = normalizedGrid.length >= 6 ? 6 : 4;
    const gridPrefix = normalizedGrid.substring(0, precision);
    return getActivityStats(activitySpots, gridPrefix, {
      endpoint: gridActivityEndpoint,
    });
  }, [
    activitySpots,
    gridActivityEndpoint,
    normalizedGrid,
    validGrid,
  ]);

  // Calculate best contact time
  const bestTime = useMemo(() => {
    if (!validGrid || !homeGrid || !isValidGrid(homeGrid)) {
      return null;
    }
    return getBestContactTime(homeGrid, normalizedGrid, currentSfi);
  }, [validGrid, homeGrid, normalizedGrid, currentSfi]);

  return {
    grid: normalizedGrid,
    entity,
    distance,
    bearing,
    activity,
    bestTime,
    isLoading: isSolarLoading,
    isValidGrid: validGrid,
    homeGrid,
  };
}

/**
 * Hook to get just the entity information for a grid
 * Lighter weight than full useGridResearch when only entity is needed
 */
export function useGridEntity(grid: string): EntityInfo | null {
  return useMemo(() => {
    if (!grid || grid.length < 4 || !isValidGrid(grid)) {
      return null;
    }
    return getEntityFromGrid(grid.toUpperCase());
  }, [grid]);
}

/**
 * Hook to get distance and bearing from home to a grid
 * Lighter weight than full useGridResearch when only distance is needed
 */
export function useGridDistance(grid: string): {
  distance: { km: number } | null;
  bearing: { degrees: number; reverse: number } | null;
} {
  const activeLocation = useActiveLocation();
  const homeGrid = activeLocation?.grid ?? null;

  return useMemo(() => {
    if (!grid || !homeGrid || !isValidGrid(grid) || !isValidGrid(homeGrid)) {
      return { distance: null, bearing: null };
    }

    const result = getDistanceBearing(homeGrid, grid.toUpperCase());
    if (!result) {
      return { distance: null, bearing: null };
    }

    return {
      distance: { km: result.distanceKm },
      bearing: { degrees: result.bearing, reverse: result.reverseBearing },
    };
  }, [grid, homeGrid]);
}
