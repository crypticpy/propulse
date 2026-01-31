/**
 * Regulatory compliance utilities
 * Checks frequencies against ITU band plans and license class privileges
 */

import type {
  ITURegion,
  LicenseClass,
  BandMode,
  RegulatoryStatus,
  BandSegment,
} from "@/types/bandplan";
import {
  getSegmentForFrequency,
  getBandPlan,
  ALL_BAND_PLANS,
} from "@/lib/data/bandplans";

// =============================================================================
// Special Frequencies Database
// =============================================================================

/**
 * Special frequency information
 */
export interface SpecialFrequencyInfo {
  isSpecial: boolean;
  type?: "beacon" | "calling" | "emergency" | "qrp";
  description?: string;
}

/**
 * Database of special frequencies with restricted or designated usage
 * All frequencies in kHz
 */
const SPECIAL_FREQUENCIES: Map<
  number,
  { type: SpecialFrequencyInfo["type"]; description: string }
> = new Map([
  // NCDXF/IARU International Beacon Network
  [
    14100,
    {
      type: "beacon",
      description: "NCDXF/IARU beacon network (14.100 MHz) - no transmit",
    },
  ],
  [
    18110,
    {
      type: "beacon",
      description: "NCDXF/IARU beacon network (18.110 MHz) - no transmit",
    },
  ],
  [
    21150,
    {
      type: "beacon",
      description: "NCDXF/IARU beacon network (21.150 MHz) - no transmit",
    },
  ],
  [
    24930,
    {
      type: "beacon",
      description: "NCDXF/IARU beacon network (24.930 MHz) - no transmit",
    },
  ],
  [
    28200,
    {
      type: "beacon",
      description: "NCDXF/IARU beacon network (28.200 MHz) - no transmit",
    },
  ],

  // 6m beacons
  [
    50000,
    { type: "beacon", description: "6m beacon sub-band (50.0-50.1 MHz)" },
  ],
  [50060, { type: "beacon", description: "6m propagation beacons" }],
  [50080, { type: "beacon", description: "6m propagation beacons" }],

  // Emergency frequencies
  [
    14300,
    {
      type: "emergency",
      description: "Global emergency frequency (14.300 MHz)",
    },
  ],
  [
    7060,
    {
      type: "emergency",
      description: "Regional emergency frequency (7.060 MHz)",
    },
  ],
  [
    3985,
    { type: "emergency", description: "ARES/RACES frequency (3.985 MHz)" },
  ],
  [
    7231,
    { type: "emergency", description: "ARES/RACES frequency (7.231 MHz)" },
  ],
  [
    7240,
    {
      type: "emergency",
      description: "IARU Region 2 emergency center (7.240 MHz)",
    },
  ],
  [
    14346,
    {
      type: "emergency",
      description: "Maritime/aeronautical emergency (14.346 MHz)",
    },
  ],

  // QRP calling frequencies
  [3560, { type: "qrp", description: "QRP CW calling frequency (3.560 MHz)" }],
  [7030, { type: "qrp", description: "QRP CW calling frequency (7.030 MHz)" }],
  [
    7040,
    { type: "qrp", description: "QRP CW calling frequency EU (7.040 MHz)" },
  ],
  [
    10106,
    { type: "qrp", description: "QRP CW calling frequency (10.106 MHz)" },
  ],
  [
    14060,
    { type: "qrp", description: "QRP CW calling frequency (14.060 MHz)" },
  ],
  [
    18096,
    { type: "qrp", description: "QRP CW calling frequency (18.096 MHz)" },
  ],
  [
    21060,
    { type: "qrp", description: "QRP CW calling frequency (21.060 MHz)" },
  ],
  [
    24906,
    { type: "qrp", description: "QRP CW calling frequency (24.906 MHz)" },
  ],
  [
    28060,
    { type: "qrp", description: "QRP CW calling frequency (28.060 MHz)" },
  ],

  // SSB QRP calling frequencies
  [3985, { type: "qrp", description: "QRP SSB frequency (3.985 MHz)" }],
  [7285, { type: "qrp", description: "QRP SSB calling frequency (7.285 MHz)" }],
  [
    14285,
    { type: "qrp", description: "QRP SSB calling frequency (14.285 MHz)" },
  ],
  [
    21285,
    { type: "qrp", description: "QRP SSB calling frequency (21.285 MHz)" },
  ],
  [
    28385,
    { type: "qrp", description: "QRP SSB calling frequency (28.385 MHz)" },
  ],

  // Standard calling frequencies
  [
    3790,
    { type: "calling", description: "DX calling frequency 80m (3.790 MHz)" },
  ],
  [
    7090,
    { type: "calling", description: "DX calling frequency 40m (7.090 MHz)" },
  ],
  [
    14195,
    { type: "calling", description: "DX calling frequency 20m (14.195 MHz)" },
  ],
  [
    18130,
    { type: "calling", description: "SSB calling frequency 17m (18.130 MHz)" },
  ],
  [
    21295,
    { type: "calling", description: "DX calling frequency 15m (21.295 MHz)" },
  ],
  [
    24950,
    { type: "calling", description: "SSB calling frequency 12m (24.950 MHz)" },
  ],
  [
    28500,
    { type: "calling", description: "USB calling frequency 10m (28.500 MHz)" },
  ],

  // 6m calling
  [
    50110,
    { type: "calling", description: "6m DX calling frequency (50.110 MHz)" },
  ],
  [
    50125,
    {
      type: "calling",
      description: "6m SSB calling frequency USA (50.125 MHz)",
    },
  ],
  [
    50150,
    { type: "calling", description: "6m SSB calling frequency (50.150 MHz)" },
  ],
  [
    52525,
    { type: "calling", description: "6m FM calling frequency (52.525 MHz)" },
  ],

  // FM calling
  [
    29600,
    { type: "calling", description: "10m FM calling frequency (29.600 MHz)" },
  ],
]);

// =============================================================================
// Core Regulatory Functions
// =============================================================================

/**
 * Check if a frequency is allowed for a given license class and mode
 * Returns detailed regulatory status including warnings and suggestions
 */
export function checkFrequencyAllowed(
  frequencyKHz: number,
  region: ITURegion,
  licenseClass: LicenseClass,
  mode: BandMode,
): RegulatoryStatus {
  const result = getSegmentForFrequency(frequencyKHz, region);
  const warnings: string[] = [];

  // Frequency not in any amateur band
  if (!result) {
    const suggested = findNearestAllowedFrequency(
      frequencyKHz,
      region,
      licenseClass,
      mode,
    );
    return {
      allowed: false,
      warnings: ["Frequency is outside amateur radio allocations"],
      suggestedFrequency: suggested ?? undefined,
    };
  }

  const { segment } = result;

  // Check license class authorization
  if (!segment.licenseClasses.includes(licenseClass)) {
    const allowedClasses = segment.licenseClasses.join(", ");
    warnings.push(`Frequency requires ${allowedClasses} license or higher`);

    const suggested = findNearestAllowedFrequency(
      frequencyKHz,
      region,
      licenseClass,
      mode,
    );

    return {
      allowed: false,
      warnings,
      suggestedFrequency: suggested ?? undefined,
    };
  }

  // Check mode permission
  if (!segment.modes.includes(mode)) {
    const allowedModes = segment.modes.join(", ");
    warnings.push(
      `${mode} not permitted in this segment. Allowed: ${allowedModes}`,
    );

    const suggested = findNearestAllowedFrequency(
      frequencyKHz,
      region,
      licenseClass,
      mode,
    );

    return {
      allowed: false,
      warnings,
      suggestedFrequency: suggested ?? undefined,
    };
  }

  // Check for special frequency restrictions
  const specialInfo = isSpecialFrequency(frequencyKHz);
  if (specialInfo.isSpecial) {
    if (specialInfo.type === "beacon") {
      warnings.push(`Beacon frequency - ${specialInfo.description}`);
    } else if (specialInfo.type === "emergency") {
      warnings.push(
        `Emergency frequency - keep clear unless emergency traffic`,
      );
    } else if (specialInfo.type === "calling") {
      warnings.push(
        `Calling frequency - avoid extended QSOs, move off after contact`,
      );
    } else if (specialInfo.type === "qrp") {
      warnings.push(`QRP calling frequency - low power operations expected`);
    }
  }

  // Check for secondary allocation
  if (!segment.isPrimary) {
    warnings.push(
      "Secondary allocation - amateur operations must not interfere with primary users",
    );
  }

  // Add notes from segment if present
  if (segment.notes) {
    // Don't duplicate the notes if they match warning content
    const lowerNotes = segment.notes.toLowerCase();
    if (
      !warnings.some((w) => w.toLowerCase().includes(lowerNotes.slice(0, 20)))
    ) {
      warnings.push(segment.notes);
    }
  }

  return {
    allowed: true,
    warnings,
  };
}

/**
 * Get the maximum allowed power at a frequency
 * Takes into account license class restrictions
 */
export function getMaxPowerAtFrequency(
  frequencyKHz: number,
  region: ITURegion,
  licenseClass: LicenseClass,
): number {
  const result = getSegmentForFrequency(frequencyKHz, region);

  if (!result) {
    return 0;
  }

  const { segment } = result;

  // Not authorized for this segment
  if (!segment.licenseClasses.includes(licenseClass)) {
    return 0;
  }

  // Special power restrictions by license class and band
  // Technician on 10m HF portion limited to 200W PEP
  if (
    licenseClass === "TECHNICIAN" &&
    frequencyKHz >= 28000 &&
    frequencyKHz <= 28500
  ) {
    return Math.min(segment.maxPowerWatts, 200);
  }

  // Novice power limits (200W on 10m, 25W on other bands)
  if (licenseClass === "NOVICE") {
    if (frequencyKHz >= 28000 && frequencyKHz <= 28500) {
      return Math.min(segment.maxPowerWatts, 200);
    }
    return Math.min(segment.maxPowerWatts, 25);
  }

  return segment.maxPowerWatts;
}

/**
 * Find the nearest allowed frequency if current is not permitted
 * Searches within the same band first, then adjacent bands
 */
export function findNearestAllowedFrequency(
  frequencyKHz: number,
  region: ITURegion,
  licenseClass: LicenseClass,
  mode: BandMode,
): number | null {
  const plans = ALL_BAND_PLANS[region];

  // First find which band the frequency is closest to
  let closestSegment: BandSegment | null = null;
  let closestDistance = Infinity;
  let closestFrequency = 0;

  for (const plan of plans) {
    for (const segment of plan.segments) {
      // Check if this segment is suitable
      if (!segment.licenseClasses.includes(licenseClass)) {
        continue;
      }
      if (!segment.modes.includes(mode)) {
        continue;
      }

      // Calculate distance to this segment
      let distance: number;
      let nearestFreq: number;

      if (frequencyKHz < segment.startKHz) {
        distance = segment.startKHz - frequencyKHz;
        nearestFreq = segment.startKHz;
      } else if (frequencyKHz > segment.endKHz) {
        distance = frequencyKHz - segment.endKHz;
        nearestFreq = segment.endKHz;
      } else {
        // Already in segment
        distance = 0;
        nearestFreq = frequencyKHz;
      }

      if (distance < closestDistance) {
        closestDistance = distance;
        closestSegment = segment;
        closestFrequency = nearestFreq;
      }
    }
  }

  return closestSegment ? closestFrequency : null;
}

/**
 * Get all available segments for a license class
 * Optionally filters by mode
 */
export function getAvailableSegments(
  band: string,
  region: ITURegion,
  licenseClass: LicenseClass,
  mode?: BandMode,
): BandSegment[] {
  const plan = getBandPlan(band, region);
  if (!plan) {
    return [];
  }

  return plan.segments.filter((segment) => {
    const hasLicense = segment.licenseClasses.includes(licenseClass);
    const hasMode = mode ? segment.modes.includes(mode) : true;
    return hasLicense && hasMode;
  });
}

/**
 * Generate regulatory warnings for a frequency
 * Checks frequency, mode, and power compliance
 */
export function getRegulatoryWarnings(
  frequencyKHz: number,
  region: ITURegion,
  licenseClass: LicenseClass,
  mode: BandMode,
  powerWatts: number,
): string[] {
  const warnings: string[] = [];

  // Get base regulatory status
  const status = checkFrequencyAllowed(
    frequencyKHz,
    region,
    licenseClass,
    mode,
  );
  warnings.push(...status.warnings);

  // Check power limits
  if (status.allowed) {
    const maxPower = getMaxPowerAtFrequency(frequencyKHz, region, licenseClass);
    if (powerWatts > maxPower) {
      warnings.push(
        `Power ${powerWatts}W exceeds maximum allowed ${maxPower}W for this frequency/license`,
      );
    }
  }

  // Additional power-related warnings
  const result = getSegmentForFrequency(frequencyKHz, region);
  if (result && !result.segment.isPrimary && powerWatts > 100) {
    warnings.push(
      "Consider reducing power on secondary allocation to minimize interference",
    );
  }

  // QRP frequency warnings
  const specialInfo = isSpecialFrequency(frequencyKHz);
  if (specialInfo.type === "qrp" && powerWatts > 5) {
    warnings.push(
      `QRP calling frequency - typical operations use 5W or less (you: ${powerWatts}W)`,
    );
  }

  return warnings;
}

/**
 * Check if frequency is in a beacon/calling frequency range
 * These frequencies have special usage restrictions
 */
export function isSpecialFrequency(frequencyKHz: number): SpecialFrequencyInfo {
  // Check exact matches first
  const exact = SPECIAL_FREQUENCIES.get(frequencyKHz);
  if (exact) {
    return {
      isSpecial: true,
      type: exact.type,
      description: exact.description,
    };
  }

  // Check ranges for beacon subbands (within 2 kHz of beacon frequencies)
  const beaconToleranceKHz = 2;
  for (const [freq, info] of SPECIAL_FREQUENCIES.entries()) {
    if (
      info.type === "beacon" &&
      Math.abs(frequencyKHz - freq) <= beaconToleranceKHz
    ) {
      return {
        isSpecial: true,
        type: "beacon",
        description: `Near ${info.description}`,
      };
    }
  }

  // Check NCDXF beacon network exact frequencies (±1 kHz)
  const beaconFreqs = [14100, 18110, 21150, 24930, 28200];
  for (const beacon of beaconFreqs) {
    if (Math.abs(frequencyKHz - beacon) <= 1) {
      return {
        isSpecial: true,
        type: "beacon",
        description: `NCDXF/IARU beacon network - no transmit within ±1 kHz`,
      };
    }
  }

  return { isSpecial: false };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get frequency range for a license class in a band
 * Returns the total available range (may include gaps)
 */
export function getLicenseFrequencyRange(
  band: string,
  region: ITURegion,
  licenseClass: LicenseClass,
  mode?: BandMode,
): { startKHz: number; endKHz: number } | null {
  const segments = getAvailableSegments(band, region, licenseClass, mode);

  if (segments.length === 0) {
    return null;
  }

  let minStart = Infinity;
  let maxEnd = -Infinity;

  for (const segment of segments) {
    minStart = Math.min(minStart, segment.startKHz);
    maxEnd = Math.max(maxEnd, segment.endKHz);
  }

  return { startKHz: minStart, endKHz: maxEnd };
}

/**
 * Get a human-readable license requirement string for a frequency
 */
export function getLicenseRequirement(
  frequencyKHz: number,
  region: ITURegion,
): string {
  const result = getSegmentForFrequency(frequencyKHz, region);

  if (!result) {
    return "Not allocated";
  }

  const classes = result.segment.licenseClasses;

  if (classes.includes("TECHNICIAN")) {
    return "Technician or higher";
  }
  if (classes.includes("GENERAL")) {
    return "General or higher";
  }
  if (classes.includes("ADVANCED")) {
    return "Advanced or Extra";
  }
  if (classes.includes("EXTRA")) {
    return "Extra class only";
  }

  return classes.join("/");
}

/**
 * Format a list of modes for display
 */
export function formatModeList(modes: BandMode[]): string {
  const modeNames: Record<BandMode, string> = {
    CW: "CW",
    PHONE: "Voice",
    DATA: "Digital",
    RTTY: "RTTY",
    IMAGE: "Image",
    AM: "AM",
    FM: "FM",
  };

  return modes.map((m) => modeNames[m] || m).join(", ");
}

/**
 * Get segment category for color coding
 */
export type SegmentCategory =
  | "cw_only"
  | "cw_data"
  | "phone"
  | "all_modes"
  | "fm"
  | "not_allowed";

export function getSegmentCategory(segment: BandSegment): SegmentCategory {
  const hasCW = segment.modes.includes("CW");
  const hasPhone = segment.modes.includes("PHONE");
  const hasData =
    segment.modes.includes("DATA") || segment.modes.includes("RTTY");
  const hasFM = segment.modes.includes("FM");

  if (hasFM && !hasData && !hasPhone) {
    return "fm";
  }
  if (hasCW && hasPhone && (hasData || hasFM)) {
    return "all_modes";
  }
  if (hasPhone) {
    return "phone";
  }
  if (hasCW && hasData) {
    return "cw_data";
  }
  if (hasCW) {
    return "cw_only";
  }

  return "all_modes";
}
