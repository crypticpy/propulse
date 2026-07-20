/**
 * Storm Impact Analyzer
 *
 * Pure functions for analyzing space weather impact on a user's station.
 * Maps alert type, priority, and station configuration into a personalized
 * impact report with equipment-specific guidance, band status timelines,
 * alternative operating suggestions, and recovery estimates.
 *
 * No React dependencies -- this module is safe to use anywhere.
 */

import type { SolarAlert, AlertType, AlertPriority } from "@/types/alerts";
import { BAND_DEGRADATION_MAP } from "@/constants/alertThresholds";

// =============================================================================
// TYPES
// =============================================================================

export interface StationConfig {
  latitude: number | null;
  longitude: number | null;
  antennas: StationAntenna[];
  activeBands: string[];
}

export interface StationAntenna {
  name: string;
  type: string; // e.g. "Yagi", "Dipole", "Vertical", "Loop"
  bands: string[]; // e.g. ["20m", "15m", "10m"]
}

export interface EquipmentImpact {
  antennaName: string;
  bands: string[];
  severity: "none" | "mild" | "moderate" | "severe";
  description: string;
}

export interface BandTimelineEntry {
  band: string;
  currentStatus: "open" | "degraded" | "closed";
  recoveryEstimate: string; // e.g. "4-8 hours"
}

export interface AlternativeBand {
  band: string;
  mode: string;
  reason: string;
}

export interface StormImpactReport {
  overallSeverity: "minimal" | "moderate" | "severe" | "extreme";
  summary: string;
  affectedEquipment: EquipmentImpact[];
  bandTimeline: BandTimelineEntry[];
  alternativeBands: AlternativeBand[];
  recommendations: string[];
  estimatedRecovery: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** Alert types that have meaningful storm-impact analysis */
const STORM_RELEVANT_TYPES: AlertType[] = [
  "GEOMAGNETIC_STORM",
  "RADIO_BLACKOUT",
  "PROTON_EVENT",
  "DST_STORM",
  "CME_INCOMING",
  "IMF_SOUTHWARD",
  "SOLAR_FLARE",
  "BAND_DEGRADATION",
  "AURORA_WARNING",
];

/** All HF amateur bands ordered from highest to lowest frequency */
const ALL_HF_BANDS = [
  "10m",
  "12m",
  "15m",
  "17m",
  "20m",
  "30m",
  "40m",
  "60m",
  "80m",
  "160m",
];

/** Band frequency rank — higher index means lower frequency (more resilient) */
const BAND_RANK: Record<string, number> = {};
ALL_HF_BANDS.forEach((b, i) => {
  BAND_RANK[b] = i;
});

/**
 * Recovery time estimates per band (hours) during geomagnetic events.
 * Higher bands take longer to recover because they require higher MUF.
 */
const RECOVERY_HOURS: Record<string, [number, number]> = {
  "10m": [8, 24],
  "12m": [6, 18],
  "15m": [4, 12],
  "17m": [3, 10],
  "20m": [2, 8],
  "30m": [1, 6],
  "40m": [1, 4],
  "60m": [0.5, 3],
  "80m": [0.5, 2],
  "160m": [0.5, 2],
};

// =============================================================================
// MAIN ANALYSIS FUNCTION
// =============================================================================

/**
 * Analyze the impact of a space weather alert on a specific station.
 *
 * @param alert  The active solar alert
 * @param station  The user's station configuration (location + antennas)
 * @returns A personalized StormImpactReport
 */
export function analyzeStormImpact(
  alert: SolarAlert,
  station: StationConfig,
): StormImpactReport {
  const affectedBands = resolveAffectedBands(alert);
  const latFactor = computeLatitudeFactor(station.latitude);
  const overallSeverity = resolveOverallSeverity(
    alert.type,
    alert.priority,
    latFactor,
  );

  const hasStation =
    station.latitude !== null &&
    station.longitude !== null &&
    (station.antennas.length > 0 || station.activeBands.length > 0);

  const affectedEquipment = hasStation
    ? buildEquipmentImpacts(station.antennas, affectedBands, overallSeverity)
    : [];

  const bandTimeline = buildBandTimeline(
    affectedBands,
    alert.type,
    alert.priority,
  );
  const alternativeBands = buildAlternatives(
    alert.type,
    alert.priority,
    affectedBands,
    latFactor,
  );
  const recommendations = buildRecommendations(
    alert.type,
    alert.priority,
    latFactor,
    hasStation,
  );
  const estimatedRecovery = estimateOverallRecovery(alert.type, alert.priority);

  const summary = buildSummary(
    alert,
    overallSeverity,
    affectedBands,
    latFactor,
    hasStation,
  );

  return {
    overallSeverity,
    summary,
    affectedEquipment,
    bandTimeline,
    alternativeBands,
    recommendations,
    estimatedRecovery,
  };
}

/**
 * Check whether a given alert type is relevant for storm-impact analysis.
 */
export function isStormRelevantType(type: AlertType): boolean {
  return STORM_RELEVANT_TYPES.includes(type);
}

// =============================================================================
// SEVERITY
// =============================================================================

function resolveOverallSeverity(
  type: AlertType,
  priority: AlertPriority,
  latFactor: number,
): StormImpactReport["overallSeverity"] {
  // Base severity from priority
  let base: number;
  switch (priority) {
    case "CRITICAL":
      base = 3;
      break;
    case "WARNING":
      base = 2;
      break;
    default:
      base = 1;
  }

  // Geomagnetic types hit high latitudes harder
  const geoTypes: AlertType[] = [
    "GEOMAGNETIC_STORM",
    "DST_STORM",
    "AURORA_WARNING",
    "IMF_SOUTHWARD",
  ];
  if (geoTypes.includes(type)) {
    base += latFactor; // 0 for equator, up to +1 for high lat
  }

  // Positive events are less severe
  if (type === "BAND_OPENING") {
    return "minimal";
  }

  if (base >= 3.5) return "extreme";
  if (base >= 2.5) return "severe";
  if (base >= 1.5) return "moderate";
  return "minimal";
}

// =============================================================================
// LATITUDE
// =============================================================================

/**
 * Compute a latitude impact factor from 0 (equatorial) to 1 (high latitude).
 * Returns 0.5 for unknown location.
 */
function computeLatitudeFactor(latitude: number | null): number {
  if (latitude === null) return 0.5;
  const absLat = Math.abs(latitude);
  if (absLat >= 60) return 1.0;
  if (absLat >= 50) return 0.8;
  if (absLat >= 40) return 0.5;
  if (absLat >= 20) return 0.3;
  return 0.1;
}

// =============================================================================
// AFFECTED BANDS
// =============================================================================

function resolveAffectedBands(alert: SolarAlert): string[] {
  // If the alert itself carries affected bands, use them
  if (alert.affectedBands.length > 0) {
    return alert.affectedBands;
  }

  // Otherwise derive from type/priority
  switch (alert.type) {
    case "GEOMAGNETIC_STORM":
    case "DST_STORM":
    case "BAND_DEGRADATION": {
      const kp =
        alert.priority === "CRITICAL"
          ? 7
          : alert.priority === "WARNING"
            ? 6
            : 5;
      return bandsFromDegradationMap(kp);
    }
    case "RADIO_BLACKOUT":
      // Flare D-layer absorption scales ~1/f^2, so it raises the LUF and
      // closes the LOWEST dayside bands first; the highest bands penetrate.
      return alert.priority === "CRITICAL"
        ? ["80m", "60m", "40m", "30m", "20m", "17m", "15m"]
        : ["80m", "60m", "40m"];
    case "PROTON_EVENT":
      return alert.priority === "CRITICAL"
        ? ["10m", "12m", "15m", "17m", "20m", "30m", "40m"]
        : ["10m", "12m", "15m", "17m", "20m"];
    case "SOLAR_FLARE":
      // Same physics as RADIO_BLACKOUT: lowest dayside bands absorbed first.
      return alert.priority === "CRITICAL"
        ? ["80m", "60m", "40m", "30m", "20m"]
        : ["80m", "60m", "40m"];
    case "CME_INCOMING":
      return ["10m", "12m", "15m", "17m", "20m"];
    case "IMF_SOUTHWARD":
      return alert.priority === "CRITICAL"
        ? ["10m", "12m", "15m", "17m", "20m"]
        : ["10m", "12m", "15m"];
    case "AURORA_WARNING":
      return alert.priority === "CRITICAL"
        ? ["10m", "12m", "15m", "17m", "20m"]
        : ["10m", "12m", "15m"];
    default:
      return [];
  }
}

function bandsFromDegradationMap(kp: number): string[] {
  const match = BAND_DEGRADATION_MAP.filter((d) => kp >= d.kpLevel).sort(
    (a, b) => b.kpLevel - a.kpLevel,
  )[0];
  return match?.bands ?? [];
}

// =============================================================================
// EQUIPMENT IMPACTS
// =============================================================================

function buildEquipmentImpacts(
  antennas: StationAntenna[],
  affectedBands: string[],
  overallSeverity: StormImpactReport["overallSeverity"],
): EquipmentImpact[] {
  const affectedSet = new Set(affectedBands);

  return antennas.map((ant) => {
    const overlap = ant.bands.filter((b) => affectedSet.has(b));

    if (overlap.length === 0) {
      return {
        antennaName: ant.name,
        bands: ant.bands,
        severity: "none" as const,
        description: `Your ${ant.name} operates on unaffected bands. No impact expected.`,
      };
    }

    const fraction = overlap.length / ant.bands.length;
    let severity: EquipmentImpact["severity"];
    let desc: string;

    if (overallSeverity === "extreme" || fraction >= 0.8) {
      severity = "severe";
      desc = `Your ${ant.name} (${ant.type}): All primary bands severely degraded. Substantial signal loss on affected paths; long DX paths likely closed on ${overlap.join(", ")}.`;
    } else if (overallSeverity === "severe" || fraction >= 0.5) {
      severity = "moderate";
      desc = `Your ${ant.name} (${ant.type}): Noticeable signal loss on ${overlap.join(", ")}; some long DX paths degraded.`;
    } else {
      severity = "mild";
      desc = `Your ${ant.name} (${ant.type}): Mild fading expected on ${overlap.join(", ")}. Short-path contacts may still work.`;
    }

    return {
      antennaName: ant.name,
      bands: overlap,
      severity,
      description: desc,
    };
  });
}

// =============================================================================
// BAND TIMELINE
// =============================================================================

function buildBandTimeline(
  affectedBands: string[],
  type: AlertType,
  priority: AlertPriority,
): BandTimelineEntry[] {
  return affectedBands.map((band) => {
    const rank = BAND_RANK[band] ?? 5;
    const recovery = RECOVERY_HOURS[band] ?? [2, 8];

    // Blackout/flare types: D-layer absorption (~1/f^2) closes the LOWEST
    // dayside bands first; the highest bands penetrate best. rank is the
    // index into ALL_HF_BANDS (high freq -> low freq), so the high-rank
    // (low-frequency) bands are the ones knocked out.
    const isCritical = priority === "CRITICAL";
    const isBlackout = type === "RADIO_BLACKOUT" || type === "SOLAR_FLARE";

    let currentStatus: BandTimelineEntry["currentStatus"];
    if (isBlackout) {
      currentStatus = rank >= 6 ? "closed" : "degraded";
    } else if (isCritical) {
      currentStatus = rank < 3 ? "closed" : "degraded";
    } else {
      currentStatus = rank < 2 ? "closed" : "degraded";
    }

    // Scale recovery based on priority
    const scale = isCritical ? 1.5 : 1.0;
    const low = Math.round(recovery[0] * scale);
    const high = Math.round(recovery[1] * scale);

    return {
      band,
      currentStatus,
      recoveryEstimate: low === high ? `~${low} hours` : `${low}-${high} hours`,
    };
  });
}

// =============================================================================
// ALTERNATIVE BANDS
// =============================================================================

function buildAlternatives(
  type: AlertType,
  priority: AlertPriority,
  affectedBands: string[],
  latFactor: number,
): AlternativeBand[] {
  const affectedSet = new Set(affectedBands);
  const alts: AlternativeBand[] = [];

  // During geomagnetic storms, low bands can be enhanced
  const geoTypes: AlertType[] = [
    "GEOMAGNETIC_STORM",
    "DST_STORM",
    "IMF_SOUTHWARD",
    "AURORA_WARNING",
  ];

  if (geoTypes.includes(type)) {
    if (!affectedSet.has("80m")) {
      alts.push({
        band: "80m",
        mode: "CW",
        reason:
          "Low bands often enhanced during geomagnetic storms at mid-latitudes.",
      });
    }
    if (!affectedSet.has("160m")) {
      alts.push({
        band: "160m",
        mode: "CW",
        reason: "Top band may benefit from reduced absorption during storms.",
      });
    }

    // VHF aurora scatter for high-latitude stations during G3+
    if (
      priority === "CRITICAL" ||
      (priority === "WARNING" && latFactor >= 0.5)
    ) {
      alts.push({
        band: "6m",
        mode: "CW/SSB",
        reason:
          "Aurora scatter possible on 50 MHz. Listen for distorted, fluttery signals.",
      });
      alts.push({
        band: "2m",
        mode: "CW",
        reason:
          "144 MHz aurora scatter for stations above 40 degrees latitude.",
      });
    }
  }

  // During radio blackouts / flares the sunlit D-layer absorbs the LOW bands
  // worst (absorption ~1/f^2); the HIGH bands penetrate best, and night-side
  // paths escape D-layer absorption entirely (the D-layer vanishes after dark).
  if (type === "RADIO_BLACKOUT" || type === "SOLAR_FLARE") {
    if (!affectedSet.has("15m")) {
      alts.push({
        band: "15m",
        mode: "CW/SSB",
        reason:
          "Higher bands penetrate flare D-layer absorption best (it falls as 1/f^2).",
      });
    }
    if (!affectedSet.has("10m")) {
      alts.push({
        band: "10m",
        mode: "CW/SSB",
        reason:
          "Highest HF band suffers the least flare absorption -- try dayside DX here first.",
      });
    }
    alts.push({
      band: "80m",
      mode: "CW",
      reason:
        "Night-side paths escape D-layer absorption entirely -- work the dark hemisphere on low bands.",
    });
  }

  // During proton events, avoid polar but mid-lat may work
  if (type === "PROTON_EVENT") {
    alts.push({
      band: "40m",
      mode: "CW/SSB",
      reason: "Use low-latitude east-west paths to avoid polar cap absorption.",
    });
  }

  // Band openings are positive
  if (type === "BAND_OPENING") {
    // Affected bands are actually the *opened* bands
    for (const band of affectedBands) {
      alts.push({
        band,
        mode: "SSB/FT8",
        reason: "Propagation detected! Get on the air for DX contacts.",
      });
    }
  }

  return alts;
}

// =============================================================================
// RECOMMENDATIONS
// =============================================================================

function buildRecommendations(
  type: AlertType,
  priority: AlertPriority,
  latFactor: number,
  hasStation: boolean,
): string[] {
  const recs: string[] = [];

  // Generic monitoring advice
  recs.push(
    "Monitor real-time Kp index and solar wind data for condition changes.",
  );

  switch (type) {
    case "GEOMAGNETIC_STORM":
    case "DST_STORM":
      if (priority === "CRITICAL") {
        recs.push(
          "Avoid high-band DX attempts. Focus on 80m/160m CW for reliable contacts.",
        );
        if (latFactor >= 0.5) {
          recs.push(
            "Check 6m and 2m for aurora scatter openings. Beam toward the auroral oval.",
          );
        }
        recs.push(
          "Disconnect sensitive equipment if conditions worsen. Protect receivers from voltage spikes.",
        );
      } else {
        recs.push(
          "Upper HF bands (10-20m) may be unreliable. Try 30m-80m for better results.",
        );
        if (latFactor >= 0.8) {
          recs.push(
            "High-latitude stations will see more severe effects. Consider operating on 40m and below.",
          );
        }
      }
      break;

    case "RADIO_BLACKOUT":
    case "SOLAR_FLARE":
      recs.push(
        "Dayside HF paths most affected. Night-side paths may still work.",
      );
      if (priority === "CRITICAL") {
        recs.push(
          "All HF unreliable on sunlit side. Wait for the flare to subside before attempting contacts.",
        );
      }
      break;

    case "PROTON_EVENT":
      recs.push(
        "Polar and trans-polar paths severely degraded. Route contacts through lower latitudes.",
      );
      if (priority === "CRITICAL") {
        recs.push(
          "Proton events can last days. Check GOES proton flux for recovery trending.",
        );
      }
      break;

    case "CME_INCOMING":
      recs.push(
        "CME impact expected. Make DX contacts now before conditions degrade.",
      );
      recs.push(
        "Prepare for possible G-class storm. Secure outdoor equipment and antennas.",
      );
      break;

    case "IMF_SOUTHWARD":
      recs.push(
        "Southward IMF drives geomagnetic activity. Watch for storm onset.",
      );
      break;

    case "AURORA_WARNING":
      recs.push(
        "HF may be disturbed but VHF aurora scatter is possible. Try CW on 50/144 MHz.",
      );
      break;

    case "BAND_OPENING":
      recs.push(
        "Propagation is enhanced! Get on the air and work DX while conditions hold.",
      );
      break;

    default:
      break;
  }

  if (!hasStation) {
    recs.push(
      "Configure your station in Shack for personalized equipment-specific impact analysis.",
    );
  }

  return recs;
}

// =============================================================================
// RECOVERY ESTIMATE
// =============================================================================

function estimateOverallRecovery(
  type: AlertType,
  priority: AlertPriority,
): string {
  const isCritical = priority === "CRITICAL";

  switch (type) {
    case "GEOMAGNETIC_STORM":
    case "DST_STORM":
      return isCritical ? "24-72 hours for full recovery" : "6-24 hours";
    case "RADIO_BLACKOUT":
      return isCritical ? "2-8 hours" : "30 minutes to 2 hours";
    case "SOLAR_FLARE":
      return isCritical ? "1-4 hours for HF recovery" : "30 minutes to 1 hour";
    case "PROTON_EVENT":
      return isCritical ? "2-7 days" : "1-3 days";
    case "CME_INCOMING":
      return "12-36 hours until impact; storm duration 6-48 hours";
    case "IMF_SOUTHWARD":
      return "Variable; depends on solar wind persistence";
    case "AURORA_WARNING":
      return isCritical ? "4-12 hours" : "2-6 hours";
    case "BAND_OPENING":
      return "Enjoy while it lasts! Typically 30 min to 3 hours.";
    default:
      return "Monitoring conditions";
  }
}

// =============================================================================
// SUMMARY
// =============================================================================

function buildSummary(
  alert: SolarAlert,
  overallSeverity: StormImpactReport["overallSeverity"],
  affectedBands: string[],
  latFactor: number,
  hasStation: boolean,
): string {
  const sevLabel =
    overallSeverity === "extreme"
      ? "Extreme"
      : overallSeverity === "severe"
        ? "Severe"
        : overallSeverity === "moderate"
          ? "Moderate"
          : "Minimal";

  const bandCount = affectedBands.length;
  const bandSummary =
    bandCount === 0
      ? "No bands directly affected"
      : `${bandCount} band${bandCount !== 1 ? "s" : ""} affected`;

  let locationNote = "";
  if (latFactor >= 0.8) {
    locationNote = " Your high-latitude location increases storm impact.";
  } else if (latFactor <= 0.2) {
    locationNote = " Your equatorial location provides some natural shielding.";
  }

  const stationNote = hasStation
    ? ""
    : " Configure your station in Shack for personalized analysis.";

  return `${sevLabel} impact: ${bandSummary}. ${alert.message}${locationNote}${stationNote}`;
}
