/**
 * Doppler Shift Calculator for Satellite Communications
 *
 * Computes frequency corrections due to relative motion between
 * an observer and a satellite. Uses the classical Doppler formula
 * (valid for v << c, which is true for all satellites).
 */

import type { SatellitePosition } from "@/types/satellite";
import type { Transponder } from "@/lib/data/satelliteTransponders";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Speed of light in km/s */
const C_KM_S = 299792.458;
const EARTH_RADIUS_KM = 6371.0;
const DEG_TO_RAD = Math.PI / 180;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DopplerPoint {
  time: Date;
  uplinkShiftHz: number;
  downlinkShiftHz: number;
  correctedUplinkHz: number;
  correctedDownlinkHz: number;
  rangeRateKmS: number;
}

export interface CorrectedFrequencies {
  uplinkHz: number;
  downlinkHz: number;
  uplinkShiftHz: number;
  downlinkShiftHz: number;
  rangeRateKmS: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Compute slant range (distance) from observer to satellite in km.
 */
function computeSlantRange(
  satLat: number,
  satLon: number,
  satAlt: number,
  obsLat: number,
  obsLon: number,
  obsAlt: number,
): number {
  const oLR = obsLat * DEG_TO_RAD;
  const oLoR = obsLon * DEG_TO_RAD;
  const sLR = satLat * DEG_TO_RAD;
  const sLoR = satLon * DEG_TO_RAD;
  const oR = EARTH_RADIUS_KM + obsAlt;
  const sR = EARTH_RADIUS_KM + satAlt;
  const rx =
    sR * Math.cos(sLR) * Math.cos(sLoR) - oR * Math.cos(oLR) * Math.cos(oLoR);
  const ry =
    sR * Math.cos(sLR) * Math.sin(sLoR) - oR * Math.cos(oLR) * Math.sin(oLoR);
  const rz = sR * Math.sin(sLR) - oR * Math.sin(oLR);
  return Math.sqrt(rx * rx + ry * ry + rz * rz);
}

// ---------------------------------------------------------------------------
// Core Doppler Functions
// ---------------------------------------------------------------------------

/**
 * Calculate instantaneous Doppler shift from range-rate.
 *
 * df = -f * (v_r / c)
 *
 * Negative range-rate (approaching) -> positive frequency shift
 * Positive range-rate (receding) -> negative frequency shift
 *
 * For a LEO at ~500 km overhead: v_r ~ ±7 km/s at horizon,
 * producing ~±3.5 kHz shift on 145 MHz or ~±10 kHz on 435 MHz.
 */
export function calculateDopplerShift(
  rangeRateKmS: number,
  frequencyHz: number,
): number {
  return -frequencyHz * (rangeRateKmS / C_KM_S);
}

/**
 * Calculate range-rate from two consecutive satellite positions.
 *
 * @param pos1 - Position at time t
 * @param pos2 - Position at time t + dt
 * @param observer - Observer location { lat, lon, alt }
 * @param dtSeconds - Time delta between positions
 * @returns Range-rate in km/s (negative = approaching)
 */
export function calculateRangeRate(
  pos1: SatellitePosition,
  pos2: SatellitePosition,
  observer: { lat: number; lon: number; alt: number },
  dtSeconds: number,
): number {
  const r1 = computeSlantRange(
    pos1.lat,
    pos1.lon,
    pos1.alt,
    observer.lat,
    observer.lon,
    observer.alt,
  );
  const r2 = computeSlantRange(
    pos2.lat,
    pos2.lon,
    pos2.alt,
    observer.lat,
    observer.lon,
    observer.alt,
  );
  return (r2 - r1) / dtSeconds;
}

/**
 * Get Doppler-corrected uplink and downlink frequencies.
 *
 * - Uplink: we pre-compensate (transmit shifted so sat receives nominal)
 * - Downlink: we receive the Doppler-shifted signal
 * - For inverted transponders the passband mapping inverts,
 *   but Doppler correction on each link is independent.
 *
 * Uses the midpoint of the transponder frequency range as nominal.
 */
export function getCorrectedFrequencies(
  sat: SatellitePosition,
  satPrev: SatellitePosition,
  observer: { lat: number; lon: number; alt: number },
  transponder: Transponder,
  dtSeconds: number = 1,
): CorrectedFrequencies {
  const rangeRateKmS = calculateRangeRate(satPrev, sat, observer, dtSeconds);

  const nominalUplink =
    (transponder.uplinkRangeHz[0] + transponder.uplinkRangeHz[1]) / 2;
  const nominalDownlink =
    (transponder.downlinkRangeHz[0] + transponder.downlinkRangeHz[1]) / 2;

  // Downlink shift: what we receive
  const downlinkShiftHz = calculateDopplerShift(rangeRateKmS, nominalDownlink);

  // Uplink pre-compensation: shift our TX opposite to what the sat would see
  const uplinkShiftHz = -calculateDopplerShift(rangeRateKmS, nominalUplink);

  return {
    uplinkHz: Math.round(nominalUplink + uplinkShiftHz),
    downlinkHz: Math.round(nominalDownlink + downlinkShiftHz),
    uplinkShiftHz: Math.round(uplinkShiftHz),
    downlinkShiftHz: Math.round(downlinkShiftHz),
    rangeRateKmS,
  };
}

/**
 * Generate a full Doppler curve over a satellite pass.
 *
 * @param satPositions - Evenly spaced satellite positions over the pass
 * @param observer - Observer location
 * @param transponder - Transponder to calculate for
 * @param startDate - Pass start time
 * @param endDate - Pass end time
 * @param steps - Number of points to compute
 */
export function getDopplerCurve(
  satPositions: SatellitePosition[],
  observer: { lat: number; lon: number; alt: number },
  transponder: Transponder,
  startDate: Date,
  endDate: Date,
  steps: number,
): DopplerPoint[] {
  if (satPositions.length < 2) return [];

  const totalMs = endDate.getTime() - startDate.getTime();
  const stepMs = totalMs / steps;
  const posStepMs = totalMs / (satPositions.length - 1);

  const points: DopplerPoint[] = [];

  for (let i = 0; i < steps; i++) {
    const timeMs = startDate.getTime() + i * stepMs;
    const posIdx = Math.min(
      Math.floor((i * stepMs) / posStepMs),
      satPositions.length - 2,
    );
    const pos = satPositions[posIdx + 1];
    const prevPos = satPositions[posIdx];
    const dt = posStepMs / 1000;

    const corrected = getCorrectedFrequencies(
      pos,
      prevPos,
      observer,
      transponder,
      dt,
    );

    points.push({
      time: new Date(timeMs),
      uplinkShiftHz: corrected.uplinkShiftHz,
      downlinkShiftHz: corrected.downlinkShiftHz,
      correctedUplinkHz: corrected.uplinkHz,
      correctedDownlinkHz: corrected.downlinkHz,
      rangeRateKmS: corrected.rangeRateKmS,
    });
  }

  return points;
}
