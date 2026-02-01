/**
 * MultiplierTracker - Visual display of worked multipliers
 * Supports CQ zones, DXCC countries, WPX prefixes, states, and more
 */

import { useMemo } from "react";
import { Card } from "@/components/ui";
import type { MultiplierEntry, MultiplierType } from "@/stores/contestStore";

/** CQ zones are numbered 1-40 */
const CQ_ZONES = Array.from({ length: 40 }, (_, i) => i + 1);

/** ITU zones are numbered 1-90 */
const ITU_ZONES = Array.from({ length: 90 }, (_, i) => i + 1);

/** US States and common territories */
const US_STATES = [
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
  "DC",
];

export interface MultiplierTrackerProps {
  /** List of worked multipliers */
  multipliers: MultiplierEntry[];
  /** Type of multipliers being tracked */
  type: MultiplierType;
}

/**
 * Grid display for CQ zones (1-40)
 */
function CQZoneGrid({ workedZones }: { workedZones: Set<string> }) {
  return (
    <div className="grid grid-cols-8 gap-1">
      {CQ_ZONES.map((zone) => {
        const zoneStr = zone.toString();
        const isWorked = workedZones.has(zoneStr);
        return (
          <div
            key={zone}
            className={`
              w-8 h-8 flex items-center justify-center rounded text-xs font-mono font-bold
              transition-all duration-200
              ${
                isWorked
                  ? "bg-signal-green/30 border border-signal-green/50 text-signal-green"
                  : "bg-white/5 border border-white/10 text-gray-500"
              }
            `}
            title={`Zone ${zone}${isWorked ? " - Worked" : ""}`}
          >
            {zone}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Grid display for ITU zones (1-90)
 */
function ITUZoneGrid({ workedZones }: { workedZones: Set<string> }) {
  return (
    <div className="grid grid-cols-10 gap-1">
      {ITU_ZONES.map((zone) => {
        const zoneStr = zone.toString();
        const isWorked = workedZones.has(zoneStr);
        return (
          <div
            key={zone}
            className={`
              w-8 h-8 flex items-center justify-center rounded text-xs font-mono font-bold
              transition-all duration-200
              ${
                isWorked
                  ? "bg-signal-green/30 border border-signal-green/50 text-signal-green"
                  : "bg-white/5 border border-white/10 text-gray-500"
              }
            `}
            title={`Zone ${zone}${isWorked ? " - Worked" : ""}`}
          >
            {zone}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Grid display for US states
 */
function StateGrid({ workedStates }: { workedStates: Set<string> }) {
  return (
    <div className="grid grid-cols-10 gap-1">
      {US_STATES.map((state) => {
        const isWorked = workedStates.has(state.toUpperCase());
        return (
          <div
            key={state}
            className={`
              w-8 h-6 flex items-center justify-center rounded text-xs font-mono font-bold
              transition-all duration-200
              ${
                isWorked
                  ? "bg-signal-green/30 border border-signal-green/50 text-signal-green"
                  : "bg-white/5 border border-white/10 text-gray-500"
              }
            `}
            title={`${state}${isWorked ? " - Worked" : ""}`}
          >
            {state}
          </div>
        );
      })}
    </div>
  );
}

/**
 * List display for countries, prefixes, or other multipliers
 */
function MultiplierList({
  multipliers,
  emptyMessage,
}: {
  multipliers: MultiplierEntry[];
  emptyMessage: string;
}) {
  // Sort by timestamp (most recent first)
  const sortedMultipliers = useMemo(() => {
    return [...multipliers].sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }, [multipliers]);

  if (sortedMultipliers.length === 0) {
    return (
      <div className="text-gray-500 text-sm text-center py-4">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
      {sortedMultipliers.map((mult, index) => {
        // Highlight the most recent 3 multipliers as "new"
        const isNew = index < 3;
        return (
          <div
            key={`${mult.type}-${mult.value}-${mult.band || "all"}`}
            className={`
              px-2 py-1 rounded text-xs font-mono font-bold
              transition-all duration-200
              ${
                isNew
                  ? "bg-signal-green/30 border border-signal-green/50 text-signal-green animate-pulse"
                  : "bg-cosmic-cyan/20 border border-cosmic-cyan/30 text-cosmic-cyan"
              }
            `}
            title={mult.band ? `Band: ${mult.band}` : undefined}
          >
            {mult.value}
            {mult.band && (
              <span className="text-gray-400 ml-1 text-[10px]">
                {mult.band}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * MultiplierTracker component
 * Displays worked multipliers in appropriate format based on type
 */
export function MultiplierTracker({
  multipliers,
  type,
}: MultiplierTrackerProps) {
  // Build set of worked values for grid displays
  const workedValues = useMemo(() => {
    return new Set(multipliers.map((m) => m.value.toUpperCase()));
  }, [multipliers]);

  // Get title based on multiplier type
  const getTitle = () => {
    switch (type) {
      case "CQ_ZONE":
        return "CQ Zones";
      case "ITU_ZONE":
        return "ITU Zones";
      case "STATE":
        return "States";
      case "PROVINCE":
        return "Provinces";
      case "DXCC":
        return "DXCC Countries";
      case "WPX_PREFIX":
        return "WPX Prefixes";
      case "SECTION":
        return "ARRL/RAC Sections";
      case "GRID":
        return "Grid Squares";
      case "NONE":
      default:
        return "Multipliers";
    }
  };

  // Get empty message based on type
  const getEmptyMessage = () => {
    switch (type) {
      case "CQ_ZONE":
        return "No zones worked yet";
      case "ITU_ZONE":
        return "No zones worked yet";
      case "STATE":
        return "No states worked yet";
      case "PROVINCE":
        return "No provinces worked yet";
      case "DXCC":
        return "No countries worked yet";
      case "WPX_PREFIX":
        return "No prefixes worked yet";
      case "SECTION":
        return "No sections worked yet";
      case "GRID":
        return "No grids worked yet";
      case "NONE":
      default:
        return "No multipliers worked yet";
    }
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-orbitron text-sm font-bold text-cosmic-cyan">
          {getTitle()}
        </h3>
        <span className="text-xs text-gray-400">
          {multipliers.length} worked
        </span>
      </div>

      {/* Render appropriate display based on type */}
      {type === "CQ_ZONE" ? (
        <CQZoneGrid workedZones={workedValues} />
      ) : type === "ITU_ZONE" ? (
        <ITUZoneGrid workedZones={workedValues} />
      ) : type === "STATE" ? (
        <StateGrid workedStates={workedValues} />
      ) : (
        <MultiplierList
          multipliers={multipliers}
          emptyMessage={getEmptyMessage()}
        />
      )}
    </Card>
  );
}

export default MultiplierTracker;
