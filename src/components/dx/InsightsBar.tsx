/**
 * InsightsBar Component
 *
 * A horizontal bar containing insight cards for propagation and logging.
 * Features glass-morphism styling and scrollable layout on narrow widths.
 * Contains: LogStatsCard, ConditionMatchCard, PredictionsCard, HistoryCard
 */

import { useState } from "react";
import { LogStatsCard } from "./LogStatsCard";
import { ConditionMatchCard } from "./ConditionMatchCard";
import { PredictionsCard } from "./PredictionsCard";
import { HistoryCard } from "./HistoryCard";

export interface InsightsBarProps {
  /** Current display time for time-sensitive data */
  displayTime: Date;
  /** Additional CSS classes */
  className?: string;
}

/**
 * InsightsBar Component
 *
 * A horizontal insights bar with 4 card slots for operator insights.
 * Displays key statistics and predictions for amateur radio operators.
 *
 * Features:
 * - Glass-morphism styling consistent with the app theme
 * - Horizontally scrollable on narrow viewports
 * - 4 insight card slots
 *
 * Cards included:
 * 1. LogStatsCard - QSO statistics (today, week, total)
 * 2. ConditionMatchCard - Historical dates with similar solar conditions
 * 3. PredictionsCard - Band opening predictions
 * 4. HistoryCard - "This Day in History" DX contacts
 *
 * @example
 * ```tsx
 * <InsightsBar
 *   displayTime={new Date()}
 *   className="mt-4"
 * />
 * ```
 */
export function InsightsBar({
  displayTime: _displayTime,
  className = "",
}: InsightsBarProps) {
  // displayTime reserved for future use (e.g., historical playback mode)
  void _displayTime;

  const [autoRefresh, setAutoRefresh] = useState(false);

  return (
    <div
      className={`
        bg-white/[0.02] backdrop-blur-sm border border-white/5
        rounded-2xl p-2
        ${className}
      `}
    >
      {/* Scrollable container for narrow widths */}
      <div
        className="
          flex gap-2
          overflow-x-auto
          scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent
          pb-1 -mb-1
        "
        style={{
          scrollbarWidth: "thin",
          msOverflowStyle: "none",
        }}
      >
        {/* Slot 1: Log Stats */}
        <div className="flex-1 min-w-[140px]">
          <LogStatsCard
            autoRefresh={autoRefresh}
            onToggleAutoRefresh={setAutoRefresh}
            className="h-full"
          />
        </div>

        {/* Slot 2: Condition Match */}
        <div className="flex-1 min-w-[160px]">
          <ConditionMatchCard className="h-full" maxMatches={2} />
        </div>

        {/* Slot 3: Band Predictions */}
        <div className="flex-1 min-w-[180px]">
          <PredictionsCard className="h-full" maxPredictions={2} />
        </div>

        {/* Slot 4: This Day in History */}
        <div className="flex-1 min-w-[160px]">
          <HistoryCard className="h-full" />
        </div>
      </div>
    </div>
  );
}

export default InsightsBar;
