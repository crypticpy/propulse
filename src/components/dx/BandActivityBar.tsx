/**
 * BandActivityBar Component
 *
 * A horizontal band activity visualization bar for the DX console.
 * Shows proportional segments for each band, colored by BAND_COLORS,
 * with click-to-filter functionality and active band highlighting.
 */

import { useMemo, useCallback } from "react";
import { BAND_COLORS } from "@/lib/utils/spotColors";
import type { DXSpot } from "@/types/dxcluster";

export interface BandActivityBarProps {
  /** Array of DX spots to count by band */
  spots: DXSpot[];
  /** Callback when a band segment is clicked */
  onBandClick?: (band: string) => void;
  /** Currently active band filters (full opacity); others get 40% */
  activeBands?: string[];
  /** Additional CSS classes */
  className?: string;
}

/** Minimum segment width so small bands remain clickable */
const MIN_SEGMENT_WIDTH = 20;

/**
 * Preferred band ordering: lower frequencies first (left to right).
 * Bands not in this list are appended at the end.
 */
const BAND_ORDER = [
  "160m",
  "80m",
  "60m",
  "40m",
  "30m",
  "20m",
  "17m",
  "15m",
  "12m",
  "10m",
  "6m",
  "2m",
];

interface BandSegment {
  band: string;
  count: number;
  color: string;
}

/**
 * BandActivityBar
 *
 * Renders a horizontal bar where each band is a proportional segment.
 * Segment width corresponds to spot count (with a minimum width).
 * Click a segment to filter by that band.
 */
export function BandActivityBar({
  spots,
  onBandClick,
  activeBands,
  className = "",
}: BandActivityBarProps) {
  // Count spots per band and build ordered segments
  const segments = useMemo(() => {
    const countMap = new Map<string, number>();

    for (const spot of spots) {
      if (spot.band) {
        countMap.set(spot.band, (countMap.get(spot.band) || 0) + 1);
      }
    }

    // Build segment array
    const segArr: BandSegment[] = [];
    for (const [band, count] of countMap.entries()) {
      const color = BAND_COLORS[band.toLowerCase()] ?? BAND_COLORS.default;
      segArr.push({ band, count, color });
    }

    // Sort by preferred band order
    segArr.sort((a, b) => {
      const aIdx = BAND_ORDER.indexOf(a.band.toLowerCase());
      const bIdx = BAND_ORDER.indexOf(b.band.toLowerCase());
      const aOrder = aIdx === -1 ? BAND_ORDER.length : aIdx;
      const bOrder = bIdx === -1 ? BAND_ORDER.length : bIdx;
      return aOrder - bOrder;
    });

    return segArr;
  }, [spots]);

  // Total spots across all bands
  const totalCount = useMemo(
    () => segments.reduce((sum, s) => sum + s.count, 0),
    [segments],
  );

  const handleClick = useCallback(
    (band: string) => {
      onBandClick?.(band);
    },
    [onBandClick],
  );

  if (segments.length === 0 || totalCount === 0) {
    return null;
  }

  // Whether we have an active filter set
  const hasActiveFilter = activeBands && activeBands.length > 0;

  return (
    <div
      className={`flex items-stretch h-[30px] rounded-lg border-2 border-black bg-black gap-[2px] p-[2px] overflow-hidden ${className}`}
      role="toolbar"
      aria-label="Band activity distribution"
    >
      {segments.map((seg) => {
        // Proportional width as a percentage, but guarantee min-width via style
        const pct = (seg.count / totalCount) * 100;
        const isActive = !hasActiveFilter || activeBands!.includes(seg.band);
        // Only show text if segment is wide enough (heuristic: > 5% of total)
        const showLabel = pct > 3;

        return (
          <button
            key={seg.band}
            onClick={() => handleClick(seg.band)}
            className={`relative flex items-center justify-center transition-all duration-300 ease-in-out cursor-pointer rounded-md hover:brightness-125 ${isActive && hasActiveFilter ? "ring-1 ring-white/40" : ""}`}
            style={{
              flex: `${seg.count} 0 0%`,
              minWidth: `${MIN_SEGMENT_WIDTH}px`,
              backgroundColor: seg.color,
              opacity: isActive ? 1 : 0.35,
            }}
            title={`${seg.band}: ${seg.count} spot${seg.count !== 1 ? "s" : ""}`}
            aria-label={`${seg.band}: ${seg.count} spots. Click to filter.`}
            aria-pressed={isActive}
          >
            {showLabel && (
              <span
                className="font-mono text-xs font-bold text-black select-none whitespace-nowrap leading-none"
                style={{ textShadow: "0 1px 1px rgba(255,255,255,0.3)" }}
              >
                {seg.band}
                <span className="ml-1 text-[11px] font-semibold opacity-90">
                  {seg.count}
                </span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

BandActivityBar.displayName = "BandActivityBar";

export default BandActivityBar;
