/**
 * Shared utility functions for propagation summary text and band recommendations.
 * Used by PropagationIndex (merged summary section) and SolarSummaryModal.
 */

import {
  getOverallCondition,
  calculateBandConditions,
} from "@/lib/utils/bands";
import type { BandCondition } from "@/types/solar";
import type { BadgeStatus } from "@/components/ui/Badge";

/**
 * Map a BandCondition string to a Badge status color
 */
export function conditionToBadgeStatus(condition: BandCondition): BadgeStatus {
  switch (condition) {
    case "Excellent":
      return "excellent";
    case "Good":
      return "good";
    case "Fair":
      return "fair";
    case "Poor":
      return "poor";
    default:
      return "fair";
  }
}

/**
 * Generate detailed plain-language summary based on solar conditions
 */
export function getDetailedSummary(kIndex: number, solarFlux: number): string {
  const parts: string[] = [];

  if (solarFlux >= 150) {
    parts.push(
      "The sun is very active today with excellent HF propagation expected.",
    );
  } else if (solarFlux >= 100) {
    parts.push(
      "Solar activity is moderate with good propagation on most HF bands.",
    );
  } else if (solarFlux >= 80) {
    parts.push(
      "Solar activity is low. Focus on lower frequency bands for best results.",
    );
  } else {
    parts.push(
      "Solar activity is very low. HF propagation may be challenging.",
    );
  }

  if (solarFlux >= 120) {
    parts.push("Higher bands (15m-10m) should be open during daylight hours.");
  } else if (solarFlux >= 90) {
    parts.push("Mid-range bands (17m-20m) are your best bet for DX.");
  } else {
    parts.push("Lower bands (30m-40m) will provide the most reliable paths.");
  }

  if (kIndex >= 5) {
    parts.push(
      "Warning: A geomagnetic storm is in progress. Expect signal degradation and polar path disruption.",
    );
  } else if (kIndex >= 4) {
    parts.push("Note: Elevated geomagnetic activity may affect polar paths.");
  } else if (kIndex <= 1) {
    parts.push("Geomagnetic conditions are very quiet - ideal for DX.");
  }

  return parts.join(" ");
}

/**
 * Get best bands (up to 4) based on current conditions and time of day
 */
export function getBestBands(kIndex: number, solarFlux: number): string[] {
  const bands = calculateBandConditions(kIndex, solarFlux);
  const now = new Date();
  const hour = now.getUTCHours();
  const isDaytime = hour >= 6 && hour < 18;

  const goodBands = bands.filter((band) => {
    const condition = isDaytime ? band.dayCondition : band.nightCondition;
    return condition === "Excellent" || condition === "Good";
  });

  return goodBands.map((band) => band.name).slice(0, 4);
}

/**
 * Get the overall HF condition and badge status for display
 */
export function getConditionBadge(kIndex: number, solarFlux: number) {
  const overall = getOverallCondition(kIndex, solarFlux);
  return {
    label: overall.hf.toUpperCase(),
    status: conditionToBadgeStatus(overall.hf),
    vhf: overall.vhf,
  };
}
