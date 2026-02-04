/**
 * ContestMultiplierPanel - Composable multiplier tracking panel
 * Placeholder wrapper for multiplier display, will be enhanced with matrix view in Phase 4
 */

import { useMemo } from "react";
import { MultiplierTracker } from "./MultiplierTracker";
import { useContestStore, type MultiplierType } from "@/stores/contestStore";
import { getContestById } from "@/lib/data/contests";

export interface ContestMultiplierPanelProps {
  /** Optional class name for styling */
  className?: string;
  /** Show compact version */
  compact?: boolean;
}

/**
 * ContestMultiplierPanel component
 * Uses narrow Zustand selectors for minimal re-renders
 */
export function ContestMultiplierPanel({
  className,
  compact = false,
}: ContestMultiplierPanelProps) {
  // Narrow selectors
  const contestId = useContestStore((s) => s.activeSession?.contestId);
  const multipliers = useContestStore(
    (s) => s.activeSession?.multipliers ?? [],
  );

  // Get multiplier type from contest definition
  const multiplierType: MultiplierType = useMemo(() => {
    if (!contestId) {
      return "NONE";
    }
    const def = getContestById(contestId);
    return def?.multiplierType ?? "NONE";
  }, [contestId]);

  // Get all multiplier types for contests with multiple mults
  const multiplierRules = useMemo(() => {
    if (!contestId) {
      return [];
    }
    const def = getContestById(contestId);
    return def?.multiplierRules ?? [];
  }, [contestId]);

  if (!contestId) {
    return null;
  }

  // For compact view, just show count
  if (compact) {
    return (
      <div className={className}>
        <div className="text-xs text-gray-400">
          Mults:{" "}
          <span className="text-cosmic-cyan font-bold">
            {multipliers.length}
          </span>
        </div>
      </div>
    );
  }

  // If contest has multiple multiplier rules, show them separately
  if (multiplierRules.length > 1) {
    return (
      <div className={`space-y-3 ${className ?? ""}`}>
        {multiplierRules.map((rule, index) => {
          // Filter multipliers by type
          const filteredMults = multipliers.filter((m) => m.type === rule.type);
          return (
            <MultiplierTracker
              key={`${rule.type}-${index}`}
              multipliers={filteredMults}
              type={rule.type}
            />
          );
        })}
      </div>
    );
  }

  // Single multiplier type
  return (
    <div className={className}>
      <MultiplierTracker multipliers={multipliers} type={multiplierType} />
    </div>
  );
}

export default ContestMultiplierPanel;
