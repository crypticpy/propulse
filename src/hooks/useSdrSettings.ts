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
      waterfallPalette: s.sdrWaterfallPalette ?? "classic",
      waterfallMinDb: s.sdrWaterfallMinDb ?? -125,
      waterfallMaxDb: s.sdrWaterfallMaxDb ?? -40,
      waterfallSpeed: s.sdrWaterfallSpeed ?? 1,
      waterfallInterpolation: s.sdrWaterfallInterpolation ?? "nearest",
      waterfallGamma: s.sdrWaterfallGamma ?? 1.0,
      waterfallRowHeight: s.sdrWaterfallRowHeight ?? 1,

      spectrumPeakHold: s.sdrSpectrumPeakHold ?? true,
      spectrumGradientFill: s.sdrSpectrumGradientFill ?? true,
      spectrumBgColor: s.sdrSpectrumBgColor ?? "#000000",
      spectrumGridLines: s.sdrSpectrumGridLines ?? 3,
      spectrumVerticalGridLines: s.sdrSpectrumVerticalGridLines ?? 6,
      spectrumGridOpacity: s.sdrSpectrumGridOpacity ?? 0.08,
      spectrumSmoothing: s.sdrSpectrumSmoothing ?? 0,
      spectrumLineColor: s.sdrSpectrumLineColor ?? "auto",
      spectrumLineWidth: s.sdrSpectrumLineWidth ?? 2,
      spectrumFillOpacity: s.sdrSpectrumFillOpacity ?? 0.3,
      spectrumLineShadow: s.sdrSpectrumLineShadow ?? true,
      spectrumLineShadowBlur: s.sdrSpectrumLineShadowBlur ?? 8,

      passbandBlendMode: s.sdrPassbandBlendMode ?? "screen",
      passbandOpacity: s.sdrPassbandOpacity ?? 0.08,
      sliceBgColor: s.sdrSliceBgColor ?? "rgba(0, 40, 60, 0.85)",
      tuningStepHz: s.sdrTuningStepHz ?? 1000,
      tuningLineColor: s.sdrTuningLineColor ?? "#00ebff",
      tuningArrowColor: s.sdrTuningArrowColor ?? "#00ebff",

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
