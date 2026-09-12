/**
 * SatelliteFilters — Layers-menu satellite controls (#1085)
 *
 * Embedded inside the Activity submenu of LayersPopover. Keeps the on/off
 * toggle's companion controls: category chips, tracking status, and two
 * spelled-out buttons that open the existing satellite surfaces. Per-satellite
 * rows live on those surfaces, not in this popover.
 */

import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useMapStore } from "@/stores/mapStore";
import { useSatellitePrefsStore } from "@/stores/satellitePrefsStore";
import { useSatellites } from "@/hooks/useSatellites";
import {
  CATEGORY_META,
  filterGlobeVisibleSatellites,
} from "@/lib/utils/satellite";
import type { SatelliteCategory } from "@/types/satellite";

const CATEGORY_ORDER: SatelliteCategory[] = [
  "iss",
  "fm",
  "linear",
  "digital",
  "weather",
  "other",
];

const ACTION_BUTTON_CLASS =
  "flex min-h-11 w-full items-center justify-center rounded-lg border border-su-line/30 bg-su-line/15 px-3 text-sm font-medium text-su-text transition-colors hover:bg-su-line/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50";

export interface SatelliteFiltersProps {
  /** Opens the Satellites list (centered dialog / existing panel). */
  onSeeFullList: () => void;
  /** Called when navigating to `/satellites` so the Layers popover can close. */
  onManageSatellites?: () => void;
}

export default function SatelliteFilters({
  onSeeFullList,
  onManageSatellites,
}: SatelliteFiltersProps) {
  const satelliteCategoryFilter = useMapStore((s) => s.satelliteCategoryFilter);
  const setSatelliteCategoryFilter = useMapStore(
    (s) => s.setSatelliteCategoryFilter,
  );
  const issTrackerActive = useMapStore((s) => s.layers.issTracker);
  const trackedNoradIds = useSatellitePrefsStore((s) => s.trackedNoradIds);

  const { satellites } = useSatellites();

  const globeVisibleSatellites = useMemo(
    () =>
      filterGlobeVisibleSatellites(satellites, {
        issTrackerActive,
        trackedNoradIds,
      }),
    [satellites, issTrackerActive, trackedNoradIds],
  );

  const categoryCounts = useMemo(() => {
    const counts: Partial<Record<SatelliteCategory, number>> = {};
    for (const sat of globeVisibleSatellites) {
      counts[sat.category] = (counts[sat.category] ?? 0) + 1;
    }
    return counts;
  }, [globeVisibleSatellites]);

  const chips = useMemo(() => {
    const result: Array<{
      key: SatelliteCategory | "all";
      label: string;
      count: number;
    }> = [
      { key: "all", label: "All", count: globeVisibleSatellites.length },
    ];

    for (const cat of CATEGORY_ORDER) {
      const count = categoryCounts[cat] ?? 0;
      if (count > 0) {
        result.push({ key: cat, label: CATEGORY_META[cat].label, count });
      }
    }
    return result;
  }, [globeVisibleSatellites.length, categoryCounts]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1" role="group" aria-label="Satellite category">
        {chips.map((chip) => {
          const isActive = satelliteCategoryFilter === chip.key;
          return (
            <button
              key={chip.key}
              type="button"
              onClick={() => setSatelliteCategoryFilter(chip.key)}
              className={`inline-flex min-h-9 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                isActive
                  ? "border border-cyan-500/40 bg-cyan-500/20 text-cyan-400"
                  : "border border-transparent bg-su-line/20 text-su-text/80 hover:bg-su-line/30 hover:text-su-text"
              }`}
            >
              {chip.label}{" "}
              <span
                className={`tabular-nums ${isActive ? "text-cyan-400/70" : "text-su-text/80"}`}
              >
                {chip.count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={onSeeFullList}
          className={ACTION_BUTTON_CLASS}
        >
          See full list
        </button>
        <Link
          to="/satellites"
          onClick={onManageSatellites}
          className={ACTION_BUTTON_CLASS}
        >
          Manage satellites
        </Link>
      </div>

      <TrackingStatusFooter totalCount={globeVisibleSatellites.length} />
    </div>
  );
}

function TrackingStatusFooter({ totalCount }: { totalCount: number }) {
  const trackedNoradIds = useSatellitePrefsStore((s) => s.trackedNoradIds);
  const hasCustomized = useSatellitePrefsStore((s) => s.hasCustomized);

  const trackedCount =
    trackedNoradIds === "all" ? totalCount : trackedNoradIds.length;
  const label = hasCustomized
    ? `Tracking ${trackedCount} of ${totalCount}`
    : "Tracking all";

  return (
    <div className="border-t border-su-line/20 px-0.5 pt-1">
      <span className="text-xs text-su-text/80">{label}</span>
    </div>
  );
}
