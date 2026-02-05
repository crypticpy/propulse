/**
 * Antenna Pattern Library for HF Propagation Analysis
 *
 * Provides elevation-dependent gain patterns for common amateur radio
 * antennas. Each antenna type has a gain function that returns dBi at
 * any elevation angle from 0-90 degrees.
 *
 * Patterns are based on simplified analytical models calibrated against
 * NEC-2 simulations for typical installation conditions.
 */

const DEG_TO_RAD = Math.PI / 180;
const EARTH_RADIUS_KM = 6371;
const DEFAULT_HMF2_KM = 300;

// =============================================================================
// Types
// =============================================================================

export type AntennaType =
  | "dipole"
  | "vertical"
  | "yagi_3el"
  | "yagi_5el"
  | "hex_beam"
  | "wire_inverted_v"
  | "nvis_dipole"
  | "isotropic";

export interface AntennaDefinition {
  type: AntennaType;
  name: string;
  description: string;
  peakGainDbi: number;
  optimalElevationDeg: number;
  minHeightWavelengths: number;
  maxHeightWavelengths: number;
  getGain: (elevationDeg: number) => number;
}

// =============================================================================
// Gain Pattern Functions
// =============================================================================

function clampElevation(elevationDeg: number): number {
  return Math.max(0, Math.min(90, elevationDeg));
}

function dipoleGain(elevationDeg: number): number {
  const el = clampElevation(elevationDeg);
  if (el <= 0 || el >= 90) return -30;

  const elRad = el * DEG_TO_RAD;
  const sinEl = Math.sin(elRad);
  const cosEl = Math.cos(elRad);

  const numerator = Math.cos((Math.PI / 2) * cosEl);
  const elementFactor = sinEl > 0.01 ? numerator / sinEl : 0;
  const groundFactor = Math.sin(Math.PI * 0.5 * sinEl);

  const pattern = elementFactor * groundFactor;
  const patternDb = pattern > 0.001 ? 20 * Math.log10(pattern) : -30;
  return Math.max(-30, patternDb + 2.15);
}

function verticalGain(elevationDeg: number): number {
  const el = clampElevation(elevationDeg);
  if (el <= 0) return -30;

  const elRad = el * DEG_TO_RAD;
  const sinEl = Math.sin(elRad);
  const cosEl = Math.cos(elRad);

  const numerator = Math.cos((Math.PI / 2) * sinEl);
  const elementFactor = cosEl > 0.01 ? numerator / cosEl : 0;
  const groundFactor = Math.sin(2 * elRad);

  const pattern = Math.abs(elementFactor * groundFactor);
  const patternDb = pattern > 0.001 ? 20 * Math.log10(pattern) : -30;
  return Math.max(-30, patternDb + 0.0);
}

function yagi3Gain(elevationDeg: number): number {
  const el = clampElevation(elevationDeg);
  if (el <= 0) return -30;

  const elRad = el * DEG_TO_RAD;
  const optimalRad = 15 * DEG_TO_RAD;
  const beamwidthRad = 35 * DEG_TO_RAD;

  const deviation = elRad - optimalRad;
  const normalizedDeviation = deviation / beamwidthRad;
  const pattern = Math.exp(-2 * normalizedDeviation * normalizedDeviation);
  const lowAngleFactor = Math.min(1, el / 5);

  const effectivePattern = pattern * lowAngleFactor;
  const patternDb =
    effectivePattern > 0.001 ? 10 * Math.log10(effectivePattern) : -30;
  return Math.max(-30, patternDb + 8.0);
}

function yagi5Gain(elevationDeg: number): number {
  const el = clampElevation(elevationDeg);
  if (el <= 0) return -30;

  const elRad = el * DEG_TO_RAD;
  const optimalRad = 12 * DEG_TO_RAD;
  const beamwidthRad = 25 * DEG_TO_RAD;

  const deviation = elRad - optimalRad;
  const normalizedDeviation = deviation / beamwidthRad;
  const pattern = Math.exp(-2.5 * normalizedDeviation * normalizedDeviation);
  const lowAngleFactor = Math.min(1, el / 5);

  const effectivePattern = pattern * lowAngleFactor;
  const patternDb =
    effectivePattern > 0.001 ? 10 * Math.log10(effectivePattern) : -30;
  return Math.max(-30, patternDb + 11.0);
}

function hexBeamGain(elevationDeg: number): number {
  const el = clampElevation(elevationDeg);
  if (el <= 0) return -30;

  const elRad = el * DEG_TO_RAD;
  const optimalRad = 20 * DEG_TO_RAD;
  const beamwidthRad = 45 * DEG_TO_RAD;

  const deviation = elRad - optimalRad;
  const normalizedDeviation = deviation / beamwidthRad;
  const pattern = Math.exp(-1.5 * normalizedDeviation * normalizedDeviation);
  const lowAngleFactor = Math.min(1, el / 4);

  const effectivePattern = pattern * lowAngleFactor;
  const patternDb =
    effectivePattern > 0.001 ? 10 * Math.log10(effectivePattern) : -30;
  return Math.max(-30, patternDb + 5.5);
}

function invertedVGain(elevationDeg: number): number {
  const el = clampElevation(elevationDeg);
  if (el <= 0 || el >= 90) return -30;

  const elRad = el * DEG_TO_RAD;
  const optimalRad = 45 * DEG_TO_RAD;
  const beamwidthRad = 55 * DEG_TO_RAD;

  const deviation = elRad - optimalRad;
  const normalizedDeviation = deviation / beamwidthRad;
  const pattern = Math.exp(-1.2 * normalizedDeviation * normalizedDeviation);
  const lowAngleFactor = Math.min(1, el / 8);
  const zenithFactor = el < 85 ? 1.0 : 1.0 - (el - 85) * 0.1;

  const effectivePattern = pattern * lowAngleFactor * zenithFactor;
  const patternDb =
    effectivePattern > 0.001 ? 10 * Math.log10(effectivePattern) : -30;
  return Math.max(-30, patternDb + 1.5);
}

function nvisDipoleGain(elevationDeg: number): number {
  const el = clampElevation(elevationDeg);
  if (el <= 0) return -30;

  const elRad = el * DEG_TO_RAD;
  const optimalRad = 80 * DEG_TO_RAD;
  const beamwidthRad = 30 * DEG_TO_RAD;

  const deviation = elRad - optimalRad;
  const normalizedDeviation = deviation / beamwidthRad;
  const pattern = Math.exp(-2 * normalizedDeviation * normalizedDeviation);
  const lowAngleSuppression = Math.pow(Math.sin(elRad), 3);

  const effectivePattern = pattern * lowAngleSuppression;
  const patternDb =
    effectivePattern > 0.001 ? 10 * Math.log10(effectivePattern) : -30;
  return Math.max(-30, patternDb + -1.0);
}

function isotropicGain(_elevationDeg: number): number {
  return 0;
}

// =============================================================================
// Utility Functions
// =============================================================================

function estimateTakeoffAngle(
  distanceKm: number,
  hmF2: number = DEFAULT_HMF2_KM,
): number {
  if (distanceKm <= 0) return 90;

  const maxSingleHopKm = 2 * Math.sqrt(2 * EARTH_RADIUS_KM * hmF2);
  const hops = Math.max(1, Math.ceil(distanceKm / maxSingleHopKm));
  const hopDistanceKm = distanceKm / hops;

  const halfHopAngle = hopDistanceKm / 2 / EARTH_RADIUS_KM;
  const cosHalf = Math.cos(halfHopAngle);
  const sinHalf = Math.sin(halfHopAngle);

  const numerator = hmF2 + EARTH_RADIUS_KM * (1 - cosHalf);
  const denominator = EARTH_RADIUS_KM * sinHalf;

  if (denominator <= 0) return 90;

  const takeoffRad = Math.atan2(numerator, denominator);
  const takeoffDeg = takeoffRad * (180 / Math.PI);
  return Math.max(3, Math.min(88, takeoffDeg));
}

// =============================================================================
// Antenna Type Definitions
// =============================================================================

export const ANTENNA_TYPES: readonly AntennaDefinition[] = [
  {
    type: "dipole",
    name: "Half-Wave Dipole",
    description:
      "Fundamental resonant antenna. When mounted at 0.5 wavelengths height, " +
      "it produces a bidirectional pattern with peak gain around 30 degrees elevation.",
    peakGainDbi: 2.15,
    optimalElevationDeg: 30,
    minHeightWavelengths: 0.25,
    maxHeightWavelengths: 1.0,
    getGain: dipoleGain,
  },
  {
    type: "vertical",
    name: "Quarter-Wave Vertical",
    description:
      "Ground-mounted or elevated vertical with radial system. Produces an " +
      "omnidirectional pattern favoring low elevation angles (10-25 degrees).",
    peakGainDbi: 0,
    optimalElevationDeg: 18,
    minHeightWavelengths: 0.25,
    maxHeightWavelengths: 0.5,
    getGain: verticalGain,
  },
  {
    type: "yagi_3el",
    name: "3-Element Yagi",
    description:
      "Directional beam antenna with reflector, driven element, and director. " +
      "Provides approximately 8 dBi forward gain with 15-20 dB front-to-back ratio.",
    peakGainDbi: 8.0,
    optimalElevationDeg: 15,
    minHeightWavelengths: 0.5,
    maxHeightWavelengths: 1.5,
    getGain: yagi3Gain,
  },
  {
    type: "yagi_5el",
    name: "5-Element Yagi",
    description:
      "High-gain directional beam with five elements on a longer boom. " +
      "Produces approximately 11 dBi forward gain with narrow beamwidth.",
    peakGainDbi: 11.0,
    optimalElevationDeg: 12,
    minHeightWavelengths: 0.75,
    maxHeightWavelengths: 2.0,
    getGain: yagi5Gain,
  },
  {
    type: "hex_beam",
    name: "Hex Beam",
    description:
      "Lightweight broadband directional antenna using hexagonal wire elements. " +
      "Offers moderate gain (5.5 dBi) with a broader beamwidth than a Yagi.",
    peakGainDbi: 5.5,
    optimalElevationDeg: 20,
    minHeightWavelengths: 0.5,
    maxHeightWavelengths: 1.0,
    getGain: hexBeamGain,
  },
  {
    type: "wire_inverted_v",
    name: "Inverted V Dipole",
    description:
      "A dipole with center elevated and ends angled downward. Requires only " +
      "a single support point. Better for medium-distance contacts than a flat dipole.",
    peakGainDbi: 1.5,
    optimalElevationDeg: 45,
    minHeightWavelengths: 0.25,
    maxHeightWavelengths: 0.75,
    getGain: invertedVGain,
  },
  {
    type: "nvis_dipole",
    name: "NVIS Dipole",
    description:
      "Dipole mounted at low height (0.1-0.25 wavelengths) for Near Vertical " +
      "Incidence Skywave propagation. Fills the skip zone for regional comms out to 400 km.",
    peakGainDbi: -1.0,
    optimalElevationDeg: 80,
    minHeightWavelengths: 0.1,
    maxHeightWavelengths: 0.25,
    getGain: nvisDipoleGain,
  },
  {
    type: "isotropic",
    name: "Isotropic Radiator",
    description:
      "Theoretical reference antenna radiating equally in all directions. " +
      "Used as the 0 dBi reference for antenna gain measurements.",
    peakGainDbi: 0,
    optimalElevationDeg: 45,
    minHeightWavelengths: 0,
    maxHeightWavelengths: 0,
    getGain: isotropicGain,
  },
] as const;

// =============================================================================
// Lookup Map
// =============================================================================

const antennaMap = new Map<AntennaType, AntennaDefinition>(
  ANTENNA_TYPES.map((def) => [def.type, def]),
);

// =============================================================================
// Public API
// =============================================================================

export function getAntennaGain(
  type: AntennaType,
  elevationAngle: number,
): number {
  const definition = antennaMap.get(type);
  if (!definition) return 0;
  return definition.getGain(elevationAngle);
}

export function getAntennaGainForPath(
  type: AntennaType,
  distanceKm: number,
  hmF2?: number,
): number {
  const takeoffAngle = estimateTakeoffAngle(
    distanceKm,
    hmF2 ?? DEFAULT_HMF2_KM,
  );
  return getAntennaGain(type, takeoffAngle);
}

export function getOptimalAntennaForPath(distanceKm: number): AntennaType {
  const takeoffAngle = estimateTakeoffAngle(distanceKm);
  let bestType: AntennaType = "isotropic";
  let bestGain = -Infinity;

  for (const definition of ANTENNA_TYPES) {
    if (definition.type === "isotropic") continue;
    const gain = definition.getGain(takeoffAngle);
    if (gain > bestGain) {
      bestGain = gain;
      bestType = definition.type;
    }
  }
  return bestType;
}

export function getAntennaDescription(type: AntennaType): string {
  const definition = antennaMap.get(type);
  if (!definition) return "Unknown antenna type";
  return (
    `${definition.name} (${definition.peakGainDbi >= 0 ? "+" : ""}${definition.peakGainDbi.toFixed(1)} dBi peak, ` +
    `optimal at ${definition.optimalElevationDeg} deg): ${definition.description}`
  );
}

export function getAntennaDefinition(
  type: AntennaType,
): AntennaDefinition | undefined {
  return antennaMap.get(type);
}

export function getAntennaTypeList(): AntennaType[] {
  return ANTENNA_TYPES.map((def) => def.type);
}
