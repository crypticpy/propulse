/**
 * MultiplierMatrix - Visual band-based multiplier tracking grid
 *
 * Features:
 * - Band tabs for per-band multiplier tracking
 * - Grid displays for zones, states, DXCC entities
 * - Worked (green) / Needed (gray) visual coding
 * - Compact display for high-speed contest operation
 * - ProPulse aesthetic with plasma-orange, cosmic-cyan, signal-green colors
 */

import { useMemo, useState, useCallback } from "react";
import { Card } from "@/components/ui";
import { useContestStore } from "@/stores/contestStore";
import { getContestById } from "@/lib/data/contests";
import { getWorkedBandsForMult } from "@/lib/contest";
import { getEffectiveMultiplierRules } from "@/types/contest";
import type { MultiplierType, MultiplierRule } from "@/types/contest";
import type { ContestSession, MultiplierEntry } from "@/stores/contestStore";
import { ARRL_RAC_SECTIONS, US_STATES } from "@/lib/contest/validation";

// ============================================================================
// Types
// ============================================================================

export interface MultiplierMatrixProps {
  /** Optional class name for styling */
  className?: string;
  /** Show compact version */
  compact?: boolean;
  /** Default selected band (for perBand contests) */
  defaultBand?: string;
}

// ============================================================================
// Constants
// ============================================================================

/** Standard contest bands for tabs */
const CONTEST_BANDS = ["160m", "80m", "40m", "20m", "15m", "10m"] as const;

/** CQ zones (1-40) */
const CQ_ZONES = Array.from({ length: 40 }, (_, i) => i + 1);

/** ITU zones (1-90) */
const ITU_ZONES = Array.from({ length: 90 }, (_, i) => i + 1);

/** Common DXCC prefixes for display in grid */
const COMMON_DXCC = [
  "K",
  "VE",
  "DL",
  "G",
  "F",
  "I",
  "EA",
  "PA",
  "ON",
  "SP",
  "OK",
  "OM",
  "HA",
  "OE",
  "HB9",
  "SM",
  "LA",
  "OH",
  "OZ",
  "UA",
  "UR",
  "JA",
  "PY",
  "LU",
  "CE",
  "VK",
  "ZL",
  "KH6",
  "ZS",
  "CN",
  "HL",
  "BV",
  "VU",
  "XE",
] as const;

/** Canadian provinces */
const PROVINCES = [
  "AB",
  "BC",
  "MB",
  "NB",
  "NL",
  "NS",
  "NT",
  "NU",
  "ON",
  "PE",
  "QC",
  "SK",
  "YT",
] as const;

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Build a set of worked values for a specific multiplier type on a specific band
 */
function getWorkedValuesForBand(
  multipliers: MultiplierEntry[],
  type: MultiplierType,
  band: string | null,
): Set<string> {
  const worked = new Set<string>();

  for (const mult of multipliers) {
    if (mult.type !== type) {
      continue;
    }

    if (band === null) {
      // All bands (for non-perBand contests)
      worked.add(mult.value.toUpperCase());
    } else if (mult.band?.toLowerCase() === band.toLowerCase()) {
      worked.add(mult.value.toUpperCase());
    }
  }

  return worked;
}

/**
 * Get unique worked values across all bands (for perBand contests)
 */
function getUniqueWorkedAcrossAllBands(
  multipliers: MultiplierEntry[],
  type: MultiplierType,
): Set<string> {
  const worked = new Set<string>();
  for (const mult of multipliers) {
    if (mult.type === type) {
      worked.add(mult.value.toUpperCase());
    }
  }
  return worked;
}

/**
 * Count worked multipliers for a type on a specific band
 */
function countWorkedForBand(
  multipliers: MultiplierEntry[],
  type: MultiplierType,
  band: string | null,
): number {
  return multipliers.filter(
    (m) =>
      m.type === type &&
      (band === null || m.band?.toLowerCase() === band.toLowerCase()),
  ).length;
}

// ============================================================================
// Grid Components
// ============================================================================

interface GridCellProps {
  value: string;
  isWorked: boolean;
  bands?: string[];
  showBands?: boolean;
  size?: "sm" | "md";
}

/**
 * Individual cell in a multiplier grid
 */
function GridCell({
  value,
  isWorked,
  bands,
  showBands = false,
  size = "md",
}: GridCellProps) {
  const sizeClasses = size === "sm" ? "w-7 h-6 text-[10px]" : "w-8 h-7 text-xs";

  return (
    <div
      className={`
        ${sizeClasses} flex items-center justify-center rounded font-mono font-bold
        transition-all duration-150
        ${
          isWorked
            ? "bg-signal-green/25 border border-signal-green/60 text-signal-green"
            : "bg-white/5 border border-white/10 text-gray-600"
        }
      `}
      title={
        isWorked
          ? `${value} - Worked${showBands && bands?.length ? ` on ${bands.join(", ")}` : ""}`
          : `${value} - Needed`
      }
    >
      {value}
    </div>
  );
}

interface ZoneGridProps {
  zones: number[];
  workedZones: Set<string>;
  session: ContestSession;
  type: MultiplierType;
  showBands: boolean;
  columns: number;
}

/**
 * Grid display for CQ/ITU zones
 */
function ZoneGrid({
  zones,
  workedZones,
  session,
  type,
  showBands,
  columns,
}: ZoneGridProps) {
  return (
    <div
      className="grid gap-1"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {zones.map((zone) => {
        const zoneStr = zone.toString().padStart(2, "0");
        const isWorked =
          workedZones.has(zoneStr) || workedZones.has(zone.toString());
        const bands = showBands
          ? getWorkedBandsForMult(session, type, zoneStr)
          : undefined;

        return (
          <GridCell
            key={zone}
            value={zone.toString()}
            isWorked={isWorked}
            bands={bands}
            showBands={showBands}
            size="sm"
          />
        );
      })}
    </div>
  );
}

interface ValueGridProps {
  values: readonly string[];
  workedValues: Set<string>;
  session: ContestSession;
  type: MultiplierType;
  showBands: boolean;
  columns: number;
}

/**
 * Grid display for states, sections, DXCC, etc.
 */
function ValueGrid({
  values,
  workedValues,
  session,
  type,
  showBands,
  columns,
}: ValueGridProps) {
  return (
    <div
      className="grid gap-1"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {values.map((value) => {
        const isWorked = workedValues.has(value.toUpperCase());
        const bands = showBands
          ? getWorkedBandsForMult(session, type, value)
          : undefined;

        return (
          <GridCell
            key={value}
            value={value}
            isWorked={isWorked}
            bands={bands}
            showBands={showBands}
          />
        );
      })}
    </div>
  );
}

// ============================================================================
// Section Components
// ============================================================================

interface MultiplierSectionProps {
  rule: MultiplierRule;
  multipliers: MultiplierEntry[];
  session: ContestSession;
  selectedBand: string | null;
  showAllBandsView: boolean;
}

/**
 * Section for a single multiplier type
 */
function MultiplierSection({
  rule,
  multipliers,
  session,
  selectedBand,
  showAllBandsView,
}: MultiplierSectionProps) {
  // Determine which band to filter by
  const bandFilter = rule.perBand ? selectedBand : null;

  // Get worked values for this section
  const workedValues = useMemo(() => {
    if (showAllBandsView && rule.perBand) {
      return getUniqueWorkedAcrossAllBands(multipliers, rule.type);
    }
    return getWorkedValuesForBand(multipliers, rule.type, bandFilter);
  }, [multipliers, rule.type, bandFilter, showAllBandsView, rule.perBand]);

  // Count for display
  const workedCount = useMemo(() => {
    if (showAllBandsView && rule.perBand) {
      return workedValues.size;
    }
    return countWorkedForBand(multipliers, rule.type, bandFilter);
  }, [
    multipliers,
    rule.type,
    bandFilter,
    showAllBandsView,
    rule.perBand,
    workedValues,
  ]);

  // Get type-specific display config
  const { title, universe, columns } = useMemo(() => {
    switch (rule.type) {
      case "CQ_ZONE":
        return { title: "CQ Zones", universe: CQ_ZONES, columns: 10 };
      case "ITU_ZONE":
        return { title: "ITU Zones", universe: ITU_ZONES, columns: 10 };
      case "STATE":
        return { title: "States", universe: US_STATES, columns: 10 };
      case "SECTION":
        return { title: "Sections", universe: ARRL_RAC_SECTIONS, columns: 10 };
      case "DXCC":
        return { title: "DXCC Entities", universe: COMMON_DXCC, columns: 8 };
      case "PROVINCE":
        return { title: "Provinces", universe: PROVINCES, columns: 7 };
      case "WPX_PREFIX":
        return { title: "WPX Prefixes", universe: [], columns: 8 };
      case "GRID":
        return { title: "Grid Squares", universe: [], columns: 8 };
      default:
        return { title: "Multipliers", universe: [], columns: 8 };
    }
  }, [rule.type]);

  // For dynamic types (WPX, GRID), show list of worked values
  const isDynamicType = rule.type === "WPX_PREFIX" || rule.type === "GRID";

  // Get universe total for percentage
  const universeTotal =
    rule.type === "CQ_ZONE"
      ? 40
      : rule.type === "ITU_ZONE"
        ? 90
        : universe.length;

  return (
    <div className="space-y-2">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-cosmic-cyan uppercase tracking-wider">
          {title}
        </h4>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-signal-green font-mono font-bold">
            {workedCount}
          </span>
          {universeTotal > 0 && (
            <>
              <span className="text-gray-500">/</span>
              <span className="text-gray-500 font-mono">{universeTotal}</span>
            </>
          )}
          {rule.perBand && selectedBand && !showAllBandsView && (
            <span className="text-gray-500 text-[10px]">on {selectedBand}</span>
          )}
        </div>
      </div>

      {/* Grid display */}
      {isDynamicType ? (
        // List view for dynamic types
        <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
          {Array.from(workedValues)
            .sort()
            .map((value) => (
              <div
                key={value}
                className="px-2 py-0.5 rounded text-[10px] font-mono font-bold
                  bg-signal-green/25 border border-signal-green/60 text-signal-green"
              >
                {value}
              </div>
            ))}
          {workedValues.size === 0 && (
            <span className="text-gray-500 text-xs">None worked yet</span>
          )}
        </div>
      ) : rule.type === "CQ_ZONE" || rule.type === "ITU_ZONE" ? (
        <ZoneGrid
          zones={rule.type === "CQ_ZONE" ? CQ_ZONES : ITU_ZONES}
          workedZones={workedValues}
          session={session}
          type={rule.type}
          showBands={showAllBandsView && rule.perBand}
          columns={columns}
        />
      ) : (
        <ValueGrid
          values={universe as readonly string[]}
          workedValues={workedValues}
          session={session}
          type={rule.type}
          showBands={showAllBandsView && rule.perBand}
          columns={columns}
        />
      )}
    </div>
  );
}

// ============================================================================
// Band Tabs Component
// ============================================================================

interface BandTabsProps {
  bands: readonly string[];
  selectedBand: string | null;
  onSelectBand: (band: string | null) => void;
  multipliers: MultiplierEntry[];
  perBandTypes: MultiplierType[];
}

/**
 * Band selection tabs for per-band multiplier contests
 */
function BandTabs({
  bands,
  selectedBand,
  onSelectBand,
  multipliers,
  perBandTypes,
}: BandTabsProps) {
  // Count mults per band for all perBand types
  const countByBand = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const band of bands) {
      counts[band] = multipliers.filter(
        (m) =>
          perBandTypes.includes(m.type) &&
          m.band?.toLowerCase() === band.toLowerCase(),
      ).length;
    }
    return counts;
  }, [bands, multipliers, perBandTypes]);

  return (
    <div className="flex items-center gap-1 mb-3 overflow-x-auto pb-1">
      {/* All bands view */}
      <button
        onClick={() => onSelectBand(null)}
        className={`
          px-2 py-1 text-[10px] font-bold uppercase rounded transition-colors whitespace-nowrap
          ${
            selectedBand === null
              ? "bg-plasma-orange/20 text-plasma-orange border border-plasma-orange/50"
              : "bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10"
          }
        `}
      >
        All
      </button>

      {/* Individual band tabs */}
      {bands.map((band) => {
        const count = countByBand[band] || 0;
        const isSelected = selectedBand === band;

        return (
          <button
            key={band}
            onClick={() => onSelectBand(band)}
            className={`
              px-2 py-1 text-[10px] font-bold uppercase rounded transition-colors whitespace-nowrap
              flex items-center gap-1
              ${
                isSelected
                  ? "bg-cosmic-cyan/20 text-cosmic-cyan border border-cosmic-cyan/50"
                  : "bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10"
              }
            `}
          >
            <span>{band}</span>
            {count > 0 && (
              <span
                className={`
                  text-[9px] px-1 rounded-full
                  ${isSelected ? "bg-cosmic-cyan/30" : "bg-white/10"}
                `}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * MultiplierMatrix component
 *
 * Displays worked/needed multipliers in a visual grid format.
 * Supports band tabs for per-band multiplier tracking.
 * Uses narrow Zustand selectors for minimal re-renders.
 */
export function MultiplierMatrix({
  className,
  compact = false,
  defaultBand,
}: MultiplierMatrixProps) {
  // Narrow selectors
  const contestId = useContestStore((s) => s.activeSession?.contestId);
  const multipliers = useContestStore(
    (s) => s.activeSession?.multipliers ?? [],
  );
  const session = useContestStore((s) => s.activeSession);

  // Get contest definition and rules
  const { contestDef, rules, hasPerBand, perBandTypes } = useMemo(() => {
    if (!contestId) {
      return {
        contestDef: null,
        rules: [],
        hasPerBand: false,
        perBandTypes: [],
      };
    }
    const def = getContestById(contestId);
    if (!def) {
      return {
        contestDef: null,
        rules: [],
        hasPerBand: false,
        perBandTypes: [],
      };
    }
    const effectiveRules = getEffectiveMultiplierRules(def);
    const perBand = effectiveRules.some((r) => r.perBand);
    const perBandTypeList = effectiveRules
      .filter((r) => r.perBand)
      .map((r) => r.type);

    return {
      contestDef: def,
      rules: effectiveRules,
      hasPerBand: perBand,
      perBandTypes: perBandTypeList,
    };
  }, [contestId]);

  // Selected band state
  const [selectedBand, setSelectedBand] = useState<string | null>(
    defaultBand || null,
  );

  // Handler for band selection
  const handleSelectBand = useCallback((band: string | null) => {
    setSelectedBand(band);
  }, []);

  // Early return if no contest or no session
  if (!contestId || !session || !contestDef || rules.length === 0) {
    return null;
  }

  // Compact view - just show counts
  if (compact) {
    const totalMults = multipliers.length;
    const typeCount = rules.length;

    return (
      <div className={className}>
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-400">Multipliers</span>
          <span className="font-mono font-bold text-signal-green">
            {totalMults}
          </span>
        </div>
        {hasPerBand && (
          <div className="text-[10px] text-gray-500 mt-1">
            {typeCount} type{typeCount > 1 ? "s" : ""}, per-band
          </div>
        )}
      </div>
    );
  }

  return (
    <Card className={`p-3 ${className ?? ""}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-orbitron text-sm font-bold text-plasma-orange">
          Multiplier Matrix
        </h3>
        <span className="text-xs text-gray-400">
          {multipliers.length} total
        </span>
      </div>

      {/* Band tabs (only for perBand contests) */}
      {hasPerBand && (
        <BandTabs
          bands={CONTEST_BANDS}
          selectedBand={selectedBand}
          onSelectBand={handleSelectBand}
          multipliers={multipliers}
          perBandTypes={perBandTypes}
        />
      )}

      {/* Multiplier sections */}
      <div className="space-y-4">
        {rules.map((rule, index) => (
          <MultiplierSection
            key={`${rule.type}-${index}`}
            rule={rule}
            multipliers={multipliers}
            session={session}
            selectedBand={selectedBand}
            showAllBandsView={selectedBand === null}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-4 pt-3 border-t border-white/10">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-signal-green/25 border border-signal-green/60" />
          <span className="text-[10px] text-gray-400">Worked</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-white/5 border border-white/10" />
          <span className="text-[10px] text-gray-400">Needed</span>
        </div>
      </div>
    </Card>
  );
}

export default MultiplierMatrix;
