/**
 * RIM (Radio Impact Model) Scoring Engine
 *
 * Pure-function scoring engine that translates weather + space weather
 * conditions into radio impact scores. No React imports, no hooks, no
 * side effects -- just math.
 *
 * Produces a RIMResult with 4 sub-scores (0-100, where 100 = ideal):
 *   - HF Band Score: ionospheric + atmospheric impact on HF propagation
 *   - VHF/UHF Score: tropospheric + weather impact on VHF/UHF paths
 *   - Infrastructure Risk: antenna/tower/power risk from weather events
 *   - EmComm Readiness: emergency communications readiness scoring
 *
 * Composite is a weighted average of *available* sub-scores only:
 * HF 0.35 + VHF 0.25 + Infra 0.25 + EmComm 0.15, renormalised when any
 * sub-score is missing. Missing inputs are never replaced with defaults.
 */

import type { RIMResult, RIMSubScore } from "@/types/atmos";
import type { RIMInput } from "./rimTypes";
import { computeEmcommScore } from "@/lib/atmos/emcommScoring";

export const RIM_WEIGHTS = {
  hfBand: 0.35,
  vhfUhf: 0.25,
  infraRisk: 0.25,
  emcommReadiness: 0.15,
} as const;

export type RimScoreSlot = keyof typeof RIM_WEIGHTS;

const SLOTS: readonly RimScoreSlot[] = [
  "hfBand",
  "vhfUhf",
  "infraRisk",
  "emcommReadiness",
];

function clamp(value: number, lo: number, max: number): number {
  return Math.max(lo, Math.min(max, value));
}

function oneSentence(parts: string[], empty: string): string {
  if (parts.length === 0) return empty;
  if (parts.length === 1) return `${parts[0]}.`;
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}.`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}.`;
}

function hfReason(input: RIMInput, available: boolean): string {
  if (!available) {
    return "NO DATA — Kp, SFI, X-ray, proton flux, and TEC have not arrived.";
  }
  const parts: string[] = [];
  if (input.kpIndex != null) {
    parts.push(
      input.kpIndex >= 3
        ? `Kp ${input.kpIndex} cuts HF`
        : `Kp ${input.kpIndex} is quiet`,
    );
  }
  if (input.solarFlux != null) {
    const sfi = Math.round(input.solarFlux);
    if (input.solarFlux > 150) parts.push(`SFI ${sfi} lifts MUF`);
    else if (input.solarFlux < 70) parts.push(`SFI ${sfi} is low`);
    else parts.push(`SFI ${sfi}`);
  }
  if (input.xrayFlux != null && input.xrayFlux > 1e-4) {
    parts.push("X-ray absorption");
  }
  if (input.protonFlux != null && input.protonFlux > 100) {
    parts.push(`proton flux ${Math.round(input.protonFlux)} pfu`);
  }
  if (input.tecValue != null) {
    const tec = Math.round(input.tecValue);
    if (input.tecValue > 80) parts.push(`TEC ${tec} TECU storm density`);
    else if (input.tecValue < 10) parts.push(`TEC ${tec} TECU is thin`);
    else parts.push(`TEC ${tec} TECU`);
  }
  if (input.nearestLightningKm != null && input.nearestLightningKm < 500) {
    parts.push(`lightning QRN at ${Math.round(input.nearestLightningKm)} km`);
  }
  return oneSentence(parts, "Quiet space weather leaves HF near baseline.");
}

function vhfReason(input: RIMInput, available: boolean): string {
  if (!available) {
    return "NO DATA — no weather alerts or lightning to score VHF/UHF.";
  }
  const parts: string[] = [];
  const extreme = input.activeAlertSeverities.filter((s) => s === "Extreme").length;
  const severe = input.activeAlertSeverities.filter((s) => s === "Severe").length;
  if (extreme > 0) parts.push(`${extreme} extreme alert${extreme === 1 ? "" : "s"}`);
  if (severe > 0) parts.push(`${severe} severe alert${severe === 1 ? "" : "s"}`);
  if (input.nearestLightningKm != null && input.nearestLightningKm < 200) {
    parts.push(
      `lightning at ${Math.round(input.nearestLightningKm)} km adds convective ducting`,
    );
  } else if (input.nearestLightningKm != null) {
    parts.push(`lightning at ${Math.round(input.nearestLightningKm)} km`);
  }
  return oneSentence(parts, "VHF/UHF holds near its quiet baseline.");
}

function infraReason(input: RIMInput, available: boolean): string {
  if (!available) {
    return "NO DATA — no alerts, lightning, or flood stage at gauges.";
  }
  const parts: string[] = [];
  const extreme = input.activeAlertSeverities.filter((s) => s === "Extreme").length;
  const severe = input.activeAlertSeverities.filter((s) => s === "Severe").length;
  const moderate = input.activeAlertSeverities.filter(
    (s) => s === "Moderate",
  ).length;
  if (extreme > 0) parts.push(`${extreme} extreme alert${extreme === 1 ? "" : "s"}`);
  if (severe > 0) parts.push(`${severe} severe alert${severe === 1 ? "" : "s"}`);
  if (moderate > 0) {
    parts.push(`${moderate} moderate alert${moderate === 1 ? "" : "s"}`);
  }
  if (input.nearestLightningKm != null && input.nearestLightningKm < 10) {
    parts.push(`lightning ${Math.round(input.nearestLightningKm)} km from the station`);
  }
  if (input.floodProximity && input.floodProximity !== "none") {
    parts.push(`${input.floodProximity} flood stage`);
  }
  return oneSentence(parts, "No scored weather is stressing infrastructure.");
}

function emcommReason(input: RIMInput, available: boolean): string {
  if (!available) {
    return "NO DATA — no station, repeaters, alerts, or flood stage to score.";
  }
  const parts: string[] = [];
  if (input.repeaterCount > 0) {
    const pct =
      input.operationalRepeaterRatio != null
        ? ` at ${Math.round(input.operationalRepeaterRatio * 100)}% operational`
        : "";
    parts.push(`${input.repeaterCount} repeater${input.repeaterCount === 1 ? "" : "s"}${pct}`);
  }
  if (input.nvisViable) parts.push("NVIS is viable");
  if (input.alertMaxSeverityLevel >= 3) {
    parts.push("severe alerts cut readiness");
  } else if (input.alertMaxSeverityLevel === 0) {
    parts.push("no severe alerts");
  }
  if (input.floodProximity && input.floodProximity !== "none") {
    parts.push(`${input.floodProximity} flood stage`);
  }
  return oneSentence(parts, "EmComm sits on its unmoved baseline.");
}

/**
 * Compute HF Band Score (0-100, 100 = ideal conditions).
 *
 * Factors: Kp index, SFI, X-ray absorption, proton flux, lightning QRN.
 */
function computeHfBandScore(input: RIMInput): RIMSubScore {
  const hasAnyData =
    input.kpIndex != null ||
    input.solarFlux != null ||
    input.xrayFlux != null ||
    input.protonFlux != null ||
    input.tecValue != null;

  if (!hasAnyData) {
    return {
      value: 50,
      label: "HF Bands",
      trend: "stable",
      dataAvailable: false,
      reason: hfReason(input, false),
    };
  }

  let score = 100;

  if (input.kpIndex != null) {
    if (input.kpIndex >= 7) {
      score -= 70;
    } else if (input.kpIndex >= 5) {
      score -= 40;
    } else if (input.kpIndex >= 3) {
      score -= 15;
    }
  }

  if (input.solarFlux != null) {
    if (input.solarFlux > 150) {
      score += 10;
    } else if (input.solarFlux < 70) {
      score -= 20;
    }
  }

  if (input.xrayFlux != null) {
    if (input.xrayFlux > 1e-3) {
      score -= 60;
    } else if (input.xrayFlux > 1e-4) {
      score -= 30;
    }
  }

  if (input.protonFlux != null) {
    if (input.protonFlux > 1000) {
      score -= 70;
    } else if (input.protonFlux > 100) {
      score -= 40;
    }
  }

  if (input.tecValue != null) {
    if (input.tecValue > 80) {
      score -= 15;
    } else if (input.tecValue > 40) {
      score += 5;
    } else if (input.tecValue < 10) {
      score -= 10;
    }
  }

  if (input.nearestLightningKm != null) {
    if (input.nearestLightningKm < 50) {
      score -= 25;
    } else if (input.nearestLightningKm < 200) {
      score -= 15;
    } else if (input.nearestLightningKm < 500) {
      score -= 8;
    }
  }

  return {
    value: clamp(score, 0, 100),
    label: "HF Bands",
    trend: "stable",
    dataAvailable: true,
    reason: hfReason(input, true),
  };
}

/**
 * Compute VHF/UHF Score (0-100, 100 = ideal conditions).
 *
 * Available only from alerts or lightning — Kp is not a VHF input and must
 * not unlock the quiet-day default of 80.
 */
function computeVhfUhfScore(input: RIMInput): RIMSubScore {
  const hasAnyData =
    input.activeAlertSeverities.length > 0 || input.nearestLightningKm != null;

  if (!hasAnyData) {
    return {
      value: 80,
      label: "VHF/UHF",
      trend: "stable",
      dataAvailable: false,
      reason: vhfReason(input, false),
    };
  }

  let score = 80;

  for (const severity of input.activeAlertSeverities) {
    if (severity === "Extreme") {
      score -= 40;
    } else if (severity === "Severe") {
      score -= 25;
    }
  }

  if (input.nearestLightningKm != null && input.nearestLightningKm < 200) {
    score += 5;
  }

  return {
    value: clamp(score, 0, 100),
    label: "VHF/UHF",
    trend: "stable",
    dataAvailable: true,
    reason: vhfReason(input, true),
  };
}

/**
 * Compute Infrastructure Risk score (0-100, 100 = no risk).
 */
function computeInfraRiskScore(input: RIMInput): RIMSubScore {
  const hasAnyData =
    input.activeAlertSeverities.length > 0 ||
    input.nearestLightningKm != null ||
    (input.floodProximity != null && input.floodProximity !== "none");

  if (!hasAnyData) {
    return {
      value: 100,
      label: "Infrastructure",
      trend: "stable",
      dataAvailable: false,
      reason: infraReason(input, false),
    };
  }

  let score = 100;
  let cumulativePenalty = 0;

  for (const severity of input.activeAlertSeverities) {
    if (severity === "Extreme") {
      cumulativePenalty += 50;
    } else if (severity === "Severe") {
      cumulativePenalty += 30;
    } else if (severity === "Moderate") {
      cumulativePenalty += 15;
    }
  }

  score -= Math.min(cumulativePenalty, 70);

  if (input.nearestLightningKm != null && input.nearestLightningKm < 10) {
    score -= 20;
  }

  if (input.floodProximity === "major") {
    score -= 30;
  } else if (input.floodProximity === "moderate") {
    score -= 20;
  } else if (input.floodProximity === "minor") {
    score -= 10;
  } else if (input.floodProximity === "action") {
    score -= 5;
  }

  return {
    value: clamp(score, 0, 100),
    label: "Infrastructure",
    trend: "stable",
    dataAvailable: true,
    reason: infraReason(input, true),
  };
}

function emcommInputsPresent(input: RIMInput): boolean {
  return (
    (input.stationLat != null && input.stationLon != null) ||
    input.repeaterCount > 0 ||
    input.alertMaxSeverityLevel > 0 ||
    (input.floodProximity != null && input.floodProximity !== "none")
  );
}

/**
 * Compute EmComm Readiness, wrapping the dedicated scorer so a missing-input
 * path can mark the sub-score unavailable instead of shipping its baseline.
 */
function computeEmcommReadiness(input: RIMInput): RIMSubScore {
  const score = computeEmcommScore({
    repeaterCount: input.repeaterCount,
    operationalRepeaterRatio: input.operationalRepeaterRatio,
    nvisViable: input.nvisViable,
    alertMaxSeverityLevel: input.alertMaxSeverityLevel,
    floodProximity: input.floodProximity ?? "none",
  });
  const available = emcommInputsPresent(input);
  return {
    ...score,
    dataAvailable: available,
    reason: emcommReason(input, available),
  };
}

export interface RimScoreParts {
  hfBand: RIMSubScore;
  vhfUhf: RIMSubScore;
  infraRisk: RIMSubScore;
  emcommReadiness: RIMSubScore;
}

/**
 * Weighted composite of available sub-scores. Unavailable slots are dropped
 * and remaining weights renormalised; their stored values are never mixed
 * in. When every slot is missing the composite is 0 and `partial` is true.
 */
export function composeRimScores(
  parts: RimScoreParts,
  regionId: string,
  updatedAt = Date.now(),
): RIMResult {
  const excludedInputs: string[] = [];
  let weighted = 0;
  let totalWeight = 0;

  for (const slot of SLOTS) {
    const sub = parts[slot];
    if (sub.dataAvailable) {
      weighted += sub.value * RIM_WEIGHTS[slot];
      totalWeight += RIM_WEIGHTS[slot];
    } else {
      excludedInputs.push(sub.label);
    }
  }

  const composite =
    totalWeight > 0 ? clamp(Math.round(weighted / totalWeight), 0, 100) : 0;

  return {
    regionId,
    composite,
    hfBand: parts.hfBand,
    vhfUhf: parts.vhfUhf,
    infraRisk: parts.infraRisk,
    emcommReadiness: parts.emcommReadiness,
    updatedAt,
    partial: excludedInputs.length > 0,
    excludedInputs,
  };
}

/**
 * Compute the full Radio Impact Model result.
 *
 * @param input  - Aggregated data from all weather/solar hooks
 * @param regionId - Identifier for the monitored region (e.g., "home")
 * @returns RIMResult with composite score and 4 sub-scores
 */
export function computeRIM(input: RIMInput, regionId: string): RIMResult {
  return composeRimScores(
    {
      hfBand: computeHfBandScore(input),
      vhfUhf: computeVhfUhfScore(input),
      infraRisk: computeInfraRiskScore(input),
      emcommReadiness: computeEmcommReadiness(input),
    },
    regionId,
  );
}
