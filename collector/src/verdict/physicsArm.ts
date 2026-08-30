/**
 * Per-scope physics arm for the ladder tick (Band Health P1,
 * DEV-PLAN-BAND-HEALTH §13).
 *
 * v1 handed every scope the same global day/night-mean p_open, which read
 * "closed" on bands wide open over the daylit half of the planet and fired
 * false surprises all night. This arm blends each band's day and night
 * condition scores by the actual lit fraction of the scope: the scope's
 * continent anchors for regional, all anchors (ham-weighted planet) for
 * global.
 */

import {
  blendPOpen,
  computePhysicsBandScores,
  type PhysicsBandScore,
} from "../collectors/forecastSnapshot.js";
import {
  CONTINENT_ANCHORS,
  globalLitFraction,
  litFraction,
} from "../lib/sun.js";

/** Recorded on every verdict event/state — BH4 segments accuracy by basis. */
export const PHYSICS_BASIS = "continent-litfrac-v1";

export interface PhysicsArm {
  basis: string;
  /** Lit fraction the arm would use for this scope, [0, 1]. */
  fLitFor(scopeType: string, scopeKey: string): number;
  /** Blended p_open for this scope + band; 0 for unknown bands. */
  scoreFor(scopeType: string, scopeKey: string, band: string): number;
  /**
   * scoreFor evaluated at an arbitrary time under solar persistence: the
   * band's day/night condition scores stay pinned to the tick's kp/sfi and
   * only the lit fraction follows the clock (BH3 opening timeline).
   */
  scoreAt(
    scopeType: string,
    scopeKey: string,
    band: string,
    atMs: number,
  ): number;
}

/** Build the arm for one tick from the solar indices and the tick time. */
export function buildLitFracPhysics(
  kp: number,
  sfi: number,
  nowMs: number,
): PhysicsArm {
  const byBand = new Map<string, PhysicsBandScore>(
    computePhysicsBandScores(kp, sfi).map((score) => [score.band, score]),
  );
  const fGlobal = globalLitFraction(nowMs);
  const fByContinent = new Map<string, number>(
    Object.entries(CONTINENT_ANCHORS).map(([continent, anchors]) => [
      continent,
      litFraction(anchors, nowMs),
    ]),
  );

  // Continents without anchors (e.g. AN) fall back to the global fraction.
  const fLitFor = (scopeType: string, scopeKey: string): number =>
    scopeType === "regional"
      ? (fByContinent.get(scopeKey) ?? fGlobal)
      : fGlobal;

  const fLitAt = (
    scopeType: string,
    scopeKey: string,
    atMs: number,
  ): number => {
    if (scopeType === "regional") {
      const anchors = CONTINENT_ANCHORS[scopeKey];
      if (anchors) return litFraction(anchors, atMs);
    }
    return globalLitFraction(atMs);
  };

  return {
    basis: PHYSICS_BASIS,
    fLitFor,
    scoreFor(scopeType, scopeKey, band) {
      const score = byBand.get(band);
      if (!score) return 0;
      return blendPOpen(score, fLitFor(scopeType, scopeKey));
    },
    scoreAt(scopeType, scopeKey, band, atMs) {
      const score = byBand.get(band);
      if (!score) return 0;
      return blendPOpen(score, fLitAt(scopeType, scopeKey, atMs));
    },
  };
}
