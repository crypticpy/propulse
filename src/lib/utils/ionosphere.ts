/**
 * Ionospheric Layer Calculations for HF Propagation
 *
 * Provides ionospheric parameter estimation for HF radio propagation analysis.
 * Based on simplified ITU-R P.533 approach and CCIR/ITU-R models.
 *
 * The ionosphere consists of multiple layers that affect HF propagation:
 * - D layer (60-90 km): Primary source of absorption, exists only during day
 * - E layer (90-150 km): Supports propagation up to ~10 MHz
 * - F1 layer (150-200 km): Daytime only, merges with F2 at night
 * - F2 layer (250-400 km): Primary layer for long-distance HF propagation
 *
 * Key parameters calculated:
 * - f0F2: Critical frequency of F2 layer
 * - f0E: Critical frequency of E layer
 * - hmF2, hmE, hmF1: Layer heights
 * - M(3000)F2: MUF factor for 3000km paths
 * - D-layer absorption
 */

import { getSubsolarPoint } from "@/lib/utils/sun";
import { getGeomagneticLatitude } from "./geomagnetic";

/**
 * Degree to radian conversion constant
 */
const DEG_TO_RAD = Math.PI / 180;

/**
 * Radian to degree conversion constant
 */
const RAD_TO_DEG = 180 / Math.PI;

/**
 * Mean earth radius in km (used for spherical ray geometry)
 */
const EARTH_RADIUS_KM = 6371;

/**
 * Convert Solar Flux Index (SFI) to the 12-month smoothed sunspot number R12.
 *
 * Uses the canonical inverse of the CCIR relation SFI = 63.7 + 0.728 * R12,
 * i.e. R12 = (SFI - 63.7) / 0.728, clamped at >= 0. Shared by the D-layer
 * absorption model and the ray-trace engine so both agree on solar activity.
 *
 * @param sfi - Solar Flux Index (10.7 cm flux)
 * @returns R12 (>= 0)
 */
export function sfiToR12(sfi: number): number {
  return Math.max(0, (sfi - 63.7) / 0.728);
}

/**
 * Angle of incidence at a reflecting/absorbing layer for a spherical earth.
 *
 * Given the ray take-off elevation angle and the layer height, the incidence
 * angle at the layer follows from the law of sines on the earth-centre triangle:
 *   sin(i) = (Re / (Re + h)) * cos(elevation)
 * (ITU-R P.533 oblique-incidence geometry). At vertical incidence (elevation
 * 90 deg) this returns 0; at grazing take-off it approaches ~90 deg.
 *
 * @param elevationDeg - Ray take-off elevation angle in degrees (0-90)
 * @param heightKm - Reflection/absorption layer height in km
 * @returns Incidence angle at the layer in degrees
 */
export function obliqueIncidenceAngle(
  elevationDeg: number,
  heightKm: number,
): number {
  const ratio = EARTH_RADIUS_KM / (EARTH_RADIUS_KM + heightKm);
  const sinI = ratio * Math.cos(elevationDeg * DEG_TO_RAD);
  return Math.asin(Math.max(-1, Math.min(1, sinI))) * RAD_TO_DEG;
}

/**
 * Shared solar-zenith-angle estimator for the F2 critical frequency.
 *
 * Single calibrated heuristic used by both the ionosphere model and the
 * multi-hop ray-trace engine so their foF2 values agree. Calibrated to
 * CCIR/URSI magnitudes: mid-latitude daytime foF2 ~6-8 MHz at SFI 70 and
 * ~9-12 MHz at SFI 150-200, with night values ~40-60% of daytime resting
 * on a solar-scaled floor (~2-3.5 MHz). Day/night follow a Chapman-like
 * cos(chi)^0.4 shape blended into a persistent night floor.
 *
 * @param zenithDeg - Solar zenith angle in degrees (0 overhead, 90 horizon, >90 night)
 * @param sfi - Solar Flux Index
 * @returns foF2 in MHz
 */
export function estimateFoF2(zenithDeg: number, sfi: number): number {
  const effectiveSfi = Math.max(65, Math.min(300, sfi));

  // Overhead (chi = 0) daytime peak critical frequency, linear in SFI:
  // ~8 MHz at SFI 70, ~11 MHz at SFI 150, ~13 MHz at SFI 200.
  const peak = 5.3 + 0.0385 * effectiveSfi;

  // Persistent night floor scales gently with solar activity (2.0-3.5 MHz).
  const nightFloor = 2.0 + (1.5 * (effectiveSfi - 65)) / 235;

  // Nighttime critical frequency ~= half the daytime peak, never below the floor.
  const nightValue = Math.max(nightFloor, 0.5 * peak);

  let f0F2: number;
  if (zenithDeg <= 90) {
    const cosChi = Math.max(0, Math.cos(zenithDeg * DEG_TO_RAD));
    // Blend from the night resting value (chi = 90) up to the overhead peak.
    f0F2 = nightValue + (peak - nightValue) * Math.pow(cosChi, 0.4);
  } else {
    // Post-sunset decay from the night value toward (but not below) the floor.
    const nightDepth = Math.min((zenithDeg - 90) / 60, 1);
    f0F2 = nightValue * (1 - 0.25 * nightDepth);
  }

  return Math.max(nightFloor * 0.9, Math.min(16, f0F2));
}

/**
 * Approximate solar declination (deg) from month, using a mid-month day count.
 */
function approximateSolarDeclination(month: number): number {
  const dayOfYear = (month - 1) * 30.4 + 15;
  return -23.45 * Math.cos((2 * Math.PI * (dayOfYear + 10)) / 365);
}

/**
 * Complete ionospheric parameters for a location and time
 */
export interface IonosphericParameters {
  /** F2 layer critical frequency in MHz */
  f0F2: number;
  /** E layer critical frequency in MHz */
  f0E: number;
  /** F1 layer critical frequency in MHz (0 if not present) */
  f0F1: number;
  /** F2 layer height in km */
  hmF2: number;
  /** F1 layer height in km */
  hmF1: number;
  /** E layer height in km */
  hmE: number;
  /** M(3000)F2 factor for MUF calculation */
  m3000F2: number;
  /** Basic MUF for 3000km path (f0F2 * M3000F2) in MHz */
  muf3000: number;
  /** Solar zenith angle in degrees */
  zenithAngle: number;
  /** Whether location is in daylight */
  isDaytime: boolean;
  /** Local solar hour (0-24) */
  localSolarHour: number;
  /** Geomagnetic latitude at the location (when computed) */
  geomagneticLatitude?: number;
}

/**
 * Layer height parameters
 */
export interface LayerHeights {
  /** E layer height in km (typically 100-120 km) */
  hmE: number;
  /** F1 layer height in km (typically 170-200 km, daytime only) */
  hmF1: number;
  /** F2 layer height in km (typically 250-400 km) */
  hmF2: number;
}

/**
 * Calculate F2 layer critical frequency from solar indices
 *
 * The F2 layer is the primary layer for long-distance HF propagation.
 * Its critical frequency (f0F2) determines the highest frequency that
 * can be reflected at vertical incidence.
 *
 * Based on simplified CCIR/ITU-R model:
 * - f0F2 increases with solar activity (SFI)
 * - f0F2 varies with local solar time (peaks in early afternoon)
 * - f0F2 has latitude dependence (equatorial anomaly, polar depletion)
 * - f0F2 has seasonal variation
 *
 * @param sfi - Solar Flux Index (65-300)
 * @param lat - Geographic latitude in degrees (-90 to 90)
 * @param hour - Local solar hour (0-24)
 * @param month - Month (1-12)
 * @returns f0F2 in MHz (typically 3-15 MHz)
 *
 * @example
 * ```typescript
 * // High solar activity, equator, midday, equinox
 * const f0F2 = calculateF0F2(150, 0, 12, 3);
 * // Returns approximately 12-14 MHz
 * ```
 */
export function calculateF0F2(
  sfi: number,
  lat: number,
  hour: number,
  month: number,
  geomagLat?: number,
): number {
  // Day/night magnitude comes from the single shared, CCIR/URSI-calibrated
  // estimator (see estimateFoF2). We derive an effective solar zenith angle
  // from latitude, local hour and month so both this model and the ray-trace
  // engine rest on one calibration rather than two disagreeing formulas.
  const decRad = approximateSolarDeclination(month) * DEG_TO_RAD;
  const hourAngleRad = (hour - 12) * 15 * DEG_TO_RAD; // 0 at local solar noon
  const latRad = lat * DEG_TO_RAD;
  const cosChi =
    Math.sin(latRad) * Math.sin(decRad) +
    Math.cos(latRad) * Math.cos(decRad) * Math.cos(hourAngleRad);
  const zenith = Math.acos(Math.max(-1, Math.min(1, cosChi))) * RAD_TO_DEG;
  const baseFoF2 = estimateFoF2(zenith, sfi);

  // Latitude variation
  // Equatorial anomaly: f0F2 peaks at ~15-20 degrees from magnetic equator
  // Polar regions have lower f0F2
  // Use geomagnetic latitude for equatorial anomaly (if available), geographic for general
  const absGeomagLat =
    geomagLat !== undefined ? Math.abs(geomagLat) : Math.abs(lat);
  const absLat = Math.abs(lat);
  let latFactor: number;

  if (absGeomagLat < 20) {
    // Equatorial region with anomaly crests (based on geomagnetic equator)
    latFactor = 1.0 + 0.15 * Math.sin((absGeomagLat / 20) * (Math.PI / 2));
  } else if (absGeomagLat < 50) {
    // Mid-latitudes - relatively stable
    latFactor = 1.1 - 0.002 * (absGeomagLat - 20);
  } else {
    // High latitudes - decreasing f0F2
    latFactor = 1.04 - 0.008 * (absGeomagLat - 50);
  }
  latFactor = Math.max(0.6, latFactor);

  // Seasonal variation
  // Summer hemisphere has higher f0F2, winter hemisphere lower
  // Effect is strongest at high latitudes
  const isNorthernHemisphere = lat >= 0;
  const isSummerMonth = isNorthernHemisphere
    ? month >= 4 && month <= 9
    : month <= 3 || month >= 10;

  const seasonalAmplitude = 0.1 * Math.sin((absLat / 90) * (Math.PI / 2));
  const seasonalFactor = isSummerMonth
    ? 1.0 + seasonalAmplitude
    : 1.0 - seasonalAmplitude;

  // Diurnal and night behaviour are already captured by the zenith-based
  // baseFoF2; here we only apply the latitude (equatorial anomaly) and
  // seasonal modifiers on top of the shared calibration.
  const f0F2 = baseFoF2 * latFactor * seasonalFactor;

  // Clamp to realistic range (2-18 MHz)
  return Math.max(2.0, Math.min(18.0, f0F2));
}

/**
 * Calculate E layer critical frequency
 *
 * The E layer is primarily controlled by solar zenith angle.
 * It exists mainly during daylight and contributes to absorption
 * and some short-distance propagation.
 *
 * Uses the standard solar-activity-dependent form (Davies, "Ionospheric
 * Radio"; consistent with ITU-R P.533 E-layer screening):
 * f0E = 0.9 * [(180 + 1.44 * R12) * cos(chi)]^0.25
 * where chi is the solar zenith angle and R12 the smoothed sunspot number.
 *
 * @param zenithAngle - Solar zenith angle in degrees (0 = sun overhead, 90 = horizon)
 * @param sfi - Solar Flux Index (default 120, moderate activity)
 * @returns f0E in MHz (0-4.5 MHz, near 0 at night)
 *
 * @example
 * ```typescript
 * // Sun directly overhead at R12 ~ 100
 * const f0E = calculateF0E(0, 150);
 * // Returns approximately 3.8 MHz
 *
 * // Sun at horizon (twilight)
 * const f0E_twilight = calculateF0E(90, 150);
 * // Returns approximately 0 MHz
 * ```
 */
export function calculateF0E(zenithAngle: number, sfi: number = 120): number {
  // No E layer at night (zenith > 90)
  if (zenithAngle >= 98) {
    return 0;
  }

  // Twilight region (90-98 degrees) - rapid decay
  if (zenithAngle >= 90) {
    const twilightFactor = (98 - zenithAngle) / 8;
    return 0.5 * twilightFactor;
  }

  // Daytime E layer: f0E = 0.9 * [(180 + 1.44 * R12) * cos(chi)]^0.25
  const r12 = sfiToR12(sfi);
  const cosZenith = Math.max(0, Math.cos(zenithAngle * DEG_TO_RAD));
  const f0E = 0.9 * Math.pow((180 + 1.44 * r12) * cosZenith, 0.25);

  return Math.max(0, Math.min(4.5, f0E));
}

/**
 * Calculate F1 layer critical frequency
 *
 * The F1 layer exists only during daytime and at low-to-mid latitudes.
 * It forms a "ledge" between the E and F2 layers.
 *
 * @param zenithAngle - Solar zenith angle in degrees
 * @param sfi - Solar Flux Index
 * @returns f0F1 in MHz (0 if layer not present)
 */
export function calculateF0F1(zenithAngle: number, sfi: number): number {
  // F1 layer only present during day with zenith < 80
  if (zenithAngle >= 80) {
    return 0;
  }

  // F1 is more prominent with higher solar activity
  const sfiEffect = 0.5 + 0.5 * Math.min(1, (sfi - 65) / 150);

  // F1 follows similar Chapman-like behavior to E layer
  const cosZenith = Math.cos(zenithAngle * DEG_TO_RAD);
  const f0F1 = 4.0 * sfiEffect * Math.pow(Math.max(0, cosZenith), 0.5);

  return Math.max(0, Math.min(6.0, f0F1));
}

/**
 * Calculate ionospheric layer heights
 *
 * Layer heights vary with latitude, season, solar activity, and time of day.
 * These heights are important for ray tracing and path geometry calculations.
 *
 * Typical height ranges:
 * - hmE: 100-120 km (very stable)
 * - hmF1: 170-200 km (daytime only)
 * - hmF2: 250-400 km (highly variable)
 *
 * @param lat - Geographic latitude in degrees
 * @param month - Month (1-12)
 * @param sfi - Solar Flux Index
 * @returns Layer heights in km
 *
 * @example
 * ```typescript
 * const heights = calculateLayerHeights(45, 6, 120);
 * // Returns { hmE: 110, hmF1: 180, hmF2: 290 }
 * ```
 */
export function calculateLayerHeights(
  lat: number,
  month: number,
  sfi: number,
): LayerHeights {
  const absLat = Math.abs(lat);

  // E layer height - very stable, small variations
  // Slightly higher at high latitudes
  const hmE = 110 + 5 * Math.sin((absLat / 90) * (Math.PI / 2));

  // F1 layer height - intermediate layer
  // Present during day, ~180 km
  const hmF1 = 180 + (10 * (sfi - 100)) / 200;

  // F2 layer height - most variable
  // Higher at equator, lower at poles
  // Higher during high solar activity
  // Higher at night than day (layer rises)
  const baseHmF2 = 300;

  // Latitude effect: higher at low latitudes
  const latEffect = -30 * Math.cos(absLat * DEG_TO_RAD);

  // Solar activity effect: higher with more activity
  const sfiEffect = (50 * (sfi - 100)) / 200;

  // Seasonal effect at high latitudes
  const isNorthernHemisphere = lat >= 0;
  const isSummerMonth = isNorthernHemisphere
    ? month >= 4 && month <= 9
    : month <= 3 || month >= 10;
  const seasonEffect = absLat > 40 ? (isSummerMonth ? 20 : -20) : 0;

  const hmF2 = baseHmF2 + latEffect + sfiEffect + seasonEffect;

  return {
    hmE: Math.round(Math.max(100, Math.min(130, hmE))),
    hmF1: Math.round(Math.max(160, Math.min(220, hmF1))),
    hmF2: Math.round(Math.max(200, Math.min(450, hmF2))),
  };
}

/**
 * Calculate M(3000)F2 - the MUF factor for 3000km paths
 *
 * M(3000)F2 is the ratio of the MUF for a 3000km path to the
 * critical frequency f0F2. It depends primarily on the F2 layer height.
 *
 * MUF = f0F2 * M(3000)F2
 *
 * Based on the Shimazaki relation between hmF2 and M(3000)F2:
 * M(3000)F2 ~= 1490 / (hmF2 + 176), with hmF2 in km.
 *
 * Higher layers (larger hmF2) give lower M factors (more vertical ray paths)
 * Lower layers (smaller hmF2) give higher M factors (more oblique paths work)
 *
 * @param hmF2 - F2 layer height in km
 * @returns M(3000)F2 factor (typically 2.5-4.0)
 *
 * @example
 * ```typescript
 * // Typical daytime F2 height
 * const m = calculateM3000F2(280);
 * // Returns approximately 3.3
 *
 * // Higher layer at night
 * const m_night = calculateM3000F2(350);
 * // Returns approximately 2.8
 * ```
 */
export function calculateM3000F2(hmF2: number): number {
  // Shimazaki inverse: M(3000)F2 ~= 1490 / (hmF2 + 176), hmF2 in km.
  // Yields ~3.5 at hmF2 250 km down to ~3.0 at 320 km. The previous form
  // 1/(0.0196*hmF2/1000 + 0.1) mishandled units (hmF2 already in km) and
  // always saturated at the 4.5 ceiling.
  const m3000 = 1490 / (hmF2 + 176);

  // Clamp to realistic range
  return Math.max(2.0, Math.min(4.5, m3000));
}

/**
 * Calculate D-layer absorption
 *
 * The D-layer is the primary source of HF signal absorption.
 * Key characteristics:
 * - Absorption is inversely proportional to frequency squared (1/f^2)
 * - Absorption increases with solar activity
 * - Absorption follows solar zenith angle (day only)
 * - Low frequencies are heavily absorbed, high frequencies pass through
 *
 * Based on the ITU-R P.533 non-deviative absorption form:
 * L = K * sec(i) * (1 + 0.003 * R12) * cos(0.881 * chi) / (f + fL)^2
 *
 * where sec(i) is the obliquity of the D-region crossing (h ~= 90 km),
 * cos(0.881 * chi) is the P.533 solar-zenith dependence, and (f + fL) with
 * fL ~= 1.2 MHz is the electron gyro-frequency correction that replaces the
 * pure 1/f^2 law.
 *
 * @param frequency - Operating frequency in MHz
 * @param zenithAngle - Solar zenith angle in degrees
 * @param sfi - Solar Flux Index (proxy for R12)
 * @param elevationDeg - Ray take-off elevation in degrees (default 90 = vertical)
 * @returns Absorption in dB (single pass through D-layer)
 *
 * @example
 * ```typescript
 * // 7 MHz during noon, near-vertical (high absorption on 40m)
 * const absorption = calculateDLayerAbsorption(7, 20, 120);
 * // Returns approximately 10-15 dB
 *
 * // 21 MHz during noon (low absorption on 15m)
 * const absorption_15m = calculateDLayerAbsorption(21, 20, 120);
 * // Returns approximately 1-2 dB
 * ```
 */
export function calculateDLayerAbsorption(
  frequency: number,
  zenithAngle: number,
  sfi: number,
  elevationDeg: number = 90,
): number {
  // No absorption at night (D-layer disappears)
  if (zenithAngle >= 98) {
    return 0;
  }

  // Twilight decay (90-98 degrees)
  let dayFactor = 1.0;
  if (zenithAngle >= 90) {
    dayFactor = (98 - zenithAngle) / 8;
  }

  // Solar activity factor via the shared SFI -> R12 conversion.
  const activityFactor = 1 + 0.003 * sfiToR12(sfi);

  // P.533 solar-zenith dependence cos(0.881 * chi), clamped >= 0 (replaces the
  // previous cos(chi)^1.3 which decayed too fast at low sun elevation).
  const zenithFactor = Math.max(0, Math.cos(0.881 * zenithAngle * DEG_TO_RAD));

  // Gyro-frequency-corrected frequency factor: 1/(f + fL)^2 with fL ~= 1.2 MHz
  // (the ordinary-wave longitudinal gyro-frequency term) instead of 1/f^2.
  const fL = 1.2;
  const freqFactor = 1.0 / Math.pow(Math.max(frequency, 1.5) + fL, 2);

  // Obliquity of the D-region crossing (h ~= 90 km): a low-angle ray traverses
  // a much longer slant path and is absorbed more. sec(i) = 1 at vertical.
  const incidenceDeg = obliqueIncidenceAngle(elevationDeg, 90);
  const secI = 1 / Math.max(0.05, Math.cos(incidenceDeg * DEG_TO_RAD));

  // Base absorption coefficient
  // ~677 gives roughly 10-15 dB at 7 MHz, noon, moderate solar activity, vertical
  const K = 677;

  const absorption =
    K * secI * activityFactor * zenithFactor * freqFactor * dayFactor;

  // Clamp to realistic range (0-50 dB single pass)
  return Math.max(0, Math.min(50, absorption));
}

/**
 * Calculate the solar zenith angle at a given location and time
 *
 * @param lat - Geographic latitude in degrees
 * @param lon - Geographic longitude in degrees
 * @param date - Date/time for calculation
 * @returns Solar zenith angle in degrees (0 = overhead, 90 = horizon, >90 = night)
 */
export function calculateZenithAngle(
  lat: number,
  lon: number,
  date: Date,
): number {
  const subsolar = getSubsolarPoint(date);

  const phi1 = lat * DEG_TO_RAD;
  const phi2 = subsolar.lat * DEG_TO_RAD;
  const deltaLambda = (lon - subsolar.lon) * DEG_TO_RAD;

  const cosAngle =
    Math.sin(phi1) * Math.sin(phi2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);

  return Math.acos(Math.max(-1, Math.min(1, cosAngle))) * RAD_TO_DEG;
}

/**
 * Calculate local solar hour from longitude and date
 *
 * @param lon - Geographic longitude in degrees
 * @param date - Date/time (UTC)
 * @returns Local solar hour (0-24)
 */
export function calculateLocalSolarHour(lon: number, date: Date): number {
  const utcHours =
    date.getUTCHours() +
    date.getUTCMinutes() / 60 +
    date.getUTCSeconds() / 3600;

  // Each 15 degrees of longitude = 1 hour offset
  let solarHour = utcHours + lon / 15;

  // Normalize to 0-24
  while (solarHour < 0) {
    solarHour += 24;
  }
  while (solarHour >= 24) {
    solarHour -= 24;
  }

  return solarHour;
}

/**
 * Get complete ionospheric parameters for a location and time
 *
 * This is the main entry point for ionospheric analysis. It calculates
 * all relevant parameters including layer frequencies, heights,
 * MUF factors, and absorption.
 *
 * @param lat - Geographic latitude in degrees (-90 to 90)
 * @param lon - Geographic longitude in degrees (-180 to 180)
 * @param date - Date/time for calculation (UTC)
 * @param sfi - Solar Flux Index (65-300)
 * @returns Complete ionospheric parameters
 *
 * @example
 * ```typescript
 * const params = getIonosphericParameters(
 *   45.0,    // latitude
 *   -93.0,   // longitude
 *   new Date('2024-06-15T18:00:00Z'),
 *   120      // SFI
 * );
 *
 * console.log(`f0F2: ${params.f0F2} MHz`);
 * console.log(`MUF(3000): ${params.muf3000} MHz`);
 * console.log(`Is daytime: ${params.isDaytime}`);
 * ```
 */
export function getIonosphericParameters(
  lat: number,
  lon: number,
  date: Date,
  sfi: number,
): IonosphericParameters {
  // Calculate solar geometry
  const zenithAngle = calculateZenithAngle(lat, lon, date);
  const localSolarHour = calculateLocalSolarHour(lon, date);
  const isDaytime = zenithAngle < 90;

  // Get month for seasonal calculations
  const month = date.getUTCMonth() + 1; // 1-12

  // Compute geomagnetic latitude for equatorial anomaly
  const geomagLat = getGeomagneticLatitude(lat, lon);

  // Calculate layer heights
  const heights = calculateLayerHeights(lat, month, sfi);

  // Calculate critical frequencies
  const f0F2 = calculateF0F2(sfi, lat, localSolarHour, month, geomagLat);
  const f0E = calculateF0E(zenithAngle, sfi);
  const f0F1 = calculateF0F1(zenithAngle, sfi);

  // Calculate MUF factor
  const m3000F2 = calculateM3000F2(heights.hmF2);

  // Calculate basic MUF for 3000km path
  const muf3000 = f0F2 * m3000F2;

  return {
    f0F2,
    f0E,
    f0F1,
    hmF2: heights.hmF2,
    hmF1: heights.hmF1,
    hmE: heights.hmE,
    m3000F2,
    muf3000,
    zenithAngle,
    isDaytime,
    localSolarHour,
    geomagneticLatitude: geomagLat,
  };
}

/**
 * Get D-layer absorption for a frequency at a location
 *
 * Convenience function that combines zenith angle calculation
 * with absorption calculation.
 *
 * @param lat - Geographic latitude
 * @param lon - Geographic longitude
 * @param date - Date/time
 * @param frequency - Operating frequency in MHz
 * @param sfi - Solar Flux Index
 * @returns Absorption in dB
 */
export function getAbsorptionAtLocation(
  lat: number,
  lon: number,
  date: Date,
  frequency: number,
  sfi: number,
): number {
  const zenithAngle = calculateZenithAngle(lat, lon, date);
  return calculateDLayerAbsorption(frequency, zenithAngle, sfi);
}

/**
 * Calculate the Lowest Usable Frequency (LUF) based on absorption
 *
 * LUF is the lowest frequency that will provide a usable signal
 * after accounting for D-layer absorption. Below LUF, signals
 * are too weak due to absorption.
 *
 * @param zenithAngle - Solar zenith angle in degrees
 * @param sfi - Solar Flux Index
 * @param requiredSNR - Required signal-to-noise ratio in dB (default 10)
 * @param txPower - Transmitter power in dBW (default 30 = 1kW)
 * @param elevationDeg - Ray take-off elevation in degrees (default 15, a
 *   typical single-hop F2 DX angle). Oblique rays traverse a longer slant
 *   path through the D layer, so LUF is evaluated at the path's actual
 *   obliquity rather than vertical incidence.
 * @returns LUF in MHz
 */
export function calculateLUF(
  zenithAngle: number,
  sfi: number,
  requiredSNR: number = 10,
  txPower: number = 30,
  elevationDeg: number = 15,
): number {
  // At night, absorption is minimal, so LUF is very low
  if (zenithAngle >= 90) {
    return 1.8; // Minimum usable HF frequency
  }

  // Start with a guess and iterate
  // LUF is where absorption becomes manageable
  // For typical amateur power levels, aim for < 25 dB total path absorption

  const maxAcceptableAbsorption = 25 + (txPower - 30) - requiredSNR;

  // Binary search for frequency where absorption = max acceptable
  let low = 1.8;
  let high = 30;

  for (let i = 0; i < 20; i++) {
    const mid = (low + high) / 2;
    const absorption = calculateDLayerAbsorption(
      mid,
      zenithAngle,
      sfi,
      elevationDeg,
    );

    if (absorption > maxAcceptableAbsorption) {
      low = mid;
    } else {
      high = mid;
    }
  }

  // Return the LUF (round up for safety margin)
  return Math.ceil(((low + high) / 2) * 10) / 10;
}

/**
 * Calculate the Frequency of Optimum Traffic (FOT)
 *
 * FOT is typically 85% of MUF - provides a safety margin below
 * the MUF to ensure reliable propagation despite ionospheric
 * variability.
 *
 * @param muf - Maximum Usable Frequency in MHz
 * @returns FOT in MHz
 */
export function calculateFOT(muf: number): number {
  return muf * 0.85;
}

/**
 * Check if a frequency will propagate via F2 layer
 *
 * @param frequency - Operating frequency in MHz
 * @param f0F2 - F2 layer critical frequency in MHz
 * @param m3000F2 - M(3000)F2 factor
 * @returns true if frequency can propagate
 */
export function canPropagate(
  frequency: number,
  f0F2: number,
  m3000F2: number,
): boolean {
  const muf = f0F2 * m3000F2;
  return frequency <= muf;
}

/**
 * Get a text description of ionospheric conditions
 *
 * @param params - Ionospheric parameters
 * @returns Human-readable description
 */
export function describeConditions(params: IonosphericParameters): string {
  const timeOfDay = params.isDaytime ? "Daytime" : "Nighttime";

  let quality: string;
  if (params.f0F2 >= 10) {
    quality = "Excellent";
  } else if (params.f0F2 >= 7) {
    quality = "Good";
  } else if (params.f0F2 >= 5) {
    quality = "Fair";
  } else {
    quality = "Poor";
  }

  const highestBand =
    params.muf3000 >= 28
      ? "10m"
      : params.muf3000 >= 21
        ? "15m"
        : params.muf3000 >= 14
          ? "20m"
          : params.muf3000 >= 10
            ? "30m"
            : params.muf3000 >= 7
              ? "40m"
              : "80m";

  return (
    `${timeOfDay} conditions: ${quality}. F2 critical frequency: ${params.f0F2.toFixed(1)} MHz. ` +
    `MUF(3000): ${params.muf3000.toFixed(1)} MHz. ` +
    `Highest usable band: ${highestBand}.`
  );
}
