/**
 * Propagation Mode Classifier
 *
 * Classifies the most likely HF propagation mode for a given path based on
 * frequency, distance, ionospheric conditions, and geometry. Returns ranked
 * probabilities for each mode: F2, sporadic E, TEP, NVIS, gray line,
 * long path, backscatter, and ground wave.
 */

const DEG_TO_RAD = Math.PI / 180;
const EARTH_CIRCUMFERENCE_KM = 40075;
const GEOMAG_DIPOLE_TILT = 11.5;
const GEOMAG_POLE_LON = -72.68;

// ============================================================================
// Types
// ============================================================================

export type PropagationMode =
  | "F2"
  | "sporadic_E"
  | "TEP"
  | "NVIS"
  | "gray_line"
  | "long_path"
  | "backscatter"
  | "ground_wave"
  | "unknown";

export type Season = "spring" | "summer" | "autumn" | "winter";

export interface PropagationClassifierInput {
  frequencyMHz: number;
  distanceKm: number;
  homeLat: number;
  homeLon: number;
  targetLat: number;
  targetLon: number;
  sfi: number;
  kp: number;
  isDaytime: boolean;
  isGrayLine: boolean;
  season: Season;
}

export interface PropagationModeResult {
  primaryMode: PropagationMode;
  confidence: number;
  description: string;
  characteristics: string[];
  operationalAdvice: string;
}

export interface ModeProbability {
  mode: PropagationMode;
  probability: number;
  reason: string;
}

// ============================================================================
// Mode Metadata
// ============================================================================

interface ModeMetadata {
  description: string;
  characteristics: string[];
  operationalAdvice: string;
  color: string;
}

const MODE_METADATA: Record<PropagationMode, ModeMetadata> = {
  F2: {
    description:
      "Standard F2-layer skip propagation. Signals refract from the F2 ionospheric layer (250-400 km altitude), supporting long-distance communication on HF bands.",
    characteristics: [
      "slow fading",
      "moderate signal strength",
      "stable path for minutes to hours",
      "multipath possible on long paths",
    ],
    operationalAdvice:
      "All modes work well. SSB and CW are excellent choices. Use the frequency of optimum traffic (FOT, ~85% of MUF) for best reliability.",
    color: "text-signal-green",
  },
  sporadic_E: {
    description:
      "Sporadic E-layer propagation. Thin, highly ionized patches in the E layer (100-120 km) refract signals on higher HF and low VHF frequencies, often producing strong but short-lived openings.",
    characteristics: [
      "rapid onset and fade",
      "strong signal peaks",
      "flutter fading",
      "narrow geographic footprint",
      "bursts of strong signal",
    ],
    operationalAdvice:
      "Act fast -- openings may last only minutes. Use SSB or CW for quick QSOs. Monitor 10m and 6m beacons for Es indicators.",
    color: "text-good",
  },
  TEP: {
    description:
      "Trans-Equatorial Propagation. Signals travel along geomagnetic field-aligned plasma irregularities near the magnetic equator, connecting stations in opposite hemispheres on VHF and upper HF bands.",
    characteristics: [
      "strong signal enhancement",
      "rapid flutter fading",
      "characteristic hollow or echo-like sound",
      "frequency spreading",
    ],
    operationalAdvice:
      "Best on 15m, 12m, and 10m. Openings peak around local sunset and during equinox seasons. Beam toward the geomagnetic equator.",
    color: "text-good",
  },
  NVIS: {
    description:
      "Near-Vertical Incidence Skywave. Signals are transmitted nearly straight up and refracted back from the F2 layer, providing regional coverage within ~500 km with no skip zone.",
    characteristics: [
      "slow fading",
      "reliable regional coverage",
      "fills the skip zone",
      "moderate signal strength",
    ],
    operationalAdvice:
      "Use horizontal antennas low to the ground. Best on 80m, 60m, and 40m below the critical frequency. Ideal for emergency and regional nets.",
    color: "text-signal-green",
  },
  gray_line: {
    description:
      "Gray line (terminator) propagation. Enhanced low-band propagation along the day/night boundary where ionospheric absorption is minimized and the D layer is weak.",
    characteristics: [
      "signal enhancement at dawn/dusk",
      "rapid signal changes",
      "deep fades possible",
      "unusual paths that are normally closed",
    ],
    operationalAdvice:
      "Best on 160m, 80m, and 40m. Be on frequency at your local sunrise or sunset. Signals may peak for only a few minutes.",
    color: "text-caution-amber",
  },
  long_path: {
    description:
      "Long-path propagation. Signals travel the long way around the Earth, sometimes providing a stronger or more reliable path than the short path.",
    characteristics: [
      "delayed signals",
      "distinct echo possible from simultaneous short+long path",
      "unusual beam headings",
      "can be stronger than short path during certain times",
    ],
    operationalAdvice:
      "Point your antenna 180 degrees from the normal short-path bearing. Long-path openings often coincide with gray line crossings.",
    color: "text-caution-amber",
  },
  backscatter: {
    description:
      "Backscatter propagation. Signals at or near the MUF scatter from ionospheric irregularities or the ground at a distant point. Very weak and noisy.",
    characteristics: [
      "very weak signals",
      "hollow or warbly sound",
      "broad signal with distortion",
      "non-directional reception possible",
    ],
    operationalAdvice:
      "Use CW or FT8 for best results with weak signals. Both stations should beam toward the scatter point. High power helps significantly.",
    color: "text-alert-red",
  },
  ground_wave: {
    description:
      "Ground wave propagation. Signals follow the Earth's surface directly from transmitter to receiver at short range, independent of ionospheric conditions.",
    characteristics: [
      "very stable signal",
      "no fading",
      "consistent day and night",
      "signal strength drops with distance",
    ],
    operationalAdvice:
      "Any mode works well at short range. Vertical antennas provide the best ground-wave performance.",
    color: "text-signal-green",
  },
  unknown: {
    description:
      "Propagation mode could not be confidently classified. Conditions may be marginal or transitional.",
    characteristics: [
      "unpredictable signal behavior",
      "mixed propagation modes possible",
      "conditions may be changing rapidly",
    ],
    operationalAdvice:
      "Monitor beacons and cluster spots for real-time propagation indicators. Use FT8 or CW for weak-signal work.",
    color: "text-gray-500",
  },
};

// ============================================================================
// Internal Helpers
// ============================================================================

function approximateGeomagLat(geoLat: number, geoLon: number): number {
  const latRad = geoLat * DEG_TO_RAD;
  const lonDiff = (geoLon - GEOMAG_POLE_LON) * DEG_TO_RAD;
  const tiltRad = GEOMAG_DIPOLE_TILT * DEG_TO_RAD;

  const sinGeomagLat =
    Math.sin(latRad) * Math.cos(tiltRad) +
    Math.cos(latRad) * Math.sin(tiltRad) * Math.cos(lonDiff);

  return Math.asin(Math.max(-1, Math.min(1, sinGeomagLat))) / DEG_TO_RAD;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ============================================================================
// Scoring Functions
// ============================================================================

function scoreGroundWave(input: PropagationClassifierInput): ModeProbability {
  const { distanceKm, frequencyMHz } = input;

  if (distanceKm < 10) {
    return {
      mode: "ground_wave",
      probability: 95,
      reason: `Very short distance (${Math.round(distanceKm)} km) -- ground wave is dominant`,
    };
  }
  if (distanceKm < 30) {
    const freqBonus = frequencyMHz < 10 ? 10 : 0;
    return {
      mode: "ground_wave",
      probability: clamp(85 - (distanceKm - 10) * 1.5 + freqBonus, 10, 90),
      reason: `Short distance (${Math.round(distanceKm)} km) -- ground wave likely dominant`,
    };
  }
  if (distanceKm < 50) {
    const freqBonus = frequencyMHz < 7 ? 10 : 0;
    return {
      mode: "ground_wave",
      probability: clamp(60 - (distanceKm - 30) * 2 + freqBonus, 5, 65),
      reason: `Short distance (${Math.round(distanceKm)} km) -- ground wave possible, mixing with skywave`,
    };
  }
  return {
    mode: "ground_wave",
    probability: Math.max(0, 10 - (distanceKm - 50) * 0.2),
    reason: `Distance ${Math.round(distanceKm)} km exceeds typical ground wave range`,
  };
}

function scoreNVIS(input: PropagationClassifierInput): ModeProbability {
  const { distanceKm, frequencyMHz, isDaytime, sfi } = input;

  if (distanceKm > 600)
    return {
      mode: "NVIS",
      probability: 0,
      reason: `Distance ${Math.round(distanceKm)} km is beyond NVIS range (~500 km)`,
    };
  if (frequencyMHz > 10)
    return {
      mode: "NVIS",
      probability: 0,
      reason: `Frequency ${frequencyMHz} MHz is too high for NVIS (needs < 10 MHz)`,
    };
  if (distanceKm < 50)
    return {
      mode: "NVIS",
      probability: 10,
      reason: `Very short distance -- ground wave is more likely than NVIS`,
    };

  let prob = 70;
  if (isDaytime) prob += 10;
  else prob -= 15;
  if (sfi >= 120) prob += 5;
  else if (sfi < 80) prob -= 10;
  if (distanceKm >= 100 && distanceKm <= 400) prob += 5;
  else if (distanceKm > 500) prob -= 15;
  if (frequencyMHz >= 3 && frequencyMHz <= 8) prob += 5;
  else if (frequencyMHz < 2) prob -= 10;

  return {
    mode: "NVIS",
    probability: clamp(prob, 0, 95),
    reason: isDaytime
      ? `Regional distance (${Math.round(distanceKm)} km) on ${frequencyMHz} MHz during daytime -- NVIS conditions favorable`
      : `Regional distance (${Math.round(distanceKm)} km) on ${frequencyMHz} MHz at night -- NVIS possible but reduced ionization`,
  };
}

function scoreSporadicE(input: PropagationClassifierInput): ModeProbability {
  const { distanceKm, frequencyMHz, season } = input;

  if (distanceKm < 400 || distanceKm > 2500) {
    return {
      mode: "sporadic_E",
      probability: distanceKm > 2500 ? 3 : 0,
      reason:
        distanceKm < 400
          ? `Distance too short for sporadic E skip`
          : `Distance beyond typical sporadic E range`,
    };
  }

  if (frequencyMHz >= 28 && frequencyMHz <= 70) {
    let prob = 55;
    if (season === "summer") prob += 25;
    else if (season === "spring" || season === "autumn") prob += 10;
    else prob -= 10;
    if (distanceKm >= 500 && distanceKm <= 2300) prob += 10;
    return {
      mode: "sporadic_E",
      probability: clamp(prob, 5, 95),
      reason: `${frequencyMHz} MHz at ${Math.round(distanceKm)} km in ${season} -- consistent with sporadic E`,
    };
  }

  if (frequencyMHz > 21 && season === "summer") {
    let prob = 45;
    if (distanceKm >= 500 && distanceKm <= 2300) prob += 10;
    return {
      mode: "sporadic_E",
      probability: clamp(prob, 5, 75),
      reason: `Summer season on ${frequencyMHz} MHz -- sporadic E possible on upper HF bands`,
    };
  }

  return {
    mode: "sporadic_E",
    probability: frequencyMHz > 15 && season === "summer" ? 15 : 5,
    reason: `Frequency ${frequencyMHz} MHz is below the typical sporadic E range`,
  };
}

function scoreTEP(input: PropagationClassifierInput): ModeProbability {
  const {
    homeLat,
    homeLon,
    targetLat,
    targetLon,
    frequencyMHz,
    season,
    isDaytime,
  } = input;

  const homeGeomagLat = approximateGeomagLat(homeLat, homeLon);
  const targetGeomagLat = approximateGeomagLat(targetLat, targetLon);

  if (Math.abs(homeGeomagLat) > 20 || Math.abs(targetGeomagLat) > 20) {
    return {
      mode: "TEP",
      probability: 0,
      reason: `Stations not within +/-20 deg of geomagnetic equator`,
    };
  }
  if (homeGeomagLat * targetGeomagLat >= 0) {
    return {
      mode: "TEP",
      probability: 5,
      reason: `Both stations on the same side of the geomagnetic equator`,
    };
  }
  if (frequencyMHz < 21 || frequencyMHz > 50) {
    return {
      mode: "TEP",
      probability: frequencyMHz > 14 ? 10 : 2,
      reason: `Frequency outside typical TEP range (21-50 MHz)`,
    };
  }

  let prob = 55;
  if (season === "spring" || season === "autumn") prob += 20;
  else prob -= 10;
  if (!isDaytime) prob += 10;
  const avgGeomagDist =
    (Math.abs(homeGeomagLat) + Math.abs(targetGeomagLat)) / 2;
  if (avgGeomagDist <= 10) prob += 10;
  else if (avgGeomagDist > 15) prob -= 5;

  return {
    mode: "TEP",
    probability: clamp(prob, 5, 95),
    reason: `Trans-equatorial geometry confirmed on ${frequencyMHz} MHz in ${season}`,
  };
}

function scoreGrayLine(input: PropagationClassifierInput): ModeProbability {
  const { isGrayLine, frequencyMHz } = input;
  if (!isGrayLine)
    return {
      mode: "gray_line",
      probability: 0,
      reason: "Path is not near the solar terminator",
    };

  if (frequencyMHz < 5)
    return {
      mode: "gray_line",
      probability: 80,
      reason: `Gray line path on ${frequencyMHz} MHz -- strong enhancement expected on low bands`,
    };
  if (frequencyMHz < 10)
    return {
      mode: "gray_line",
      probability: 65,
      reason: `Gray line path on ${frequencyMHz} MHz -- good enhancement expected`,
    };
  if (frequencyMHz < 14)
    return {
      mode: "gray_line",
      probability: 45,
      reason: `Gray line path on ${frequencyMHz} MHz -- moderate enhancement possible`,
    };
  return {
    mode: "gray_line",
    probability: 20,
    reason: `Gray line path on ${frequencyMHz} MHz -- minimal gray line enhancement above 14 MHz`,
  };
}

function scoreLongPath(input: PropagationClassifierInput): ModeProbability {
  const { distanceKm, frequencyMHz, sfi, isDaytime } = input;

  if (distanceKm <= 20000) {
    if (distanceKm > 15000)
      return {
        mode: "long_path",
        probability: 10,
        reason: `Distance ${Math.round(distanceKm)} km is long but below the long-path threshold`,
      };
    return {
      mode: "long_path",
      probability: 0,
      reason: `Distance ${Math.round(distanceKm)} km -- short path is much shorter`,
    };
  }

  const longPathDist = EARTH_CIRCUMFERENCE_KM - distanceKm;
  let prob = 60;
  if (sfi >= 120) prob += 10;
  else if (sfi < 80) prob -= 15;
  if (frequencyMHz >= 14 && frequencyMHz <= 21) prob += 10;
  if (isDaytime) prob += 5;

  return {
    mode: "long_path",
    probability: clamp(prob, 10, 90),
    reason: `Short-path distance ${Math.round(distanceKm)} km suggests long-path (~${Math.round(longPathDist)} km) propagation`,
  };
}

function scoreBackscatter(input: PropagationClassifierInput): ModeProbability {
  const { frequencyMHz, sfi, distanceKm } = input;

  if (frequencyMHz < 24)
    return {
      mode: "backscatter",
      probability: 2,
      reason: `Frequency ${frequencyMHz} MHz too low for typical backscatter`,
    };
  if (sfi < 100)
    return {
      mode: "backscatter",
      probability: 5,
      reason: `SFI ${sfi} too low for backscatter`,
    };

  let prob = 25;
  if (frequencyMHz >= 28 && frequencyMHz <= 50) prob += 15;
  if (sfi >= 150) prob += 15;
  else if (sfi >= 120) prob += 10;
  if (distanceKm >= 500 && distanceKm <= 3000) prob += 10;

  return {
    mode: "backscatter",
    probability: clamp(prob, 2, 70),
    reason: `${frequencyMHz} MHz with SFI ${sfi} -- conditions ${sfi >= 120 ? "support" : "are marginal for"} backscatter`,
  };
}

function scoreF2(input: PropagationClassifierInput): ModeProbability {
  const { distanceKm, frequencyMHz, sfi, kp, isDaytime } = input;

  if (distanceKm < 50)
    return {
      mode: "F2",
      probability: 5,
      reason: `Distance ${Math.round(distanceKm)} km too short for F2-layer skip`,
    };

  let prob = 60;
  if (frequencyMHz >= 3 && frequencyMHz <= 30) prob += 10;
  else if (frequencyMHz > 30) prob -= sfi < 150 ? 25 : 10;

  if (frequencyMHz > 14) {
    if (sfi >= 120) prob += 10;
    else if (sfi < 80) prob -= 15;
  }
  if (kp >= 5) prob -= 20;
  else if (kp >= 3) prob -= 10;
  if (isDaytime && frequencyMHz > 14) prob += 5;
  if (distanceKm >= 500 && distanceKm <= 4000) prob += 5;

  return {
    mode: "F2",
    probability: clamp(prob, 5, 95),
    reason: `Standard F2-layer propagation on ${frequencyMHz} MHz over ${Math.round(distanceKm)} km with SFI ${sfi} (Kp=${kp})`,
  };
}

// ============================================================================
// Public API
// ============================================================================

export function classifyPropagationMode(
  params: PropagationClassifierInput,
): PropagationModeResult {
  const probabilities = getModeProbabilities(params);
  const best = probabilities[0];

  if (!best || best.probability <= 0) {
    const meta = MODE_METADATA.unknown;
    return {
      primaryMode: "unknown",
      confidence: 0,
      description: meta.description,
      characteristics: meta.characteristics,
      operationalAdvice: meta.operationalAdvice,
    };
  }

  const meta = MODE_METADATA[best.mode];
  return {
    primaryMode: best.mode,
    confidence: best.probability,
    description: meta.description,
    characteristics: meta.characteristics,
    operationalAdvice: meta.operationalAdvice,
  };
}

export function getPropagationModeDescription(mode: PropagationMode): string {
  return MODE_METADATA[mode]?.description ?? MODE_METADATA.unknown.description;
}

export function getPropagationModeColor(mode: PropagationMode): string {
  return MODE_METADATA[mode]?.color ?? MODE_METADATA.unknown.color;
}

export function getModeProbabilities(
  params: PropagationClassifierInput,
): ModeProbability[] {
  const scores: ModeProbability[] = [
    scoreGroundWave(params),
    scoreNVIS(params),
    scoreSporadicE(params),
    scoreTEP(params),
    scoreGrayLine(params),
    scoreLongPath(params),
    scoreBackscatter(params),
    scoreF2(params),
  ];

  scores.sort((a, b) => {
    if (b.probability !== a.probability) return b.probability - a.probability;
    return a.mode.localeCompare(b.mode);
  });

  return scores;
}
