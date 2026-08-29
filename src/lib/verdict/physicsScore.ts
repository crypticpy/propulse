/**
 * physicsScore — per-band 0..1 physics ratings for the Band Verdict engine.
 *
 * v1.1 (M4 F3): when the operator has a saved target, HF bands are scored
 * with the per-path physics chain (getEnhancedBandConditions: ionospheric
 * parameters at the path midpoint, D-layer absorption, full path loss) for
 * QTH→target. Bands the path model doesn't cover (6m — Es/aurora, not
 * F-layer hops) and the no-target case keep the v1 station-local kp/sfi
 * day/night table, so the verdict engine's 0.4 enter / 0.3 exit hysteresis
 * calibration is unchanged.
 */

import {
  calculateBandConditions,
  getEnhancedBandConditions,
} from "@/lib/utils/bands";

/** Physics condition word -> 0..1 score, per the E4 spec */
export const CONDITION_SCORE: Record<string, number> = {
  Excellent: 0.9,
  Good: 0.7,
  Fair: 0.45,
  Poor: 0.2,
  Aurora: 0.2,
};

/**
 * Per-path status -> 0..1 score. Same vocabulary the verdict thresholds
 * were calibrated against, plus the "closed" level the day/night table
 * cannot express (a path-dead band should not hover at Poor's 0.2).
 */
export const PATH_STATUS_SCORE: Record<string, number> = {
  excellent: 0.9,
  good: 0.7,
  fair: 0.45,
  poor: 0.2,
  closed: 0.05,
};

export interface LatLon {
  lat: number;
  lon: number;
}

/** v1 station-local scores: kp/sfi table resolved for day or night. */
export function stationPhysicsScores(
  kp: number,
  sfi: number,
  isDaylight: boolean,
): Map<string, number> {
  const scores = new Map<string, number>();
  for (const status of calculateBandConditions(kp, sfi)) {
    const condition = isDaylight ? status.dayCondition : status.nightCondition;
    const score = CONDITION_SCORE[condition];
    if (score !== undefined) {
      scores.set(status.name, score);
    }
  }
  return scores;
}

/** Per-path scores for the HF bands the path physics engine covers. */
export function pathPhysicsScores(
  home: LatLon,
  target: LatLon,
  kp: number,
  sfi: number,
  date: Date,
): Map<string, number> {
  const scores = new Map<string, number>();
  const conditions = getEnhancedBandConditions(
    home.lat,
    home.lon,
    target.lat,
    target.lon,
    kp,
    sfi,
    date,
  );
  for (const condition of conditions) {
    const score = PATH_STATUS_SCORE[condition.status];
    if (score !== undefined) {
      scores.set(condition.band, score);
    }
  }
  return scores;
}

export interface BandPhysicsScoreInputs {
  kp: number;
  sfi: number;
  isDaylight: boolean;
  /** Operator QTH; per-path scoring needs both ends */
  home?: LatLon;
  /** Current target (first saved target by convention); absent = v1 fallback */
  target?: LatLon;
  date: Date;
}

/**
 * The Band Verdict physics arm: station-local scores for every band,
 * overridden by QTH→target path scores where both a home and target exist.
 * Band iteration order (160m…6m, the display order) is preserved because
 * overriding an existing Map key keeps its insertion position.
 */
export function bandPhysicsScores({
  kp,
  sfi,
  isDaylight,
  home,
  target,
  date,
}: BandPhysicsScoreInputs): Map<string, number> {
  const scores = stationPhysicsScores(kp, sfi, isDaylight);
  if (home && target) {
    for (const [band, score] of pathPhysicsScores(home, target, kp, sfi, date)) {
      if (scores.has(band)) {
        scores.set(band, score);
      }
    }
  }
  return scores;
}
