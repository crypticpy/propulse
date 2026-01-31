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
}) => {
  return (
    <div
      className="grid grid-cols-4 md:grid-cols-5 gap-2 md:gap-4 py-2 px-2 items-center border-b border-white/5 last:border-b-0 hover:bg-white/[0.02] transition-colors"
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

      {/* Best For */}
      <div
        className="text-xs text-gray-400 truncate text-right md:text-left"
        role="cell"
        title={bestFor}
      >
        {bestFor}
      </div>
    </div>
  );
};

BandRow.displayName = "BandRow";

export default BandRow;
