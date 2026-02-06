import { useMemo } from "react";
import {
  getSolarCyclePosition,
  compareToCycle24,
  getSolarCycleTrend,
} from "@/lib/data/historicalPropagation";

interface SolarCycleContextProps {
  currentSFI: number | null;
  recentSFI?: number[];
  loading?: boolean;
}

export function SolarCycleContext({
  currentSFI,
  recentSFI,
  loading,
}: SolarCycleContextProps) {
  const cyclePos = useMemo(() => getSolarCyclePosition(), []);
  const comparison = useMemo(
    () =>
      currentSFI !== null
        ? compareToCycle24(currentSFI)
        : "SFI data unavailable",
    [currentSFI],
  );
  const trend = useMemo(() => getSolarCycleTrend(recentSFI ?? []), [recentSFI]);

  // Phase icon and color
  const phaseConfig = {
    rising: {
      icon: "\u2197",
      color: "text-signal-green",
      label: "Rising Phase",
    },
    peak: { icon: "\u25C6", color: "text-plasma-orange", label: "Near Peak" },
    declining: {
      icon: "\u2198",
      color: "text-caution-amber",
      label: "Declining Phase",
    },
  };
  const phase = phaseConfig[cyclePos.phase];

  // Trend config
  const trendConfig = {
    rising: { icon: "\u25B2", color: "text-signal-green", label: "Improving" },
    stable: { icon: "\u25CF", color: "text-gray-400", label: "Stable" },
    declining: { icon: "\u25BC", color: "text-alert-red", label: "Declining" },
  };
  const trendInfo = trendConfig[trend];

  if (loading) {
    return (
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-md p-4 animate-pulse">
        <div className="h-6 bg-white/5 rounded w-1/3 mb-3" />
        <div className="h-4 bg-white/5 rounded w-2/3" />
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-md p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-sans text-lg font-semibold text-white tracking-wide">
          Solar Cycle 25
        </h2>
        <span className={`text-sm font-mono ${phase.color}`}>
          {phase.icon} {phase.label}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl bg-gradient-to-br from-plasma-orange/10 to-transparent border border-plasma-orange/20 p-3">
          <div className="text-xs text-gray-400 uppercase tracking-wider">
            Cycle Position
          </div>
          <div className="mt-1 text-lg font-bold text-white font-mono">
            {cyclePos.percentOfPeak}%
          </div>
          <div className="text-xs text-gray-500 mt-1">of predicted peak</div>
        </div>
        <div className="rounded-xl bg-gradient-to-br from-cosmic-cyan/10 to-transparent border border-cosmic-cyan/20 p-3">
          <div className="text-xs text-gray-400 uppercase tracking-wider">
            Short-term Trend
          </div>
          <div
            className={`mt-1 text-lg font-bold font-mono ${trendInfo.color}`}
          >
            {trendInfo.icon} {trendInfo.label}
          </div>
        </div>
        <div className="rounded-xl bg-gradient-to-br from-aurora-purple/10 to-transparent border border-aurora-purple/20 p-3">
          <div className="text-xs text-gray-400 uppercase tracking-wider">
            vs SC24 Peak
          </div>
          <div className="mt-1 text-sm text-gray-300 leading-snug">
            {comparison}
          </div>
        </div>
      </div>
    </section>
  );
}
