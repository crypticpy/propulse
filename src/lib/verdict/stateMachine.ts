/**
 * Band Verdict state machine (E4) — pure hold-to-confirm reducer that
 * turns the raw per-evaluation verdict stream into a stable verdict
 * that doesn't flap.
 *
 * Asymmetric holds, both configurable:
 *  - UPGRADES (toward more open, e.g. closed→likely, likely→confirmed,
 *    closed→surprise) promote after a short consistent hold — a real
 *    opening backed by spots should surface fast.
 *  - DOWNGRADES (toward closed) require the full hold — a band must
 *    stay quiet/poor for the whole period before we call it worse, so
 *    a pause between spots never flaps "confirmed" off the wall.
 *
 * The reducer is pure: (state, rawVerdict, now) → state. Persistence
 * and the decision log live in the store layer, not here.
 */

import { VERDICT_RANK, type BandVerdict } from "./verdictEngine";

/** Downgrades must persist this long before they stick (dev plan: 20 min) */
export const DOWNGRADE_HOLD_MS = 20 * 60 * 1000;
/** Upgrades confirm after this much consistent evidence */
export const UPGRADE_HOLD_MS = 5 * 60 * 1000;

/** Hold machine over any totally ordered verdict vocabulary (BH2). */
export interface RankedMachineState<T extends string> {
  /** The stable verdict shown to the user */
  stable: T;
  /** When `stable` was last promoted */
  stableSince: number;
  /** Differing raw verdict currently on hold, if any */
  candidate: T | null;
  /** When the current candidate streak started */
  candidateSince: number;
}

export type VerdictMachineState = RankedMachineState<BandVerdict>;

export interface RankedFlip<T extends string> {
  from: T;
  to: T;
  at: number;
}

export type VerdictFlip = RankedFlip<BandVerdict>;

export interface RankedAdvanceResult<T extends string> {
  state: RankedMachineState<T>;
  /** Set when this advance promoted a new stable verdict */
  flip: RankedFlip<T> | null;
}

export type AdvanceResult = RankedAdvanceResult<BandVerdict>;

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

export const initialMachineState = initialRankedState<BandVerdict>;

export function holdForRanked<T extends string>(
  rank: Record<T, number>,
  from: T,
  to: T,
): number {
  return rank[to] > rank[from] ? UPGRADE_HOLD_MS : DOWNGRADE_HOLD_MS;
}

export function holdFor(from: BandVerdict, to: BandVerdict): number {
  return holdForRanked(VERDICT_RANK, from, to);
}

/**
 * Feed one raw verdict evaluation into the machine.
 *
 * Raw agreeing with stable clears any candidate (the streak broke).
 * A raw differing from stable starts/continues a candidate streak;
 * when the streak's age reaches the applicable hold, it promotes.
 */
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

  // New or switched candidate: restart the streak
  if (state.candidate !== raw) {
    return {
      state: { ...state, candidate: raw, candidateSince: now },
      flip: null,
    };
  }

  // Continuing streak: promote once it has aged past the hold
  const held = now - state.candidateSince;
  if (held >= holdForRanked(rank, state.stable, raw)) {
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

export function advance(
  state: VerdictMachineState,
  raw: BandVerdict,
  now: number,
): AdvanceResult {
  return advanceRanked(VERDICT_RANK, state, raw, now);
}
