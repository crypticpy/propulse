/** Active station summary derived from the canonical station-chain engine. */

import { useMemo } from "react";
import type { AntennaType } from "@/lib/data/antennas";
import {
  computeStationChainPerformance,
  computeStationPresetPerformance,
} from "@/lib/station/stationChainEngine";
import { useSettingsStore } from "@/stores/settingsStore";
import {
  useActiveChain,
  useActivePreset,
  useInlineComponents,
  useUserAccessories,
  useUserAntennas,
  useUserFeedlines,
  useUserRadios,
} from "@/stores/shackStore";

export interface ActiveStationGain {
  antennaType: AntennaType;
  systemLossDb: number;
  txPowerWatts: number;
}
export function useActiveStationGain(): ActiveStationGain {
  const activeChain = useActiveChain();
  const activePreset = useActivePreset();
  const antennas = useUserAntennas();
  const feedlines = useUserFeedlines();
  const accessories = useUserAccessories();
  const radios = useUserRadios();
  const inlineComponents = useInlineComponents();
  const fallbackAntennaType = useSettingsStore((state) => state.antennaType);

  return useMemo(() => {
    const inventory = {
      radios,
      antennas,
      feedlines,
      accessories,
      inlineComponents,
    };
    const calculation = activeChain
      ? computeStationChainPerformance(activeChain, inventory)
      : computeStationPresetPerformance(activePreset, inventory);
    const representativeBand =
      calculation.bands.find((band) => band.band === "20m") ??
      calculation.bands[0];

    const antennaId = activeChain
      ? activeChain.nodes.find((node) => node.type === "antenna")
      : activePreset
        ? { type: "antenna" as const, antennaId: activePreset.antennaId }
        : undefined;
    const antenna =
      antennaId?.type === "antenna"
        ? antennas.find((candidate) => candidate.id === antennaId.antennaId)
        : undefined;

    return {
      antennaType: antenna?.gainPatternType ?? fallbackAntennaType,
      systemLossDb: representativeBand
        ? representativeBand.totalPassiveLossDb -
          representativeBand.totalAmplifierGainDb
        : 0,
      txPowerWatts: representativeBand?.txPowerWatts ?? 100,
    };
  }, [
    activeChain,
    activePreset,
    radios,
    antennas,
    feedlines,
    accessories,
    inlineComponents,
    fallbackAntennaType,
  ]);
}
