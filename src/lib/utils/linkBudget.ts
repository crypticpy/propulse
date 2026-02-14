/**
 * Link Budget & Squint Angle Calculator
 *
 * Provides RF link budget analysis for satellite communications including
 * free-space path loss (FSPL), squint angle for nadir-pointing antennas,
 * and overall link margin estimation.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EARTH_RADIUS_KM = 6371.0;
const DEG_TO_RAD = Math.PI / 180;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LinkBudgetResult {
  squintAngleDeg: number;
  freeSpacePathLossDb: number;
  estimatedMarginDb: number;
  quality: "good" | "marginal" | "unlikely";
}

// ---------------------------------------------------------------------------
// Core Functions
// ---------------------------------------------------------------------------

/**
 * Compute the squint angle between a satellite's nadir vector and the
 * observer direction. For nadir-pointing antennas, squint is approximately
 * 90deg minus the observer's elevation angle, corrected for Earth geometry.
 *
 * @param satPosition - Satellite position {lat, lon, altitude} in degrees/km
 * @param observerPosition - Observer {lat, lon} in degrees
 * @param elevationDeg - Observer elevation angle to satellite in degrees
 * @returns Squint angle in degrees (0 = directly below satellite)
 */
export function computeSquintAngle(
  satPosition: { lat: number; lon: number; altitude: number },
  observerPosition: { lat: number; lon: number },
  _elevationDeg: number,
): number {
  // For a nadir-pointing satellite antenna, squint angle is the angle
  // between the satellite-to-nadir vector and the satellite-to-observer vector.
  //
  // Using Earth-center geometry:
  //   gamma = central angle between satellite sub-point and observer
  //   squint = arctan(sin(gamma) / (h/R + 1 - cos(gamma)))
  //
  // However for most practical use, squint ~= 90 - elevation for LEO
  // with a simpler correction for exact geometry.

  const satLatRad = satPosition.lat * DEG_TO_RAD;
  const satLonRad = satPosition.lon * DEG_TO_RAD;
  const obsLatRad = observerPosition.lat * DEG_TO_RAD;
  const obsLonRad = observerPosition.lon * DEG_TO_RAD;

  // Central angle (gamma) via haversine
  const dLat = obsLatRad - satLatRad;
  const dLon = obsLonRad - satLonRad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(satLatRad) * Math.cos(obsLatRad) * Math.sin(dLon / 2) ** 2;
  const gamma = 2 * Math.asin(Math.sqrt(a));

  // Satellite orbital radius
  const satR = EARTH_RADIUS_KM + satPosition.altitude;
  const ratio = EARTH_RADIUS_KM / satR;

  // Exact squint from geometry:
  // squint = atan2(sin(gamma), (1 - ratio * cos(gamma)))
  const squintRad = Math.atan2(Math.sin(gamma), 1 - ratio * Math.cos(gamma));

  const squintDeg = squintRad / DEG_TO_RAD;

  // Clamp to [0, 90] for safety
  return Math.max(0, Math.min(90, squintDeg));
}

/**
 * Compute Free Space Path Loss (FSPL) in dB.
 *
 * FSPL = 20*log10(d_km) + 20*log10(f_MHz) + 32.44
 *
 * @param distanceKm - Slant range from observer to satellite in km
 * @param frequencyMHz - Operating frequency in MHz
 * @returns Path loss in dB (positive number)
 */
export function computePathLoss(
  distanceKm: number,
  frequencyMHz: number,
): number {
  if (distanceKm <= 0 || frequencyMHz <= 0) return 0;
  return 20 * Math.log10(distanceKm) + 20 * Math.log10(frequencyMHz) + 32.44;
}

/**
 * Compute a simplified link budget for a satellite communication link.
 *
 * margin = EIRP(dBW) - FSPL(dB) + observerGain(dBi) - noiseFloor(dBm) - 30
 *
 * The -30 converts dBW to dBm for comparison with noise floor.
 * A margin > 10 dB is "good", 3-10 dB is "marginal", < 3 dB is "unlikely".
 *
 * @param satEirpDbw - Satellite EIRP in dBW (typical LEO amateur: 0-10 dBW)
 * @param distanceKm - Slant range in km
 * @param frequencyMHz - Operating frequency in MHz
 * @param observerGainDbi - Observer antenna gain in dBi
 * @param noiseFloorDbm - Receiver noise floor in dBm (typical: -130 to -140)
 * @returns Link budget result with margin and quality classification
 */
export function computeLinkBudget(
  satEirpDbw: number,
  distanceKm: number,
  frequencyMHz: number,
  observerGainDbi: number,
  noiseFloorDbm: number,
): LinkBudgetResult {
  const fspl = computePathLoss(distanceKm, frequencyMHz);

  // EIRP(dBW) -> dBm = +30
  const satEirpDbm = satEirpDbw + 30;

  // Received signal = EIRP - FSPL + RX antenna gain
  const receivedSignalDbm = satEirpDbm - fspl + observerGainDbi;

  // Margin above noise floor
  const marginDb = receivedSignalDbm - noiseFloorDbm;

  // Squint angle needs satellite position — computed separately,
  // included here for completeness (caller passes it in)
  let quality: LinkBudgetResult["quality"];
  if (marginDb >= 10) {
    quality = "good";
  } else if (marginDb >= 3) {
    quality = "marginal";
  } else {
    quality = "unlikely";
  }

  return {
    squintAngleDeg: 0, // Caller should compute separately via computeSquintAngle
    freeSpacePathLossDb: fspl,
    estimatedMarginDb: marginDb,
    quality,
  };
}

/**
 * Compute slant range from observer to satellite.
 *
 * Uses spherical Earth geometry to calculate the distance
 * between observer on Earth's surface and satellite at altitude.
 *
 * @param satLat - Satellite latitude in degrees
 * @param satLon - Satellite longitude in degrees
 * @param satAltKm - Satellite altitude in km
 * @param obsLat - Observer latitude in degrees
 * @param obsLon - Observer longitude in degrees
 * @returns Slant range in km
 */
export function computeSlantRange(
  satLat: number,
  satLon: number,
  satAltKm: number,
  obsLat: number,
  obsLon: number,
): number {
  const oLR = obsLat * DEG_TO_RAD;
  const oLoR = obsLon * DEG_TO_RAD;
  const sLR = satLat * DEG_TO_RAD;
  const sLoR = satLon * DEG_TO_RAD;

  const oR = EARTH_RADIUS_KM;
  const sR = EARTH_RADIUS_KM + satAltKm;

  const ox = oR * Math.cos(oLR) * Math.cos(oLoR);
  const oy = oR * Math.cos(oLR) * Math.sin(oLoR);
  const oz = oR * Math.sin(oLR);

  const sx = sR * Math.cos(sLR) * Math.cos(sLoR);
  const sy = sR * Math.cos(sLR) * Math.sin(sLoR);
  const sz = sR * Math.sin(sLR);

  const dx = sx - ox;
  const dy = sy - oy;
  const dz = sz - oz;

  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
