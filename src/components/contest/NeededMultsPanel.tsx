/**
 * NeededMultsPanel - Ranked list of most valuable needed multipliers
 *
 * Features:
 * - Shows ranked list of needed multipliers by strategic value
 * - Updates immediately after logging a QSO
 * - For CQWW shows both zone and DXCC needed counts
 * - Compact display for high-speed contest operation
 * - ProPulse aesthetic with plasma-orange, cosmic-cyan, signal-green colors
 */

import { useMemo } from "react";
import { Card } from "@/components/ui";
import { useContestStore } from "@/stores/contestStore";
import { getContestById } from "@/lib/data/contests";
import {
  getTopTargets,
  getNeededMultipliersSummary,
  hasPerBandMultipliers,
} from "@/lib/contest";
import type { RankedTarget, NeededMultsSummary } from "@/lib/contest";
import type { MultiplierType } from "@/types/contest";
import { getEffectiveMultiplierRules } from "@/types/contest";

// ============================================================================
// Types
// ============================================================================

export interface NeededMultsPanelProps {
  /** Optional class name for styling */
  className?: string;
  /** Show compact version */
  compact?: boolean;
  /** Maximum number of targets to show (default 8) */
  maxTargets?: number;
  /** Current operating band for ranking context */
  currentBand?: string;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get display name for a multiplier type
 */
function getTypeName(type: MultiplierType): string {
  switch (type) {
    case "CQ_ZONE":
      return "Zone";
    case "ITU_ZONE":
      return "ITU";
    case "DXCC":
      return "DXCC";
    case "STATE":
      return "State";
    case "SECTION":
      return "Sect";
    case "PROVINCE":
      return "Prov";
    case "WPX_PREFIX":
      return "Pfx";
    case "GRID":
      return "Grid";
    default:
      return "Mult";
  }
}

/**
 * Get color class for a multiplier type
 */
function getTypeColor(type: MultiplierType): string {
  switch (type) {
    case "CQ_ZONE":
    case "ITU_ZONE":
      return "text-plasma-orange";
    case "DXCC":
      return "text-cosmic-cyan";
    case "STATE":
    case "SECTION":
    case "PROVINCE":
      return "text-signal-green";
    default:
      return "text-gray-300";
  }
}

/**
 * Get badge color class for a multiplier type
 */
function getTypeBadgeColor(type: MultiplierType): string {
  switch (type) {
    case "CQ_ZONE":
    case "ITU_ZONE":
      return "bg-plasma-orange/20 border-plasma-orange/40 text-plasma-orange";
    case "DXCC":
      return "bg-cosmic-cyan/20 border-cosmic-cyan/40 text-cosmic-cyan";
    case "STATE":
    case "SECTION":
    case "PROVINCE":
      return "bg-signal-green/20 border-signal-green/40 text-signal-green";
    default:
      return "bg-white/10 border-white/20 text-gray-300";
  }
}

// ============================================================================
// Sub-Components
// ============================================================================

interface TargetRowProps {
  target: RankedTarget;
  showBand: boolean;
}

/**
 * Individual row showing a ranked target multiplier
 */
function TargetRow({ target, showBand }: TargetRowProps) {
  const { mult, rank, score } = target;
  const typeColor = getTypeColor(mult.type);
  const badgeColor = getTypeBadgeColor(mult.type);

  // Determine rank indicator style
  const rankStyle =
    rank <= 3
      ? "bg-plasma-orange/30 text-plasma-orange"
      : rank <= 6
        ? "bg-cosmic-cyan/20 text-cosmic-cyan"
        : "bg-white/10 text-gray-400";

  return (
    <div className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-white/5 transition-colors">
      {/* Rank indicator */}
      <div
        className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold ${rankStyle}`}
      >
        {rank}
      </div>

      {/* Multiplier value */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`font-mono font-bold text-sm ${typeColor}`}>
            {mult.value}
          </span>
          {showBand && mult.band && (
            <span className="text-[10px] text-gray-500 font-mono">
              {mult.band}
            </span>
          )}
        </div>
      </div>

      {/* Type badge */}
      <div
        className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border ${badgeColor}`}
      >
        {getTypeName(mult.type)}
      </div>

      {/* Score (optional, for debugging) */}
      <div
        className="text-[9px] text-gray-600 font-mono w-6 text-right"
        title={`Score: ${score}`}
      >
        {score}
      </div>
    </div>
  );
}

interface SummaryHeaderProps {
  summary: NeededMultsSummary;
}

/**
 * Summary header showing needed counts by type
 */
function SummaryHeader({ summary }: SummaryHeaderProps) {
  // Get types with needed counts > 0
  const typesWithNeeded = Object.entries(summary.countByType)
    .filter(([type, count]) => count > 0 && type !== "NONE")
    .sort((a, b) => b[1] - a[1]);

  if (typesWithNeeded.length === 0) {
    return (
      <div className="text-center py-2 text-signal-green text-sm font-bold">
        All multipliers worked!
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 mb-3 pb-2 border-b border-white/10">
      <div className="flex items-center gap-2 flex-wrap">
        {typesWithNeeded.slice(0, 4).map(([type, count]) => (
          <div
            key={type}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border
              ${getTypeBadgeColor(type as MultiplierType)}`}
          >
            <span>{getTypeName(type as MultiplierType)}</span>
            <span className="opacity-70">{count}</span>
          </div>
        ))}
      </div>
      <div className="text-xs text-gray-500">{summary.total} needed</div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * NeededMultsPanel component
 *
 * Displays a ranked list of the most valuable needed multipliers.
 * Uses narrow Zustand selectors for minimal re-renders.
 */
export function NeededMultsPanel({
  className,
  compact = false,
  maxTargets = 8,
  currentBand,
}: NeededMultsPanelProps) {
  // Narrow selectors
  const contestId = useContestStore((s) => s.activeSession?.contestId);
  const session = useContestStore((s) => s.activeSession);
  const qsoCount = useContestStore((s) => s.activeSession?.qsos.length ?? 0);

  // Get contest definition and check for perBand rules
  const { contestDef, hasPerBand, hasMultipleTypes } = useMemo(() => {
    if (!contestId) {
      return { contestDef: null, hasPerBand: false, hasMultipleTypes: false };
    }
    const def = getContestById(contestId);
    if (!def) {
      return { contestDef: null, hasPerBand: false, hasMultipleTypes: false };
    }
    const rules = getEffectiveMultiplierRules(def);
    return {
      contestDef: def,
      hasPerBand: hasPerBandMultipliers(def),
      hasMultipleTypes: rules.length > 1,
    };
  }, [contestId]);

  // Get top targets with ranking context
  // qsoCount is included to force re-computation when QSOs are logged
  const { targets, summary } = useMemo(() => {
    if (!session || !contestDef) {
      return { targets: [], summary: null };
    }

    // Build ranking context
    const context = {
      currentBand,
      contestHour: new Date().getUTCHours(),
    };

    const topTargets = getTopTargets(session, contestDef, context, maxTargets);

    const neededSummary = getNeededMultipliersSummary(session, contestDef);

    return {
      targets: topTargets,
      summary: neededSummary,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, contestDef, currentBand, maxTargets, qsoCount]);

  // Early return if no contest or no session
  if (!contestId || !session || !contestDef) {
    return null;
  }

  // Compact view - just show counts
  if (compact) {
    const totalNeeded = summary?.total ?? 0;

    return (
      <div className={className}>
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-400">Needed</span>
          <span className="font-mono font-bold text-plasma-orange">
            {totalNeeded}
          </span>
        </div>
        {hasMultipleTypes && summary && (
          <div className="flex items-center gap-2 mt-1">
            {Object.entries(summary.countByType)
              .filter(([type, count]) => count > 0 && type !== "NONE")
              .slice(0, 2)
              .map(([type, count]) => (
                <span
                  key={type}
                  className={`text-[10px] font-mono ${getTypeColor(type as MultiplierType)}`}
                >
                  {getTypeName(type as MultiplierType)}: {count}
                </span>
              ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <Card className={`p-3 ${className ?? ""}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-orbitron text-sm font-bold text-plasma-orange">
          Next Best Mults
        </h3>
        {currentBand && (
          <span className="text-[10px] text-gray-500">on {currentBand}</span>
        )}
      </div>

      {/* Summary counts by type */}
      {summary && <SummaryHeader summary={summary} />}

      {/* Target list */}
      {targets.length > 0 ? (
        <div className="space-y-0.5">
          {targets.map((target, index) => (
            <TargetRow
              key={`${target.mult.type}-${target.mult.value}-${target.mult.band ?? "all"}-${index}`}
              target={target}
              showBand={hasPerBand}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-4 text-signal-green text-sm">
          All multipliers worked!
        </div>
      )}

      {/* Show more indicator */}
      {summary && summary.total > maxTargets && (
        <div className="text-center mt-2 pt-2 border-t border-white/10">
          <span className="text-[10px] text-gray-500">
            +{summary.total - maxTargets} more needed
          </span>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-3 pt-2 border-t border-white/10">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-plasma-orange" />
          <span className="text-[9px] text-gray-500">High value</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-cosmic-cyan" />
          <span className="text-[9px] text-gray-500">Medium</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-white/30" />
          <span className="text-[9px] text-gray-500">Standard</span>
        </div>
      </div>
    </Card>
  );
}

export default NeededMultsPanel;
