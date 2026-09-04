/** Active station summary derived from the canonical station-chain engine. */

import { useMemo } from "react";
import type { AntennaType } from "@/lib/data/antennas";
import { useActiveMode } from "@/hooks/useActiveBandMode";
import {
  computeStationChainPerformance,
  computeStationPresetPerformance,
} from "@/lib/station/stationChainEngine";
import {
  physicsArgsForPath,
  toPhysicsMode,
  type PhysicsMode,
} from "@/lib/station/stationPhysics";
import type { ForecastStationParams } from "@/lib/utils/bands";
import { getDistance } from "@/lib/utils/path";
import { useSettingsStore } from "@/stores/settingsStore";
import {
  useActiveChain,
  useActivePreset,
  useStationInventory,
} from "@/stores/shackStore";

export interface ActiveStationGain {
  antennaType: AntennaType;
  systemLossDb: number;
  txPowerWatts: number;
  erpWatts: number;
  physicsMode: PhysicsMode;
}
export function useActiveStationGain(): ActiveStationGain {
  const activeChain = useActiveChain();
  const activePreset = useActivePreset();
  const inventory = useStationInventory();
  const fallbackAntennaType = useSettingsStore((state) => state.antennaType);
  const liveMode = useActiveMode();

  return useMemo(() => {
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
        ? inventory.antennas.find(
            (candidate) => candidate.id === antennaId.antennaId,
          )
        : undefined;

    return {
      antennaType: antenna?.gainPatternType ?? fallbackAntennaType,
      systemLossDb: representativeBand
        ? representativeBand.totalPassiveLossDb -
          representativeBand.totalAmplifierGainDb
        : 0,
      txPowerWatts: representativeBand?.txPowerWatts ?? 100,
      erpWatts: representativeBand?.erpWatts ?? 0,
      physicsMode: toPhysicsMode(liveMode),
    };
  }, [
    activeChain,
    activePreset,
    inventory,
    fallbackAntennaType,
    liveMode,
  ]);
}

export function useForecastStationParams(
  homeLat?: number,
  homeLon?: number,
  targetLat?: number,
  targetLon?: number,
): ForecastStationParams | undefined {
  const { antennaType, txPowerWatts, systemLossDb, physicsMode } =
    useActiveStationGain();
  const noiseEnvironment = useSettingsStore((state) => state.noiseEnvironment);

  return useMemo(() => {
    if (
      homeLat == null ||
      homeLon == null ||
      targetLat == null ||
      targetLon == null
    ) {
      return undefined;
    }
    const distance = getDistance(homeLat, homeLon, targetLat, targetLon);
    const physics = physicsArgsForPath(
      antennaType,
      distance,
      systemLossDb,
      txPowerWatts,
      physicsMode,
    );
    return {
      txPowerWatts: physics.txPowerWatts,
      mode: physics.mode,
      antennaGainDbi: physics.antennaGainDbi,
      noiseEnvironment,
    };
  }, [
    antennaType,
    homeLat,
    homeLon,
    noiseEnvironment,
    physicsMode,
    systemLossDb,
    targetLat,
    targetLon,
    txPowerWatts,
  ]);
}
