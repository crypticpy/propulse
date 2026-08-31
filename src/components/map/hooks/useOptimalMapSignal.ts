import { useMemo } from "react";
import { useActiveStationGain } from "@/hooks/useActiveStationGain";
import { useKIndex, useSolarFlux } from "@/hooks/useSolarData";
import { getAntennaGainForPath } from "@/lib/data/antennas";
import { pickOptimalBandCondition } from "@/lib/utils/optimalBand";
import { getEnhancedBandConditions } from "@/lib/utils/bands";
import { getDistance } from "@/lib/utils/path";
import { useSettingsStore } from "@/stores/settingsStore";

interface MapCoordinate {
  lat: number;
  lon: number;
}

interface UseOptimalMapSignalOptions {
  station: MapCoordinate | null;
  target: MapCoordinate | null;
  displayTime: Date;
  /** Preserve projection-specific lazy behavior, such as globe hover details. */
  enabled?: boolean;
}

/**
 * Produce the target tooltip's best-band signal estimate from the enhanced
 * propagation engine. The three renderers previously duplicated this entire
 * data/default/calculation pipeline, making subtle model changes a 3× edit.
 */
export function useOptimalMapSignal({
  station,
  target,
  displayTime,
  enabled = true,
}: UseOptimalMapSignalOptions) {
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

  const isEstimatedConditions =
    kIndexQuery.isPlaceholderData ||
    solarFluxQuery.isPlaceholderData ||
    !kIndexQuery.data?.length ||
    !solarFluxQuery.data?.length;

  return useMemo(() => {
    if (!enabled || !station || !target) return null;
    try {
      const distance = getDistance(
        station.lat,
        station.lon,
        target.lat,
        target.lon,
      );
      const antennaGainDbi = getAntennaGainForPath(antennaType, distance);
      const conditions = getEnhancedBandConditions(
        station.lat,
        station.lon,
        target.lat,
        target.lon,
        currentKp,
        currentSfi,
        displayTime,
        100,
        "FT8",
        antennaGainDbi,
        noiseEnvironment,
      );
      const best = pickOptimalBandCondition(conditions);
      if (!best) return null;
      return {
        band: best.band,
        status: best.status,
        sUnit: best.sUnit,
        snrEstimate: best.snrEstimate,
        confidence: best.signalPrediction?.confidence,
        notes: best.notes,
        isEstimated: isEstimatedConditions,
      };
    } catch {
      // A tooltip is supplementary; invalid coordinates or model inputs must
      // never take down the renderer that owns it.
      return null;
    }
  }, [
    enabled,
    station,
    target,
    antennaType,
    currentKp,
    currentSfi,
    displayTime,
    noiseEnvironment,
    isEstimatedConditions,
  ]);
}
