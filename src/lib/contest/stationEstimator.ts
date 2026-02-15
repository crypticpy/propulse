/**
 * Station Performance Estimator
 *
 * Estimates contest QSO counts based on the operator's station setup
 * (radio power, antenna type, feedline loss) and contest type. Returns
 * a tier label, QSO range estimate, and contextual operating tips.
 *
 * This is intentionally optimistic and encouraging — the goal is to
 * motivate beginners, not gatekeep.
 *
 * @module lib/contest/stationEstimator
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StationProfile {
  /** Transmit power in watts */
  powerWatts: number;
  /** Antenna category for estimation */
  antennaCategory: AntennaCategory;
  /** Total feedline loss in dB (optional, defaults to 1) */
  feedlineLossDb?: number;
}

export type AntennaCategory =
  | "wire"
  | "vertical"
  | "yagi"
  | "beam"
  | "stacked"
  | "loop"
  | "unknown";

export interface PerformanceEstimate {
  /** Low end of estimated QSO count */
  lowEstimate: number;
  /** High end of estimated QSO count */
  highEstimate: number;
  /** Human-readable tier label */
  tier: string;
  /** Contextual tips based on station setup */
  tips: string[];
}

// ---------------------------------------------------------------------------
// Power classification
// ---------------------------------------------------------------------------

type PowerClass = "qrp" | "lp" | "hp";

function classifyPower(watts: number): PowerClass {
  if (watts <= 5) return "qrp";
  if (watts <= 100) return "lp";
  return "hp";
}

// ---------------------------------------------------------------------------
// Tier definitions
// ---------------------------------------------------------------------------

interface TierDef {
  tier: string;
  low: number;
  high: number;
}

const TIER_TABLE: Record<string, TierDef> = {
  qrp_wire: { tier: "Adventurous", low: 20, high: 50 },
  qrp_vertical: { tier: "Adventurous", low: 25, high: 60 },
  qrp_loop: { tier: "Adventurous", low: 20, high: 55 },
  qrp_yagi: { tier: "Bold Explorer", low: 40, high: 100 },
  qrp_beam: { tier: "Bold Explorer", low: 40, high: 100 },
  qrp_stacked: { tier: "Bold Explorer", low: 50, high: 120 },
  qrp_unknown: { tier: "Adventurous", low: 20, high: 50 },

  lp_wire: { tier: "Capable", low: 50, high: 150 },
  lp_vertical: { tier: "Capable", low: 60, high: 180 },
  lp_loop: { tier: "Capable", low: 50, high: 160 },
  lp_yagi: { tier: "Competitive", low: 150, high: 400 },
  lp_beam: { tier: "Competitive", low: 150, high: 400 },
  lp_stacked: { tier: "Serious Contester", low: 250, high: 600 },
  lp_unknown: { tier: "Capable", low: 50, high: 150 },

  hp_wire: { tier: "Capable", low: 80, high: 250 },
  hp_vertical: { tier: "Competitive", low: 120, high: 350 },
  hp_loop: { tier: "Capable", low: 100, high: 280 },
  hp_yagi: { tier: "Serious Contester", low: 400, high: 1000 },
  hp_beam: { tier: "Serious Contester", low: 400, high: 1000 },
  hp_stacked: { tier: "Top Gun", low: 1000, high: 3000 },
  hp_unknown: { tier: "Competitive", low: 120, high: 350 },
};

// ---------------------------------------------------------------------------
// Contest mode multiplier
// ---------------------------------------------------------------------------

/**
 * CW contacts are faster than SSB; digital is somewhere in between.
 * Apply a rate multiplier based on the dominant contest mode.
 */
function getContestModeMultiplier(contestType?: string): number {
  if (!contestType) return 1.0;
  const lower = contestType.toLowerCase();
  if (lower.includes("cw")) return 1.3;
  if (
    lower.includes("rtty") ||
    lower.includes("digital") ||
    lower.includes("ft8") ||
    lower.includes("ft4")
  )
    return 1.15;
  if (lower.includes("ssb") || lower.includes("phone")) return 0.9;
  return 1.0;
}

// ---------------------------------------------------------------------------
// Tips generation
// ---------------------------------------------------------------------------

function generateTips(
  powerClass: PowerClass,
  antenna: AntennaCategory,
  feedlineLossDb: number,
  contestType?: string,
): string[] {
  const tips: string[] = [];

  // Power-based tips
  if (powerClass === "qrp") {
    tips.push(
      "QRP contesting is all about patience and timing. Call during openings when signals are strong.",
    );
    tips.push(
      "Focus on Search & Pounce rather than running a frequency — your signal may not cut through pileups.",
    );
  } else if (powerClass === "lp") {
    tips.push(
      "Low power is the most popular contest category. You are in great company!",
    );
  }

  // Antenna-based tips
  if (antenna === "wire" || antenna === "loop") {
    tips.push(
      "Wire antennas work surprisingly well. Focus on the bands where your antenna is resonant for best results.",
    );
    tips.push(
      "Consider operating during grey-line periods (sunrise/sunset) when propagation favors all station sizes.",
    );
  } else if (antenna === "vertical") {
    tips.push(
      "Verticals are great for low-angle DX. Focus on working distant stations during band openings.",
    );
  } else if (antenna === "yagi" || antenna === "beam") {
    tips.push(
      "Point your beam toward population centers (Europe or Japan from NA) during peak hours for the highest rates.",
    );
  } else if (antenna === "stacked") {
    tips.push(
      "Stacked arrays give you a serious edge. Use your signal advantage to run a frequency and keep rates high.",
    );
  }

  // Feedline loss warning
  if (feedlineLossDb > 3) {
    tips.push(
      `Your feedline loss of ${feedlineLossDb.toFixed(1)} dB is significant. Upgrading to lower-loss coax could improve your effective signal.`,
    );
  }

  // Contest-type tips
  if (contestType) {
    const lower = contestType.toLowerCase();
    if (lower.includes("cw")) {
      tips.push(
        "CW contests move fast. Practice your exchange before the contest starts.",
      );
    }
    if (lower.includes("ssb") || lower.includes("phone")) {
      tips.push(
        "On SSB, speak clearly and keep your exchange short. Use phonetics for your callsign.",
      );
    }
    if (lower.includes("rtty") || lower.includes("digital")) {
      tips.push(
        "Digital contests are great for beginners. Your software handles the exchange — just make sure macros are set up correctly.",
      );
    }
  }

  // General tip (always include one)
  tips.push(
    "Every QSO counts! Even a handful of contacts contributes to the contest community and helps others earn multipliers.",
  );

  return tips;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Estimate contest performance based on station profile and contest type.
 *
 * @param profile - Station setup (power, antenna, feedline loss)
 * @param contestType - Optional contest mode hint (e.g., "CW", "SSB", "RTTY")
 * @returns Performance estimate with QSO range, tier, and tips
 */
export function estimateContestPerformance(
  profile: StationProfile,
  contestType?: string,
): PerformanceEstimate {
  const powerClass = classifyPower(profile.powerWatts);
  const feedlineLossDb = profile.feedlineLossDb ?? 1;

  // Look up base estimate
  const key = `${powerClass}_${profile.antennaCategory}`;
  const base = TIER_TABLE[key] ?? TIER_TABLE[`${powerClass}_unknown`];

  // Apply contest mode multiplier
  const modeMult = getContestModeMultiplier(contestType);

  // Apply feedline loss penalty (each dB above 2 reduces estimates by ~5%)
  const excessLoss = Math.max(0, feedlineLossDb - 2);
  const lossPenalty = Math.max(0.7, 1 - excessLoss * 0.05);

  const low = Math.round(base.low * modeMult * lossPenalty);
  const high = Math.round(base.high * modeMult * lossPenalty);

  const tips = generateTips(
    powerClass,
    profile.antennaCategory,
    feedlineLossDb,
    contestType,
  );

  return {
    lowEstimate: low,
    highEstimate: high,
    tier: base.tier,
    tips,
  };
}

/**
 * Map a UserAntennaType string to an AntennaCategory for estimation.
 * Groups the 34 specific antenna types into broad categories.
 */
export function antennaTypeToCategory(antennaType: string): AntennaCategory {
  const t = antennaType.toLowerCase();

  // Stacked / phased
  if (t.includes("stacked") || t.includes("phased_array")) return "stacked";

  // Yagi / beam / directional
  if (
    t.includes("yagi") ||
    t.includes("hex_beam") ||
    t.includes("quad") ||
    t.includes("log_periodic") ||
    t.includes("moxon") ||
    t.includes("steppir") ||
    t.includes("rhombic") ||
    t.includes("dish") ||
    t.includes("helical")
  ) {
    return "yagi";
  }

  // Vertical / omnidirectional
  if (
    t.includes("vertical") ||
    t.includes("ground_plane") ||
    t.includes("j_pole") ||
    t.includes("slim_jim") ||
    t.includes("trapped_vertical")
  ) {
    return "vertical";
  }

  // Loop
  if (
    t.includes("loop") ||
    t.includes("delta_loop") ||
    t.includes("magnetic_loop")
  ) {
    return "loop";
  }

  // Wire (default for most wire types)
  if (
    t.includes("dipole") ||
    t.includes("wire") ||
    t.includes("efhw") ||
    t.includes("ocf") ||
    t.includes("fan") ||
    t.includes("trap_dipole") ||
    t.includes("zepp") ||
    t.includes("g5rv") ||
    t.includes("inverted") ||
    t.includes("nvis") ||
    t.includes("beverage")
  ) {
    return "wire";
  }

  return "unknown";
}
