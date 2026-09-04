import type { CongestionContext, CongestionLevel } from "@/lib/contest/contestCongestionModel";
import {
  estimateCongestion,
  getAlternatives,
} from "@/lib/contest/contestCongestionModel";
import type { BandCandidate, WizardMode, WizardOptimizeFor } from "./types";

const LEVEL_PENALTY: Record<CongestionLevel, number> = {
  clear: 0,
  light: 5,
  moderate: 15,
  heavy: 35,
  extreme: 55,
};

export interface ContestRankedCandidate extends BandCandidate {
  contestImpact: CongestionLevel;
  contestScore: number;
  contestDescription: string;
  rankScore: number;
}

export interface ContestRankResult {
  candidates: ContestRankedCandidate[];
  best: ContestRankedCandidate | null;
  alternatives: Array<{
    band: string;
    reason: string;
    congestionLevel: CongestionLevel;
  }>;
  optimizeFor: WizardOptimizeFor;
}

function propScore(c: BandCandidate): number {
  // Higher is better: prefer within ceiling, lower watts, higher SNR
  const ceilingBonus = c.withinCeiling ? 1000 : 0;
  return ceilingBonus - c.requiredWatts + c.snrEstimate * 2;
}

/**
 * Re-rank wizard candidates with contest congestion weight.
 * contestWeight 0 = pure propagation; 1 = pure clear-spectrum.
 */
export function applyContestCongestionRanking(params: {
  candidates: BandCandidate[];
  mode: WizardMode;
  optimizeFor: WizardOptimizeFor;
  congestionContext: CongestionContext;
  contestWeight?: number;
}): ContestRankResult {
  const {
    candidates,
    mode,
    optimizeFor,
    congestionContext,
    contestWeight = optimizeFor === "propagation"
      ? 0
      : optimizeFor === "clear"
        ? 0.85
        : 0.3,
  } = params;

  const ranked: ContestRankedCandidate[] = candidates.map((c) => {
    const est = estimateCongestion(c.band, mode, congestionContext);
    const p = propScore(c);
    const congestionPenalty = LEVEL_PENALTY[est.level];
    const rankScore = p * (1 - contestWeight) - congestionPenalty * contestWeight;
    return {
      ...c,
      contestImpact: est.level,
      contestScore: est.score,
      contestDescription: est.description,
      rankScore,
    };
  });

  ranked.sort((a, b) => b.rankScore - a.rankScore);

  const alts = getAlternatives(ranked[0]?.band ?? "20m", congestionContext).map(
    (a) => ({
      band: a.band,
      reason: a.reason,
      congestionLevel: a.congestion.level,
    }),
  );

  return {
    candidates: ranked,
    best: ranked[0] ?? null,
    alternatives: alts,
    optimizeFor,
  };
}
