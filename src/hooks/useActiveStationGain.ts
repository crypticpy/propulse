/**
 * Hook: useActiveStationGain
 *
 * Returns station gain parameters from the active station preset,
 * falling back to settingsStore.antennaType when no preset is active.
 *
 * Computes system loss from feedline attenuation and accessory gains/losses.
 */

import {
  useActivePreset,
  useUserAntennas,
  useUserFeedlines,
  useUserAccessories,
} from "@/stores/shackStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { calculateTotalFeedlineLoss } from "@/lib/data/feedlines";
import type { AntennaType } from "@/lib/data/antennas";
import type { UserAccessory } from "@/types/shack";

/** Reference frequency (20 m band center) used for feedline loss calculation */
const REFERENCE_FREQ_MHZ = 14.1;

export interface ActiveStationGain {
  antennaType: AntennaType;
  systemLossDb: number;
  txPowerWatts: number;
}

/**
 * Compute the net gain/loss contribution of a single accessory.
 * Amplifiers contribute positive gain; tuners, filters, and switches
 * contribute negative insertion loss; other categories contribute 0.
 */
function getAccessoryGainDb(accessory: UserAccessory): number {
  switch (accessory.category) {
    case "amplifier":
      return accessory.gainDb;
    case "tuner":
      return -(accessory.insertionLossDb ?? 0);
    case "filter":
      return -accessory.insertionLossDb;
    case "switch":
      return -accessory.insertionLossDb;
    default:
      return 0;
  }
}

export function useActiveStationGain(): ActiveStationGain {
  const preset = useActivePreset();
  const antennas = useUserAntennas();
  const feedlines = useUserFeedlines();
  const accessories = useUserAccessories();
  const fallbackAntennaType = useSettingsStore((s) => s.antennaType);

  if (!preset) {
    return {
      antennaType: fallbackAntennaType,
      systemLossDb: 0,
      txPowerWatts: 100,
    };
  }

  // Resolve antenna gain pattern type
  const antenna = antennas.find((a) => a.id === preset.antennaId);
  const antennaType: AntennaType =
    antenna?.gainPatternType ?? fallbackAntennaType;

  // Compute feedline loss at reference frequency
  const feedline = preset.feedlineId
    ? feedlines.find((f) => f.id === preset.feedlineId)
    : undefined;
  const feedlineLossDb = feedline
    ? calculateTotalFeedlineLoss(feedline, REFERENCE_FREQ_MHZ)
    : 0;

  // Sum accessory contributions (positive = gain, negative = loss)
  const presetAccessories = accessories.filter((a) =>
    preset.accessoryIds.includes(a.id),
  );
  const netAccessoryGainDb = presetAccessories.reduce(
    (sum, a) => sum + getAccessoryGainDb(a),
    0,
  );

  // System loss = feedline loss minus net accessory gain
  // Positive value = net loss in the system
  const systemLossDb = feedlineLossDb - netAccessoryGainDb;

  return {
    antennaType,
    systemLossDb,
    txPowerWatts: preset.operatingPowerWatts,
  };
}
