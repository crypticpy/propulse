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
  onAntennaChange: (port: string) => void;
  onFilterChange: (low: number, high: number) => void;
  onNrChange: (enabled: boolean, level: number) => void;
  onNbChange: (enabled: boolean, threshold: number) => void;
  onVfoChange: (vfo: "A" | "B") => void;
  onPttChange: (active: boolean) => void;
  onToggleFft: () => void;
  onToggleAudio: () => void;
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
  notchFilters: Array<{
    id: string;
    freqHz: number;
    q: number;
    enabled: boolean;
  }>;
  onAddNotch: (freqHz: number, q: number) => void;
  onRemoveNotch: (id: string) => void;
  onUpdateNotch: (id: string, freqHz: number, q: number) => void;
  onToggleNotch: (id: string, enabled: boolean) => void;
  /** Tuning step size in Hz */
  tuningStepHz: number;
  onTuningStepChange: (stepHz: number) => void;
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
