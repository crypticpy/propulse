/**
 * EmComm Readiness Scoring Engine
 *
 * Computes an emergency communications readiness score (0-100) based on:
 * - Repeater density and operational status
 * - NVIS viability (HF regional fallback)
 * - Active NWS alert severity
 * - Flood proximity from river gauges
 *
 * Higher score = better readiness for emergency communications.
 */

import type { RIMSubScore } from "@/types/atmos";

export interface EmCommScoringInput {
  repeaterCount: number;
  operationalRepeaterRatio: number | null; // 0-1, null if no repeaters nearby
  nvisViable: boolean;
  alertMaxSeverityLevel: number; // 0=none, 1=Minor, 2=Moderate, 3=Severe, 4=Extreme
  floodProximity: "none" | "action" | "minor" | "moderate" | "major";
}

export function computeEmcommScore(input: EmCommScoringInput): RIMSubScore {
  let score = 50;

  // Repeater density bonus: +3 per repeater, cap +15
  score += Math.min(input.repeaterCount * 3, 15);

  // NVIS viable: +15 (HF regional fallback available)
  if (input.nvisViable) score += 15;

  // No severe alerts: +10
  if (input.alertMaxSeverityLevel === 0) score += 10;

  // Alert penalties
  if (input.alertMaxSeverityLevel >= 4)
    score -= 20; // Extreme
  else if (input.alertMaxSeverityLevel >= 3) score -= 10; // Severe

  // Low operational repeater ratio: -10 if <50%
  if (
    input.operationalRepeaterRatio != null &&
    input.operationalRepeaterRatio < 0.5
  ) {
    score -= 10;
  }

  // Flood risk
  if (input.floodProximity === "major") score -= 10;
  else if (input.floodProximity === "moderate") score -= 5;

  score = Math.max(0, Math.min(100, score));

  // Determine trend based on alert severity
  const trend: RIMSubScore["trend"] =
    input.alertMaxSeverityLevel >= 3
      ? "down"
      : input.alertMaxSeverityLevel === 0 && input.nvisViable
        ? "up"
        : "stable";

  return {
    value: score,
    label: "EmComm",
    trend,
    dataAvailable: true,
  };
}
