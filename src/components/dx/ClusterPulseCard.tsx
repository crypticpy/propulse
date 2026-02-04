/**
 * ClusterPulseCard Component
 *
 * A compact card for the DX Console InsightsBar showing real-time
 * cluster activity metrics. Answers "is the cluster alive right now?"
 * by displaying spot rate, median age, and peak band.
 */

import { useMemo } from "react";
import { Card } from "@/components/ui/Card";
import { useDXStore } from "@/stores/dxStore";
import type { DXSpot } from "@/types/dxcluster";

export interface ClusterPulseCardProps {
  className?: string;
  onClick?: () => void;
}

/**
 * Pulse/activity line SVG icon for the card header
 */
function PulseIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

/**
 * Expand icon shown on hover when the card is clickable
 */
function ExpandIcon() {
  return (
    <svg
      className="w-3.5 h-3.5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
      />
    </svg>
  );
}

/**
 * Compute the age of a spot in minutes from the current time.
 *
 * The DXSpot `time` field is a Date object. We compute the difference
 * in minutes between now (UTC) and the spot time.
 * Negative ages (future timestamps from clock skew) are clamped to 0.
 */
function getSpotAgeMinutes(spot: DXSpot): number {
  const nowMs = Date.now();
  const spotMs =
    spot.time instanceof Date
      ? spot.time.getTime()
      : new Date(spot.time).getTime();
  const ageMinutes = (nowMs - spotMs) / 60_000;
  return Math.max(0, ageMinutes);
}

/**
 * Compute the median of a sorted numeric array.
 */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/**
 * Determine the rate color class based on spots per minute.
 * - Red if < 0.5 (cluster is nearly dead)
 * - Yellow if < 2 (slow)
 * - Green otherwise (healthy)
 */
function getRateColorClass(rate: number): string {
  if (rate < 0.5) return "text-alert-red";
  if (rate < 2) return "text-yellow-400";
  return "text-signal-green";
}

/**
 * ClusterPulseCard Component
 *
 * Displays real-time cluster activity metrics:
 * - Rate: spots per minute over the last 5 minutes
 * - Age: median age of all spots
 * - Peak: the band with the most spots
 *
 * @example
 * ```tsx
 * <ClusterPulseCard onClick={() => openDetail("pulse")} />
 * ```
 */
export function ClusterPulseCard({
  className = "",
  onClick,
}: ClusterPulseCardProps) {
  const spots = useDXStore((state) => state.spots);

  const metrics = useMemo(() => {
    if (spots.length === 0) {
      return null;
    }

    // --- Rate: spots in the last 5 minutes, divided by 5 ---
    const FIVE_MINUTES = 5;
    let recentCount = 0;
    const ages: number[] = [];
    const bandCounts: Record<string, number> = {};

    for (const spot of spots) {
      const ageMin = getSpotAgeMinutes(spot);
      ages.push(ageMin);

      if (ageMin <= FIVE_MINUTES) {
        recentCount++;
      }

      // Accumulate band counts
      const band = spot.band;
      if (band) {
        bandCounts[band] = (bandCounts[band] || 0) + 1;
      }
    }

    const rate = recentCount / FIVE_MINUTES;

    // --- Freshness: median age of all spots ---
    const medianAge = Math.round(median(ages));

    // --- Peak band: band with the most spots ---
    let peakBand = "--";
    let peakCount = 0;
    for (const [band, count] of Object.entries(bandCounts)) {
      if (count > peakCount) {
        peakCount = count;
        peakBand = band;
      }
    }

    return { rate, medianAge, peakBand };
  }, [spots]);

  const handleKeyDown = onClick
    ? (e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }
    : undefined;

  return (
    <Card
      className={`
        relative min-w-[140px]
        ${onClick ? "cursor-pointer hover:border-white/30 hover:bg-white/[0.05] group" : ""}
        ${className}
      `}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={handleKeyDown}
    >
      {/* Hover-reveal expand icon */}
      {onClick && (
        <div className="absolute top-2 right-2 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">
          <ExpandIcon />
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-1.5 mb-2">
        <PulseIcon className="w-3.5 h-3.5 text-signal-green" />
        <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">
          Cluster Pulse
        </span>
      </div>

      {/* Content */}
      {metrics === null ? (
        <div className="flex items-center justify-center py-2">
          <span className="text-xs text-gray-400">Waiting for spots...</span>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          {/* Rate */}
          <div className="flex flex-col items-center">
            <span
              className={`text-2xl font-bold font-mono leading-none ${getRateColorClass(metrics.rate)}`}
            >
              {metrics.rate.toFixed(1)}
            </span>
            <span className="text-[9px] text-gray-400 uppercase">/min</span>
          </div>

          {/* Divider */}
          <div className="w-px h-6 bg-white/10" />

          {/* Age (median freshness) */}
          <div className="flex flex-col items-center">
            <span className="text-2xl font-bold font-mono text-cosmic-cyan leading-none">
              {metrics.medianAge}
              <span className="text-sm">m</span>
            </span>
            <span className="text-[9px] text-gray-400 uppercase">Age</span>
          </div>

          {/* Divider */}
          <div className="w-px h-6 bg-white/10" />

          {/* Peak band */}
          <div className="flex flex-col items-center">
            <span className="text-2xl font-bold font-mono text-plasma-orange leading-none">
              {metrics.peakBand}
            </span>
            <span className="text-[9px] text-gray-400 uppercase">Peak</span>
          </div>
        </div>
      )}
    </Card>
  );
}

ClusterPulseCard.displayName = "ClusterPulseCard";

export default ClusterPulseCard;
