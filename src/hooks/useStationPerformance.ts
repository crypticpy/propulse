/** React adapter for legacy station presets using the canonical chain engine. */

import { useMemo } from "react";
import {
  useActivePreset,
  useInlineComponents,
  useShackStore,
  useUserAccessories,
  useUserAntennas,
  useUserFeedlines,
  useUserRadios,
} from "@/stores/shackStore";
import {
  computeStationPresetPerformance,
  type BandChainPerformance,
  type PresetPerformanceResult,
} from "@/lib/station/stationChainEngine";
import type { StationPreset } from "@/types/shack";

export type BandPerformance = BandChainPerformance;

export interface StationPerformance extends PresetPerformanceResult {
  preset: StationPreset | null;
  isLoading: boolean;
}
export function useStationPerformance(presetId?: string): StationPerformance {
  const activePreset = useActivePreset();
  const allPresets = useShackStore((state) => state.stationPresets);
  const antennas = useUserAntennas();
  const feedlines = useUserFeedlines();
  const accessories = useUserAccessories();
  const radios = useUserRadios();
  const inlineComponents = useInlineComponents();

  const targetPreset = useMemo(
    () =>
      presetId
        ? (allPresets.find((preset) => preset.id === presetId) ?? null)
        : activePreset,
    [activePreset, allPresets, presetId],
  );

  return useMemo(
    () => ({
      ...computeStationPresetPerformance(targetPreset, {
        radios,
        antennas,
        feedlines,
        accessories,
        inlineComponents,
      }),
      isLoading: false,
    }),
    [
      targetPreset,
      radios,
      antennas,
      feedlines,
      accessories,
      inlineComponents,
    ],
  );
}
