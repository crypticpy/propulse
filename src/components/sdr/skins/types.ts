/**
 * Skin system types for the SDR Console.
 * Each skin is a React component that receives SdrSkinProps and renders a layout.
 */

import type {
  RadioState,
  DeviceInfo,
  RadioBinaryFrame,
  DaemonStatusMessage,
  ClusterSpotMessage,
  WsjtxStatus,
  WsjtxDecode,
} from "@/lib/radio/protocol";
import type {
  WaterfallPaletteName,
  WaterfallView,
  TuningOverlay,
} from "@/components/sdr/waterfallPalette";
import type {
  EqBand,
  EqFilterType,
  EqBandCategory,
  EqSlope,
} from "@/lib/audio/eqTypes";
import type { Ft8EnrichedDecode } from "@/lib/ft8/ft8EnrichedDecode";
import type { Ft8BandPreset } from "@/lib/ft8/ft8BandPresets";
import type { TimeSyncResult } from "@/lib/ft8/timeSyncCheck";

// ─── Skin name type ─────────────────────────────────────────────────────────

export type SdrSkinName = "classic" | "flexible" | "fate";

// ─── FFT frame helper type ──────────────────────────────────────────────────

export type FftFrame = Extract<RadioBinaryFrame, { kind: "fft" }>;

// ─── Display helpers (shared by all skins) ──────────────────────────────────

export function formatHz(hz: number): string {
  if (!Number.isFinite(hz)) return "\u2014";
  return `${(hz / 1_000_000).toFixed(6)} MHz`;
}

export function formatUtcMsSinceMidnight(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "\u2014";
  const totalSeconds = Math.floor(ms / 1000);
  const hh = Math.floor(totalSeconds / 3600) % 24;
  const mm = Math.floor((totalSeconds % 3600) / 60);
  const ss = totalSeconds % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}Z`;
}

// ─── Sub-interfaces ─────────────────────────────────────────────────────────

export interface SdrRadioStateProps {
  effectiveState: RadioState | null;
  smeterDbm: number | undefined;
  fftEnabled: boolean;
  audioEnabled: boolean;
  selectedDevice: DeviceInfo | null;
  connectedDeviceId: string | null;
  canControlConnected: boolean;
  canStreamFft: boolean;
  canStreamAudio: boolean;
  daemonConnected: boolean;
  daemonError: string | null;
  lastResponseError: string | null;
  rit?: { enabled: boolean; offsetHz: number };
  xit?: { enabled: boolean; offsetHz: number };
  split?: boolean;
  anf?: boolean;
  qsk?: boolean;
  vox?: boolean;
  lock?: boolean;
  txAntenna?: string;
  txMeter?: { powerW?: number; swr?: number; alc?: number };
  cwSpeed?: number;
  ifShift?: number;
  agcMode?: number;
}

export interface SdrFftDataProps {
  lastFftFrame: FftFrame | null;
  /** High-resolution FFT derived from the audio stream (~11.7 Hz/bin). */
  audioFftFrame: FftFrame | null;
  waterfallView: WaterfallView | null;
  tuningOverlay: TuningOverlay | null;
  waterfallOverlays: Array<{
    hz: number;
    label?: string;
    color?: "cyan" | "orange" | "red" | "green";
  }>;
}

export interface SdrSpectrumSettings {
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
  /** Tuning indicator line color (CSS hex) */
  tuningLineColor: string;
  /** Tuning indicator arrow color (CSS hex) */
  tuningArrowColor: string;
}

export interface SdrWaterfallSettings {
  waterfallPalette: WaterfallPaletteName;
  waterfallMinDb: number;
  waterfallMaxDb: number;
  waterfallSpeed: number;
  waterfallInterpolation: "nearest" | "linear";
  waterfallGamma: number;
  waterfallRowHeight: number;
  passbandBlendMode: string;
  passbandOpacity: number;
  /** Slice flag background color (CSS value) */
  sliceBgColor: string;
}

export interface SdrFt8Props {
  ft8DecoderEnabled: boolean;
  ft8DecoderMode: "FT8" | "FT4";
  ft8CycleProgress: number;
  ft8DecoderStats: {
    totalDecodes: number;
    cyclesCompleted: number;
    lastCycleDecodes: number;
    workerReady: boolean;
  };
  ft8Error: string | null;
  onFt8Toggle: () => void;
  onFt8ModeChange: (mode: "FT8" | "FT4") => void;
  ft8EnrichedDecodes: Ft8EnrichedDecode[];
  ft8CurrentBand: string | null;
  ft8TimeSyncResult: TimeSyncResult | null;
  onFt8BandPresetSelect: (preset: Ft8BandPreset) => void;
  onFt8CallsignClick?: (callsign: string) => void;
  onFt8CallsignDoubleClick?: (callsign: string) => void;
}

export interface SdrDecodeProps {
  wsjtxStatus: WsjtxStatus | null;
  wsjtxDecodes: WsjtxDecode[];
  clusterSpots: ClusterSpotMessage[];
}

export interface SdrControlProps {
  freqInput: string;
  freqUnit: "MHz" | "kHz" | "Hz";
  onTune: () => void;
  onFreqInputChange: (value: string) => void;
  onFreqUnitChange: (unit: "MHz" | "kHz" | "Hz") => void;
  onModeChange: (mode: string) => void;
  onGainChange: (stage: string, value: number) => void;
  onAgcToggle: (enabled: boolean) => void;
  onAgcModeChange: (mode: number) => void;
  onAntennaChange: (port: string) => void;
  onFilterChange: (low: number, high: number) => void;
  onNrChange: (enabled: boolean, level: number) => void;
  onNbChange: (enabled: boolean, threshold: number) => void;
  onVfoChange: (vfo: "A" | "B") => void;
  onPttChange: (active: boolean) => void;
  onToggleFft: () => void;
  onToggleAudio: () => void;
  onRitToggle: (enabled: boolean) => void;
  onRitOffset: (offsetHz: number) => void;
  onXitToggle: (enabled: boolean) => void;
  onXitOffset: (offsetHz: number) => void;
  onSplitToggle: (enabled: boolean) => void;
  onAnfToggle: () => void;
  onQskToggle: () => void;
  onVoxToggle: () => void;
  onIfShift: (hz: number) => void;
  onCwSpeed: (wpm: number) => void;
  onLockToggle: () => void;
}

export interface SdrDspProps {
  noiseGateEnabled: boolean;
  noiseGateThreshold: number;
  onNoiseGateToggle: (enabled: boolean) => void;
  onNoiseGateThresholdChange: (threshold: number) => void;
  clientNrEnabled: boolean;
  clientNrLevel: number;
  onClientNrToggle: (enabled: boolean) => void;
  onClientNrLevelChange: (level: number) => void;
  sweetenEnabled: boolean;
  sweetenAmount: number;
  onSweetenToggle: (enabled: boolean) => void;
  onSweetenAmountChange: (amount: number) => void;
  expanderEnabled: boolean;
  expanderThreshold: number;
  expanderRatio: number;
  expanderAttackMs: number;
  expanderReleaseMs: number;
  expanderRangeDb: number;
  onExpanderToggle: (enabled: boolean) => void;
  onExpanderThresholdChange: (threshold: number) => void;
  onExpanderRatioChange: (ratio: number) => void;
  onExpanderAttackMsChange: (attackMs: number) => void;
  onExpanderReleaseMsChange: (releaseMs: number) => void;
  onExpanderRangeDbChange: (rangeDb: number) => void;
  compressorEnabled: boolean;
  compressorThreshold: number;
  compressorRatio: number;
  compressorAttackMs: number;
  compressorReleaseMs: number;
  compressorKnee: number;
  compressorMakeupDb: number;
  onCompressorToggle: (enabled: boolean) => void;
  onCompressorThresholdChange: (threshold: number) => void;
  onCompressorRatioChange: (ratio: number) => void;
  onCompressorAttackMsChange: (attackMs: number) => void;
  onCompressorReleaseMsChange: (releaseMs: number) => void;
  onCompressorKneeChange: (knee: number) => void;
  onCompressorMakeupDbChange: (makeupDb: number) => void;
  eqBands: EqBand[];
  onAddEqBand: (
    freqHz: number,
    gainDb: number,
    category: EqBandCategory,
  ) => void;
  onRemoveEqBand: (id: string) => void;
  onUpdateEqBand: (
    id: string,
    freqHz: number,
    q: number,
    gainDb: number,
  ) => void;
  onUpdateEqBandType: (id: string, filterType: EqFilterType) => void;
  onToggleEqBand: (id: string, enabled: boolean) => void;
  onEqBandQChange: (id: string, q: number) => void;
  onUpdateEqBandSlope: (id: string, slope: EqSlope) => void;
  /** Tuning step size in Hz */
  tuningStepHz: number;
  onTuningStepChange: (stepHz: number) => void;

  // Recording
  isRecording: boolean;
  recordingDurationSec: number;
  recordingEstimatedBytes: number;
  hasRecording: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onExportRecording: () => void;
  onDiscardRecording: () => void;
  // Spectral Taming
  spectralTamingEnabled: boolean;
  spectralTamingTameAmount: number;
  spectralTamingRecoverAmount: number;
  spectralTamingSpeed: number;
  onSpectralTamingToggle: (enabled: boolean) => void;
  onSpectralTamingTameAmountChange: (amount: number) => void;
  onSpectralTamingRecoverAmountChange: (amount: number) => void;
  onSpectralTamingSpeedChange: (speed: number) => void;
  // Psychoacoustic Leveler
  levelerEnabled: boolean;
  levelerTargetLevel: number;
  levelerSpeed: number;
  levelerMaxGainDb: number;
  onLevelerToggle: (enabled: boolean) => void;
  onLevelerTargetLevelChange: (level: number) => void;
  onLevelerSpeedChange: (speed: number) => void;
  onLevelerMaxGainDbChange: (maxGainDb: number) => void;
}

export interface SdrInteractionProps {
  onPickFrequencyHz: (hz: number) => void;
  onSelectRangeHz: (range: { startHz: number; endHz: number }) => void;
  /** Wheel-tune: direction +1 (freq up) or -1 (freq down) */
  onWheelTune: (direction: number) => void;
  onWaterfallViewChange: (view: WaterfallView) => void;
}

// ─── Composed main interface ────────────────────────────────────────────────

export interface SdrSkinProps {
  radio: SdrRadioStateProps;
  fft: SdrFftDataProps;
  spectrum: SdrSpectrumSettings;
  waterfall: SdrWaterfallSettings;
  ft8: SdrFt8Props;
  decodes: SdrDecodeProps;
  controls: SdrControlProps;
  dsp: SdrDspProps;
  interaction: SdrInteractionProps;
  isMobile: boolean;
  lastDaemonStatus: DaemonStatusMessage | null;
}
