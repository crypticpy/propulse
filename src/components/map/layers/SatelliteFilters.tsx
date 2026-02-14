/**
 * SatelliteFilters — Inline satellite category filtering and compact list
 *
 * Embedded inside the Activity submenu of LayersPopover. Shows category
 * filter chips, a "Popular" satellite section, and an expandable "All
 * Satellites" list grouped by category.
 */

import { useMemo } from "react";
import { useMapStore } from "@/stores/mapStore";
import { useSatellites } from "@/hooks/useSatellites";
import { POPULAR_SATS } from "@/lib/api/satellites";
import { CATEGORY_META } from "@/lib/utils/satellite";
import type { SatelliteCategory, SatelliteInfo } from "@/types/satellite";

// ---------------------------------------------------------------------------
// Inline micro-components (copied from SatellitePanel — ~10 lines each)
// ---------------------------------------------------------------------------

function CategoryBadge({ category }: { category: SatelliteCategory }) {
  const meta = CATEGORY_META[category];
  return (
    <span
      className={`inline-block px-1 py-px rounded text-[8px] font-semibold uppercase tracking-wider leading-none ${meta.color} ${meta.bg}`}
    >
      {meta.label}
    </span>
  );
}

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const POPULAR_NORAD_IDS = new Set(
  Object.values(POPULAR_SATS).map((s) => s.noradId),
);

const CATEGORY_ORDER: SatelliteCategory[] = [
  "iss",
  "fm",
  "linear",
  "digital",
  "weather",
  "other",
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SatelliteFilters() {
  const satelliteCategoryFilter = useMapStore((s) => s.satelliteCategoryFilter);
  const setSatelliteCategoryFilter = useMapStore(
    (s) => s.setSatelliteCategoryFilter,
  );
  const satelliteShowAll = useMapStore((s) => s.satelliteShowAll);
  const setSatelliteShowAll = useMapStore((s) => s.setSatelliteShowAll);
  const selectedSatelliteId = useMapStore((s) => s.selectedSatelliteId);
  const setSelectedSatelliteId = useMapStore((s) => s.setSelectedSatelliteId);

  const { satellites } = useSatellites();

  // Count satellites per category
  const categoryCounts = useMemo(() => {
    const counts: Partial<Record<SatelliteCategory, number>> = {};
    for (const sat of satellites) {
      counts[sat.category] = (counts[sat.category] ?? 0) + 1;
    }
    return counts;
  }, [satellites]);

  // Filter chips data
  const chips = useMemo(() => {
    const result: Array<{
      key: SatelliteCategory | "all";
      label: string;
      count: number;
    }> = [{ key: "all", label: "All", count: satellites.length }];

    for (const cat of CATEGORY_ORDER) {
      const count = categoryCounts[cat] ?? 0;
      if (count > 0) {
        result.push({ key: cat, label: CATEGORY_META[cat].label, count });
      }
    }
    return result;
  }, [satellites.length, categoryCounts]);

  // Filtered satellites
  const filtered = useMemo(() => {
    if (satelliteCategoryFilter === "all") return satellites;
    return satellites.filter((s) => s.category === satelliteCategoryFilter);
  }, [satellites, satelliteCategoryFilter]);

  // Popular satellites (matching current filter)
  const popularSats = useMemo(
    () => filtered.filter((s) => POPULAR_NORAD_IDS.has(s.noradId)),
    [filtered],
  );

  // Remaining (non-popular) grouped by category
  const remainingSats = useMemo(
    () => filtered.filter((s) => !POPULAR_NORAD_IDS.has(s.noradId)),
    [filtered],
  );

  const groupedRemaining = useMemo(() => {
    const groups: Partial<Record<SatelliteCategory, SatelliteInfo[]>> = {};
    for (const sat of remainingSats) {
      if (!groups[sat.category]) groups[sat.category] = [];
      groups[sat.category]!.push(sat);
    }
    return groups;
  }, [remainingSats]);

  return (
    <div className="space-y-1.5">
      {/* ── Category chips ── */}
      <div className="flex flex-wrap gap-1">
        {chips.map((chip) => {
          const isActive = satelliteCategoryFilter === chip.key;
          return (
            <button
              key={chip.key}
              type="button"
              onClick={() => setSatelliteCategoryFilter(chip.key)}
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
                isActive
                  ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/40"
                  : "bg-white/[0.06] text-white/50 border border-transparent hover:bg-white/[0.10] hover:text-white/70"
              }`}
            >
              {chip.label}
              <span
                className={`text-[9px] tabular-nums ${isActive ? "text-cyan-400/70" : "text-white/30"}`}
              >
                {chip.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Popular section ── */}
      {popularSats.length > 0 && (
        <div>
          <div className="flex items-center gap-1 mb-0.5 px-0.5">
            <svg
              viewBox="0 0 16 16"
              fill="currentColor"
              className="w-3 h-3 text-yellow-500/70"
            >
              <path d="M8 1.5l1.85 3.75 4.15.6-3 2.92.71 4.13L8 10.88l-3.71 1.97.71-4.08-3-2.97 4.15-.6L8 1.5z" />
            </svg>
            <span className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">
              Popular
            </span>
          </div>
          <div className="flex flex-col">
            {popularSats.map((sat) => (
              <SatRow
                key={sat.noradId}
                sat={sat}
                isSelected={selectedSatelliteId === sat.noradId}
                onSelect={setSelectedSatelliteId}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── All Satellites (collapsible) ── */}
      <div>
        <button
          type="button"
          onClick={() => setSatelliteShowAll(!satelliteShowAll)}
          className="flex items-center gap-1 w-full px-0.5 py-0.5 hover:bg-white/[0.04] rounded transition-colors"
        >
          <svg
            viewBox="0 0 10 10"
            fill="none"
            className={`w-2.5 h-2.5 text-white/40 transition-transform duration-150 ${
              satelliteShowAll ? "rotate-90" : ""
            }`}
          >
            <path
              d="M3 1.5l4 3.5-4 3.5"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">
            All Satellites
          </span>
          <span className="text-[9px] text-white/25 tabular-nums">
            ({remainingSats.length})
          </span>
        </button>

        {satelliteShowAll && (
          <div className="max-h-48 overflow-y-auto scrollbar-hide mt-0.5">
            {CATEGORY_ORDER.map((cat) => {
              const group = groupedRemaining[cat];
              if (!group || group.length === 0) return null;
              return (
                <div key={cat} className="mb-1">
                  <div className="px-0.5 py-0.5">
                    <span
                      className={`text-[9px] font-semibold uppercase tracking-wider ${CATEGORY_META[cat].color}`}
                    >
                      {CATEGORY_META[cat].label}
                    </span>
                  </div>
                  {group.map((sat) => (
                    <SatRow
                      key={sat.noradId}
                      sat={sat}
                      isSelected={selectedSatelliteId === sat.noradId}
                      onSelect={setSelectedSatelliteId}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Satellite row
// ---------------------------------------------------------------------------

function SatRow({
  sat,
  isSelected,
  onSelect,
}: {
  sat: SatelliteInfo;
  isSelected: boolean;
  onSelect: (noradId: number | null) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(sat.noradId)}
      className={`w-full flex items-center gap-1.5 px-1 py-0.5 rounded text-left transition-colors ${
        isSelected
          ? "bg-cyan-500/10 border border-cyan-500/30"
          : "border border-transparent hover:bg-white/[0.05]"
      }`}
    >
      <VisibilityDot isVisible={sat.isVisible} />
      <span className="flex-1 text-[11px] font-mono text-gray-300 truncate">
        {sat.name}
      </span>
      <CategoryBadge category={sat.category} />
    </button>
  );
}
