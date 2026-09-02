/**
 * ContestSpotsPanel Component
 *
 * Contest-aware DX spot panel for S&P (Search & Pounce) multiplier hunting.
 * Tags spots with contest status (DUPE, NEW MULT, NEEDED) and provides
 * contest-specific filtering.
 *
 * @module components/contest/ContestSpotsPanel
 */

import { useMemo, useCallback, useState } from "react";
import { Card, LoadingSpinner } from "@/components/ui";
import { useDXCluster } from "@/hooks/useDXCluster";
import { useMapOperationalContext } from "@/hooks/useMapOperationalContext";
import { useContestStore } from "@/stores/contestStore";
import { getContestById } from "@/lib/data/contests";
import { getNeededMultipliers, type NeededMult } from "@/lib/contest/strategy";
import { getBandColor } from "@/lib/api/dxcluster";
import type { DXSpot, DXClusterFilters } from "@/types/dxcluster";
import { policyAllows } from "@/lib/map/operationalScope";

// ============================================================================
// Types
// ============================================================================

/**
 * Status tags for contest spots
 */
export type SpotStatus = "DUPE" | "NEW_MULT" | "NEEDED_MULT" | "NORMAL";

/**
 * Extended spot with contest status
 */
export interface ContestSpot extends DXSpot {
  status: SpotStatus;
  statusLabel: string;
}

/**
 * Band filter option
 */
export type BandFilterOption = "current" | "hf" | "all";

/**
 * Mode filter option
 */
export type ModeFilterOption = "current" | "any";

/**
 * Age filter option in minutes
 */
export type AgeFilterOption = 5 | 15 | 30 | 60;

/**
 * Props for ContestSpotsPanel
 */
export interface ContestSpotsPanelProps {
  /** Current operating band */
  currentBand: string;
  /** Current operating mode */
  currentMode: string;
  /** Callback when spot is clicked */
  onSpotClick: (spot: DXSpot) => void;
  /** Maximum number of spots to display */
  maxSpots?: number;
  /** Custom class name */
  className?: string;
}

// ============================================================================
// Constants
// ============================================================================

/** HF contest bands */
const HF_BANDS = ["160m", "80m", "40m", "20m", "15m", "10m"];

/** Age filter options */
const AGE_OPTIONS: { value: AgeFilterOption; label: string }[] = [
  { value: 5, label: "5m" },
  { value: 15, label: "15m" },
  { value: 30, label: "30m" },
  { value: 60, label: "1h" },
];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format time for display (HH:MM UTC)
 */
function formatTime(date: Date): string {
  return date.toISOString().substring(11, 16);
}

/**
 * Calculate minutes ago from now
 */
function getMinutesAgo(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / 60000);
}

/**
 * Format frequency for display (MHz)
 */
function formatFrequency(freqKHz: number): string {
  return (freqKHz / 1000).toFixed(3);
}

/**
 * Check if a spot would be a new multiplier based on needed mults
 */
function getMultiplierStatus(
  spot: DXSpot,
  neededMults: NeededMult[],
  workedValues: Set<string>,
): { isNewMult: boolean; isNeededMult: boolean } {
  // Check if this spot's potential multiplier values are needed
  // For simplicity, we check if the spot's callsign prefix or zone info might be needed
  const spotBand = spot.band?.toLowerCase();

  for (const needed of neededMults) {
    // Match by band if the mult is per-band
    if (needed.band && spotBand && needed.band.toLowerCase() !== spotBand) {
      continue;
    }

    // For DXCC mults, check callsign prefix
    if (needed.type === "DXCC") {
      const callPrefix = spot.dx.match(/^([A-Z]{1,2}[0-9]?)/i)?.[1];
      if (
        callPrefix &&
        needed.value.toUpperCase() === callPrefix.toUpperCase()
      ) {
        // Check if we already have this value on any band
        const hasValueOnAnyBand = workedValues.has(needed.value.toUpperCase());
        return {
          isNewMult: !hasValueOnAnyBand,
          isNeededMult: hasValueOnAnyBand,
        };
      }
    }

    // For CQ_ZONE mults, we'd need zone info from exchange
    // For now, mark any needed mult type as potentially needed
    if (needed.type === "CQ_ZONE" || needed.type === "ITU_ZONE") {
      // Grid-based zone estimation could be added here
      continue;
    }
  }

  return { isNewMult: false, isNeededMult: false };
}

// ============================================================================
// Sub-Components
// ============================================================================

interface FilterControlsProps {
  bandFilter: BandFilterOption;
  onBandFilterChange: (value: BandFilterOption) => void;
  modeFilter: ModeFilterOption;
  onModeFilterChange: (value: ModeFilterOption) => void;
  neededOnly: boolean;
  onNeededOnlyChange: (value: boolean) => void;
  hideWorked: boolean;
  onHideWorkedChange: (value: boolean) => void;
  ageFilter: AgeFilterOption;
  onAgeFilterChange: (value: AgeFilterOption) => void;
}

/**
 * Compact filter controls for contest operation
 */
function FilterControls({
  bandFilter,
  onBandFilterChange,
  modeFilter,
  onModeFilterChange,
  neededOnly,
  onNeededOnlyChange,
  hideWorked,
  onHideWorkedChange,
  ageFilter,
  onAgeFilterChange,
}: FilterControlsProps) {
  return (
    <div className="space-y-2 mb-3">
      {/* Band and Mode filters */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-gray-500 uppercase tracking-wide">
            Band:
          </span>
          <div className="flex gap-0.5">
            {(["current", "hf", "all"] as BandFilterOption[]).map((opt) => (
              <button
                key={opt}
                onClick={() => onBandFilterChange(opt)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-all ${
                  bandFilter === opt
                    ? "bg-plasma-orange/30 text-plasma-orange border border-plasma-orange/50"
                    : "bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10"
                }`}
              >
                {opt === "current" ? "Cur" : opt === "hf" ? "HF" : "All"}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-gray-500 uppercase tracking-wide">
            Mode:
          </span>
          <div className="flex gap-0.5">
            {(["current", "any"] as ModeFilterOption[]).map((opt) => (
              <button
                key={opt}
                onClick={() => onModeFilterChange(opt)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-all ${
                  modeFilter === opt
                    ? "bg-cosmic-cyan/30 text-cosmic-cyan border border-cosmic-cyan/50"
                    : "bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10"
                }`}
              >
                {opt === "current" ? "Cur" : "Any"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Toggles and Age */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => onNeededOnlyChange(!neededOnly)}
          className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all ${
            neededOnly
              ? "bg-signal-green/30 text-signal-green border border-signal-green/50"
              : "bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10"
          }`}
        >
          Needed Only
        </button>

        <button
          onClick={() => onHideWorkedChange(!hideWorked)}
          className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all ${
            hideWorked
              ? "bg-alert-red/30 text-alert-red border border-alert-red/50"
              : "bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10"
          }`}
        >
          Hide Dupes
        </button>

        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-[10px] text-gray-500 uppercase tracking-wide">
            Age:
          </span>
          <div className="flex gap-0.5">
            {AGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => onAgeFilterChange(opt.value)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-all ${
                  ageFilter === opt.value
                    ? "bg-cosmic-cyan/30 text-cosmic-cyan border border-cosmic-cyan/50"
                    : "bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

interface SpotRowProps {
  spot: ContestSpot;
  onClick: () => void;
}

/**
 * Compact spot row for contest operation
 */
function SpotRow({ spot, onClick }: SpotRowProps) {
  const bandColor = getBandColor(spot.band || "");
  const minutesAgo = getMinutesAgo(spot.time);

  // Status-based styling
  const statusStyles = useMemo(() => {
    switch (spot.status) {
      case "DUPE":
        return {
          rowBg: "bg-alert-red/5",
          textColor: "text-gray-500",
          badge: {
            bg: "bg-alert-red/20",
            text: "text-alert-red",
            border: "border-alert-red/40",
          },
        };
      case "NEW_MULT":
        return {
          rowBg: "bg-signal-green/10",
          textColor: "text-white",
          badge: {
            bg: "bg-signal-green/25",
            text: "text-signal-green",
            border: "border-signal-green/50",
          },
        };
      case "NEEDED_MULT":
        return {
          rowBg: "bg-cosmic-cyan/10",
          textColor: "text-white",
          badge: {
            bg: "bg-cosmic-cyan/25",
            text: "text-cosmic-cyan",
            border: "border-cosmic-cyan/50",
          },
        };
      default:
        return {
          rowBg: "",
          textColor: "text-white",
          badge: null,
        };
    }
  }, [spot.status]);

  return (
    <div
      className={`grid grid-cols-[40px_50px_60px_1fr_70px] gap-2 px-2 py-1.5 cursor-pointer transition-all duration-100 hover:bg-white/5 ${statusStyles.rowBg}`}
      onClick={onClick}
      role="row"
    >
      {/* Age */}
      <div
        className="text-gray-400 text-[11px] font-mono"
        title={formatTime(spot.time)}
      >
        {minutesAgo}m
      </div>

      {/* Band */}
      <div className="flex items-center">
        <span
          className="px-1.5 py-0.5 rounded text-[9px] font-bold"
          style={{
            backgroundColor: bandColor.bgColor,
            color: bandColor.color,
          }}
        >
          {spot.band}
        </span>
      </div>

      {/* Frequency */}
      <div className="text-[11px] font-mono text-cosmic-cyan/80 tabular-nums">
        {formatFrequency(spot.frequency)}
      </div>

      {/* Callsign + Mode */}
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={`font-mono font-semibold text-sm truncate ${statusStyles.textColor}`}
        >
          {spot.dx}
        </span>
        {spot.mode && (
          <span className="px-1 py-0.5 rounded bg-white/5 text-[9px] text-gray-400 flex-shrink-0">
            {spot.mode}
          </span>
        )}
      </div>

      {/* Status Badge */}
      <div className="flex items-center justify-end">
        {statusStyles.badge && (
          <span
            className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${statusStyles.badge.bg} ${statusStyles.badge.text} ${statusStyles.badge.border}`}
          >
            {spot.statusLabel}
          </span>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * ContestSpotsPanel Component
 *
 * Displays DX spots with contest-aware tagging and filtering.
 * Designed for fast S&P multiplier hunting during contests.
 *
 * @example
 * ```tsx
 * <ContestSpotsPanel
 *   currentBand="20m"
 *   currentMode="CW"
 *   onSpotClick={(spot) => tuneToSpot(spot)}
 *   maxSpots={15}
 * />
 * ```
 */
export function ContestSpotsPanel({
  currentBand,
  currentMode,
  onSpotClick,
  maxSpots = 15,
  className = "",
}: ContestSpotsPanelProps) {
  // Filter state
  const [bandFilter, setBandFilter] = useState<BandFilterOption>("current");
  const [modeFilter, setModeFilter] = useState<ModeFilterOption>("current");
  const [neededOnly, setNeededOnly] = useState(false);
  const [hideWorked, setHideWorked] = useState(true);
  const [ageFilter, setAgeFilter] = useState<AgeFilterOption>(15);

  // Contest store
  const { activeSession, isDupe } = useContestStore();
  const { policy } = useMapOperationalContext();
  const publicSpotsEnabled = policyAllows(policy, "liveSpots", "public");

  // Build filters for DX cluster hook
  const dxFilters = useMemo<DXClusterFilters>(() => {
    const filters: DXClusterFilters = {
      maxAge: ageFilter,
    };

    // Band filtering
    if (bandFilter === "current" && currentBand) {
      filters.bands = [currentBand];
    } else if (bandFilter === "hf") {
      filters.bands = HF_BANDS;
    }

    // Mode filtering
    if (modeFilter === "current" && currentMode) {
      filters.modes = [currentMode];
    }

    return filters;
  }, [bandFilter, currentBand, modeFilter, currentMode, ageFilter]);

  // Fetch spots with filters
  const { spots, isLoading, isFetching, lastUpdated } = useDXCluster(
    dxFilters,
    { enabled: publicSpotsEnabled },
  );

  // Get contest definition and needed multipliers
  const contestDef = useMemo(() => {
    if (!activeSession?.contestId) {
      return null;
    }
    return getContestById(activeSession.contestId);
  }, [activeSession?.contestId]);

  const neededMults = useMemo(() => {
    if (!activeSession || !contestDef) {
      return [];
    }
    return getNeededMultipliers(activeSession, contestDef);
  }, [activeSession, contestDef]);

  // Build set of worked multiplier values
  const workedMultValues = useMemo(() => {
    const values = new Set<string>();
    if (activeSession) {
      for (const mult of activeSession.multipliers) {
        values.add(mult.value.toUpperCase());
      }
    }
    return values;
  }, [activeSession]);

  // Process spots with contest status
  const contestSpots = useMemo<ContestSpot[]>(() => {
    const processed: ContestSpot[] = [];

    for (const spot of spots) {
      // Check if dupe
      const isDupeSpot = activeSession
        ? isDupe(spot.dx, spot.band || currentBand, spot.mode || currentMode)
        : false;

      // Check multiplier status
      const { isNewMult, isNeededMult } = getMultiplierStatus(
        spot,
        neededMults,
        workedMultValues,
      );

      // Determine status
      let status: SpotStatus;
      let statusLabel: string;

      if (isDupeSpot) {
        status = "DUPE";
        statusLabel = "DUPE";
      } else if (isNewMult) {
        status = "NEW_MULT";
        statusLabel = "NEW MULT";
      } else if (isNeededMult) {
        status = "NEEDED_MULT";
        statusLabel = "NEEDED";
      } else {
        status = "NORMAL";
        statusLabel = "";
      }

      processed.push({
        ...spot,
        status,
        statusLabel,
      });
    }

    return processed;
  }, [
    spots,
    activeSession,
    isDupe,
    currentBand,
    currentMode,
    neededMults,
    workedMultValues,
  ]);

  // Apply contest-specific filters
  const filteredSpots = useMemo(() => {
    let filtered = contestSpots;

    // Hide dupes if enabled
    if (hideWorked) {
      filtered = filtered.filter((s) => s.status !== "DUPE");
    }

    // Show only needed mults if enabled
    if (neededOnly) {
      filtered = filtered.filter(
        (s) => s.status === "NEW_MULT" || s.status === "NEEDED_MULT",
      );
    }

    // Limit to maxSpots
    return filtered.slice(0, maxSpots);
  }, [contestSpots, hideWorked, neededOnly, maxSpots]);

  // Spot click handler
  const handleSpotClick = useCallback(
    (spot: ContestSpot) => {
      onSpotClick(spot);
    },
    [onSpotClick],
  );

  // Count stats
  const stats = useMemo(() => {
    const dupeCount = contestSpots.filter((s) => s.status === "DUPE").length;
    const newMultCount = contestSpots.filter(
      (s) => s.status === "NEW_MULT",
    ).length;
    const neededCount = contestSpots.filter(
      (s) => s.status === "NEEDED_MULT",
    ).length;
    return { dupeCount, newMultCount, neededCount, total: contestSpots.length };
  }, [contestSpots]);

  // Filter summary
  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    if (bandFilter === "current") {
      parts.push(currentBand);
    } else if (bandFilter === "hf") parts.push("HF");
        else parts.push("All bands");

    if (modeFilter === "current") {
      parts.push(currentMode);
    } else parts.push("All modes");

    return parts.join(" / ");
  }, [bandFilter, modeFilter, currentBand, currentMode]);

  return (
    <Card className={`flex flex-col ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-white tracking-wide">
            CONTEST SPOTS
          </h3>
          <span className="text-[10px] text-gray-500">
            {filteredSpots.length}/{stats.total}
          </span>
          {stats.newMultCount > 0 && (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-signal-green/20 text-signal-green border border-signal-green/30">
              {stats.newMultCount} NEW
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {(isLoading || isFetching) && <LoadingSpinner size="sm" />}
          <span className="text-[10px] text-gray-500">{filterSummary}</span>
        </div>
      </div>

      {/* Filter Controls */}
      <FilterControls
        bandFilter={bandFilter}
        onBandFilterChange={setBandFilter}
        modeFilter={modeFilter}
        onModeFilterChange={setModeFilter}
        neededOnly={neededOnly}
        onNeededOnlyChange={setNeededOnly}
        hideWorked={hideWorked}
        onHideWorkedChange={setHideWorked}
        ageFilter={ageFilter}
        onAgeFilterChange={setAgeFilter}
      />

      {/* Column Headers */}
      <div
        className="grid grid-cols-[40px_50px_60px_1fr_70px] gap-2 px-2 py-1 border-b border-white/10 text-[10px] font-semibold text-gray-500 uppercase tracking-wider"
        role="row"
      >
        <div>Age</div>
        <div>Band</div>
        <div>Freq</div>
        <div>Call</div>
        <div className="text-right">Status</div>
      </div>

      {/* Spot List */}
      <div
        className="flex-1 overflow-y-auto divide-y divide-white/5"
        role="table"
        aria-label="Contest Spots"
      >
        {isLoading && filteredSpots.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <LoadingSpinner size="md" />
          </div>
        ) : filteredSpots.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
            {neededOnly
              ? "No needed multipliers spotted"
              : hideWorked
                ? "No new spots"
                : "No spots match filters"}
          </div>
        ) : (
          filteredSpots.map((spot) => (
            <SpotRow
              key={spot.id}
              spot={spot}
              onClick={() => handleSpotClick(spot)}
            />
          ))
        )}
      </div>

      {/* Footer */}
      <div className="mt-2 pt-2 border-t border-white/10 flex items-center justify-between text-[10px] text-gray-500">
        <div>
          {lastUpdated && <span>Updated {formatTime(lastUpdated)} UTC</span>}
        </div>
        <div className="flex items-center gap-3">
          {stats.dupeCount > 0 && (
            <span className="text-alert-red">{stats.dupeCount} dupes</span>
          )}
          {stats.neededCount > 0 && (
            <span className="text-cosmic-cyan">{stats.neededCount} needed</span>
          )}
        </div>
      </div>
    </Card>
  );
}

ContestSpotsPanel.displayName = "ContestSpotsPanel";

export default ContestSpotsPanel;
