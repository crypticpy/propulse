/**
 * useStationPerformance — Per-band station performance calculator.
 *
 * Computes ERP per band by combining feedline loss, accessory gain/loss,
 * and antenna gain for the active (or specified) station preset.
 */

import { useMemo } from "react";
import {
  useShackStore,
  useActivePreset,
  useUserAntennas,
  useUserFeedlines,
  useUserAccessories,
} from "@/stores/shackStore";
import type {
  UserAntenna,
  UserFeedline,
  UserAccessory,
  StationPreset,
} from "@/types/shack";
import { calculateTotalFeedlineLoss } from "@/lib/data/feedlines";
import { ANTENNA_TYPES } from "@/lib/data/antennas";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BandPerformance {
  band: string;
  freqMHz: number;
  txPowerWatts: number;
  feedlineLossDb: number;
  accessoryGainDb: number; // positive = amplifier gain, negative = filter/switch loss
  antennaGainDbi: number;
  powerAtAntennaWatts: number;
  erpWatts: number;
}

export interface StationPerformance {
  preset: StationPreset | null;
  bands: BandPerformance[];
  bestBand: BandPerformance | null;
  worstBand: BandPerformance | null;
  totalLossRangeDb: string; // e.g., "2.1 - 8.4"
  isLoading: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BAND_CENTER_FREQ: Record<string, number> = {
  "160m": 1.9,
  "80m": 3.6,
  "60m": 5.35,
  "40m": 7.15,
  "30m": 10.125,
  "20m": 14.15,
  "17m": 18.1,
  "15m": 21.2,
  "12m": 24.93,
  "10m": 28.5,
  "6m": 50.1,
  "2m": 144.2,
  "70cm": 432.1,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeAccessoryGainDb(accessories: UserAccessory[]): number {
  let total = 0;
  for (const acc of accessories) {
    switch (acc.category) {
      case "amplifier":
        total += acc.gainDb;
        break;
      case "tuner":
        total -= acc.insertionLossDb ?? 0;
        break;
      case "filter":
        total -= acc.insertionLossDb;
        break;
      case "switch":
        total -= acc.insertionLossDb;
        break;
      default:
        // power_supply, grounding — no signal-path gain/loss
        break;
    }
  }
  return total;
}

const EMPTY_PERFORMANCE: StationPerformance = {
  preset: null,
  bands: [],
  bestBand: null,
  worstBand: null,
  totalLossRangeDb: "",
  isLoading: false,
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useStationPerformance(presetId?: string): StationPerformance {
  const activePreset = useActivePreset();
  const allPresets = useShackStore((s) => s.stationPresets);
  const antennas = useUserAntennas();
  const feedlines = useUserFeedlines();
  const accessories = useUserAccessories();

  const targetPreset = useMemo(() => {
    if (presetId) {
      return allPresets.find((p) => p.id === presetId) ?? null;
    }
    return activePreset;
  }, [presetId, allPresets, activePreset]);

  return useMemo(() => {
    if (!targetPreset) return EMPTY_PERFORMANCE;

    const antenna: UserAntenna | undefined = antennas.find(
      (a) => a.id === targetPreset.antennaId,
    );
    const feedline: UserFeedline | undefined = feedlines.find(
      (f) => f.id === targetPreset.feedlineId,
    );
    const presetAccessories: UserAccessory[] = accessories.filter((a) =>
      targetPreset.accessoryIds.includes(a.id),
    );

    if (!antenna) {
      return { ...EMPTY_PERFORMANCE, preset: targetPreset };
    }

    const txPowerWatts = targetPreset.operatingPowerWatts;
    const accessoryGainDb = computeAccessoryGainDb(presetAccessories);

    const bandPerformances: BandPerformance[] = [];

    for (const band of antenna.bands) {
      const freqMHz = BAND_CENTER_FREQ[band];
      if (freqMHz == null) continue;

      // Feedline loss
      const feedlineLossDb = feedline
        ? calculateTotalFeedlineLoss(
            feedline,
            freqMHz,
            antenna.swrByBand?.[band] ?? 1.5,
          )
        : 0;

      // Antenna gain
      const antennaGainDbi =
        antenna.gainDbiOverride?.[band] ??
        ANTENNA_TYPES.find((a) => a.type === antenna.gainPatternType)
          ?.peakGainDbi ??
        0;

      // Power at antenna after feedline loss and accessory gain/loss
      const powerAtAntennaWatts =
        txPowerWatts *
        Math.pow(10, -feedlineLossDb / 10) *
        Math.pow(10, accessoryGainDb / 10);

      // ERP with antenna gain
      const erpWatts = powerAtAntennaWatts * Math.pow(10, antennaGainDbi / 10);

      bandPerformances.push({
        band,
        freqMHz,
        txPowerWatts,
        feedlineLossDb,
        accessoryGainDb,
        antennaGainDbi,
        powerAtAntennaWatts,
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

    // Total loss range (feedline loss only, as that varies per band)
    let totalLossRangeDb = "";
    if (bandPerformances.length > 0) {
      const losses = bandPerformances.map((b) => b.feedlineLossDb);
      const minLoss = Math.min(...losses);
      const maxLoss = Math.max(...losses);
      totalLossRangeDb = `${minLoss.toFixed(1)} - ${maxLoss.toFixed(1)}`;
    }

    return {
      preset: targetPreset,
      bands: bandPerformances,
      bestBand,
      worstBand,
      totalLossRangeDb,
      isLoading: false,
    };
  }, [targetPreset, antennas, feedlines, accessories]);
}
