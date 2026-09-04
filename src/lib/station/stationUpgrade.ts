import {
  BAND_CENTER_FREQUENCIES,
  calculateTotalFeedlineLoss,
} from "@/lib/data/feedlines";
import type { StationInventory } from "@/lib/station/stationChainEngine";
import type { BandChainPerformance } from "@/lib/station/stationChainEngine";
import type { StationChain } from "@/types/stationChain";
import type { UserFeedline } from "@/types/shack";

export interface StationUpgradeSuggestion {
  band: string;
  savingDb: number;
  message: string;
}

const UPGRADE_CABLE: UserFeedline["feedlineType"] = "lmr400";

function cloneFeedlineAsLmr400(feedline: UserFeedline): UserFeedline {
  return { ...feedline, feedlineType: UPGRADE_CABLE };
}

/** Quantified coax upgrade vs LMR-400 at the same length, highest-loss HF band. */
export function suggestFeedlineUpgrade(
  chain: StationChain | null,
  inventory: StationInventory,
  bands: BandChainPerformance[],
): StationUpgradeSuggestion | null {
  if (!chain || bands.length === 0) return null;
  const runNode = chain.nodes.find((node) => node.type === "feedline_run");
  if (runNode?.type !== "feedline_run") return null;
  const run = chain.feedlineRuns.find((item) => item.id === runNode.feedlineRunId);
  if (!run) return null;
  const feedline = inventory.feedlines.find((item) => item.id === run.feedlineId);
  if (!feedline || feedline.feedlineType === UPGRADE_CABLE) return null;

  const worst = [...bands].sort((a, b) => b.feedlineLossDb - a.feedlineLossDb)[0];
  const freqMHz = BAND_CENTER_FREQUENCIES[worst.band];
  if (freqMHz == null) return null;

  const currentLoss = calculateTotalFeedlineLoss(feedline, freqMHz, 1.5);
  const upgradedLoss = calculateTotalFeedlineLoss(
    cloneFeedlineAsLmr400(feedline),
    freqMHz,
    1.5,
  );
  const savingDb = currentLoss - upgradedLoss;
  if (savingDb < 0.4) return null;

  return {
    band: worst.band,
    savingDb,
    message: `This ${feedline.lengthFeet} ft of ${feedline.name} costs ${worst.feedlineLossDb.toFixed(1)} dB on ${worst.band}. LMR-400 at the same length would save ${savingDb.toFixed(1)} dB.`,
  };
}

export function openingTiedChallenge(
  suggestion: StationUpgradeSuggestion | null,
  bandOpen: boolean,
): string | null {
  if (!suggestion || !bandOpen) return null;
  return `${suggestion.band} is open. ${suggestion.message}`;
}
