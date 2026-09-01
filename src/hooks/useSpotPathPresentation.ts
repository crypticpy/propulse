import { useMemo } from "react";
import { useActiveStationGain } from "@/hooks/useActiveStationGain";
import { useKIndex, useSolarFlux } from "@/hooks/useSolarData";
import { useSettingsStore } from "@/stores/settingsStore";
import { useUserStore } from "@/stores/userStore";
import { getAntennaGainForPath } from "@/lib/data/antennas";
import { getEnhancedBandConditions } from "@/lib/utils/bands";
import { pickOptimalBandCondition } from "@/lib/utils/optimalBand";
import { getDistance, getPathMetrics } from "@/lib/utils/path";
import type { DifficultyLevel } from "@/components/map/LocationMarker";
import type { OptimalBandSignalSummary } from "@/components/map/TargetHoverTooltip";

export interface SpotPathEndpoint {
  lat?: number;
  lon?: number;
}
export interface SpotPathPresentation {
  difficulty?: DifficultyLevel;
  distanceKm?: number;
  bearing?: number;
  optimalSignal: OptimalBandSignalSummary | null;
  unavailableReason?: string;
}

export function useSpotPathPresentation(
  endpoint: SpotPathEndpoint | null,
  displayTime: Date,
): SpotPathPresentation {
  const { station } = useUserStore();
  const { antennaType } = useActiveStationGain();
  const noiseEnvironment = useSettingsStore((state) => state.noiseEnvironment);
  const kIndexQuery = useKIndex();
  const solarFluxQuery = useSolarFlux();

  const currentKp = useMemo(() => {
    const last = kIndexQuery.data?.[kIndexQuery.data.length - 1];
    return last?.kp_index ?? 3;
  }, [kIndexQuery.data]);

  const currentSfi = useMemo(() => {
    const last = solarFluxQuery.data?.[solarFluxQuery.data.length - 1];
    return last?.flux ?? 100;
  }, [solarFluxQuery.data]);

  const estimated =
    kIndexQuery.isPlaceholderData ||
    solarFluxQuery.isPlaceholderData ||
    !kIndexQuery.data?.length ||
    !solarFluxQuery.data?.length;

  return useMemo(() => {
    if (!station) {
      return {
        optimalSignal: null,
        unavailableReason: "Set your QTH to model this path",
      };
    }
    if (
      !endpoint ||
      !Number.isFinite(endpoint.lat) ||
      !Number.isFinite(endpoint.lon)
    ) {
      return {
        optimalSignal: null,
        unavailableReason: "Spot location is unavailable",
      };
    }

    const lat = endpoint.lat!;
    const lon = endpoint.lon!;
    try {
      const metrics = getPathMetrics(station.lat, station.lon, lat, lon);
      const distanceKm = getDistance(station.lat, station.lon, lat, lon);
      const antennaGainDbi = getAntennaGainForPath(antennaType, distanceKm);
      const conditions = getEnhancedBandConditions(
        station.lat,
        station.lon,
        lat,
        lon,
        currentKp,
        currentSfi,
        displayTime,
        100,
        "FT8",
        antennaGainDbi,
        noiseEnvironment,
      );
      const best = pickOptimalBandCondition(conditions);
      return {
        difficulty: metrics.difficulty,
        distanceKm: metrics.shortPath.distance,
        bearing: metrics.shortPath.bearing,
        optimalSignal: best
          ? {
              band: best.band,
              status: best.status,
              sUnit: best.sUnit,
              snrEstimate: best.snrEstimate,
              confidence: best.signalPrediction?.confidence,
              notes: best.notes,
              isEstimated: estimated,
            }
          : null,
      };
    } catch {
      return {
        optimalSignal: null,
        unavailableReason: "Path model is unavailable for this spot",
      };
    }
  }, [
    antennaType,
    currentKp,
    currentSfi,
    displayTime,
    endpoint,
    estimated,
    noiseEnvironment,
    station,
  ]);
}
