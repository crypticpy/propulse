/**
 * SDR Console — data/logic layer.
 * All rendering is delegated to the active skin component.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DevicePicker } from "@/components/sdr/DevicePicker";
import { useAudioStreamPlayer } from "@/hooks/useAudioStreamPlayer";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useRadioDaemon } from "@/hooks/useRadioDaemon";
import type {
  ClusterSpotMessage,
  DaemonDiscoveryDaemonsMessage,
  DaemonIncomingMessage,
  RadioState,
  RadioBinaryFrame,
  WsjtxDecode,
  WsjtxStatus,
} from "@/lib/radio/protocol";
import {
  isClusterSpotMessage,
  isDaemonDiscoveryDaemonsMessage,
  isDaemonResponseMessage,
  isDaemonStatusMessage,
  isDevicesAddedMessage,
  isDevicesListMessage,
  isDevicesRemovedMessage,
  isRadioSmeterMessage,
  isRadioStateMessage,
  isWsjtxDecodeMessage,
  isWsjtxStatusMessage,
} from "@/lib/radio/protocol";
import { useRadioStore } from "@/stores/radioStore";
import { useSdrStore } from "@/stores/sdrStore";
import { useSettingsStore } from "@/stores/settingsStore";
import type {
  WaterfallView,
  TuningOverlay,
} from "@/components/sdr/waterfallPalette";
import { ClassicSkin } from "@/components/sdr/skins/ClassicSkin";
import { FlexibleSkin } from "@/components/sdr/skins/FlexibleSkin";
import type { SdrSkinProps, SdrSkinName } from "@/components/sdr/skins/types";

const DEFAULT_DAEMON_URL = "ws://127.0.0.1:9867";
const LS_DAEMON_URL_KEY = "propulse-radio-daemon-url";
const LS_LAST_DEVICE_KEY = "propulse-radio-daemon-device";

export function SdrConsole() {
  const isMobile = useIsMobile();

  // ── Skin selection ──────────────────────────────────────────
  const sdrSkinName = useSettingsStore((s) => s.sdrSkinName ?? "classic");
  const updatePreferences = useSettingsStore((s) => s.updatePreferences);
  const activeSkin: SdrSkinName = isMobile ? "classic" : sdrSkinName;
  const handleSkinChange = useCallback(
    (skin: SdrSkinName) => updatePreferences({ sdrSkinName: skin }),
    [updatePreferences],
  );

  // ── Connection state ────────────────────────────────────────
  const [daemonUrl, setDaemonUrl] = useState(() => {
    try {
      return localStorage.getItem(LS_DAEMON_URL_KEY) ?? DEFAULT_DAEMON_URL;
    } catch {
      return DEFAULT_DAEMON_URL;
    }
  });
  const [devicePickerOpen, setDevicePickerOpen] = useState(false);
  const [discoveredDaemons, setDiscoveredDaemons] = useState<
    DaemonDiscoveryDaemonsMessage["daemons"]
  >([]);
  const [wsjtxStatus, setWsjtxStatus] = useState<WsjtxStatus | null>(null);
  const [wsjtxDecodes, setWsjtxDecodes] = useState<WsjtxDecode[]>([]);
  const [clusterSpots, setClusterSpots] = useState<ClusterSpotMessage[]>([]);
  const autoConnectAttemptedRef = useRef(false);
  const gainDebounceRef = useRef<Record<string, number>>({});
  const filterDebounceRef = useRef<number | null>(null);
  const autoFftStartRef = useRef<Record<string, boolean>>({});
  const [waterfallSpanHz, setWaterfallSpanHz] = useState<number | null>(null);

  // ── Radio store ─────────────────────────────────────────────
  const devices = useRadioStore((s) => s.devices);
  const selectedDeviceId = useRadioStore((s) => s.selectedDeviceId);
  const connectedDeviceId = useRadioStore((s) => s.connectedDeviceId);
  const radioStateById = useRadioStore((s) => s.radioStateById);
  const smeterById = useRadioStore((s) => s.smeterDbmById);
  const lastStatus = useRadioStore((s) => s.lastDaemonStatus);

  const resetRadioStore = useRadioStore((s) => s.reset);
  const setDevices = useRadioStore((s) => s.setDevices);
  const setSelectedDeviceId = useRadioStore((s) => s.setSelectedDeviceId);
  const upsertRadioState = useRadioStore((s) => s.upsertRadioState);
  const setSmeterDbm = useRadioStore((s) => s.setSmeterDbm);
  const setLastDaemonStatus = useRadioStore((s) => s.setLastDaemonStatus);

  // ── SDR store ───────────────────────────────────────────────
  const fftEnabled = useSdrStore((s) => s.fftEnabled);
  const audioEnabled = useSdrStore((s) => s.audioEnabled);
  const lastFftFrame = useSdrStore((s) => s.lastFftFrame);
  const lastAudioFrame = useSdrStore((s) => s.lastAudioFrame);
  const setFftEnabled = useSdrStore((s) => s.setFftEnabled);
  const setAudioEnabled = useSdrStore((s) => s.setAudioEnabled);
  const setFrame = useSdrStore((s) => s.setFrame);

  // ── Settings ────────────────────────────────────────────────
  const waterfallPalette = useSettingsStore((s) => s.sdrWaterfallPalette);
  const waterfallMinDb = useSettingsStore((s) => s.sdrWaterfallMinDb);
  const waterfallMaxDb = useSettingsStore((s) => s.sdrWaterfallMaxDb);
  const waterfallSpeed = useSettingsStore((s) => s.sdrWaterfallSpeed);
  const spectrumPeakHold = useSettingsStore((s) => s.sdrSpectrumPeakHold);
  const spectrumGradientFill = useSettingsStore(
    (s) => s.sdrSpectrumGradientFill,
  );

  // ── Local UI state ──────────────────────────────────────────
  const [lastResponseError, setLastResponseError] = useState<string | null>(
    null,
  );
  const [freqInput, setFreqInput] = useState("");
  const [freqUnit, setFreqUnit] = useState<"MHz" | "kHz" | "Hz">("MHz");
  const [draftState, setDraftState] = useState<RadioState | null>(null);

  // ── Daemon message handler ──────────────────────────────────
  const handleDaemonMessage = useCallback(
    (
      msg: DaemonIncomingMessage,
      api: Pick<ReturnType<typeof useRadioDaemon>, "sendCommand">,
    ) => {
      if (isDevicesListMessage(msg)) {
        setDevices(msg.devices);
        return;
      }
      if (isDevicesAddedMessage(msg) || isDevicesRemovedMessage(msg)) {
        api.sendCommand("devices:enumerate");
        return;
      }
      if (isRadioStateMessage(msg)) {
        upsertRadioState(msg.device_id, msg.state);
        return;
      }
      if (isRadioSmeterMessage(msg)) {
        setSmeterDbm(msg.device_id, msg.dbm);
        return;
      }
      if (isDaemonStatusMessage(msg)) {
        setLastDaemonStatus(msg);
        return;
      }
      if (isDaemonResponseMessage(msg)) {
        const err =
          typeof msg.error === "string" ? msg.error : "Command failed";
        setLastResponseError(msg.success ? null : err);
        return;
      }
      if (isDaemonDiscoveryDaemonsMessage(msg)) {
        setDiscoveredDaemons(msg.daemons);
        return;
      }
      if (isWsjtxStatusMessage(msg)) {
        setWsjtxStatus(msg.status);
        return;
      }
      if (isWsjtxDecodeMessage(msg)) {
        setWsjtxDecodes((prev) => {
          const next = [msg.decode, ...prev];
          if (next.length > 200) next.length = 200;
          return next;
        });
        return;
      }
      if (isClusterSpotMessage(msg)) {
        setClusterSpots((prev) => {
          const next = [msg, ...prev];
          if (next.length > 200) next.length = 200;
          return next;
        });
      }
    },
    [
      setClusterSpots,
      setDevices,
      setLastDaemonStatus,
      setLastResponseError,
      setSmeterDbm,
      setWsjtxDecodes,
      setWsjtxStatus,
      upsertRadioState,
    ],
  );

  const handleDaemonFrame = useCallback(
    (frame: RadioBinaryFrame) => {
      setFrame(frame);
    },
    [setFrame],
  );

  const daemon = useRadioDaemon({
    enabled: true,
    url: daemonUrl,
    onMessage: handleDaemonMessage,
    onFrame: handleDaemonFrame,
  });
  const daemonConnected = daemon.connected;
  const daemonConnecting = daemon.connecting;
  const daemonError = daemon.error;
  const daemonSendCommand = daemon.sendCommand;

  // ── Derived state ───────────────────────────────────────────
  const selectedDevice = useMemo(
    () => devices.find((d) => d.device_id === selectedDeviceId) ?? null,
    [devices, selectedDeviceId],
  );
  const connectedState = connectedDeviceId
    ? (radioStateById[connectedDeviceId] ?? null)
    : null;
  const effectiveState = draftState ?? connectedState;

  useEffect(() => {
    setDraftState(connectedState);
  }, [connectedState]);

  // ── Side effects ────────────────────────────────────────────

  // Persist daemon URL; reset radio state when switching daemons.
  useEffect(() => {
    try {
      localStorage.setItem(LS_DAEMON_URL_KEY, daemonUrl);
    } catch {
      // ignore
    }
    resetRadioStore();
    setFftEnabled(false);
    setAudioEnabled(false);
    autoConnectAttemptedRef.current = false;
    setDiscoveredDaemons([]);
    setWsjtxStatus(null);
    setWsjtxDecodes([]);
    setClusterSpots([]);
    setWaterfallSpanHz(null);
    autoFftStartRef.current = {};
  }, [daemonUrl, resetRadioStore, setAudioEnabled, setFftEnabled]);

  // Track successful radio connection for auto-reconnect.
  useEffect(() => {
    if (!connectedDeviceId) return;
    try {
      localStorage.setItem(LS_LAST_DEVICE_KEY, connectedDeviceId);
    } catch {
      // ignore
    }
  }, [connectedDeviceId]);

  useEffect(() => {
    if (!daemonConnected) return;
    autoConnectAttemptedRef.current = false;
  }, [daemonConnected, daemonUrl]);

  // Auto-reconnect to last selected radio (best-effort).
  useEffect(() => {
    if (!daemonConnected) return;
    if (connectedDeviceId) return;
    if (devices.length === 0) return;
    if (autoConnectAttemptedRef.current) return;

    let lastDevice: string | null = null;
    try {
      lastDevice = localStorage.getItem(LS_LAST_DEVICE_KEY);
    } catch {
      lastDevice = null;
    }

    if (!lastDevice) {
      autoConnectAttemptedRef.current = true;
      return;
    }
    if (!devices.some((d) => d.device_id === lastDevice)) {
      autoConnectAttemptedRef.current = true;
      return;
    }

    autoConnectAttemptedRef.current = true;
    setSelectedDeviceId(lastDevice);
    daemonSendCommand("radio:connect", { device_id: lastDevice });
  }, [
    connectedDeviceId,
    daemonConnected,
    daemonSendCommand,
    devices,
    setSelectedDeviceId,
  ]);

  // Keep frequency input synced to connected radio state.
  useEffect(() => {
    if (!connectedState) return;
    const base =
      freqUnit === "MHz"
        ? connectedState.freq / 1_000_000
        : freqUnit === "kHz"
          ? connectedState.freq / 1_000
          : connectedState.freq;
    const text =
      freqUnit === "MHz"
        ? base.toFixed(6)
        : freqUnit === "kHz"
          ? base.toFixed(3)
          : Math.round(base).toString();
    setFreqInput(text);
  }, [connectedState, freqUnit]);

  useEffect(() => {
    setWaterfallSpanHz(null);
  }, [connectedDeviceId]);

  // Auto-start FFT streaming once per device.
  useEffect(() => {
    if (!daemonConnected) return;
    if (!connectedDeviceId) return;
    if (fftEnabled) return;
    const dev = devices.find((d) => d.device_id === connectedDeviceId);
    if (!dev?.capabilities.can_stream_fft) return;
    if (autoFftStartRef.current[connectedDeviceId]) return;
    autoFftStartRef.current[connectedDeviceId] = true;
    const storedCivPort = parseInt(
      localStorage.getItem("propulse-civ-port") || "4580",
      10,
    );
    daemonSendCommand("stream:fft:start", {
      device_id: connectedDeviceId,
      fft_size: 4096,
      fps: 20,
      averaging: 4,
      civ_port: storedCivPort > 0 ? storedCivPort : 4580,
    });
    setFftEnabled(true);
  }, [
    connectedDeviceId,
    daemonConnected,
    daemonSendCommand,
    devices,
    fftEnabled,
    setFftEnabled,
  ]);

  const canControlDevice = daemonConnected && !!selectedDeviceId;
  const canControlConnected = daemonConnected && !!connectedDeviceId;

  useAudioStreamPlayer(
    audioEnabled,
    lastAudioFrame
      ? {
          sampleRate: lastAudioFrame.sampleRate,
          samples: lastAudioFrame.samples,
        }
      : null,
  );

  // ── Command handlers ────────────────────────────────────────

  const handleConnectRadio = useCallback(() => {
    if (!selectedDeviceId) return;
    daemonSendCommand("radio:connect", { device_id: selectedDeviceId });
  }, [daemonSendCommand, selectedDeviceId]);

  const handleDisconnectRadio = useCallback(() => {
    if (!connectedDeviceId) return;
    daemonSendCommand("radio:disconnect", { device_id: connectedDeviceId });
    setFftEnabled(false);
    setAudioEnabled(false);
    setDraftState(null);
  }, [connectedDeviceId, daemonSendCommand, setAudioEnabled, setFftEnabled]);

  const handleTune = useCallback(() => {
    if (!connectedDeviceId) return;
    const value = Number(freqInput);
    if (!Number.isFinite(value) || value <= 0) {
      setLastResponseError("Invalid frequency");
      return;
    }
    const hz =
      freqUnit === "MHz"
        ? Math.round(value * 1_000_000)
        : freqUnit === "kHz"
          ? Math.round(value * 1_000)
          : Math.round(value);
    daemonSendCommand("radio:tune", { device_id: connectedDeviceId, freq: hz });
    setDraftState((s) => (s ? { ...s, freq: hz } : s));
  }, [connectedDeviceId, daemonSendCommand, freqInput, freqUnit]);

  const handleModeChange = useCallback(
    (mode: string) => {
      if (!connectedDeviceId) return;
      daemonSendCommand("radio:mode", { device_id: connectedDeviceId, mode });
      setDraftState((s) => (s ? { ...s, mode } : s));
    },
    [connectedDeviceId, daemonSendCommand],
  );

  const handleGainChange = useCallback(
    (stage: string, value: number) => {
      setDraftState((s) => {
        if (!s) return s;
        return { ...s, gains: { ...s.gains, [stage]: value } };
      });
      if (!connectedDeviceId) return;

      const existing = gainDebounceRef.current[stage];
      if (existing) window.clearTimeout(existing);
      gainDebounceRef.current[stage] = window.setTimeout(() => {
        daemonSendCommand("radio:gain", {
          device_id: connectedDeviceId,
          stage,
          value,
        });
      }, 50);
    },
    [connectedDeviceId, daemonSendCommand],
  );

  const handleAgcToggle = useCallback(
    (enabled: boolean) => {
      setDraftState((s) => (s ? { ...s, agc: enabled } : s));
      if (!connectedDeviceId) return;
      daemonSendCommand("radio:agc", {
        device_id: connectedDeviceId,
        enabled,
      });
    },
    [connectedDeviceId, daemonSendCommand],
  );

  const handleAntennaChange = useCallback(
    (port: string) => {
      setDraftState((s) => (s ? { ...s, antenna: port } : s));
      if (!connectedDeviceId) return;
      daemonSendCommand("radio:antenna", {
        device_id: connectedDeviceId,
        port,
      });
    },
    [connectedDeviceId, daemonSendCommand],
  );

  const handleFilterChange = useCallback(
    (low: number, high: number) => {
      const lo = Math.min(low, high);
      const hi = Math.max(low, high);
      setDraftState((s) =>
        s ? { ...s, filter: { low: Math.round(lo), high: Math.round(hi) } } : s,
      );
      if (!connectedDeviceId) return;
      if (filterDebounceRef.current)
        window.clearTimeout(filterDebounceRef.current);
      filterDebounceRef.current = window.setTimeout(() => {
        daemonSendCommand("radio:filter", {
          device_id: connectedDeviceId,
          low: Math.round(lo),
          high: Math.round(hi),
        });
      }, 75);
    },
    [connectedDeviceId, daemonSendCommand],
  );

  const handleNrChange = useCallback(
    (enabled: boolean, level: number) => {
      setDraftState((s) =>
        s ? { ...s, nr: { enabled, level: Math.round(level) } } : s,
      );
      if (!connectedDeviceId) return;
      daemonSendCommand("radio:nr", {
        device_id: connectedDeviceId,
        enabled,
        level: Math.round(level),
      });
    },
    [connectedDeviceId, daemonSendCommand],
  );

  const handleNbChange = useCallback(
    (enabled: boolean, threshold: number) => {
      setDraftState((s) =>
        s ? { ...s, nb: { enabled, threshold: Math.round(threshold) } } : s,
      );
      if (!connectedDeviceId) return;
      daemonSendCommand("radio:nb", {
        device_id: connectedDeviceId,
        enabled,
        threshold: Math.round(threshold),
      });
    },
    [connectedDeviceId, daemonSendCommand],
  );

  const handlePttChange = useCallback(
    (active: boolean) => {
      setDraftState((s) => (s ? { ...s, ptt: active } : s));
      if (!connectedDeviceId) return;
      daemonSendCommand("radio:ptt", {
        device_id: connectedDeviceId,
        active,
      });
    },
    [connectedDeviceId, daemonSendCommand],
  );

  const handleToggleFft = useCallback(() => {
    if (!connectedDeviceId) return;
    if (fftEnabled) {
      daemonSendCommand("stream:fft:stop", { device_id: connectedDeviceId });
      setFftEnabled(false);
    } else {
      const storedPort = parseInt(
        localStorage.getItem("propulse-civ-port") || "4580",
        10,
      );
      daemonSendCommand("stream:fft:start", {
        device_id: connectedDeviceId,
        fft_size: 4096,
        fps: 20,
        averaging: 4,
        civ_port: storedPort > 0 ? storedPort : 4580,
      });
      setFftEnabled(true);
    }
  }, [connectedDeviceId, daemonSendCommand, fftEnabled, setFftEnabled]);

  const handleToggleAudio = useCallback(() => {
    if (!connectedDeviceId) return;
    if (audioEnabled) {
      daemonSendCommand("stream:audio:stop", { device_id: connectedDeviceId });
      setAudioEnabled(false);
    } else {
      daemonSendCommand("stream:audio:start", {
        device_id: connectedDeviceId,
        sample_rate: 48000,
        format: "pcm_i16",
      });
      setAudioEnabled(true);
    }
  }, [audioEnabled, connectedDeviceId, daemonSendCommand, setAudioEnabled]);

  const refreshDiscovery = useCallback(() => {
    if (!daemonConnected) return;
    daemonSendCommand("discovery:mdns:browse");
  }, [daemonConnected, daemonSendCommand]);

  // ── Derived memos ───────────────────────────────────────────

  const waterfallOverlays = useMemo(() => {
    const overlays: Array<{
      hz: number;
      label?: string;
      color?: "cyan" | "orange" | "red" | "green";
    }> = [];

    for (const s of clusterSpots.slice(0, 15)) {
      overlays.push({
        hz: s.freq * 1000,
        label: s.dx,
        color: "orange",
      });
    }

    if (wsjtxStatus) {
      const dial = wsjtxStatus.frequency;
      const isLsb = (effectiveState?.mode ?? "").toUpperCase() === "LSB";
      for (const d of wsjtxDecodes.slice(0, 20)) {
        const rf = dial + (isLsb ? -d.deltaFrequency : d.deltaFrequency);
        overlays.push({
          hz: rf,
          label: d.callsign ?? undefined,
          color: "cyan",
        });
      }
    }

    return overlays;
  }, [clusterSpots, effectiveState?.mode, wsjtxDecodes, wsjtxStatus]);

  useEffect(() => {
    if (!devicePickerOpen) return;
    refreshDiscovery();
  }, [devicePickerOpen, refreshDiscovery]);

  const canStreamFft = selectedDevice?.capabilities.can_stream_fft ?? false;
  const canStreamAudio = selectedDevice?.capabilities.can_stream_audio ?? false;

  const waterfallView: WaterfallView | null = useMemo(() => {
    if (!lastFftFrame) return null;
    const spanHz = waterfallSpanHz ?? lastFftFrame.spanHz;
    return {
      centerHz: lastFftFrame.centerHz,
      spanHz: Math.min(spanHz, lastFftFrame.spanHz),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastFftFrame?.centerHz, lastFftFrame?.spanHz, waterfallSpanHz]);

  const tuningOverlay: TuningOverlay | null = useMemo(() => {
    if (!effectiveState) return null;
    return {
      freqHz: effectiveState.freq,
      filterLowHz: effectiveState.filter?.low ?? 300,
      filterHighHz: effectiveState.filter?.high ?? 2700,
      mode: effectiveState.mode ?? "USB",
    };
  }, [effectiveState]);

  const handleWaterfallViewChange = useCallback((next: WaterfallView) => {
    setWaterfallSpanHz(next.spanHz);
  }, []);

  const handlePickFrequencyHz = useCallback(
    (hz: number) => {
      if (!connectedDeviceId) return;
      daemonSendCommand("radio:tune", {
        device_id: connectedDeviceId,
        freq: hz,
      });
      setDraftState((s) => (s ? { ...s, freq: hz } : s));
      const base =
        freqUnit === "MHz"
          ? hz / 1_000_000
          : freqUnit === "kHz"
            ? hz / 1_000
            : hz;
      const text =
        freqUnit === "MHz"
          ? base.toFixed(6)
          : freqUnit === "kHz"
            ? base.toFixed(3)
            : Math.round(base).toString();
      setFreqInput(text);
    },
    [connectedDeviceId, daemonSendCommand, freqUnit],
  );

  const handleSelectRangeHz = useCallback(
    (range: { startHz: number; endHz: number }) => {
      const mid = Math.round((range.startHz + range.endHz) / 2);
      handlePickFrequencyHz(mid);
      const bw = Math.max(
        50,
        Math.round(Math.abs(range.endHz - range.startHz)),
      );
      const mode = (effectiveState?.mode ?? "USB").toUpperCase();
      if (mode === "CW") {
        const center = 700;
        handleFilterChange(center - bw / 2, center + bw / 2);
        return;
      }
      if (mode === "AM" || mode === "FM") {
        handleFilterChange(0, bw / 2);
        return;
      }
      handleFilterChange(300, 300 + bw);
    },
    [effectiveState?.mode, handleFilterChange, handlePickFrequencyHz],
  );

  // ── Assemble skin props ─────────────────────────────────────

  const skinProps: SdrSkinProps = {
    daemonConnected,
    daemonConnecting,
    daemonError,
    daemonUrl,
    lastResponseError,
    lastDaemonStatus: lastStatus,
    discoveredDaemons,

    devices,
    selectedDevice,
    selectedDeviceId,
    connectedDeviceId,
    canControlDevice,
    canControlConnected,
    canStreamFft,
    canStreamAudio,

    effectiveState,
    smeterDbm: connectedDeviceId ? smeterById[connectedDeviceId] : undefined,

    fftEnabled,
    audioEnabled,
    lastFftFrame,
    waterfallView,
    tuningOverlay,
    waterfallOverlays,

    waterfallPalette,
    waterfallMinDb,
    waterfallMaxDb,
    waterfallSpeed,
    spectrumPeakHold,
    spectrumGradientFill,

    freqInput,
    freqUnit,

    wsjtxStatus,
    wsjtxDecodes,
    clusterSpots,

    isMobile,
    activeSkin,
    onSkinChange: handleSkinChange,

    onConnectRadio: handleConnectRadio,
    onDisconnectRadio: handleDisconnectRadio,
    onTune: handleTune,
    onFreqInputChange: setFreqInput,
    onFreqUnitChange: setFreqUnit,
    onModeChange: handleModeChange,
    onGainChange: handleGainChange,
    onAgcToggle: handleAgcToggle,
    onAntennaChange: handleAntennaChange,
    onFilterChange: handleFilterChange,
    onNrChange: handleNrChange,
    onNbChange: handleNbChange,
    onPttChange: handlePttChange,
    onToggleFft: handleToggleFft,
    onToggleAudio: handleToggleAudio,
    onDeviceSelect: setSelectedDeviceId,
    onWaterfallViewChange: handleWaterfallViewChange,
    onPickFrequencyHz: handlePickFrequencyHz,
    onSelectRangeHz: handleSelectRangeHz,
    onOpenDevicePicker: () => setDevicePickerOpen(true),
  };

  // ── Render ──────────────────────────────────────────────────

  const SkinComponent = activeSkin === "flexible" ? FlexibleSkin : ClassicSkin;

  return (
    <>
      <DevicePicker
        isOpen={devicePickerOpen}
        onClose={() => setDevicePickerOpen(false)}
        currentUrl={daemonUrl}
        onSelect={({ url, deviceId }) => {
          try {
            if (deviceId) localStorage.setItem(LS_LAST_DEVICE_KEY, deviceId);
          } catch {
            // ignore
          }
          setDaemonUrl(url);
        }}
        daemons={discoveredDaemons}
        canRefresh={daemonConnected}
        onRefresh={refreshDiscovery}
      />
      <SkinComponent {...skinProps} />
    </>
  );
}

export default SdrConsole;
