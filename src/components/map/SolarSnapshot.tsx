/**
 * SolarSnapshot Component
 *
 * A compact widget that combines propagation index, solar indicators,
 * and optimal band recommendations into a single unified display.
 * Designed to replace the RecommendationsBadge with richer context.
 */

import { useMemo, useState } from "react";
import { useKIndex, useSolarFlux, useMagnetometer } from "@/hooks/useSolarData";
import { HelpButton, HelpModal } from "@/components/ui/HelpModal";
import { calculatePropagationIndex } from "@/components/solar/PropagationIndex";
import { getRecommendations } from "@/lib/utils/recommendations";
import {
  getGreylineStatus,
  getGreylineIntensityLabel,
  getGreylineIntensityColor,
  formatGreylineEventTime,
} from "@/lib/utils/greyline";
import type { PropagationRecommendations } from "@/types/recommendations";

export interface SolarSnapshotProps {
  homeLat: number;
  homeLon: number;
  targetLat: number;
  targetLon: number;
  displayTime: Date;
  className?: string;
}

/**
 * Get color for propagation score value
 */
function getScoreColor(score: number): string {
  if (score >= 80) return "#00ff88";
  if (score >= 60) return "#44dd66";
  if (score >= 40) return "#ffaa00";
  if (score >= 20) return "#ff7700";
  return "#ff4455";
}

/**
 * Get color for Solar Flux Index value
 */
function getSfiColor(sfi: number): string {
  if (sfi >= 150) return "#00ff88";
  if (sfi >= 100) return "#ffaa00";
  return "#ff4455";
}

/**
 * Get color for Kp index value
 */
function getKpColor(kp: number): string {
  if (kp <= 2) return "#00ff88";
  if (kp <= 4) return "#ffaa00";
  return "#ff4455";
}

/**
 * Get color for IMF Bz value
 */
function getBzColor(bz: number | null): string {
  if (bz === null) return "#888";
  if (bz > 0) return "#00ff88";
  if (bz > -5) return "#ffaa00";
  return "#ff4455";
}

/**
 * Get category label from propagation score
 */
function getCategoryLabel(
  category: "excellent" | "good" | "fair" | "poor" | "very-poor",
): string {
  switch (category) {
    case "excellent":
      return "Excellent";
    case "good":
      return "Good";
    case "fair":
      return "Fair";
    case "poor":
      return "Poor";
    case "very-poor":
      return "Very Poor";
  }
}

// Mode colors for visual distinction
const MODE_COLORS: Record<string, string> = {
  FT8: "text-cyan-400",
  CW: "text-yellow-400",
  SSB: "text-green-400",
  RTTY: "text-purple-400",
};

/**
 * Get a contextual operating tip based on conditions
 */
function getOperatingTip(
  sfi: number,
  kp: number,
  hour: number,
  score: number,
): { tip: string; audience: string } {
  // For storm conditions
  if (kp >= 5) {
    return {
      tip: "Storm active - try 40m/80m NVIS or wait for recovery",
      audience: "all",
    };
  }

  // High flux conditions
  if (sfi >= 150 && score >= 60) {
    return {
      tip: "Excellent for 10m/15m SSB DX - work the high bands!",
      audience: "dx",
    };
  }

  // Greyline opportunities
  if ((hour >= 5 && hour <= 7) || (hour >= 17 && hour <= 19)) {
    return {
      tip: "Greyline window - enhanced long-path propagation",
      audience: "dx",
    };
  }

  // Low flux
  if (sfi < 80) {
    return {
      tip: "Low SFI - 20m/40m are your best bets, use FT8/CW",
      audience: "all",
    };
  }

  // Nighttime
  if (hour >= 22 || hour < 6) {
    return {
      tip: "Night mode - 40m/80m/160m are open for DX",
      audience: "dx",
    };
  }

  // Daytime
  if (hour >= 10 && hour < 16) {
    return {
      tip: "Peak daytime - 20m/17m/15m should be productive",
      audience: "all",
    };
  }

  return {
    tip: "Stable conditions - check the forecast for peak times",
    audience: "beginner",
  };
}

/**
 * Compact arc gauge for propagation score
 */
function MiniArcGauge({ score, color }: { score: number; color: string }) {
  const radius = 28;
  const strokeWidth = 5;
  const circumference = 2 * Math.PI * radius;
  const arcLength = circumference * 0.75; // 270 degrees
  const scoreArcLength = (score / 100) * arcLength;

  return (
    <svg
      width="70"
      height="52"
      viewBox="0 0 70 52"
      className="overflow-visible"
    >
      {/* Background arc */}
      <circle
        cx="35"
        cy="35"
        r={radius}
        fill="none"
        stroke="rgba(255,255,255,0.1)"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={`${arcLength} ${circumference}`}
        strokeDashoffset={-circumference * (135 / 360)}
        transform="rotate(-90 35 35)"
      />
      {/* Score arc */}
      <circle
        cx="35"
        cy="35"
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={`${scoreArcLength} ${circumference}`}
        strokeDashoffset={-circumference * (135 / 360)}
        transform="rotate(-90 35 35)"
        className="transition-all duration-500"
        style={{ filter: `drop-shadow(0 0 4px ${color}40)` }}
      />
      {/* Score text */}
      <text
        x="35"
        y="38"
        fill="white"
        fontSize="18"
        fontFamily="monospace"
        fontWeight="bold"
        textAnchor="middle"
        dominantBaseline="middle"
      >
        {score}
      </text>
    </svg>
  );
}

export function SolarSnapshot({
  homeLat,
  homeLon,
  targetLat,
  targetLon,
  displayTime,
  className = "",
}: SolarSnapshotProps) {
  const [showHelp, setShowHelp] = useState(false);

  // Fetch solar data
  const { data: kIndexData, isLoading: kLoading } = useKIndex();
  const { data: solarFluxData, isLoading: sfiLoading } = useSolarFlux();
  const { data: magnetometerData } = useMagnetometer();

  const isLoading = kLoading || sfiLoading;

  // Extract current values with defaults
  const currentKp = useMemo(() => {
    if (!kIndexData || kIndexData.length === 0) return 3;
    return kIndexData[kIndexData.length - 1].kp_index;
  }, [kIndexData]);

  const currentSfi = useMemo(() => {
    if (!solarFluxData || solarFluxData.length === 0) return 100;
    return solarFluxData[solarFluxData.length - 1].flux;
  }, [solarFluxData]);

  const currentBz = useMemo(() => {
    if (!magnetometerData || magnetometerData.length === 0) return null;
    return (
      magnetometerData
        .slice()
        .reverse()
        .find((d) => typeof d.bz_gsm === "number" && Number.isFinite(d.bz_gsm))
        ?.bz_gsm ?? null
    );
  }, [magnetometerData]);

  // Calculate propagation index
  const indexResult = useMemo(
    () => calculatePropagationIndex(currentSfi, currentKp, currentBz),
    [currentSfi, currentKp, currentBz],
  );

  // Get band recommendations
  const recommendations = useMemo<PropagationRecommendations | null>(() => {
    return getRecommendations(
      homeLat,
      homeLon,
      targetLat,
      targetLon,
      currentKp,
      currentSfi,
      displayTime,
      "FT8",
    );
  }, [
    homeLat,
    homeLon,
    targetLat,
    targetLon,
    currentKp,
    currentSfi,
    displayTime,
  ]);

  // Check storm risk conditions
  const hasStormRisk = currentKp >= 5 || (currentBz !== null && currentBz < -5);

  // Get greyline status for home location
  const greylineStatus = useMemo(() => {
    return getGreylineStatus(homeLat, homeLon, displayTime);
  }, [homeLat, homeLon, displayTime]);

  const scoreColor = getScoreColor(indexResult.score);
  const optimal = recommendations?.optimal ?? null;
  const mode = recommendations?.mode ?? null;

  // Empty state when no target is selected
  const hasTarget = targetLat !== 0 || targetLon !== 0;
  if (!hasTarget) {
    return (
      <div
        className={`${className} h-full flex items-center justify-center text-gray-400 text-xs`}
      >
        Select a target to see conditions
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div
        className={`${className} h-full flex items-center justify-center text-gray-400 text-xs`}
      >
        <div className="animate-pulse">Loading...</div>
      </div>
    );
  }

  // Get operating tip
  const currentHour = displayTime.getUTCHours();
  const operatingTip = getOperatingTip(
    currentSfi,
    currentKp,
    currentHour,
    indexResult.score,
  );

  return (
    <div className={`${className} h-full flex flex-col`}>
      {/* Header: Title + Help button */}
      <div className="flex items-center justify-between mb-1.5">
        <h3 className="text-xs font-medium text-gray-300 uppercase tracking-wide">
          Solar Snapshot
        </h3>
        <HelpButton onClick={() => setShowHelp(true)} />
      </div>

      {/* Condition + Solar metrics row */}
      <div className="flex items-center justify-between gap-2 mb-1">
        {/* Condition label */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-gray-400 uppercase">
            Conditions
          </span>
          <span className="text-sm font-semibold" style={{ color: scoreColor }}>
            {getCategoryLabel(indexResult.category)}
          </span>
        </div>

        {/* Solar metrics pills - compact */}
        <div className="flex items-center gap-1 text-xs">
          <span
            className="px-1.5 py-0.5 rounded bg-white/10 font-mono"
            title="Solar Flux Index - higher is better for HF propagation"
          >
            <span className="text-gray-500">SFI</span>{" "}
            <span style={{ color: getSfiColor(currentSfi) }}>
              {Math.round(currentSfi)}
            </span>
          </span>
          <span
            className="px-1.5 py-0.5 rounded bg-white/10 font-mono"
            title="K-index - lower is better for stable propagation"
          >
            <span className="text-gray-500">Kp</span>{" "}
            <span style={{ color: getKpColor(currentKp) }}>
              {currentKp.toFixed(1)}
            </span>
          </span>
          <span
            className="px-1 py-0.5 rounded bg-white/10 font-mono"
            title="IMF Bz - northward (↑) is favorable"
          >
            <span className="text-gray-500">Bz</span>{" "}
            <span style={{ color: getBzColor(currentBz) }}>
              {currentBz !== null ? (currentBz > 0 ? "↑" : "↓") : "—"}
            </span>
          </span>
        </div>
      </div>

      {/* Storm warning if applicable - with pulse animation */}
      {hasStormRisk && (
        <div className="flex items-center gap-1 text-xs text-alert-red mb-1 animate-pulse">
          <span>⚠</span>
          <span>Storm risk - HF may be degraded</span>
        </div>
      )}

      {/* Greyline status indicator */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-gray-400 uppercase">Greyline</span>
          <span
            className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
              greylineStatus.isActive ? "animate-pulse" : ""
            }`}
            style={{
              color: getGreylineIntensityColor(greylineStatus.intensity),
              backgroundColor: `${getGreylineIntensityColor(greylineStatus.intensity)}20`,
            }}
          >
            {getGreylineIntensityLabel(greylineStatus.intensity)}
          </span>
        </div>
        {greylineStatus.minutesToNextEvent !== null && (
          <span
            className="text-[10px] text-gray-400 font-mono"
            title={
              greylineStatus.nextEventTime
                ? `Next: ${greylineStatus.nextEventTime.toLocaleTimeString()}`
                : undefined
            }
          >
            {formatGreylineEventTime(
              greylineStatus.minutesToNextEvent,
              greylineStatus.nextEventType,
            )}
          </span>
        )}
      </div>

      {/* Main content: Gauge + Band Info */}
      <div className="flex-1 flex items-center gap-3 min-h-0">
        {/* Left: Arc gauge */}
        <div className="flex-shrink-0">
          <MiniArcGauge score={indexResult.score} color={scoreColor} />
        </div>

        {/* Right: Band recommendations */}
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
          {optimal && mode ? (
            <>
              {/* Best band + mode + SNR */}
              <div className="flex items-baseline gap-2">
                <span className="text-[10px] text-gray-500 uppercase">
                  Best
                </span>
                <span className="text-xl font-bold font-mono text-white leading-none">
                  {optimal.band}
                </span>
                <span
                  className={`text-sm font-semibold ${MODE_COLORS[mode] || "text-white"}`}
                >
                  {mode}
                </span>
                {optimal.snr !== undefined && (
                  <span className="text-xs font-mono text-gray-400">
                    {optimal.snr > 0 ? "+" : ""}
                    {optimal.snr}dB
                  </span>
                )}
              </div>

              {/* Alternatives as colored pill tags */}
              {recommendations?.alternatives &&
                recommendations.alternatives.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] text-gray-500 uppercase">
                      Also
                    </span>
                    {recommendations.alternatives.slice(0, 3).map((alt) => (
                      <span
                        key={alt.band}
                        className="px-2 py-0.5 rounded-full text-sm font-mono font-medium border"
                        style={{
                          color: getScoreColor(alt.score),
                          borderColor: `${getScoreColor(alt.score)}40`,
                          backgroundColor: `${getScoreColor(alt.score)}15`,
                        }}
                        title={`${alt.band}: Score ${alt.score}/100`}
                      >
                        {alt.band}
                      </span>
                    ))}
                  </div>
                )}

              {/* Band score indicator */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-500 uppercase">
                  Band Score
                </span>
                <span
                  className="text-sm font-mono font-bold"
                  style={{ color: scoreColor }}
                >
                  {optimal.score}
                </span>
                <span className="text-[10px] text-gray-500">/ 100</span>
              </div>
            </>
          ) : (
            <div className="text-xs text-gray-400">No bands currently open</div>
          )}
        </div>
      </div>

      {/* Bottom: Operating tip */}
      <div className="mt-1 pt-1 border-t border-white/10">
        <div className="bg-plasma-orange/10 border-l-2 border-plasma-orange rounded-r px-2 py-1 text-xs leading-tight">
          <span className="text-gray-400">Tip:</span>{" "}
          <span className="text-gray-300">{operatingTip.tip}</span>
        </div>
      </div>

      {/* Help Modal */}
      <HelpModal
        isOpen={showHelp}
        onClose={() => setShowHelp(false)}
        title="Solar Conditions"
        sections={[
          {
            title: "Propagation Score",
            content:
              "A 0-100 score combining SFI, Kp, and Bz. Higher is better for HF propagation.",
          },
          {
            title: "SFI (Solar Flux Index)",
            content:
              "Measures solar radio emissions. Higher SFI (>100) means better high-band propagation.",
          },
          {
            title: "Kp Index",
            content:
              "Measures geomagnetic disturbance. Lower Kp (<3) means more stable propagation.",
          },
          {
            title: "Bz",
            content:
              "IMF magnetic field direction. Northward (↑) is favorable for propagation.",
          },
          {
            title: "Greyline",
            content:
              "The twilight zone around sunrise/sunset. Peak: within 15 min of SR/SS. Enhanced: 15-30 min. Great for low-band (160m/80m/40m) DX.",
          },
        ]}
      />
    </div>
  );
}
