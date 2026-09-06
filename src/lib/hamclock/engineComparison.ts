/**
 * Engine comparison — the pure verdict behind `EngineComparisonStrip`.
 *
 * The three-engine rule (spec §26.0) is the product's core claim: physics
 * (P.533-style physics model), NowCast (the trained model) and observed
 * activity are shown side by side, and the wall states whether they agree.
 * This module never touches a hook, a store or a formatted string — it only
 * turns three `EngineReading.comparable` values into AGREE / SPLIT /
 * DISAGREE plus the one-line reason, so that verdict can be unit tested on
 * its own and can never depend on how a report chose to format a number.
 */

import { BAND_RANGES } from "@/lib/data/bandRanges";
import { LADDER_RANK, type LadderState } from "@/lib/verdict/ladder";

export type EngineUnit = "MHz" | "dB" | "pct" | "spots";
export type EngineVerdict = "closed" | "marginal" | "open";

export type EngineComparable =
  | { kind: "number"; value: number; unit: EngineUnit }
  | { kind: "verdict"; verdict: EngineVerdict }
  /** Unavailable engines carry no comparable and are excluded, never
   * defaulted to zero or another engine's number. */
  | { kind: "none" };

export interface EngineReading {
  /** Display-only, already formatted — one format per column. */
  value: string;
  comparable: EngineComparable;
  /** e.g. "SNR +9 dB", "412 spots / 30 min". */
  detail?: string;
  /** 0-100, rendered as a bar; omitted when unknown. */
  confidence?: number;
  /** Drives the freshness word ladder (`formatAge`). */
  updatedAt?: Date;
  state: "ok" | "stale" | "unavailable";
}

export type EngineCompareWord =
  "AGREE" | "SPLIT" | "DISAGREE" | "NO COMPARISON";
export type EngineCompareTone = "good" | "warn" | "bad" | "info";

export interface EngineCompareResult {
  word: EngineCompareWord;
  tone: EngineCompareTone;
  reason: string;
}

/**
 * Maps one engine's numeric reading onto the shared open/marginal/closed
 * ladder a report needs in order to compare across units it does not
 * otherwise share (MHz, dB, a percentage). Each report supplies its own
 * rule — see `bandFrequencyStepClassifier` and `probabilityStepClassifier`
 * below for the two this batch ships.
 */
export type EngineStepClassifier = (
  value: number,
  unit: EngineUnit,
) => EngineVerdict;

const STEP_RANK: Record<EngineVerdict, number> = {
  closed: 0,
  marginal: 1,
  open: 2,
};

type EngineKey = "physics" | "nowcast" | "observed";

const ENGINE_LABEL: Record<EngineKey, string> = {
  physics: "physics",
  nowcast: "the model",
  observed: "observed activity",
};

function stepOf(
  reading: EngineReading,
  classify: EngineStepClassifier,
): EngineVerdict | null {
  const { comparable } = reading;
  if (comparable.kind === "none") return null;
  if (comparable.kind === "verdict") return comparable.verdict;
  return classify(comparable.value, comparable.unit);
}

function pairReason(
  a: EngineKey,
  b: EngineKey,
  delta: number,
): { word: EngineCompareWord; tone: EngineCompareTone; reason: string } {
  const labelA = ENGINE_LABEL[a];
  const labelB = ENGINE_LABEL[b];
  if (delta === 0) {
    return {
      word: "AGREE",
      tone: "good",
      reason: `${labelA} and ${labelB} agree.`,
    };
  }
  if (delta === 1) {
    return {
      word: "SPLIT",
      tone: "warn",
      reason: `${labelA} and ${labelB} are one step apart.`,
    };
  }
  return {
    word: "DISAGREE",
    tone: "bad",
    reason: `${labelA} and ${labelB} disagree outright.`,
  };
}

/**
 * Turns three engine readings into the wall's headline verdict — AGREE,
 * SPLIT or DISAGREE — plus the one-line reason an operator reads under it.
 * Pure: it only inspects `comparable`, never `value` or `state`, so the
 * strip's word can never depend on formatting or freshness, only on what
 * the engines actually computed.
 */
export function compareEngines(
  physics: EngineReading,
  nowcast: EngineReading,
  observed: EngineReading,
  classify: EngineStepClassifier,
): EngineCompareResult {
  const steps: Record<EngineKey, EngineVerdict | null> = {
    physics: stepOf(physics, classify),
    nowcast: stepOf(nowcast, classify),
    observed: stepOf(observed, classify),
  };
  const present = (Object.keys(steps) as EngineKey[]).filter(
    (key) => steps[key] !== null,
  );

  if (present.length < 2) {
    return {
      word: "NO COMPARISON",
      tone: "info",
      reason: "not enough engines report a value to compare.",
    };
  }

  if (present.length === 2) {
    const [a, b] = present;
    const delta = Math.abs(STEP_RANK[steps[a]!] - STEP_RANK[steps[b]!]);
    return pairReason(a, b, delta);
  }

  // Three present. The product's loudest case always wins first: physics
  // and the trained model landing on opposite sides of the open/closed
  // line, whatever the third engine says.
  const physicsRank = STEP_RANK[steps.physics!];
  const nowcastRank = STEP_RANK[steps.nowcast!];
  if (Math.abs(physicsRank - nowcastRank) === 2) {
    const modelSeesMore = nowcastRank > physicsRank;
    return {
      word: "DISAGREE",
      tone: "bad",
      reason: modelSeesMore
        ? "model sees an opening physics does not."
        : "physics sees an opening the model does not.",
    };
  }

  const ranks = present.map((key) => STEP_RANK[steps[key]!]);
  const spread = Math.max(...ranks) - Math.min(...ranks);
  if (spread <= 1) {
    return {
      word: "AGREE",
      tone: "good",
      reason: "physics, model and the air all point the same way.",
    };
  }

  // Spread of two without a physics/model split: when the other two engines
  // agree with each other, the third is a clean single outlier; three
  // genuinely distinct readings are a gradient rather than one bad actor,
  // so the reason names the range instead of blaming one engine.
  const outlier = present.find((key) => {
    const others = present.filter((other) => other !== key);
    const otherRanks = others.map((other) => STEP_RANK[steps[other]!]);
    return otherRanks[0] === otherRanks[1];
  });

  if (outlier) {
    return {
      word: "SPLIT",
      tone: "warn",
      reason: `${ENGINE_LABEL[outlier]} breaks from the other two.`,
    };
  }

  return {
    word: "SPLIT",
    tone: "warn",
    reason: "the three engines spread across the usable range.",
  };
}

/**
 * MUF classify rule (spec §26.1): a numeric MHz reading is judged against
 * the subject band's own frequency, not against a fixed constant, so the
 * same classifier works whichever band physics currently calls the top of
 * the ladder. `marginMHz` is the width of the "marginal" straddle either
 * side of the band edge.
 */
export function bandFrequencyStepClassifier(
  subjectBand: string,
  marginMHz = 2,
): EngineStepClassifier {
  const range = BAND_RANGES[subjectBand];
  const referenceMHz = range ? range.startKHz / 1000 : 0;
  return (value, unit) => {
    if (unit !== "MHz") return "marginal";
    if (value >= referenceMHz + marginMHz) return "open";
    if (value >= referenceMHz - marginMHz) return "marginal";
    return "closed";
  };
}

/**
 * The observed engine's reading is a Band Health ladder state, not a raw
 * number, so it maps onto the shared verdict directly instead of through a
 * classifier: hot/verified read open, stirring reads marginal, forecast and
 * closed both read closed. Shared by every report whose observed column is
 * a `useBandVerdicts` entry, so "open" always means the same ladder rank.
 */
export function ladderStepVerdict(stable: LadderState): EngineVerdict {
  if (LADDER_RANK[stable] >= LADDER_RANK.verified) return "open";
  if (stable === "stirring") return "marginal";
  return "closed";
}

/**
 * SNR / probability classify rule (spec §26.1): the 40 / 60 % lines shared
 * by every report that compares a model probability against the ladder.
 */
export function probabilityStepClassifier(
  lowPct = 40,
  highPct = 60,
): EngineStepClassifier {
  return (value, unit) => {
    if (unit !== "pct") return "marginal";
    if (value >= highPct) return "open";
    if (value >= lowPct) return "marginal";
    return "closed";
  };
}
