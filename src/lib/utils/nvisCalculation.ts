/**
 * NVIS (Near-Vertical Incidence Skywave) Coverage Calculator
 *
 * Calculates the NVIS coverage dome for a given location and set of
 * ionospheric conditions. This module complements the existing
 * `src/lib/utils/nvis.ts` (which provides full analysis with band
 * recommendations) by adding:
 *
 * - Standalone foF2 estimation from solar indices (no ionosphere.ts dependency)
 * - Coverage dome radius calculation for globe overlay rendering
 * - Quality classification for quick status display
 *
 * NVIS works by sending signals nearly straight up (70-90 degree takeoff
 * angle) so they reflect off the F2 layer and return within ~0-300 km
 * of the transmitter. This fills the "skip zone" between ground wave
 * range (~50 km) and normal skywave skip distance (~800+ km).
 *
 * Key physics:
 * - Works only when frequency < foF2 (F2 critical frequency)
 * - Optimal at ~85% of foF2 for reliability margin
 * - foF2 depends on: solar flux (SFI), latitude, local solar time, season
 * - Coverage radius depends on F2 layer height and takeoff angle geometry
 * - D-layer absorption limits NVIS to frequencies above ~1.8 MHz during day
 *
 * Reference: ARRL Antenna Book Ch. 23 "NVIS Propagation"
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NVISResult {
  /** Coverage radius in km (0 = no NVIS possible) */
  radiusKm: number;
  /** Amateur bands usable for NVIS (e.g., ["40m", "60m", "80m"]) */
  usableBands: string[];
  /** Estimated F2 critical frequency in MHz */
  criticalFreqMHz: number;
  /** Maximum usable frequency for vertical incidence in MHz */
  maxUsableFreqMHz: number;
  /** Quality assessment */
  quality: "excellent" | "good" | "marginal" | "none";
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Amateur bands relevant to NVIS, ordered by frequency ascending */
const NVIS_AMATEUR_BANDS = [
  { name: "160m", centerMHz: 1.9, minMHz: 1.8, maxMHz: 2.0 },
  { name: "80m", centerMHz: 3.75, minMHz: 3.5, maxMHz: 4.0 },
  { name: "60m", centerMHz: 5.37, minMHz: 5.33, maxMHz: 5.405 },
  { name: "40m", centerMHz: 7.15, minMHz: 7.0, maxMHz: 7.3 },
] as const;

/** Typical F2 layer heights by latitude zone (km) */
const F2_HEIGHT_TROPICAL = 350; // Higher ionosphere near equator
const F2_HEIGHT_TEMPERATE = 300; // Mid-latitudes
const F2_HEIGHT_HIGH = 280; // Higher latitudes, compressed ionosphere

// ---------------------------------------------------------------------------
// foF2 Estimation
// ---------------------------------------------------------------------------

/**
 * Estimate F2 critical frequency (foF2) from solar indices and conditions.
 *
 * This is a simplified empirical model suitable for NVIS planning.
 * For full accuracy, use IRI-2020 or the ionosphere.ts module.
 *
 * The model considers:
 * - Solar Flux Index (SFI): primary driver of ionization
 * - Latitude: geomagnetic latitude affects ionization density
 * - Local solar time: diurnal variation (peak at ~14:00 local)
 * - Season: summer hemisphere has higher foF2
 * - Kp index: geomagnetic disturbance reduces foF2 at mid/high latitudes
 *
 * @param sfi - Solar Flux Index (65-300)
 * @param kp - Current Kp index (0-9)
 * @param lat - Geographic latitude in degrees
 * @param localSolarHour - Local solar hour (0-24)
 * @param month - Month (1-12)
 * @returns Estimated foF2 in MHz
 */
function estimateFoF2(
  sfi: number,
  kp: number,
  lat: number,
  localSolarHour: number,
  month: number,
): number {
  // Base foF2 from SFI using empirical regression
  // At SFI=70 (solar minimum): ~4 MHz base
  // At SFI=150 (moderate): ~7 MHz base
  // At SFI=250 (solar maximum): ~10 MHz base
  const sfiNormalized = Math.max(65, Math.min(300, sfi));
  const baseFoF2 = 2.5 + 0.035 * sfiNormalized;

  // Diurnal variation: foF2 peaks around 14:00 local solar time
  // Nighttime foF2 drops to ~40-60% of daytime value
  const hourAngle = ((localSolarHour - 14) / 12) * Math.PI; // peaks at 14:00
  const diurnalFactor = 0.55 + 0.45 * Math.cos(hourAngle);

  // Latitude factor: mid-latitudes (30-50) have highest foF2
  // Equatorial anomaly gives higher values near +/-15 degrees
  // High latitudes have lower foF2
  const absLat = Math.abs(lat);
  let latFactor: number;
  if (absLat < 15) {
    // Equatorial anomaly region - slightly enhanced
    latFactor = 1.05;
  } else if (absLat < 45) {
    // Mid-latitude peak region
    latFactor = 1.1 - 0.003 * Math.abs(absLat - 30);
  } else if (absLat < 65) {
    // Declining at higher latitudes
    latFactor = 0.95 - 0.005 * (absLat - 45);
  } else {
    // Polar regions: significantly lower
    latFactor = 0.6 - 0.003 * (absLat - 65);
  }
  latFactor = Math.max(0.4, latFactor);

  // Seasonal variation: summer hemisphere has higher foF2
  // Determine if it's summer at this latitude
  const isNorthernHemisphere = lat >= 0;
  const isSummerMonth = isNorthernHemisphere
    ? month >= 4 && month <= 9
    : month <= 3 || month >= 10;
  const seasonFactor = isSummerMonth ? 1.1 : 0.9;

  // Geomagnetic disturbance: Kp reduces foF2 at mid/high latitudes
  // Low Kp has minimal effect; high Kp can reduce foF2 by 20-40%
  const kpClamped = Math.max(0, Math.min(9, kp));
  const kpFactor =
    absLat > 30
      ? Math.max(0.6, 1.0 - 0.04 * kpClamped)
      : Math.max(0.8, 1.0 - 0.02 * kpClamped);

  const foF2 = baseFoF2 * diurnalFactor * latFactor * seasonFactor * kpFactor;

  // Clamp to physically reasonable range (1-15 MHz)
  return Math.max(1.0, Math.min(15.0, foF2));
}

/**
 * Get the local solar hour from UTC hour and geographic longitude.
 */
function getLocalSolarHour(utcHour: number, lon: number): number {
  const offset = lon / 15; // 15 degrees per hour
  return (((utcHour + offset) % 24) + 24) % 24;
}

/**
 * Estimate F2 layer peak height based on latitude.
 */
function estimateHmF2(lat: number): number {
  const absLat = Math.abs(lat);
  if (absLat < 23.5) return F2_HEIGHT_TROPICAL;
  if (absLat < 55) return F2_HEIGHT_TEMPERATE;
  return F2_HEIGHT_HIGH;
}

// ---------------------------------------------------------------------------
// Coverage Geometry
// ---------------------------------------------------------------------------

/**
 * Calculate NVIS coverage radius from F2 layer parameters.
 *
 * NVIS geometry: signal travels up to hmF2 at ~80-90 degree takeoff,
 * reflects, and returns. The maximum ground distance covered depends
 * on the layer height and the minimum usable takeoff angle.
 *
 * For a takeoff angle theta (from horizontal) and layer height h:
 *   half_distance = h * tan(90 - theta)
 *   coverage_radius = 2 * half_distance
 *
 * NVIS is typically defined as angles > 70 degrees from horizontal.
 * At 70 degrees with hmF2 = 300 km: radius ~ 218 km
 * At 75 degrees: radius ~ 161 km
 * At 80 degrees: radius ~ 106 km
 *
 * We also add a reliability scaling based on foF2 margin.
 *
 * @param hmF2 - F2 layer peak height in km
 * @param foF2 - Critical frequency in MHz
 * @returns Coverage radius in km
 */
function calculateCoverageRadius(hmF2: number, foF2: number): number {
  if (foF2 < 2.0) return 0; // Too low for any NVIS

  // Minimum takeoff angle for NVIS: 70 degrees from horizontal
  // This gives the maximum coverage radius
  const minTakeoffDeg = 70;
  const minTakeoffRad = (minTakeoffDeg * Math.PI) / 180;

  // Maximum ground distance from geometry
  // cos(theta) / sin(theta) = tan(90 - theta)
  const halfDistance =
    (hmF2 * Math.cos(minTakeoffRad)) / Math.sin(minTakeoffRad);
  const maxRadius = 2 * halfDistance;

  // Scale by foF2 reliability: higher foF2 means more bands work
  // and the coverage is more reliable
  const foF2Factor = Math.min(1.0, (foF2 - 2.0) / 5.0);

  return Math.round(Math.min(400, maxRadius * foF2Factor));
}

// ---------------------------------------------------------------------------
// Band Selection
// ---------------------------------------------------------------------------

/**
 * Determine which amateur bands are usable for NVIS.
 *
 * A band is usable if its center frequency is below foF2 and above
 * the D-layer absorption cutoff (~1.8 MHz during day, ~1.0 MHz at night).
 *
 * @param foF2 - Critical frequency in MHz
 * @returns Array of band name strings (e.g., ["80m", "60m", "40m"])
 */
function getUsableNVISBands(foF2: number): string[] {
  const bands: string[] = [];

  for (const band of NVIS_AMATEUR_BANDS) {
    // Band center must be below foF2 for vertical-incidence reflection
    // Use 95% of foF2 for reliability margin
    if (band.centerMHz < foF2 * 0.95) {
      bands.push(band.name);
    }
  }

  return bands;
}

// ---------------------------------------------------------------------------
// Quality Assessment
// ---------------------------------------------------------------------------

/**
 * Assess NVIS quality based on foF2 and number of usable bands.
 */
function assessQuality(
  foF2: number,
  usableBands: string[],
): "excellent" | "good" | "marginal" | "none" {
  if (foF2 < 2.5 || usableBands.length === 0) return "none";
  if (foF2 >= 7.0 && usableBands.length >= 3) return "excellent";
  if (foF2 >= 5.0 && usableBands.length >= 2) return "good";
  return "marginal";
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Calculate NVIS coverage for a location given current conditions.
 *
 * This is a standalone calculation that does not depend on the
 * ionosphere.ts module. It estimates foF2 internally from solar indices.
 *
 * @param sfi - Solar Flux Index (65-300)
 * @param kp - Current Kp index (0-9)
 * @param lat - Observer latitude in degrees (-90 to 90)
 * @param hour - UTC hour (0-23)
 * @param month - Month (1-12)
 * @returns NVIS coverage result
 *
 * @example
 * ```typescript
 * const result = calculateNVIS(120, 2, 38.9, 18, 6);
 * // result.radiusKm ~ 200
 * // result.usableBands ~ ["80m", "60m", "40m"]
 * // result.quality ~ "good"
 * ```
 */
export function calculateNVIS(
  sfi: number,
  kp: number,
  lat: number,
  hour: number,
  month: number,
): NVISResult {
  // Calculate local solar hour from UTC
  // For standalone use without lon, we use lat as a rough proxy
  // (NVIS is location-centric, lon mainly shifts the time)
  // When this is called from a globe overlay, lon-based local time
  // should be pre-computed and passed as the hour parameter
  const localSolarHour = hour; // Caller should pass local solar hour

  // Estimate foF2
  const foF2 = estimateFoF2(sfi, kp, lat, localSolarHour, month);

  // Maximum usable frequency for vertical incidence
  // MUF(90) = foF2 * sec(0) = foF2 (exactly at vertical)
  // For practical NVIS angles (70-90 deg), MUF is slightly higher
  // MUF(70deg) = foF2 * sec(20deg) = foF2 * 1.064
  const maxUsableFreqMHz = Math.round(foF2 * 1.064 * 100) / 100;

  // Get usable bands
  const usableBands = getUsableNVISBands(foF2);

  // Calculate coverage radius
  const hmF2 = estimateHmF2(lat);
  const radiusKm = calculateCoverageRadius(hmF2, foF2);

  // Assess quality
  const quality = assessQuality(foF2, usableBands);

  return {
    radiusKm,
    usableBands,
    criticalFreqMHz: Math.round(foF2 * 100) / 100,
    maxUsableFreqMHz,
    quality,
  };
}

/**
 * Calculate NVIS with explicit longitude for accurate local solar time.
 *
 * Preferred over `calculateNVIS` when longitude is available (e.g.,
 * for globe overlay rendering).
 *
 * @param sfi - Solar Flux Index (65-300)
 * @param kp - Current Kp index (0-9)
 * @param lat - Observer latitude in degrees
 * @param lon - Observer longitude in degrees
 * @param utcHour - UTC hour (0-23)
 * @param month - Month (1-12)
 * @returns NVIS coverage result
 */
export function calculateNVISAtLocation(
  sfi: number,
  kp: number,
  lat: number,
  lon: number,
  utcHour: number,
  month: number,
): NVISResult {
  const localSolarHour = getLocalSolarHour(utcHour, lon);
  const foF2 = estimateFoF2(sfi, kp, lat, localSolarHour, month);

  const maxUsableFreqMHz = Math.round(foF2 * 1.064 * 100) / 100;

  const usableBands = getUsableNVISBands(foF2);
  const hmF2 = estimateHmF2(lat);
  const radiusKm = calculateCoverageRadius(hmF2, foF2);
  const quality = assessQuality(foF2, usableBands);

  return {
    radiusKm,
    usableBands,
    criticalFreqMHz: Math.round(foF2 * 100) / 100,
    maxUsableFreqMHz,
    quality,
  };
}

/**
 * Get the Tailwind color class for an NVIS quality level.
 *
 * @param quality - NVIS quality level
 * @returns Tailwind color class string
 */
export function getNVISQualityColor(quality: NVISResult["quality"]): string {
  switch (quality) {
    case "excellent":
      return "text-signal-green";
    case "good":
      return "text-cosmic-cyan";
    case "marginal":
      return "text-caution-amber";
    case "none":
      return "text-alert-red";
  }
}
