import React from "react";
import { DetailModal } from "@/components/ui/DetailModal";
import { Badge, type BadgeStatus } from "@/components/ui/Badge";
import {
  getOverallCondition,
  calculateBandConditions,
} from "@/lib/utils/bands";
import type { BandCondition, VHFCondition } from "@/types/solar";

export interface SolarSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  kIndex: number;
  solarFlux: number;
}

/**
 * Map condition to badge status
 */
function conditionToBadgeStatus(
  condition: BandCondition | VHFCondition,
): BadgeStatus {
  switch (condition) {
    case "Excellent":
      return "excellent";
    case "Good":
      return "good";
    case "Fair":
      return "fair";
    case "Poor":
      return "poor";
    case "Aurora":
      return "active";
    default:
      return "fair";
  }
}

/**
 * Get time-of-day recommendations
 */
function getTimeRecommendations(
  kIndex: number,
  solarFlux: number,
): Array<{ period: string; bands: string[]; notes: string }> {
  const recommendations = [];

  // Sunrise/Greyline (around 6-8 local)
  if (solarFlux >= 90) {
    recommendations.push({
      period: "Sunrise / Greyline",
      bands: ["40m", "30m", "20m"],
      notes:
        "Excellent for long-path DX. 40m provides reliable paths as darkness recedes. Watch for greyline enhancement.",
    });
  } else {
    recommendations.push({
      period: "Sunrise / Greyline",
      bands: ["80m", "40m", "30m"],
      notes:
        "Focus on lower bands during transition. 80m may still be open for distant stations.",
    });
  }

  // Midday (10-14 local)
  if (solarFlux >= 120) {
    recommendations.push({
      period: "Midday (Peak)",
      bands: ["17m", "15m", "12m", "10m"],
      notes:
        "Higher bands at their best. F2 layer ionization at maximum. Best time for worldwide DX on higher bands.",
    });
  } else if (solarFlux >= 90) {
    recommendations.push({
      period: "Midday (Peak)",
      bands: ["20m", "17m", "15m"],
      notes:
        "Mid-bands provide reliable propagation. 20m is the workhorse band during daylight.",
    });
  } else {
    recommendations.push({
      period: "Midday (Peak)",
      bands: ["20m", "17m"],
      notes:
        "Limited high-band activity. Concentrate on 20m for DX opportunities.",
    });
  }

  // Afternoon (14-18 local)
  recommendations.push({
    period: "Afternoon",
    bands: solarFlux >= 100 ? ["20m", "17m", "15m"] : ["20m", "40m"],
    notes:
      solarFlux >= 100
        ? "Long-path openings to Asia/Pacific. Higher bands begin to fade towards evening."
        : "Transition period. 20m remains active, 40m beginning to improve.",
  });

  // Evening/Sunset (18-21 local)
  recommendations.push({
    period: "Evening / Sunset",
    bands: ["40m", "30m", "20m"],
    notes:
      "Greyline enhancement possible. 40m becomes primary DX band. Watch for short openings on higher bands.",
  });

  // Night (21-06 local)
  if (kIndex <= 3) {
    recommendations.push({
      period: "Night",
      bands: ["160m", "80m", "40m"],
      notes:
        "Lower bands come alive. 160m provides intercontinental paths. 40m remains active worldwide.",
    });
  } else {
    recommendations.push({
      period: "Night",
      bands: ["80m", "40m"],
      notes:
        "Elevated K-index may affect lower bands. 40m is most reliable. 160m may be degraded.",
    });
  }

  return recommendations;
}

/**
 * Assess DX opportunities
 */
function getDXAssessment(
  kIndex: number,
  solarFlux: number,
): { rating: string; color: string; description: string; tips: string[] } {
  const hfScore = (solarFlux / 200) * (1 - kIndex / 9);

  if (hfScore > 0.6) {
    return {
      rating: "Excellent",
      color: "#00ff88",
      description:
        "Outstanding conditions for DX. All paths should be workable with moderate power and antennas.",
      tips: [
        "Great time to chase rare DX and new DXCC entities",
        "Try long-path openings for enhanced signals",
        "Higher bands (10-15m) offer worldwide coverage",
        "Consider running a frequency - you may attract pileups",
      ],
    };
  }
  if (hfScore > 0.45) {
    return {
      rating: "Good",
      color: "#44dd66",
      description:
        "Favorable conditions for most DX paths. Some persistence may be needed for difficult paths.",
      tips: [
        "20m is your best bet for consistent DX",
        "Check 17m and 15m around solar noon",
        "Digital modes (FT8) extend your range significantly",
        "Gray line times offer enhanced propagation",
      ],
    };
  }
  if (hfScore > 0.3) {
    return {
      rating: "Fair",
      color: "#ffaa00",
      description:
        "Moderate DX possible but may require effort. Focus on optimal times and frequencies.",
      tips: [
        "Focus on 20m during daylight hours",
        "40m provides good night-time DX",
        "Use directional antennas if available",
        "FT8 and other weak-signal modes recommended",
      ],
    };
  }
  return {
    rating: "Poor",
    color: "#ff4455",
    description:
      "Challenging conditions for DX. Focus on lower bands and use weak-signal modes.",
    tips: [
      "Lower bands (40m, 80m) offer best chances",
      "Digital modes essential for weak signals",
      "Be patient - conditions can change rapidly",
      "Consider NVIS for regional contacts",
    ],
  };
}

/**
 * SolarSummaryModal Component
 *
 * Extended propagation analysis with all HF bands, time-of-day recommendations,
 * and DX opportunity assessment.
 */
export const SolarSummaryModal: React.FC<SolarSummaryModalProps> = ({
  isOpen,
  onClose,
  kIndex,
  solarFlux,
}) => {
  const overall = getOverallCondition(kIndex, solarFlux);
  const bands = calculateBandConditions(kIndex, solarFlux);
  const timeRecs = getTimeRecommendations(kIndex, solarFlux);
  const dxAssessment = getDXAssessment(kIndex, solarFlux);

  // Determine current time period
  const now = new Date();
  const hour = now.getHours();
  const isDaytime = hour >= 6 && hour < 18;

  return (
    <DetailModal
      isOpen={isOpen}
      onClose={onClose}
      title="Propagation Analysis"
      subtitle="Detailed conditions and recommendations"
      size="xl"
    >
      <div className="space-y-6">
        {/* Overall Assessment */}
        <div className="bg-void-black/50 rounded-lg p-4 border border-white/5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h4 className="text-sm font-mono uppercase tracking-wider text-gray-400 mb-2">
                Overall HF Conditions
              </h4>
              <Badge status={conditionToBadgeStatus(overall.hf)} size="md">
                {overall.hf.toUpperCase()}
              </Badge>
            </div>
            <div className="flex gap-6">
              <div className="text-center">
                <div className="text-xs text-gray-500 mb-1">Solar Flux</div>
                <div className="text-xl font-mono font-bold text-plasma-orange">
                  {solarFlux}
                </div>
              </div>
              <div className="text-center">
                <div className="text-xs text-gray-500 mb-1">K-Index</div>
                <div className="text-xl font-mono font-bold text-cosmic-cyan">
                  {kIndex}
                </div>
              </div>
            </div>
          </div>
          <p className="mt-4 text-gray-300 leading-relaxed">
            {overall.summary}
          </p>
        </div>

        {/* DX Opportunity Assessment */}
        <div className="bg-void-black/50 rounded-lg p-4 border border-white/5">
          <h4 className="text-sm font-mono uppercase tracking-wider text-gray-400 mb-3">
            DX Opportunity Assessment
          </h4>
          <div className="flex items-start gap-4 mb-4">
            <div
              className="px-4 py-2 rounded-lg font-mono font-bold text-lg shrink-0"
              style={{
                backgroundColor: `${dxAssessment.color}20`,
                color: dxAssessment.color,
                border: `1px solid ${dxAssessment.color}40`,
              }}
            >
              {dxAssessment.rating}
            </div>
            <p className="text-gray-300">{dxAssessment.description}</p>
          </div>
          <div className="mt-4">
            <h5 className="text-sm font-medium text-white mb-2">
              Tips for Today:
            </h5>
            <ul className="grid md:grid-cols-2 gap-2">
              {dxAssessment.tips.map((tip, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-sm text-gray-400"
                >
                  <span className="text-plasma-orange shrink-0">&#8226;</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Complete Band Matrix */}
        <div className="bg-void-black/50 rounded-lg p-4 border border-white/5">
          <h4 className="text-sm font-mono uppercase tracking-wider text-gray-400 mb-4">
            Complete HF Band Conditions
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-400 uppercase">
                    Band
                  </th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-400 uppercase hidden md:table-cell">
                    Frequency
                  </th>
                  <th className="text-center py-2 px-3 text-xs font-semibold text-gray-400 uppercase">
                    Day
                  </th>
                  <th className="text-center py-2 px-3 text-xs font-semibold text-gray-400 uppercase">
                    Night
                  </th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-400 uppercase">
                    Best For
                  </th>
                </tr>
              </thead>
              <tbody>
                {bands.map((band) => {
                  const isCurrentlyBest =
                    (isDaytime && band.dayCondition === "Excellent") ||
                    (!isDaytime && band.nightCondition === "Excellent") ||
                    (isDaytime && band.dayCondition === "Good") ||
                    (!isDaytime && band.nightCondition === "Good");

                  return (
                    <tr
                      key={band.name}
                      className={`border-b border-white/5 ${
                        isCurrentlyBest ? "bg-white/[0.03]" : ""
                      }`}
                    >
                      <td className="py-2 px-3">
                        <span className="font-mono font-medium text-white">
                          {band.name}
                        </span>
                        {isCurrentlyBest && (
                          <span className="ml-2 text-xs text-signal-green">
                            (recommended)
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-gray-400 text-sm font-mono hidden md:table-cell">
                        {band.freq}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <Badge
                          status={conditionToBadgeStatus(band.dayCondition)}
                          size="sm"
                        >
                          {band.dayCondition}
                        </Badge>
                      </td>
                      <td className="py-2 px-3 text-center">
                        <Badge
                          status={conditionToBadgeStatus(band.nightCondition)}
                          size="sm"
                        >
                          {band.nightCondition}
                        </Badge>
                      </td>
                      <td className="py-2 px-3 text-sm text-gray-400">
                        {band.bestFor}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Time-of-Day Recommendations */}
        <div className="bg-void-black/50 rounded-lg p-4 border border-white/5">
          <h4 className="text-sm font-mono uppercase tracking-wider text-gray-400 mb-4">
            Best Times for DX (Local Time)
          </h4>
          <div className="space-y-4">
            {timeRecs.map((rec, i) => {
              // Determine if this is the current period
              let isCurrent = false;
              if (rec.period.includes("Sunrise") && hour >= 6 && hour < 9) {
                isCurrent = true;
              }
              if (rec.period.includes("Midday") && hour >= 10 && hour < 14) {
                isCurrent = true;
              }
              if (rec.period === "Afternoon" && hour >= 14 && hour < 18) {
                isCurrent = true;
              }
              if (rec.period.includes("Evening") && hour >= 18 && hour < 21) {
                isCurrent = true;
              }
              if (rec.period === "Night" && (hour >= 21 || hour < 6)) {
                isCurrent = true;
              }

              return (
                <div
                  key={i}
                  className={`p-4 rounded-lg border ${
                    isCurrent
                      ? "bg-plasma-orange/10 border-plasma-orange/30"
                      : "bg-white/[0.02] border-white/5"
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-2">
                    <h5 className="font-medium text-white flex items-center gap-2">
                      {rec.period}
                      {isCurrent && (
                        <span className="text-xs bg-plasma-orange/20 text-plasma-orange px-2 py-0.5 rounded-full">
                          NOW
                        </span>
                      )}
                    </h5>
                    <div className="flex flex-wrap gap-1">
                      {rec.bands.map((band) => (
                        <span
                          key={band}
                          className="px-2 py-0.5 text-xs font-mono text-signal-green bg-signal-green/10 border border-signal-green/20 rounded"
                        >
                          {band}
                        </span>
                      ))}
                    </div>
                  </div>
                  <p className="text-sm text-gray-400">{rec.notes}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* VHF Note */}
        {overall.vhf === "Aurora" && (
          <div className="bg-aurora-purple/10 rounded-lg p-4 border border-aurora-purple/30">
            <h4 className="text-sm font-mono uppercase tracking-wider text-aurora-purple mb-2">
              Aurora Propagation Possible
            </h4>
            <p className="text-gray-300 text-sm">
              With current K-index levels, aurora propagation may be possible on
              6m and 2m. Listen for characteristic &quot;flutter&quot; signals
              and point antennas toward the auroral oval (generally north in the
              Northern Hemisphere). CW works best due to signal distortion.
            </p>
          </div>
        )}
      </div>
    </DetailModal>
  );
};

SolarSummaryModal.displayName = "SolarSummaryModal";

export default SolarSummaryModal;
