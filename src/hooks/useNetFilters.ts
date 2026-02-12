/**
 * useNetFilters -- Local state hook for net directory filter management.
 *
 * Follows the useDXSpotListState pattern for filter + sort controls.
 * Pure client-side state -- no realtime subscriptions or Supabase calls.
 */

import { useState, useCallback, useMemo } from "react";
import type { NetFilters, NetType } from "@/types/net";
import { DEFAULT_NET_FILTERS } from "@/types/net";

/** Return type for the useNetFilters hook */
export interface UseNetFiltersResult {
  /** Current filter state */
  filters: NetFilters;
  /** Set the free-text search query */
  setSearch: (search: string) => void;
  /** Set the net type filter (null to clear) */
  setType: (type: NetType | null) => void;
  /** Set the band filter (null to clear) */
  setBand: (band: string | null) => void;
  /** Set the mode filter (null to clear) */
  setMode: (mode: string | null) => void;
  /** Set the day-of-week filter (null to clear) */
  setDayOfWeek: (dayOfWeek: number | null) => void;
  /** Set the region filter (null to clear) */
  setRegion: (region: string | null) => void;
  /** Set the sort order */
  setSortBy: (sortBy: NetFilters["sortBy"]) => void;
  /** Number of active filters (excludes sortBy) */
  activeFilterCount: number;
  /** Reset all filters to defaults */
  resetFilters: () => void;
}

/**
 * Local state hook for net directory filter management.
 * Returns filter state, individual setters, active count, and reset.
 */
export function useNetFilters(): UseNetFiltersResult {
  const [filters, setFilters] = useState<NetFilters>(DEFAULT_NET_FILTERS);

  const setSearch = useCallback(
    (search: string) => setFilters((prev) => ({ ...prev, search })),
    [],
  );

  const setType = useCallback(
    (type: NetType | null) => setFilters((prev) => ({ ...prev, type })),
    [],
  );

  const setBand = useCallback(
    (band: string | null) => setFilters((prev) => ({ ...prev, band })),
    [],
  );

  const setMode = useCallback(
    (mode: string | null) => setFilters((prev) => ({ ...prev, mode })),
    [],
  );

  const setDayOfWeek = useCallback(
    (dayOfWeek: number | null) =>
      setFilters((prev) => ({ ...prev, dayOfWeek })),
    [],
  );

  const setRegion = useCallback(
    (region: string | null) => setFilters((prev) => ({ ...prev, region })),
    [],
  );

  const setSortBy = useCallback(
    (sortBy: NetFilters["sortBy"]) =>
      setFilters((prev) => ({ ...prev, sortBy })),
    [],
  );

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.search) count++;
    if (filters.type !== null) count++;
    if (filters.band !== null) count++;
    if (filters.mode !== null) count++;
    if (filters.dayOfWeek !== null) count++;
    if (filters.region !== null) count++;
    // sortBy is excluded from the count
    return count;
  }, [filters]);

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_NET_FILTERS);
  }, []);

  return {
    filters,
    setSearch,
    setType,
    setBand,
    setMode,
    setDayOfWeek,
    setRegion,
    setSortBy,
    activeFilterCount,
    resetFilters,
  };
}
