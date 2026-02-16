/**
 * SatellitesPage -- Satellite Database listing page.
 *
 * Displays a filterable, searchable grid of amateur radio satellites
 * grouped by category with per-category Select All / Deselect All controls.
 * Supports category filtering, sort, and a centered detail modal.
 */

import { useState, useMemo, useCallback } from "react";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useSatellites } from "@/hooks/useSatellites";
import { useSatellitePrefsStore } from "@/stores/satellitePrefsStore";
import { useUserStore } from "@/stores/userStore";
import { useSatelliteNextPasses } from "@/hooks/useSatelliteNextPasses";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { SatelliteCard } from "@/components/satellites/SatelliteCard";
import { SatelliteDetailModal } from "@/components/satellites/SatelliteDetailModal";
import {
  SatelliteFilterControls,
  DEFAULT_SATELLITE_FILTERS,
} from "@/components/satellites/SatelliteFilterControls";
import { SatelliteGroupPicker } from "@/components/satellites/SatelliteGroupPicker";
import { CATEGORY_META } from "@/lib/utils/satellite";
import type { SatelliteFilters } from "@/components/satellites/SatelliteFilterControls";
import type {
  SatelliteCategory,
  SatelliteInfoExtended,
} from "@/types/satellite";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CATEGORY_ORDER: SatelliteCategory[] = [
  "iss",
  "fm",
  "linear",
  "digital",
  "weather",
  "other",
];

const CATEGORY_DISPLAY_NAMES: Record<string, string> = {
  iss: "Space Stations",
  fm: "FM Repeaters",
  linear: "Linear Transponders",
  digital: "Digital & Packet",
  weather: "Weather Satellites",
  other: "Other Satellites",
};

function matchesSearch(sat: SatelliteInfoExtended, search: string): boolean {
  if (!search) return true;
  const lower = search.toLowerCase();
  return (
    sat.name.toLowerCase().includes(lower) ||
    String(sat.noradId).includes(lower)
  );
}

/** Sort order lookup for category-based sorting */
const CATEGORY_SORT_ORDER: Record<string, number> = {
  iss: 0,
  fm: 1,
  linear: 2,
  digital: 3,
  weather: 4,
  other: 5,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SatellitesPage() {
  const isMobile = useIsMobile();

  // Satellite data
  const { satellites, isLoading } = useSatellites();

  // Observer location
  const station = useUserStore((s) => s.station);
  const observerLat = station?.lat;
  const observerLon = station?.lon;

  // Tracking prefs
  const isTracked = useSatellitePrefsStore((s) => s.isTracked);
  const trackSatellite = useSatellitePrefsStore((s) => s.trackSatellite);
  const untrackSatellite = useSatellitePrefsStore((s) => s.untrackSatellite);
  const trackAll = useSatellitePrefsStore((s) => s.trackAll);
  const trackCategory = useSatellitePrefsStore((s) => s.trackCategory);
  const untrackCategory = useSatellitePrefsStore((s) => s.untrackCategory);
  const hasCustomized = useSatellitePrefsStore((s) => s.hasCustomized);
  const trackedNoradIds = useSatellitePrefsStore((s) => s.trackedNoradIds);

  // All NORAD IDs for the untrack expansion
  const allNoradIds = useMemo(
    () => satellites.map((s) => s.noradId),
    [satellites],
  );

  // Next pass predictions
  const nextPassMap = useSatelliteNextPasses(
    satellites,
    observerLat,
    observerLon,
  );

  // Detail modal state
  const [detailSatellite, setDetailSatellite] =
    useState<SatelliteInfoExtended | null>(null);

  // Filter state
  const [filters, setFilters] = useState<SatelliteFilters>({
    ...DEFAULT_SATELLITE_FILTERS,
  });

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.search) count++;
    if (filters.category !== "all") count++;
    if (filters.visibleOnly) count++;
    if (filters.customOnly) count++;
    if (filters.tleAge !== null) count++;
    return count;
  }, [filters]);

  // Filter change handler
  const handleFilterChange = useCallback(
    <K extends keyof SatelliteFilters>(key: K, value: SatelliteFilters[K]) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  // Reset all filters
  const handleReset = useCallback(() => {
    setFilters({ ...DEFAULT_SATELLITE_FILTERS });
  }, []);

  // Track toggle handler
  const handleTrackToggle = useCallback(
    (noradId: number, track: boolean) => {
      if (track) {
        trackSatellite(noradId);
      } else {
        untrackSatellite(noradId, allNoradIds);
      }
    },
    [trackSatellite, untrackSatellite, allNoradIds],
  );

  // Tracking count
  const trackedCount = useMemo(() => {
    if (trackedNoradIds === "all") return satellites.length;
    return trackedNoradIds.length;
  }, [trackedNoradIds, satellites.length]);

  // Apply filters + sort
  const filteredSatellites = useMemo(() => {
    let result = satellites.filter((sat) => {
      // Search
      if (!matchesSearch(sat, filters.search)) return false;

      // Category
      if (filters.category !== "all" && sat.category !== filters.category)
        return false;

      // Visible only
      if (filters.visibleOnly && !sat.isVisible) return false;

      // Custom only
      if (filters.customOnly && !sat.isCustom) return false;

      // TLE age
      if (filters.tleAge !== null && sat.tleAge !== filters.tleAge)
        return false;

      return true;
    });

    // Sort
    result = [...result].sort((a, b) => {
      switch (filters.sortBy) {
        case "name":
          return a.name.localeCompare(b.name);
        case "category": {
          const catDiff =
            (CATEGORY_SORT_ORDER[a.category] ?? 99) -
            (CATEGORY_SORT_ORDER[b.category] ?? 99);
          if (catDiff !== 0) return catDiff;
          return a.name.localeCompare(b.name);
        }
        case "nextPass": {
          const passA = nextPassMap.get(a.noradId);
          const passB = nextPassMap.get(b.noradId);
          // Satellites with passes come first, sorted by AOS time
          if (passA && passB) {
            const aosA =
              passA.aos instanceof Date
                ? passA.aos.getTime()
                : new Date(passA.aos as unknown as string).getTime();
            const aosB =
              passB.aos instanceof Date
                ? passB.aos.getTime()
                : new Date(passB.aos as unknown as string).getTime();
            return aosA - aosB;
          }
          if (passA && !passB) return -1;
          if (!passA && passB) return 1;
          return a.name.localeCompare(b.name);
        }
        default:
          return 0;
      }
    });

    return result;
  }, [satellites, filters, nextPassMap]);

  // Group filtered satellites by category
  const groupedByCategory = useMemo(() => {
    const groups: {
      category: SatelliteCategory;
      sats: SatelliteInfoExtended[];
    }[] = [];
    for (const cat of CATEGORY_ORDER) {
      const sats = filteredSatellites.filter((s) => s.category === cat);
      if (sats.length > 0) {
        groups.push({ category: cat, sats });
      }
    }
    return groups;
  }, [filteredSatellites]);

  // Handle per-category select all / deselect all
  const handleCategorySelectAll = useCallback(
    (categorySats: SatelliteInfoExtended[]) => {
      const categoryNoradIds = categorySats.map((s) => s.noradId);
      trackCategory(categoryNoradIds, allNoradIds);
    },
    [trackCategory, allNoradIds],
  );

  const handleCategoryDeselectAll = useCallback(
    (categorySats: SatelliteInfoExtended[]) => {
      const categoryNoradIds = categorySats.map((s) => s.noradId);
      untrackCategory(categoryNoradIds, allNoradIds);
    },
    [untrackCategory, allNoradIds],
  );

  return (
    <div
      className={
        isMobile
          ? "px-4 py-4 space-y-4"
          : "max-w-[1200px] mx-auto px-6 py-6 space-y-6"
      }
    >
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-white">Satellite Database</h1>
          {!isLoading && satellites.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/10 text-gray-300 border border-white/10">
              {satellites.length}
            </span>
          )}
        </div>
        <p className="text-sm text-gray-400 mt-1 max-w-xl">
          All satellites below are tracked on the globe by default. Toggle
          individual satellites or use category controls to customize your
          tracking preferences.
        </p>
      </div>

      {/* Tracking status bar */}
      {!isLoading && satellites.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-gray-400">
            {hasCustomized
              ? `Tracking ${trackedCount} of ${satellites.length} satellites`
              : `Tracking all ${satellites.length} satellites`}
          </span>
          <button
            onClick={hasCustomized ? trackAll : undefined}
            className={`px-3 py-1 rounded-full text-[11px] font-medium transition-colors ${
              hasCustomized
                ? "bg-white/5 text-gray-300 border border-white/10 hover:bg-white/10 cursor-pointer"
                : "bg-white/[0.02] text-gray-600 border border-white/5 cursor-default"
            }`}
          >
            Reset to Default
          </button>
        </div>
      )}

      {/* Satellite group picker */}
      {!isLoading && <SatelliteGroupPicker />}

      {/* Filter controls */}
      <SatelliteFilterControls
        filters={filters}
        onChange={handleFilterChange}
        onReset={handleReset}
        activeCount={activeFilterCount}
      />

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center min-h-[30vh]">
          <LoadingSpinner size="lg" text="Loading satellites..." />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && filteredSatellites.length === 0 && (
        <div className="flex flex-col items-center justify-center min-h-[30vh] text-center">
          <svg
            className="w-12 h-12 text-gray-600 mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 3v1m0 16v1m8.66-13.5l-.87.5M4.21 16l-.87.5M20.66 16l-.87-.5M4.21 8l-.87-.5M16 12a4 4 0 11-8 0 4 4 0 018 0z"
            />
          </svg>
          <p className="text-gray-400 text-sm mb-2">No satellites found</p>
          <p className="text-gray-500 text-xs mb-4">
            {activeFilterCount > 0
              ? "Try adjusting your filters or search query"
              : "Satellite TLE data could not be loaded"}
          </p>
          {activeFilterCount > 0 && (
            <button
              onClick={handleReset}
              className="text-xs text-plasma-orange hover:text-plasma-orange/80 transition-colors"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}

      {/* Satellite card grid grouped by category */}
      {!isLoading &&
        filteredSatellites.length > 0 &&
        groupedByCategory.map(({ category, sats }) => {
          const meta = CATEGORY_META[category];
          return (
            <div key={category} className="space-y-3">
              {/* Category header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${meta?.color ?? "text-gray-400"} ${meta?.bg ?? "bg-gray-400/20"}`}
                  >
                    {meta?.label ?? category.toUpperCase()}
                  </span>
                  <h2 className="text-sm font-semibold text-gray-200">
                    {CATEGORY_DISPLAY_NAMES[category] ?? category}
                  </h2>
                  <span className="text-[11px] text-gray-500">
                    ({sats.length})
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleCategorySelectAll(sats)}
                    className="text-[11px] text-gray-400 hover:text-signal-green transition-colors"
                  >
                    Select All
                  </button>
                  <span className="text-gray-600">&middot;</span>
                  <button
                    onClick={() => handleCategoryDeselectAll(sats)}
                    className="text-[11px] text-gray-400 hover:text-alert-red transition-colors"
                  >
                    Deselect All
                  </button>
                </div>
              </div>

              {/* Cards grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {sats.map((sat) => (
                  <SatelliteCard
                    key={sat.noradId}
                    satellite={sat}
                    nextPass={nextPassMap.get(sat.noradId) ?? null}
                    isTracked={isTracked(sat.noradId)}
                    onTrackToggle={handleTrackToggle}
                    onCardClick={setDetailSatellite}
                  />
                ))}
              </div>
            </div>
          );
        })}

      {/* Detail modal */}
      {detailSatellite && (
        <SatelliteDetailModal
          satellite={detailSatellite}
          nextPass={nextPassMap.get(detailSatellite.noradId) ?? null}
          isTracked={isTracked(detailSatellite.noradId)}
          onTrackToggle={handleTrackToggle}
          onClose={() => setDetailSatellite(null)}
        />
      )}
    </div>
  );
}
