/**
 * Global-conditions heuristic shared by the Solar Pulse gauge, the mobile
 * header pill, and the map snapshot. Lives outside the React component so
 * lightweight consumers do not pull the gauge (and its UI deps) into the
 * app entry bundle.
 */

export type PropagationIndexCategory =
  | "excellent"
  | "good"
  | "fair"
  | "poor"
  | "very-poor";

export interface PropagationIndexResult {
  score: number;
  sfiScore: number;
  kpScore: number;
  bzScore: number;
  bzAvailable: boolean;
  evidenceCoverage: "2 of 3 inputs" | "3 of 3 inputs";
  category: PropagationIndexCategory;
  description: string;
}

/**
 * Calculate a transparent global-conditions heuristic (0-100).
 * It is not path-specific and is not a calibrated probability.
 *
 * Formula breakdown:
 * - SFI component (40 points max): Higher SFI = better ionization = better propagation
 * - Kp component (40 points max): Lower Kp = quieter geomagnetic = better propagation
 * - Bz component (20 points max): Positive Bz = shield from solar wind = better propagation
 */
export function calculatePropagationIndex(
  solarFlux: number,
  kIndex: number,
  bz: number | null,
): PropagationIndexResult {
  // SFI component: 0-40 points
  // SFI of 70 = 0 points (minimum useful), SFI of 200 = 40 points (excellent)
  const normalizedSfi = Math.max(0, Math.min(1, (solarFlux - 70) / 130));
  const sfiScore = normalizedSfi * 40;

  // Kp component: 0-40 points
  // Kp of 0 = 40 points (perfect quiet), Kp of 9 = 0 points (severe storm)
  const kpScore = ((9 - kIndex) / 9) * 40;

  // Bz component: 0-20 points
  // Bz >= 5 = 20 points (strong shield), Bz < -10 = 0 points (storm conditions)
  let bzScore = 0;
  if (bz !== null) {
    if (bz >= 5) {
      bzScore = 20;
    } else if (bz >= 0) {
      bzScore = 15;
    } else if (bz >= -5) bzScore = 10;
    else if (bz >= -10) bzScore = 5;
    else bzScore = 0;
  }

  // Normalize only across observed inputs. Missing Bz contributes no hidden
  // neutral points; evidence coverage is returned and shown beside the score.
  const availableMaximum = bz === null ? 80 : 100;
  const score = Math.round(((sfiScore + kpScore + bzScore) / availableMaximum) * 100);

  // Categorize
  let category: PropagationIndexCategory;
  let description: string;

  if (score >= 80) {
    category = "excellent";
    description = "Global indices are strongly supportive; path results may differ";
  } else if (score >= 60) {
    category = "good";
    description = "Global indices are supportive; check the specific path and time";
  } else if (score >= 40) {
    category = "fair";
    description = "Global inputs are mixed; use path-aware analysis";
  } else if (score >= 20) {
    category = "poor";
    description = "Global inputs indicate disruption risk";
  } else {
    category = "very-poor";
    description = "Global inputs indicate substantial disruption risk";
  }

  return {
    score,
    sfiScore,
    kpScore,
    bzScore,
    bzAvailable: bz !== null,
    evidenceCoverage: bz === null ? "2 of 3 inputs" : "3 of 3 inputs",
    category,
    description,
  };
}
