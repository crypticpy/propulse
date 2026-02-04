/**
 * SatellitePanel Component
 *
 * Info panel displaying tracked amateur radio satellites with:
 * - List of satellites with category badges and visibility indicators
 * - Selected satellite details (position, altitude, velocity)
 * - Next pass predictions when observer location is available
 *
 * Uses the same Card styling pattern as BandConditionsPanel.
 */

import { useMemo, useState, useCallback } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { Card } from "@/components/ui/Card";
import { useSatellites } from "@/hooks/useSatellites";
import type {
  SatelliteInfo,
  SatelliteCategory,
  PassPrediction,
} from "@/types/satellite";

// ---------------------------------------------------------------------------
// Constants & Helpers
// ---------------------------------------------------------------------------

/** Category display config */
const CATEGORY_META: Record<
  SatelliteCategory,
  { label: string; color: string; bg: string }
> = {
  iss: { label: "ISS", color: "text-white", bg: "bg-white/20" },
  fm: { label: "FM", color: "text-green-400", bg: "bg-green-400/20" },
  linear: { label: "LIN", color: "text-cyan-400", bg: "bg-cyan-400/20" },
  digital: { label: "DIG", color: "text-orange-400", bg: "bg-orange-400/20" },
  weather: { label: "WX", color: "text-purple-400", bg: "bg-purple-400/20" },
  other: { label: "OTH", color: "text-gray-400", bg: "bg-gray-400/20" },
};

/** Format azimuth to compass bearing string */
function formatAzimuth(az: number): string {
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const index = Math.round(az / 45) % 8;
  return `${Math.round(az)}° ${directions[index]}`;
}

/** Format lat/lon for display */
function formatLatLon(lat: number, lon: number): string {
  const latDir = lat >= 0 ? "N" : "S";
  const lonDir = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(1)}°${latDir} ${Math.abs(lon).toFixed(1)}°${lonDir}`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Category badge */
function CategoryBadge({ category }: { category: SatelliteCategory }) {
  const meta = CATEGORY_META[category];
  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider ${meta.color} ${meta.bg}`}
    >
      {meta.label}
    </span>
  );
}

/** Visibility indicator dot */
function VisibilityDot({ isVisible }: { isVisible: boolean }) {
  return (
    <span
      className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${
        isVisible ? "bg-green-400 animate-pulse" : "bg-gray-600"
      }`}
      title={isVisible ? "Above horizon" : "Below horizon"}
    />
  );
}

/** Single satellite row in the list */
function SatelliteRow({
  satellite,
  isSelected,
  onSelect,
}: {
  satellite: SatelliteInfo;
  isSelected: boolean;
  onSelect: (noradId: number) => void;
}) {
  return (
    <button
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors text-left ${
        isSelected
          ? "bg-white/10 border border-white/20"
          : "hover:bg-white/5 border border-transparent"
      }`}
      onClick={() => onSelect(satellite.noradId)}
    >
      <VisibilityDot isVisible={satellite.isVisible} />
      <span className="flex-1 text-xs font-mono text-gray-200 truncate">
        {satellite.name}
      </span>
      <CategoryBadge category={satellite.category} />
    </button>
  );
}

/** Pass prediction row */
function PassRow({ pass }: { pass: PassPrediction }) {
  const isActive = pass.aos <= new Date() && pass.los >= new Date();
  const isFuture = pass.aos > new Date();

  return (
    <div
      className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs ${
        isActive
          ? "bg-green-400/10 border border-green-400/20"
          : "bg-white/[0.02]"
      }`}
    >
      <div className="flex-1">
        <div className="flex items-center gap-1.5">
          {isActive && (
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          )}
          <span className="font-mono text-gray-300">
            {isActive
              ? "NOW"
              : isFuture
                ? format(pass.aos, "HH:mm")
                : format(pass.aos, "HH:mm")}
          </span>
          <span className="text-gray-500">-</span>
          <span className="font-mono text-gray-400">
            {format(pass.los, "HH:mm")}
          </span>
        </div>
        {isFuture && (
          <div className="text-[10px] text-gray-500 mt-0.5">
            in {formatDistanceToNow(pass.aos)}
          </div>
        )}
      </div>
      <div className="text-right">
        <div className="font-mono text-gray-300">
          {Math.round(pass.maxEl)}° max
        </div>
        <div className="text-[10px] text-gray-500 mt-0.5">
          {formatAzimuth(pass.aosAz)} → {formatAzimuth(pass.losAz)}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Selected Satellite Detail View
// ---------------------------------------------------------------------------

function SatelliteDetail({
  satellite,
  passes,
  onBack,
}: {
  satellite: SatelliteInfo;
  passes: PassPrediction[];
  onBack: () => void;
}) {
  const { lat, lon, alt, velocity } = satellite.position;

  return (
    <div className="flex flex-col h-full">
      {/* Header with back button */}
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={onBack}
          className="p-1 hover:bg-white/10 rounded transition-colors flex-shrink-0"
          title="Back to list"
        >
          <svg
            className="w-4 h-4 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white truncate">
              {satellite.name}
            </span>
            <CategoryBadge category={satellite.category} />
          </div>
          <div className="text-[10px] text-gray-500 font-mono">
            NORAD {satellite.noradId}
          </div>
        </div>
        <VisibilityDot isVisible={satellite.isVisible} />
      </div>

      {/* Position data grid */}
      <div
        className="grid gap-2 mb-3"
        style={{ gridTemplateColumns: "1fr 1fr" }}
      >
        <div className="bg-white/[0.03] rounded-md px-2 py-1.5">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider">
            Position
          </div>
          <div className="text-xs font-mono text-gray-200 mt-0.5">
            {formatLatLon(lat, lon)}
          </div>
        </div>
        <div className="bg-white/[0.03] rounded-md px-2 py-1.5">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider">
            Altitude
          </div>
          <div className="text-xs font-mono text-gray-200 mt-0.5">
            {Math.round(alt)} km
          </div>
        </div>
        <div className="bg-white/[0.03] rounded-md px-2 py-1.5">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider">
            Velocity
          </div>
          <div className="text-xs font-mono text-gray-200 mt-0.5">
            {velocity.toFixed(1)} km/s
          </div>
        </div>
        <div className="bg-white/[0.03] rounded-md px-2 py-1.5">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider">
            Status
          </div>
          <div
            className={`text-xs font-mono mt-0.5 ${
              satellite.isVisible ? "text-green-400" : "text-gray-400"
            }`}
          >
            {satellite.isVisible ? "Visible" : "Below horizon"}
          </div>
        </div>
      </div>

      {/* Pass predictions */}
      <div className="flex-1 min-h-0">
        <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">
          Next Passes (24h)
        </div>
        {passes.length === 0 ? (
          <div className="text-xs text-gray-500 text-center py-3">
            No passes predicted — set your QTH in settings
          </div>
        ) : (
          <div className="flex flex-col gap-1 overflow-y-auto max-h-[200px] scrollbar-hide">
            {passes.slice(0, 8).map((pass, idx) => (
              <PassRow key={idx} pass={pass} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Panel Component
// ---------------------------------------------------------------------------

interface SatellitePanelProps {
  className?: string;
  /** When true, panel collapses to a slim summary bar */
  collapsed?: boolean;
  /** Callback to toggle collapsed state */
  onToggleCollapse?: () => void;
}

export function SatellitePanel({
  className = "",
  collapsed = false,
  onToggleCollapse,
}: SatellitePanelProps) {
  const {
    satellites,
    selectedSatellite,
    selectSatellite,
    isLoading,
    nextPasses,
    isAvailable,
    refetch,
  } = useSatellites();

  const [filterCategory, setFilterCategory] = useState<
    SatelliteCategory | "all"
  >("all");

  // Filter and sort satellites
  const filteredSatellites = useMemo(() => {
    let filtered = satellites;

    // Apply category filter
    if (filterCategory !== "all") {
      filtered = filtered.filter((s) => s.category === filterCategory);
    }

    // Sort: visible first, then by category priority, then alphabetically
    const categoryOrder: Record<SatelliteCategory, number> = {
      iss: 0,
      fm: 1,
      linear: 2,
      digital: 3,
      weather: 4,
      other: 5,
    };

    return [...filtered].sort((a, b) => {
      // Visible satellites first
      if (a.isVisible !== b.isVisible) {
        return a.isVisible ? -1 : 1;
      }
      // Then by category
      if (a.category !== b.category) {
        return categoryOrder[a.category] - categoryOrder[b.category];
      }
      // Then alphabetically
      return a.name.localeCompare(b.name);
    });
  }, [satellites, filterCategory]);

  // Count visible satellites
  const visibleCount = useMemo(
    () => satellites.filter((s) => s.isVisible).length,
    [satellites],
  );

  const handleSelect = useCallback(
    (noradId: number) => {
      if (selectedSatellite?.noradId === noradId) {
        selectSatellite(null);
      } else {
        selectSatellite(noradId);
      }
    },
    [selectedSatellite, selectSatellite],
  );

  const handleBack = useCallback(() => {
    selectSatellite(null);
  }, [selectSatellite]);

  // Category filter buttons
  const categoryFilters: Array<{
    key: SatelliteCategory | "all";
    label: string;
  }> = [
    { key: "all", label: "All" },
    { key: "iss", label: "ISS" },
    { key: "fm", label: "FM" },
    { key: "linear", label: "Linear" },
    { key: "digital", label: "Digital" },
  ];

  // Collapsed summary
  if (collapsed) {
    return (
      <Card className={`${className} !p-2.5 !rounded-lg`}>
        <div
          className="flex items-center gap-3 cursor-pointer"
          onClick={onToggleCollapse}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onToggleCollapse?.();
            }
          }}
        >
          {/* Expand indicator */}
          <svg
            className="w-3.5 h-3.5 text-gray-500 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>

          {/* Satellite icon */}
          <svg
            className="w-4 h-4 text-cyan-400 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>

          <span className="text-sm text-gray-300">Satellites</span>

          <div className="w-px h-3 bg-white/10" />

          {/* Summary stats */}
          <div className="flex items-center gap-2 text-[10px] font-mono">
            <span className="text-gray-400">{satellites.length} tracked</span>
            {visibleCount > 0 && (
              <span className="text-green-400">{visibleCount} visible</span>
            )}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className={`${className} flex flex-col h-full p-2 !rounded-lg`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className="p-1 hover:bg-white/10 rounded transition-colors flex-shrink-0"
              title="Collapse panel"
            >
              <svg
                className="w-4 h-4 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
          )}
          <h3 className="text-xs font-medium text-gray-300 uppercase tracking-wide truncate">
            Satellites
          </h3>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {visibleCount > 0 && (
            <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-green-400/10 text-green-400">
              {visibleCount} vis
            </span>
          )}
          <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-white/5 text-gray-400">
            {satellites.length} sats
          </span>
          <button
            onClick={() => refetch()}
            className="p-1 hover:bg-white/10 rounded transition-colors"
            title="Refresh TLE data"
            aria-label="Refresh satellite data"
          >
            <svg
              className={`w-3.5 h-3.5 text-gray-400 ${isLoading ? "animate-spin" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {/* Loading state */}
        {isLoading && satellites.length === 0 && (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            <svg
              className="w-4 h-4 mr-2 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Loading TLE data...
          </div>
        )}

        {/* No data state */}
        {!isLoading && !isAvailable && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm text-center px-4">
            <p>No satellite data available</p>
            <button
              onClick={() => refetch()}
              className="mt-2 text-xs text-cyan-400 hover:text-cyan-300 underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* Detail view for selected satellite */}
        {selectedSatellite && (
          <SatelliteDetail
            satellite={selectedSatellite}
            passes={nextPasses}
            onBack={handleBack}
          />
        )}

        {/* Satellite list (when no satellite is selected) */}
        {!selectedSatellite && isAvailable && (
          <div className="flex flex-col h-full">
            {/* Category filter bar */}
            <div className="flex gap-1 mb-2 flex-shrink-0 overflow-x-auto scrollbar-hide">
              {categoryFilters.map((filter) => (
                <button
                  key={filter.key}
                  onClick={() => setFilterCategory(filter.key)}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors whitespace-nowrap ${
                    filterCategory === filter.key
                      ? "bg-white/15 text-white"
                      : "bg-white/5 text-gray-400 hover:bg-white/10"
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            {/* Scrollable satellite list */}
            <div className="flex-1 overflow-y-auto scrollbar-hide -mx-1">
              <div className="flex flex-col gap-0.5 px-1">
                {filteredSatellites.map((sat) => (
                  <SatelliteRow
                    key={sat.noradId}
                    satellite={sat}
                    isSelected={false}
                    onSelect={handleSelect}
                  />
                ))}
              </div>

              {filteredSatellites.length === 0 && (
                <div className="text-center text-gray-500 text-xs py-4">
                  No satellites match filter
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

export default SatellitePanel;
