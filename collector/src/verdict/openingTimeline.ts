/**
 * BH3 opening timeline — "likely opens ~40 min" per scope × band
 * (DEV-PLAN-BAND-HEALTH §10).
 *
 * Sweeps the physics arm forward in fixed steps under a solar-persistence
 * assumption (kp/sfi pinned to the tick's values, only the lit fraction
 * follows the clock) and reports the first crossing of the ladder's own
 * hysteresis pair — so a "likely opens" call and the tick that later fires
 * it share one definition of open. Physics-only v1: FutureCast has no
 * global per-band aggregation yet.
 */

import { PHYSICS_OPEN_ENTER, PHYSICS_OPEN_EXIT } from "./ladder.js";
import type { PhysicsArm } from "./physicsArm.js";

export const TIMELINE_STEP_MIN = 15;
export const TIMELINE_HORIZON_MIN = 12 * 60;

export interface OpeningTimeline {
  /**
   * Minutes until the blend first reaches PHYSICS_OPEN_ENTER; null when the
   * scope is already physics-open or never crosses inside the horizon.
   */
  opensInMin: number | null;
  /**
   * Minutes until the blend first drops below PHYSICS_OPEN_EXIT; null when
   * the scope is physics-closed or holds open through the horizon.
   */
  fadesInMin: number | null;
}

export function computeOpeningTimeline(
  physics: PhysicsArm,
  scopeType: string,
  scopeKey: string,
  band: string,
  physicsOpen: boolean,
  nowMs: number,
): OpeningTimeline {
  for (
    let min = TIMELINE_STEP_MIN;
    min <= TIMELINE_HORIZON_MIN;
    min += TIMELINE_STEP_MIN
  ) {
    const score = physics.scoreAt(
      scopeType,
      scopeKey,
      band,
      nowMs + min * 60_000,
    );
    if (!physicsOpen && score >= PHYSICS_OPEN_ENTER) {
      return { opensInMin: min, fadesInMin: null };
    }
    if (physicsOpen && score < PHYSICS_OPEN_EXIT) {
      return { opensInMin: null, fadesInMin: min };
    }
  }
  return { opensInMin: null, fadesInMin: null };
}
