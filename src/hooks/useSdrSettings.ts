/**
 * Consolidated SDR settings hook.
 * Replaces ~30 individual useSettingsStore selectors with a single
 * shallow-equality subscription, cutting per-render selector overhead.
 */

import { useSettingsStore } from "@/stores/settingsStore";
import { useShallow } from "zustand/react/shallow";
import type { WaterfallPaletteName } from "@/components/sdr/waterfallPalette";

// ─── Exported type ───────────────────────────────────────────────────────────

export interface SdrSettings {
  waterfallPalette: WaterfallPaletteName;
  waterfallMinDb: number;
  waterfallMaxDb: number;
  waterfallSpeed: number;
  waterfallInterpolation: "nearest" | "linear";
  waterfallGamma: number;
  waterfallRowHeight: number;

  spectrumPeakHold: boolean;
  spectrumGradientFill: boolean;
  spectrumBgColor: string;
  spectrumGridLines: number;
  spectrumVerticalGridLines: number;
  spectrumGridOpacity: number;
  spectrumSmoothing: number;
  spectrumLineColor: string;
  spectrumLineWidth: number;
  spectrumFillOpacity: number;
  spectrumLineShadow: boolean;
  spectrumLineShadowBlur: number;

  passbandBlendMode: string;
  passbandOpacity: number;
  sliceBgColor: string;
  tuningStepHz: number;
  tuningLineColor: string;
  tuningArrowColor: string;

  sdrNoiseGateEnabled: boolean;
  sdrNoiseGateThreshold: number;
  sdrNrEnabled: boolean;
  sdrNrLevel: number;
  sdrNotchFilters: Array<{
    id: string;
    freqHz: number;
    q: number;
    enabled: boolean;
  }>;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useSdrSettings(): SdrSettings {
  return useSettingsStore(
    useShallow((s) => ({
      waterfallPalette: s.sdrWaterfallPalette,
      waterfallMinDb: s.sdrWaterfallMinDb,
      waterfallMaxDb: s.sdrWaterfallMaxDb,
      waterfallSpeed: s.sdrWaterfallSpeed,
      waterfallInterpolation: s.sdrWaterfallInterpolation,
      waterfallGamma: s.sdrWaterfallGamma,
      waterfallRowHeight: s.sdrWaterfallRowHeight,

      spectrumPeakHold: s.sdrSpectrumPeakHold,
      spectrumGradientFill: s.sdrSpectrumGradientFill,
      spectrumBgColor: s.sdrSpectrumBgColor,
      spectrumGridLines: s.sdrSpectrumGridLines,
      spectrumVerticalGridLines: s.sdrSpectrumVerticalGridLines,
      spectrumGridOpacity: s.sdrSpectrumGridOpacity,
      spectrumSmoothing: s.sdrSpectrumSmoothing,
      spectrumLineColor: s.sdrSpectrumLineColor,
      spectrumLineWidth: s.sdrSpectrumLineWidth,
      spectrumFillOpacity: s.sdrSpectrumFillOpacity,
      spectrumLineShadow: s.sdrSpectrumLineShadow,
      spectrumLineShadowBlur: s.sdrSpectrumLineShadowBlur,

      passbandBlendMode: s.sdrPassbandBlendMode,
      passbandOpacity: s.sdrPassbandOpacity,
      sliceBgColor: s.sdrSliceBgColor,
      tuningStepHz: s.sdrTuningStepHz,
      tuningLineColor: s.sdrTuningLineColor,
      tuningArrowColor: s.sdrTuningArrowColor,

      sdrNoiseGateEnabled: s.sdrNoiseGateEnabled,
      sdrNoiseGateThreshold: s.sdrNoiseGateThreshold,
      sdrNrEnabled: s.sdrNrEnabled,
      sdrNrLevel: s.sdrNrLevel,
      sdrNotchFilters: s.sdrNotchFilters,
    })),
  );
}
