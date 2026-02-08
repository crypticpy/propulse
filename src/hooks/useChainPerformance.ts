/**
 * useChainPerformance — Per-node, per-band signal chain calculator.
 *
 * Walks a StationChain's nodes in order and computes gain/loss at each stage,
 * including inline component losses within feedline runs.
 * Used by the visual Builder Canvas for per-node annotations and by the
 * PerformanceSidebar for the full performance table.
 */

import { useMemo } from "react";
import {
  useStationChains,
  useActiveChain,
  useUserAntennas,
  useUserFeedlines,
  useUserAccessories,
  useUserRadios,
  useInlineComponents,
} from "@/stores/shackStore";
import type { UserAccessory } from "@/types/shack";
import type { StationChain } from "@/types/stationChain";
import type { RadioEquipment } from "@/types/radio";
import {
  calculateTotalFeedlineLoss,
  BAND_CENTER_FREQUENCIES,
} from "@/lib/data/feedlines";
import { ANTENNA_TYPES } from "@/lib/data/antennas";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface NodePerformance {
  nodeIndex: number;
  nodeType: string;
  label: string;
  /** Power arriving at this node's input (watts) */
  inputPowerWatts: number;
  /** Loss through this node (dB, positive = loss) */
  lossDb: number;
  /** Gain through this node (dB, positive = gain) — only for amplifiers/antennas */
  gainDb: number;
  /** Net effect: gainDb - lossDb */
  netDb: number;
  /** Power leaving this node's output (watts) */
  outputPowerWatts: number;
}

export interface BandChainPerformance {
  band: string;
  freqMHz: number;
  nodes: NodePerformance[];
  totalSystemGainDb: number; // sum of all netDb values (negative = net loss)
  erpWatts: number;
}

export interface ChainPerformanceResult {
  chain: StationChain | null;
  bands: BandChainPerformance[];
  bestBand: BandChainPerformance | null;
  worstBand: BandChainPerformance | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const EMPTY_RESULT: ChainPerformanceResult = {
  chain: null,
  bands: [],
  bestBand: null,
  worstBand: null,
};

/**
 * Get gain/loss contribution from a single accessory node.
 */
function getAccessoryNodeEffect(acc: UserAccessory): {
  gainDb: number;
  lossDb: number;
} {
  switch (acc.category) {
    case "amplifier":
      return { gainDb: acc.gainDb, lossDb: 0 };
    case "tuner":
      return { gainDb: 0, lossDb: acc.insertionLossDb ?? 0 };
    case "filter":
      return { gainDb: 0, lossDb: acc.insertionLossDb };
    case "switch":
      return { gainDb: 0, lossDb: acc.insertionLossDb };
    default:
      return { gainDb: 0, lossDb: 0 };
  }
}

/**
 * Get a display name for a radio, falling back to manufacturer + model.
 */
function getRadioLabel(equipment: RadioEquipment | undefined): string {
  if (!equipment) return "Unknown Radio";
  return (
    equipment.displayName ?? `${equipment.manufacturer} ${equipment.model}`
  );
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useChainPerformance(chainId?: string): ChainPerformanceResult {
  const allChains = useStationChains();
  const activeChain = useActiveChain();
  const antennas = useUserAntennas();
  const feedlines = useUserFeedlines();
  const accessories = useUserAccessories();
  const radios = useUserRadios();
  const inlineComponents = useInlineComponents();

  const targetChain = useMemo(() => {
    if (chainId) {
      return allChains.find((c) => c.id === chainId) ?? null;
    }
    return activeChain;
  }, [chainId, allChains, activeChain]);

  return useMemo(() => {
    if (!targetChain) return EMPTY_RESULT;

    // Find the antenna node to determine available bands
    const antennaNode = targetChain.nodes.find((n) => n.type === "antenna");
    if (!antennaNode || antennaNode.type !== "antenna") {
      return { ...EMPTY_RESULT, chain: targetChain };
    }

    const antenna = antennas.find((a) => a.id === antennaNode.antennaId);
    if (!antenna) {
      return { ...EMPTY_RESULT, chain: targetChain };
    }

    const bandPerformances: BandChainPerformance[] = [];

    for (const band of antenna.bands) {
      const freqMHz = BAND_CENTER_FREQUENCIES[band];
      if (freqMHz == null) continue;

      const nodePerformances: NodePerformance[] = [];
      let currentPowerWatts = targetChain.operatingPowerWatts;

      for (let i = 0; i < targetChain.nodes.length; i++) {
        const node = targetChain.nodes[i];
        let label = "";
        let gainDb = 0;
        let lossDb = 0;

        switch (node.type) {
          case "radio": {
            // Radio is the power source: 0 dB gain/loss
            const radioEntry = radios.find(
              (r) => r.userRadio.id === node.radioId,
            );
            label = getRadioLabel(radioEntry?.equipment);
            break;
          }

          case "accessory": {
            const acc = accessories.find((a) => a.id === node.accessoryId);
            if (acc) {
              label = acc.name;
              const effect = getAccessoryNodeEffect(acc);
              gainDb = effect.gainDb;
              lossDb = effect.lossDb;
            } else {
              label = "Unknown Accessory";
            }
            break;
          }

          case "feedline_run": {
            const run = targetChain.feedlineRuns.find(
              (r) => r.id === node.feedlineRunId,
            );
            if (run) {
              const feedline = feedlines.find((f) => f.id === run.feedlineId);
              if (feedline) {
                label = feedline.name;
                // Cable loss at this frequency
                const cableLossDb = calculateTotalFeedlineLoss(
                  feedline,
                  freqMHz,
                  antenna.swrByBand?.[band] ?? 1.5,
                );
                // Inline component losses
                const runInlines = inlineComponents.filter((c) =>
                  run.inlineComponentIds.includes(c.id),
                );
                const inlineLossDb = runInlines.reduce(
                  (sum, c) => sum + (c.insertionLossDb ?? 0),
                  0,
                );
                lossDb = cableLossDb + inlineLossDb;
              } else {
                label = "Unknown Feedline";
              }
            } else {
              label = "Unknown Feedline Run";
            }
            break;
          }

          case "antenna": {
            label = antenna.name;
            // Antenna gain for this band
            const antennaGainDbi =
              antenna.gainDbiOverride?.[band] ??
              ANTENNA_TYPES.find((a) => a.type === antenna.gainPatternType)
                ?.peakGainDbi ??
              0;
            gainDb = antennaGainDbi;
            lossDb = 0;
            break;
          }
        }

        const netDb = gainDb - lossDb;
        const inputPowerWatts = currentPowerWatts;
        const outputPowerWatts = inputPowerWatts * Math.pow(10, netDb / 10);

        nodePerformances.push({
          nodeIndex: i,
          nodeType: node.type,
          label,
          inputPowerWatts,
          lossDb,
          gainDb,
          netDb,
          outputPowerWatts,
        });

        currentPowerWatts = outputPowerWatts;
      }

      const totalSystemGainDb = nodePerformances.reduce(
        (sum, n) => sum + n.netDb,
        0,
      );
      // ERP = final output power after all nodes including antenna gain
      const erpWatts =
        nodePerformances.length > 0
          ? nodePerformances[nodePerformances.length - 1].outputPowerWatts
          : targetChain.operatingPowerWatts;

      bandPerformances.push({
        band,
        freqMHz,
        nodes: nodePerformances,
        totalSystemGainDb,
        erpWatts,
      });
    }

    // Sort by ERP descending
    bandPerformances.sort((a, b) => b.erpWatts - a.erpWatts);

    const bestBand = bandPerformances.length > 0 ? bandPerformances[0] : null;
    const worstBand =
      bandPerformances.length > 0
        ? bandPerformances[bandPerformances.length - 1]
        : null;

    return {
      chain: targetChain,
      bands: bandPerformances,
      bestBand,
      worstBand,
    };
  }, [targetChain, antennas, feedlines, accessories, radios, inlineComponents]);
}
