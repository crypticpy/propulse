/**
 * Consolidated SDR settings hook.
 * Replaces ~30 individual useSettingsStore selectors with a single
 * shallow-equality subscription, cutting per-render selector overhead.
 */

import { useSettingsStore } from "@/stores/settingsStore";
import { useShallow } from "zustand/react/shallow";
import type { WaterfallPaletteName } from "@/components/sdr/waterfallPalette";
import type { EqBand } from "@/lib/audio/eqTypes";

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
  sdrEqBands: EqBand[];
  sdrSweetenEnabled: boolean;
  sdrSweetenAmount: number;
  sdrExpanderEnabled: boolean;
  sdrExpanderThreshold: number;
  sdrExpanderRatio: number;
  sdrExpanderAttackMs: number;
  sdrExpanderReleaseMs: number;
  sdrExpanderRangeDb: number;
  sdrCompressorEnabled: boolean;
  sdrCompressorThreshold: number;
  sdrCompressorRatio: number;
  sdrCompressorAttackMs: number;
  sdrCompressorReleaseMs: number;
  sdrCompressorKnee: number;
  sdrCompressorMakeupDb: number;
  sdrSpectralTamingEnabled: boolean;
  sdrSpectralTamingTameAmount: number;
  sdrSpectralTamingRecoverAmount: number;
  sdrSpectralTamingSpeed: number;
  sdrLevelerEnabled: boolean;
  sdrLevelerTargetLevel: number;
  sdrLevelerSpeed: number;
  sdrLevelerMaxGainDb: number;
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
      sdrEqBands: s.sdrEqBands,
      sdrSweetenEnabled: s.sdrSweetenEnabled,
      sdrSweetenAmount: s.sdrSweetenAmount,
      sdrExpanderEnabled: s.sdrExpanderEnabled,
      sdrExpanderThreshold: s.sdrExpanderThreshold,
      sdrExpanderRatio: s.sdrExpanderRatio,
      sdrExpanderAttackMs: s.sdrExpanderAttackMs,
      sdrExpanderReleaseMs: s.sdrExpanderReleaseMs,
      sdrExpanderRangeDb: s.sdrExpanderRangeDb,
      sdrCompressorEnabled: s.sdrCompressorEnabled,
      sdrCompressorThreshold: s.sdrCompressorThreshold,
      sdrCompressorRatio: s.sdrCompressorRatio,
      sdrCompressorAttackMs: s.sdrCompressorAttackMs,
      sdrCompressorReleaseMs: s.sdrCompressorReleaseMs,
      sdrCompressorKnee: s.sdrCompressorKnee,
      sdrCompressorMakeupDb: s.sdrCompressorMakeupDb,
      sdrSpectralTamingEnabled: s.sdrSpectralTamingEnabled,
      sdrSpectralTamingTameAmount: s.sdrSpectralTamingTameAmount,
      sdrSpectralTamingRecoverAmount: s.sdrSpectralTamingRecoverAmount,
      sdrSpectralTamingSpeed: s.sdrSpectralTamingSpeed,
      sdrLevelerEnabled: s.sdrLevelerEnabled,
      sdrLevelerTargetLevel: s.sdrLevelerTargetLevel,
      sdrLevelerSpeed: s.sdrLevelerSpeed,
      sdrLevelerMaxGainDb: s.sdrLevelerMaxGainDb,
    })),
  );
}
