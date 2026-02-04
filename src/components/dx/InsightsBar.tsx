/**
 * InsightsBar Component
 *
 * A horizontal bar containing insight cards for propagation and logging.
 * Features glass-morphism styling and scrollable layout on narrow widths.
 * Contains: LogStatsCard, ClusterPulseCard, PredictionsCard, HistoryCard
 */

import { useState } from "react";
import { useSolarFlux, useKIndex } from "@/hooks/useSolarData";
import { LogStatsCard } from "./LogStatsCard";
import { ClusterPulseCard } from "./ClusterPulseCard";
import { PredictionsCard } from "./PredictionsCard";
import { HistoryCard } from "./HistoryCard";
import { LogStatsDetailModal } from "./modals/LogStatsDetailModal";
import { HistoryDetailModal } from "./modals/HistoryDetailModal";
import { ClusterPulseDetailModal } from "./modals/ClusterPulseDetailModal";
import { BandConditionsModal } from "@/components/solar/modals/BandConditionsModal";

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
 * 2. ClusterPulseCard - Real-time DX cluster activity pulse
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
  const [activeModal, setActiveModal] = useState<
    "logStats" | "bandConditions" | "history" | "clusterPulse" | null
  >(null);

  const { data: kIndexData } = useKIndex();
  const { data: solarFluxData } = useSolarFlux();
  const currentKp = kIndexData?.[kIndexData.length - 1]?.kp_index ?? 3;
  const currentSfi = solarFluxData?.[solarFluxData.length - 1]?.flux ?? 100;

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
            onClick={() => setActiveModal("logStats")}
          />
        </div>

        {/* Slot 2: Cluster Pulse */}
        <div className="flex-1 min-w-[160px]">
          <ClusterPulseCard
            className="h-full"
            onClick={() => setActiveModal("clusterPulse")}
          />
        </div>

        {/* Slot 3: Band Predictions */}
        <div className="flex-1 min-w-[180px]">
          <PredictionsCard
            className="h-full"
            maxPredictions={2}
            onClick={() => setActiveModal("bandConditions")}
          />
        </div>

        {/* Slot 4: This Day in History */}
        <div className="flex-1 min-w-[160px]">
          <HistoryCard
            className="h-full"
            onClick={() => setActiveModal("history")}
          />
        </div>
      </div>

      {/* Detail Modals */}
      <LogStatsDetailModal
        isOpen={activeModal === "logStats"}
        onClose={() => setActiveModal(null)}
      />
      <BandConditionsModal
        isOpen={activeModal === "bandConditions"}
        onClose={() => setActiveModal(null)}
        kIndex={currentKp}
        solarFlux={currentSfi}
      />
      <HistoryDetailModal
        isOpen={activeModal === "history"}
        onClose={() => setActiveModal(null)}
      />
      <ClusterPulseDetailModal
        isOpen={activeModal === "clusterPulse"}
        onClose={() => setActiveModal(null)}
      />
    </div>
  );
}

export default InsightsBar;
