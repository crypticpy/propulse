import React from "react";
import { Badge, type BadgeStatus } from "@/components/ui";
import type { BandCondition, VHFCondition } from "@/types/solar";

export interface BandRowProps {
  /** Band designation (e.g., "20m") */
  name: string;
  /** Center frequency (e.g., "14.0 MHz") */
  freq: string;
  /** Expected propagation during daylight hours */
  dayCondition: BandCondition | VHFCondition;
  /** Expected propagation during nighttime */
  nightCondition: BandCondition | VHFCondition;
  /** Typical use case */
  bestFor: string;
  /** True if band is primarily nighttime (160m) */
  isNightOnly?: boolean;
  /** Number of DX cluster spots in the last 30 min */
  spotCount?: number;
}

/**
 * Map band condition to Badge status
 */
function conditionToBadgeStatus(
  condition: BandCondition | VHFCondition,
): BadgeStatus {
  switch (condition) {
    case "Excellent":
      return "excellent";
    case "Good":
      return "good";
    case "Fair":
      return "fair";
    case "Poor":
      return "poor";
    case "Aurora":
      return "active";
    default:
      return "poor";
  }
}

/**
 * BandRow Component
 *
 * A single row in the band conditions table showing propagation status
 * for a specific amateur radio band.
 *
 * @example
 * ```tsx
 * <BandRow
 *   name="20m"
 *   freq="14.0 MHz"
 *   dayCondition="Good"
 *   nightCondition="Fair"
 *   bestFor="Daytime DX"
 * />
 * ```
 */
export const BandRow: React.FC<BandRowProps> = ({
  name,
  freq,
  dayCondition,
  nightCondition,
  bestFor,
  isNightOnly = false,
  spotCount,
}) => {
  return (
    <div
      className="grid grid-cols-[50px_1fr_1fr_1fr] md:grid-cols-[60px_80px_90px_90px_1fr] lg:grid-cols-[60px_80px_90px_90px_70px_1fr] gap-3 md:gap-4 py-2 px-2 items-center border-b border-white/5 last:border-b-0 hover:bg-white/[0.02] transition-colors"
      role="row"
    >
      {/* Band Name */}
      <div className="font-mono text-sm text-white font-medium" role="cell">
        {name}
      </div>

      {/* Frequency - hidden on mobile */}
      <div
        className="hidden md:block font-mono text-xs text-gray-400"
        role="cell"
      >
        {freq}
      </div>

      {/* Day Condition */}
      <div className="flex justify-center" role="cell">
        {isNightOnly ? (
          <span
            className="text-gray-500 text-lg"
            title="Night-only band"
            aria-label="Night-only band"
          >
            🌙
          </span>
        ) : (
          <Badge status={conditionToBadgeStatus(dayCondition)} size="sm">
            {dayCondition}
          </Badge>
        )}
      </div>

      {/* Night Condition */}
      <div className="flex justify-center" role="cell">
        <Badge status={conditionToBadgeStatus(nightCondition)} size="sm">
          {nightCondition}
        </Badge>
      </div>

      {/* Activity - hidden below lg */}
      <div
        className="hidden lg:flex items-center justify-center gap-1"
        role="cell"
      >
        {spotCount != null && spotCount > 0 ? (
          <>
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                spotCount >= 10
                  ? "bg-signal-green"
                  : spotCount >= 3
                    ? "bg-caution-amber"
                    : "bg-gray-500"
              }`}
              title={
                spotCount >= 10
                  ? "High activity"
                  : spotCount >= 3
                    ? "Moderate activity"
                    : "Low activity"
              }
            />
            <span className="font-mono text-xs text-gray-300">{spotCount}</span>
          </>
        ) : (
          <span className="text-gray-600 text-xs">--</span>
        )}
      </div>

      {/* Best For */}
      <div
        className="text-xs text-gray-400 text-right md:text-left md:pl-1"
        role="cell"
      >
        {bestFor}
      </div>
    </div>
  );
};

BandRow.displayName = "BandRow";

export default BandRow;
