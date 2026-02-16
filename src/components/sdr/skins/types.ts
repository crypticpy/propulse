/**
 * Skin system types for the SDR Console.
 * Each skin is a React component that receives SdrSkinProps and renders a layout.
 */

import type {
  RadioState,
  DeviceInfo,
  RadioBinaryFrame,
  DaemonStatusMessage,
  DaemonDiscoveryDaemonsMessage,
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

export type SdrSkinName = "classic" | "flexible";

// ─── FFT frame helper type ──────────────────────────────────────────────────

export type FftFrame = Extract<RadioBinaryFrame, { kind: "fft" }>;

// ─── Display helpers (shared by all skins) ──────────────────────────────────

export function formatHz(hz: number): string {
  if (!Number.isFinite(hz)) return "—";
  return `${(hz / 1_000_000).toFixed(6)} MHz`;
}

export function formatUtcMsSinceMidnight(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const totalSeconds = Math.floor(ms / 1000);
  const hh = Math.floor(totalSeconds / 3600) % 24;
  const mm = Math.floor((totalSeconds % 3600) / 60);
  const ss = totalSeconds % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}Z`;
}

// ─── Skin props contract ────────────────────────────────────────────────────

export interface SdrSkinProps {
  // ── Connection ────────────────────────────────
  daemonConnected: boolean;
  daemonConnecting: boolean;
  daemonError: string | null;
  daemonUrl: string;
  lastResponseError: string | null;
  lastDaemonStatus: DaemonStatusMessage | null;
  discoveredDaemons: DaemonDiscoveryDaemonsMessage["daemons"];

  // ── Devices ───────────────────────────────────
  devices: DeviceInfo[];
  selectedDevice: DeviceInfo | null;
  selectedDeviceId: string | null;
  connectedDeviceId: string | null;
  canControlDevice: boolean;
  canControlConnected: boolean;
  canStreamFft: boolean;
  canStreamAudio: boolean;

  // ── Radio state ───────────────────────────────
  effectiveState: RadioState | null;
  smeterDbm: number | undefined;

  // ── FFT / Spectrum ────────────────────────────
  fftEnabled: boolean;
  audioEnabled: boolean;
  lastFftFrame: FftFrame | null;
  waterfallView: WaterfallView | null;
  tuningOverlay: TuningOverlay | null;
  waterfallOverlays: Array<{
    hz: number;
    label?: string;
    color?: "cyan" | "orange" | "red" | "green";
  }>;

  // ── Waterfall / Spectrum settings ─────────────
  waterfallPalette: WaterfallPaletteName;
  waterfallMinDb: number;
  waterfallMaxDb: number;
  waterfallSpeed: number;
  spectrumPeakHold: boolean;
  spectrumGradientFill: boolean;

  // ── Frequency input ───────────────────────────
  freqInput: string;
  freqUnit: "MHz" | "kHz" | "Hz";

  // ── WSJT-X + DX Cluster ──────────────────────
  wsjtxStatus: WsjtxStatus | null;
  wsjtxDecodes: WsjtxDecode[];
  clusterSpots: ClusterSpotMessage[];

  // ── Viewport ──────────────────────────────────
  isMobile: boolean;

  // ── Skin switching ────────────────────────────
  activeSkin: SdrSkinName;
  onSkinChange: (skin: SdrSkinName) => void;

  // ── Callbacks ─────────────────────────────────
  onConnectRadio: () => void;
  onDisconnectRadio: () => void;
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
  onPttChange: (active: boolean) => void;
  onToggleFft: () => void;
  onToggleAudio: () => void;
  onDeviceSelect: (deviceId: string | null) => void;
  onWaterfallViewChange: (view: WaterfallView) => void;
  onPickFrequencyHz: (hz: number) => void;
  onSelectRangeHz: (range: { startHz: number; endHz: number }) => void;
  onOpenDevicePicker: () => void;
}
