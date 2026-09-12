import React from "react";
import { Badge, type BadgeStatus } from "@/components/ui";
import { BandPill } from "@/components/ui/BandPill";
import type { BandCondition, VHFCondition } from "@/types/solar";
import { BAND_CONDITIONS_GRID_TEMPLATE } from "./bandConditionsGrid";

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
      className={`grid ${BAND_CONDITIONS_GRID_TEMPLATE} gap-3 md:gap-4 py-2 px-2 items-center border-b border-su-line/20 last:border-b-0 hover:bg-su-line/10 transition-colors`}
      role="row"
    >
      {/* Band Name */}
      <div className="col-span-2 sm:col-span-1" role="cell">
        <BandPill band={name} size="md" />
      </div>

      {/* Frequency - hidden on mobile */}
      <div
        className="hidden md:block font-mono text-xs text-su-muted"
        role="cell"
      >
        {freq}
      </div>

      {/* Day Condition */}
      <div className="flex justify-center" role="cell">
        {isNightOnly ? (
          <span
            className="text-su-muted text-lg"
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
                    : "bg-su-line"
              }`}
              title={
                spotCount >= 10
                  ? "High activity"
                  : spotCount >= 3
                    ? "Moderate activity"
                    : "Low activity"
              }
            />
            <span className="font-mono text-xs text-su-muted">{spotCount}</span>
          </>
        ) : (
          <span className="text-su-muted text-xs">--</span>
        )}
      </div>

      {/* Best For */}
      <div
        className="col-span-2 min-w-0 text-xs text-su-muted sm:col-span-1 sm:break-words sm:text-right md:text-left md:pl-1"
        role="cell"
      >
        <span className="font-semibold sm:hidden">Best for: </span>
        {bestFor}
      </div>
    </div>
  );
};

BandRow.displayName = "BandRow";

export default BandRow;
