/**
 * ConditionsPill Component
 *
 * A compact conditions indicator designed for mobile header display.
 * Shows propagation score with color coding in a minimal pill format.
 */

import { useMemo } from "react";
import { useKIndex, useSolarFlux } from "@/hooks/useSolarData";
import { calculatePropagationIndex } from "@/components/solar/PropagationIndex";

interface ConditionsPillProps {
  className?: string;
  compact?: boolean;
}

function getScoreColor(score: number): string {
  if (score >= 80) {
    return "#00ff88";
  }
  if (score >= 60) {
    return "#44dd66";
  }
  if (score >= 40) {
    return "#ffaa00";
  }
  if (score >= 20) {
    return "#ff7700";
  }
  return "#ff4455";
}

function getCategoryShort(
  category: "excellent" | "good" | "fair" | "poor" | "very-poor",
): string {
  switch (category) {
    case "excellent":
      return "Strong";
    case "good":
      return "Support";
    case "fair":
      return "Mixed";
    case "poor":
      return "Disrupted";
    case "very-poor":
      return "Severe";
  }
}

export function ConditionsPill({ className = "", compact = false }: ConditionsPillProps) {
  const { data: kIndexData, isLoading: kLoading } = useKIndex();
  const { data: solarFluxData, isLoading: sfiLoading } = useSolarFlux();

  const currentKp = useMemo(() => {
    if (!kIndexData || kIndexData.length === 0) {
      return null;
    }
    return kIndexData[kIndexData.length - 1].kp_index;
  }, [kIndexData]);

  const currentSfi = useMemo(() => {
    if (!solarFluxData || solarFluxData.length === 0) {
      return null;
    }
    return solarFluxData[solarFluxData.length - 1].flux;
  }, [solarFluxData]);

  const indexResult = useMemo(
    () =>
      currentSfi !== null && currentKp !== null
        ? calculatePropagationIndex(currentSfi, currentKp, null)
        : null,
    [currentSfi, currentKp],
  );

  const isLoading = kLoading || sfiLoading;
  const scoreColor = indexResult ? getScoreColor(indexResult.score) : "#888899";

  if (isLoading) {
    return (
      <div
        className={`px-2 py-0.5 rounded-full bg-white/10 text-xs text-gray-400 ${className}`}
      >
        ...
      </div>
    );
  }

  if (!indexResult) {
    return (
      <div className={`px-2 py-0.5 rounded-full bg-white/10 text-xs text-gray-400 ${className}`}>
        Global conditions unavailable
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/10 ${className}`}
      title={`Global conditions heuristic: ${indexResult.score}/100 (${indexResult.evidenceCoverage}) - ${getCategoryShort(indexResult.category)}`}
    >
      {/* Mini score indicator */}
      <div
        className="w-2 h-2 rounded-full"
        style={{ backgroundColor: scoreColor }}
      />
      <span
        className="text-xs font-mono font-medium"
        style={{ color: scoreColor }}
      >
        {indexResult.score}
      </span>
      {!compact && (
        <span className="text-xs text-gray-400">
          {getCategoryShort(indexResult.category)}
        </span>
      )}
    </div>
  );
}

export default ConditionsPill;
