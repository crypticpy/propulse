/**
 * Band Health ladder — collector port of src/lib/verdict/ladder.ts and the
 * ranked hold machine from src/lib/verdict/stateMachine.ts (keep all three
 * in sync; same precedent as the computePhysicsBandScores port in
 * collectors/forecastSnapshot.ts).
 *
 * This is the CANONICAL ladder (DEV-PLAN-BAND-HEALTH §6): the collector
 * evaluates it per tick for the deterministic scopes (global per band,
 * regional per band × continent), appends transitions to verdict_events
 * pre-outcome, and serves the stable states from verdict_states. Client
 * ladders are UI-only and never the scored record.
 */

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

// Thresholds — mirror src/lib/verdict/verdictEngine.ts + ladder.ts
export const PHYSICS_OPEN_ENTER = 0.4;
export const PHYSICS_OPEN_EXIT = 0.3;
export const VERIFIED_OBS_ENTER = 6;
export const VERIFIED_REPORTERS_ENTER = 3;
export const VERIFIED_OBS_EXIT = 2;
export const STIRRING_OBS_ENTER = 1;

// Trend — mirror src/lib/utils/bandActivity.ts computeTrend
export const TREND_DEAD_BAND = 0.2;
export type ActivityTrend = "rising" | "steady" | "falling";

export function computeTrend(
  count10mRecent: number,
  count10mPrior: number,
): ActivityTrend {
  if (count10mPrior === 0) {
    return count10mRecent > 0 ? "rising" : "steady";
  }
  const ratio = count10mRecent / count10mPrior;
  if (ratio > 1 + TREND_DEAD_BAND) return "rising";
  if (ratio < 1 - TREND_DEAD_BAND) return "falling";
  return "steady";
}

export interface LadderInputs {
  physicsScore: number;
  obs20m: number;
  reporters20m: number;
  count10mRecent: number;
  count10mPrior: number;
}

export interface LadderEdgeState {
  physicsOpen: boolean;
  verified: boolean;
}

export interface LadderEvaluation {
  state: LadderState;
  surprise: boolean;
  physicsOpen: boolean;
  verified: boolean;
  trend: ActivityTrend;
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

  return { state, surprise, physicsOpen, verified, trend };
}

// ─── Hold machine (mirror src/lib/verdict/stateMachine.ts) ──────────────────

export const DOWNGRADE_HOLD_MS = 20 * 60 * 1000;
export const UPGRADE_HOLD_MS = 5 * 60 * 1000;

export interface RankedMachineState<T extends string> {
  stable: T;
  stableSince: number;
  candidate: T | null;
  candidateSince: number;
}

export interface RankedFlip<T extends string> {
  from: T;
  to: T;
  at: number;
}

export interface RankedAdvanceResult<T extends string> {
  state: RankedMachineState<T>;
  flip: RankedFlip<T> | null;
}

export function initialRankedState<T extends string>(
  verdict: T,
  now: number,
): RankedMachineState<T> {
  return {
    stable: verdict,
    stableSince: now,
    candidate: null,
    candidateSince: 0,
  };
}

export function advanceRanked<T extends string>(
  rank: Record<T, number>,
  state: RankedMachineState<T>,
  raw: T,
  now: number,
): RankedAdvanceResult<T> {
  if (raw === state.stable) {
    if (state.candidate === null) return { state, flip: null };
    return {
      state: { ...state, candidate: null, candidateSince: 0 },
      flip: null,
    };
  }

  if (state.candidate !== raw) {
    return {
      state: { ...state, candidate: raw, candidateSince: now },
      flip: null,
    };
  }

  const held = now - state.candidateSince;
  const hold =
    rank[raw] > rank[state.stable] ? UPGRADE_HOLD_MS : DOWNGRADE_HOLD_MS;
  if (held >= hold) {
    const flip: RankedFlip<T> = { from: state.stable, to: raw, at: now };
    return {
      state: {
        stable: raw,
        stableSince: now,
        candidate: null,
        candidateSince: 0,
      },
      flip,
    };
  }

  return { state, flip: null };
}
