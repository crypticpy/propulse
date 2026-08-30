/**
 * Band Health ladder (BH2) — pure evaluation of the five-state verified
 * ladder from DEV-PLAN-BAND-HEALTH §3:
 *
 *   closed < forecast < stirring < verified < hot
 *
 * The ladder is a total order over evidence strength. Each raw evaluation
 * classifies one scope (global band, regional band, or DX field pair) from
 * deduplicated observation counts; the hold machine (stateMachine.ts,
 * advanceRanked) turns the raw stream into a stable state, so "hot"
 * requires its rising trend to survive the 5-min upgrade hold and any
 * downgrade must persist the full 20-min hold.
 *
 * "Surprise" is NOT a ladder state: it is an orthogonal flag set whenever
 * real activity (stirring or better) appears while the blended forecast
 * said closed. It renders as a modifier and is logged as an event.
 *
 * Observation identity (§3): one observation = one deduplicated
 * (tx, rx, band, 5-min bucket) tuple; reporters = distinct rx callsigns
 * after dedup. Dedup happens server-side — inputs here are already deduped.
 *
 * The collector ports this evaluation for the canonical server-side ladder
 * (collector/src/verdict/ladder.ts) — keep the two in sync.
 */

import {
  PHYSICS_OPEN_ENTER,
  PHYSICS_OPEN_EXIT,
} from "./verdictEngine";
import { computeTrend, type ActivityTrend } from "@/lib/utils/bandActivity";

export type LadderState =
  | "closed"
  | "forecast"
  | "stirring"
  | "verified"
  | "hot";

export const LADDER_RANK: Record<LadderState, number> = {
  closed: 0,
  forecast: 1,
  stirring: 2,
  verified: 3,
  hot: 4,
};

/**
 * Verified bar (§3): ENTER at ≥6 deduplicated observations from ≥3 unique
 * reporters in the trailing 20 min; EXIT well below enter (≤2 obs) so a
 * pause between spots can't flap "verified" off the wall. Reporters only
 * gate entry — once verified, the obs floor alone keeps it.
 */
export const VERIFIED_OBS_ENTER = 6;
export const VERIFIED_REPORTERS_ENTER = 3;
export const VERIFIED_OBS_EXIT = 2;

/** Stirring: any real deduplicated observation in the window. */
export const STIRRING_OBS_ENTER = 1;

export interface LadderInputs {
  /** 0..1 blended forecast p_open for this scope right now */
  physicsScore: number;
  /** Deduplicated observations in the trailing 20 min */
  obs20m: number;
  /** Distinct reporters behind obs20m */
  reporters20m: number;
  /** Raw counts for the two 10-min trend windows */
  count10mRecent: number;
  count10mPrior: number;
}

/** Previous edge states, for hysteresis. Omit on first evaluation. */
export interface LadderEdgeState {
  physicsOpen: boolean;
  verified: boolean;
}

export interface LadderEvaluation {
  state: LadderState;
  /** Activity the forecast did not predict (stirring+ while p_open closed) */
  surprise: boolean;
  physicsOpen: boolean;
  verified: boolean;
  trend: ActivityTrend;
  /** Human-readable factor lines for the why popover / event log */
  why: string[];
}

export function evaluateLadder(
  inputs: LadderInputs,
  prev?: LadderEdgeState,
): LadderEvaluation {
  const { physicsScore, obs20m, reporters20m, count10mRecent, count10mPrior } =
    inputs;

  const physicsOpen = prev?.physicsOpen
    ? physicsScore >= PHYSICS_OPEN_EXIT
    : physicsScore >= PHYSICS_OPEN_ENTER;

  const verified = prev?.verified
    ? obs20m > VERIFIED_OBS_EXIT
    : obs20m >= VERIFIED_OBS_ENTER && reporters20m >= VERIFIED_REPORTERS_ENTER;

  const trend = computeTrend(count10mRecent, count10mPrior);

  let state: LadderState;
  if (verified && trend === "rising") state = "hot";
  else if (verified) state = "verified";
  else if (obs20m >= STIRRING_OBS_ENTER) state = "stirring";
  else if (physicsOpen) state = "forecast";
  else state = "closed";

  const surprise = LADDER_RANK[state] >= LADDER_RANK.stirring && !physicsOpen;

  const why: string[] = [
    `Forecast p_open ${physicsScore.toFixed(2)} → ${
      physicsOpen ? "open" : "closed"
    } (enter ≥${PHYSICS_OPEN_ENTER}, exit <${PHYSICS_OPEN_EXIT})`,
    `${obs20m} obs from ${reporters20m} reporter${
      reporters20m === 1 ? "" : "s"
    } in 20 min → ${
      verified ? "verified" : obs20m >= STIRRING_OBS_ENTER ? "stirring" : "none"
    } (verify ≥${VERIFIED_OBS_ENTER} obs / ≥${VERIFIED_REPORTERS_ENTER} reporters)`,
    `Rate ${count10mRecent} vs ${count10mPrior} prior 10 min → ${trend}`,
  ];
  if (surprise) {
    why.push("Activity the forecast did not predict — possible Es/TEP opening");
  }

  return { state, surprise, physicsOpen, verified, trend, why };
}
