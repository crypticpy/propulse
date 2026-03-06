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
 * Composite is a weighted average: HF 0.35 + VHF 0.25 + Infra 0.25 + EmComm 0.15
 */

import type { RIMResult, RIMSubScore } from "@/types/atmos";
import type { RIMInput } from "./rimTypes";
import { computeEmcommScore } from "@/lib/atmos/emcommScoring";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ---------------------------------------------------------------------------
// Sub-Score Computations
// ---------------------------------------------------------------------------

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
    };
  }

  let score = 100;

  // Kp penalty
  if (input.kpIndex != null) {
    if (input.kpIndex >= 7) {
      score -= 70;
    } else if (input.kpIndex >= 5) {
      score -= 40;
    } else if (input.kpIndex >= 3) {
      score -= 15;
    }
  }

  // SFI bonus/penalty
  if (input.solarFlux != null) {
    if (input.solarFlux > 150) {
      score += 10;
    } else if (input.solarFlux < 70) {
      score -= 20;
    }
  }

  // X-ray absorption (GOES flux in W/m^2)
  if (input.xrayFlux != null) {
    if (input.xrayFlux > 1e-3) {
      // X-class flare
      score -= 60;
    } else if (input.xrayFlux > 1e-4) {
      // M-class flare
      score -= 30;
    }
  }

  // Proton flux (pfu)
  if (input.protonFlux != null) {
    if (input.protonFlux > 1000) {
      score -= 70;
    } else if (input.protonFlux > 100) {
      score -= 40;
    }
  }

  // TEC (Total Electron Content) — higher is generally better for HF
  // propagation (higher MUF), but extremely elevated TEC (>80 TECU)
  // during storm conditions can degrade signal quality.
  if (input.tecValue != null) {
    if (input.tecValue > 80) {
      score -= 15; // Storm-enhanced density — scintillation risk
    } else if (input.tecValue > 40) {
      score += 5; // Elevated ionisation — good HF propagation
    } else if (input.tecValue < 10) {
      score -= 10; // Low ionisation — poor higher-band propagation
    }
  }

  // Lightning QRN
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
  };
}

/**
 * Compute VHF/UHF Score (0-100, 100 = ideal conditions).
 *
 * VHF is generally reliable; main concerns are severe weather and
 * convective ducting opportunities.
 */
function computeVhfUhfScore(input: RIMInput): RIMSubScore {
  const hasAnyData =
    input.activeAlertSeverities.length > 0 || input.nearestLightningKm != null;

  if (!hasAnyData && input.kpIndex == null) {
    return {
      value: 80,
      label: "VHF/UHF",
      trend: "stable",
      dataAvailable: false,
    };
  }

  let score = 80;

  // Alert severity penalty
  for (const severity of input.activeAlertSeverities) {
    if (severity === "Extreme") {
      score -= 40;
    } else if (severity === "Severe") {
      score -= 25;
    }
  }

  // Lightning nearby: convective ducting potential bonus
  if (input.nearestLightningKm != null && input.nearestLightningKm < 200) {
    score += 5;
  }

  return {
    value: clamp(score, 0, 100),
    label: "VHF/UHF",
    trend: "stable",
    dataAvailable: true,
  };
}

/**
 * Compute Infrastructure Risk score (0-100, 100 = no risk).
 *
 * Assesses antenna/tower/power risk from weather events.
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
    };
  }

  let score = 100;
  let cumulativePenalty = 0;

  // Alert severity penalties (cumulative, capped at -70)
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

  // Lightning direct strike risk
  if (input.nearestLightningKm != null && input.nearestLightningKm < 10) {
    score -= 20;
  }

  // River gauge flood proximity
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
  };
}

/**
 * Compute EmComm Readiness score by delegating to the dedicated scoring module.
 */
function computeEmcommReadiness(input: RIMInput) {
  return computeEmcommScore({
    repeaterCount: input.repeaterCount,
    operationalRepeaterRatio: input.operationalRepeaterRatio,
    nvisViable: input.nvisViable,
    alertMaxSeverityLevel: input.alertMaxSeverityLevel,
    floodProximity: input.floodProximity ?? "none",
  });
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/** Weight factors for composite score */
const WEIGHTS = {
  hf: 0.35,
  vhf: 0.25,
  infra: 0.25,
  emcomm: 0.15,
} as const;

/**
 * Compute the full Radio Impact Model result.
 *
 * @param input  - Aggregated data from all weather/solar hooks
 * @param regionId - Identifier for the monitored region (e.g., "home")
 * @returns RIMResult with composite score and 4 sub-scores
 */
export function computeRIM(input: RIMInput, regionId: string): RIMResult {
  const hfBand = computeHfBandScore(input);
  const vhfUhf = computeVhfUhfScore(input);
  const infraRisk = computeInfraRiskScore(input);
  const emcommReadiness = computeEmcommReadiness(input);

  const composite = Math.round(
    hfBand.value * WEIGHTS.hf +
      vhfUhf.value * WEIGHTS.vhf +
      infraRisk.value * WEIGHTS.infra +
      emcommReadiness.value * WEIGHTS.emcomm,
  );

  return {
    regionId,
    composite: clamp(composite, 0, 100),
    hfBand,
    vhfUhf,
    infraRisk,
    emcommReadiness,
    updatedAt: Date.now(),
  };
}
