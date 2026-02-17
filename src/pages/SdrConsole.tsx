/**
 * SDR Console — data/logic layer.
 * All rendering is delegated to the active skin component.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DevicePicker } from "@/components/sdr/DevicePicker";
import { useAudioStreamPlayer } from "@/hooks/useAudioStreamPlayer";
import { useAudioFft } from "@/hooks/useAudioFft";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useRadioDaemon } from "@/hooks/useRadioDaemon";
import type {
  ClusterSpotMessage,
  DaemonDiscoveryDaemonsMessage,
  DaemonIncomingMessage,
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
import { SdrSettingsModal } from "@/components/sdr/SdrSettingsModal";
import { SdrConsoleHeader } from "@/components/sdr/SdrConsoleHeader";
import { useFt8Decoder } from "@/hooks/useFt8Decoder";
import { useFt8DecoderStore } from "@/stores/ft8DecoderStore";
import { ClassicSkin } from "@/components/sdr/skins/ClassicSkin";
import { FlexibleSkin } from "@/components/sdr/skins/FlexibleSkin";
import { FateSkin } from "@/components/sdr/skins/fate/FateSkin";
import type { SdrSkinProps, SdrSkinName } from "@/components/sdr/skins/types";
import { useSdrSettings } from "@/hooks/useSdrSettings";
import { useRadioCommands } from "@/hooks/useRadioCommands";
import { useSmartTuning } from "@/hooks/useSmartTuning";
import { useEqBands } from "@/hooks/useEqBands";
import { useClientDsp } from "@/hooks/useClientDsp";
import { useFt8AutoConfig } from "@/hooks/useFt8AutoConfig";
import { useAudioDspChain } from "@/hooks/useAudioDspChain";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";

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
  const [sdrSettingsOpen, setSdrSettingsOpen] = useState(false);
  const [discoveredDaemons, setDiscoveredDaemons] = useState<
    DaemonDiscoveryDaemonsMessage["daemons"]
  >([]);
  const [wsjtxStatus, setWsjtxStatus] = useState<WsjtxStatus | null>(null);
  const wsjtxDecodes = useFt8DecoderStore((s) => s.decodes);
  const ft8AddDecodes = useFt8DecoderStore((s) => s.addDecodes);
  const ft8ClearDecodes = useFt8DecoderStore((s) => s.clearDecodes);
  const ft8LoadRecent = useFt8DecoderStore((s) => s.loadRecent);
  const [clusterSpots, setClusterSpots] = useState<ClusterSpotMessage[]>([]);

  // ── Native FT8/FT4 decoder ────────────────────────────────────
  const ft8Decoder = useFt8Decoder({
    onDecodes: useCallback(
      (decodes: WsjtxDecode[]) => {
        ft8AddDecodes(decodes);
      },
      [ft8AddDecodes],
    ),
  });
  const autoConnectAttemptedRef = useRef(false);
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

  // ── Settings (consolidated via shallow-equality hook) ──────
  const sdrSettings = useSdrSettings();

  // ── Local UI state ──────────────────────────────────────────
  const [lastResponseError, setLastResponseError] = useState<string | null>(
    null,
  );
  const [freqInput, setFreqInput] = useState("");
  const [freqUnit, setFreqUnit] = useState<"MHz" | "kHz" | "Hz">("MHz");

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
        ft8AddDecodes([msg.decode]);
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
      ft8AddDecodes,
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

  // ── Extracted hooks ─────────────────────────────────────────

  // Hook 1: Radio command handlers + draftState + effectiveState
  const {
    draftState: _draftState,
    setDraftState,
    effectiveState,
    handleConnectRadio,
    handleDisconnectRadio,
    handleTune,
    handleModeChange,
    handleGainChange,
    handleAgcToggle,
    handleAgcModeChange,
    handleAntennaChange,
    handleFilterChange,
    handleNrChange,
    handleNbChange,
    handlePttChange,
    handleVfoChange,
    handleRitToggle,
    handleRitOffset,
    handleXitToggle,
    handleXitOffset,
    handleSplitToggle,
    handleAnfToggle,
    handleQskToggle,
    handleVoxToggle,
    handleIfShift,
    handleCwSpeed,
    handleLockToggle,
  } = useRadioCommands({
    connectedDeviceId,
    selectedDeviceId,
    daemonSendCommand,
    connectedState,
    freqInput,
    freqUnit,
    setLastResponseError,
    setFftEnabled,
    setAudioEnabled,
  });

  // Keep effectiveStateRef in sync for useFt8AutoConfig
  const effectiveStateRef = useRef(effectiveState);
  effectiveStateRef.current = effectiveState;

  // Hook 2: Smart tuning (click-to-tune, wheel tune, step change)
  const { handlePickFrequencyHz, handleWheelTune, handleTuningStepChange } =
    useSmartTuning({
      connectedDeviceId,
      daemonSendCommand,
      lastFftFrame,
      tuningStepHz: sdrSettings.tuningStepHz,
      effectiveState,
      freqUnit,
      setDraftState,
      setFreqInput,
    });

  // Hook 3: EQ band CRUD (replaces old notch filter hook)
  const {
    handleAddEqBand,
    handleRemoveEqBand,
    handleUpdateEqBand,
    handleUpdateEqBandType,
    handleToggleEqBand,
    handleEqBandQChange,
  } = useEqBands();

  // Hook 4: Client-side DSP controls
  const {
    handleNoiseGateToggle,
    handleNoiseGateThresholdChange,
    handleClientNrToggle,
    handleClientNrLevelChange,
  } = useClientDsp();

  // ── Stream toggle handlers (inline — used by useFt8AutoConfig) ──

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

  // Hook 5: FT8 auto-config toggle
  const { handleFt8Toggle } = useFt8AutoConfig({
    connectedDeviceId,
    effectiveStateRef,
    ft8Decoder,
    handleModeChange,
    handleFilterChange,
    handleAgcToggle,
    handleNrChange,
    handleNbChange,
    handleToggleFft,
  });

  // Hook 6: Audio DSP chain lifecycle
  const processingChain = useAudioDspChain({
    audioEnabled,
    noiseGateEnabled: sdrSettings.sdrNoiseGateEnabled,
    noiseGateThreshold: sdrSettings.sdrNoiseGateThreshold,
    clientNrEnabled: sdrSettings.sdrNrEnabled,
    clientNrLevel: sdrSettings.sdrNrLevel,
  });

  // Hook 7: Audio recording
  const [recorderState, recorderActions] = useAudioRecorder();
  const handleStartRecording = useCallback(() => {
    if (processingChain) recorderActions.startRecording(processingChain);
  }, [processingChain, recorderActions]);

  // ── Side effects ────────────────────────────────────────────

  // Sync draftState from connectedState
  useEffect(() => {
    setDraftState(connectedState);
  }, [connectedState, setDraftState]);

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
    ft8ClearDecodes();
    setClusterSpots([]);
    setWaterfallSpanHz(null);
    autoFftStartRef.current = {};
  }, [
    daemonUrl,
    ft8ClearDecodes,
    resetRadioStore,
    setAudioEnabled,
    setFftEnabled,
  ]);

  // Restore recent FT8 decodes from IndexedDB on mount.
  useEffect(() => {
    ft8LoadRecent();
  }, [ft8LoadRecent]);

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

  // ── Audio stream player ─────────────────────────────────────

  useAudioStreamPlayer({
    enabled: audioEnabled,
    frame: lastAudioFrame
      ? {
          sampleRate: lastAudioFrame.sampleRate,
          samples: lastAudioFrame.samples,
        }
      : null,
    processingChain,
    eqBands: sdrSettings.sdrEqBands,
  });

  // ── Remaining handlers ──────────────────────────────────────

  const refreshDiscovery = useCallback(() => {
    if (!daemonConnected) return;
    daemonSendCommand("discovery:mdns:browse");
  }, [daemonConnected, daemonSendCommand]);

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

  // ── Audio-derived FFT for zoom waterfall (~11.7 Hz/bin) ──
  const audioFftFrame = useAudioFft({
    enabled: audioEnabled,
    audioFrame: lastAudioFrame,
    tuning: tuningOverlay,
  });

  const handleWaterfallViewChange = useCallback((next: WaterfallView) => {
    setWaterfallSpanHz(next.spanHz);
  }, []);

  // ── Assemble skin props (memoised) ─────────────────────────

  const openDevicePicker = useCallback(() => setDevicePickerOpen(true), []);
  const openSdrSettings = useCallback(() => setSdrSettingsOpen(true), []);

  const skinProps: SdrSkinProps = useMemo(
    () => ({
      radio: {
        effectiveState,
        smeterDbm: connectedDeviceId
          ? smeterById[connectedDeviceId]
          : undefined,
        fftEnabled,
        audioEnabled,
        selectedDevice,
        connectedDeviceId,
        canControlConnected,
        canStreamFft,
        canStreamAudio,
        daemonConnected,
        daemonError,
        lastResponseError,
        rit: effectiveState?.rit,
        xit: effectiveState?.xit,
        split: effectiveState?.split,
        anf: effectiveState?.anf,
        qsk: effectiveState?.qsk,
        vox: effectiveState?.vox,
        lock: effectiveState?.lock,
        txAntenna: effectiveState?.txAntenna,
        txMeter: effectiveState?.txMeter,
        cwSpeed: effectiveState?.cwSpeed,
        ifShift: effectiveState?.ifShift,
        agcMode: effectiveState?.agcMode,
      },
      fft: {
        lastFftFrame,
        audioFftFrame,
        waterfallView,
        tuningOverlay,
        waterfallOverlays,
      },
      spectrum: {
        spectrumPeakHold: sdrSettings.spectrumPeakHold,
        spectrumGradientFill: sdrSettings.spectrumGradientFill,
        spectrumBgColor: sdrSettings.spectrumBgColor,
        spectrumGridLines: sdrSettings.spectrumGridLines,
        spectrumVerticalGridLines: sdrSettings.spectrumVerticalGridLines,
        spectrumGridOpacity: sdrSettings.spectrumGridOpacity,
        spectrumSmoothing: sdrSettings.spectrumSmoothing,
        spectrumLineColor: sdrSettings.spectrumLineColor,
        spectrumLineWidth: sdrSettings.spectrumLineWidth,
        spectrumFillOpacity: sdrSettings.spectrumFillOpacity,
        spectrumLineShadow: sdrSettings.spectrumLineShadow,
        spectrumLineShadowBlur: sdrSettings.spectrumLineShadowBlur,
        tuningLineColor: sdrSettings.tuningLineColor,
        tuningArrowColor: sdrSettings.tuningArrowColor,
      },
      waterfall: {
        waterfallPalette: sdrSettings.waterfallPalette,
        waterfallMinDb: sdrSettings.waterfallMinDb,
        waterfallMaxDb: sdrSettings.waterfallMaxDb,
        waterfallSpeed: sdrSettings.waterfallSpeed,
        waterfallInterpolation: sdrSettings.waterfallInterpolation,
        waterfallGamma: sdrSettings.waterfallGamma,
        waterfallRowHeight: sdrSettings.waterfallRowHeight,
        passbandBlendMode: sdrSettings.passbandBlendMode,
        passbandOpacity: sdrSettings.passbandOpacity,
        sliceBgColor: sdrSettings.sliceBgColor,
      },
      ft8: {
        ft8DecoderEnabled: ft8Decoder.enabled,
        ft8DecoderMode: ft8Decoder.mode,
        ft8CycleProgress: ft8Decoder.cycleProgress,
        ft8DecoderStats: ft8Decoder.stats,
        ft8Error: ft8Decoder.error,
        onFt8Toggle: handleFt8Toggle,
        onFt8ModeChange: ft8Decoder.setMode,
      },
      decodes: {
        wsjtxStatus,
        wsjtxDecodes,
        clusterSpots,
      },
      controls: {
        freqInput,
        freqUnit,
        onTune: handleTune,
        onFreqInputChange: setFreqInput,
        onFreqUnitChange: setFreqUnit,
        onModeChange: handleModeChange,
        onGainChange: handleGainChange,
        onAgcToggle: handleAgcToggle,
        onAgcModeChange: handleAgcModeChange,
        onAntennaChange: handleAntennaChange,
        onFilterChange: handleFilterChange,
        onNrChange: handleNrChange,
        onNbChange: handleNbChange,
        onVfoChange: handleVfoChange,
        onPttChange: handlePttChange,
        onToggleFft: handleToggleFft,
        onToggleAudio: handleToggleAudio,
        onRitToggle: handleRitToggle,
        onRitOffset: handleRitOffset,
        onXitToggle: handleXitToggle,
        onXitOffset: handleXitOffset,
        onSplitToggle: handleSplitToggle,
        onAnfToggle: handleAnfToggle,
        onQskToggle: handleQskToggle,
        onVoxToggle: handleVoxToggle,
        onIfShift: handleIfShift,
        onCwSpeed: handleCwSpeed,
        onLockToggle: handleLockToggle,
      },
      dsp: {
        noiseGateEnabled: sdrSettings.sdrNoiseGateEnabled,
        noiseGateThreshold: sdrSettings.sdrNoiseGateThreshold,
        onNoiseGateToggle: handleNoiseGateToggle,
        onNoiseGateThresholdChange: handleNoiseGateThresholdChange,
        clientNrEnabled: sdrSettings.sdrNrEnabled,
        clientNrLevel: sdrSettings.sdrNrLevel,
        onClientNrToggle: handleClientNrToggle,
        onClientNrLevelChange: handleClientNrLevelChange,
        eqBands: sdrSettings.sdrEqBands,
        onAddEqBand: handleAddEqBand,
        onRemoveEqBand: handleRemoveEqBand,
        onUpdateEqBand: handleUpdateEqBand,
        onUpdateEqBandType: handleUpdateEqBandType,
        onToggleEqBand: handleToggleEqBand,
        onEqBandQChange: handleEqBandQChange,
        tuningStepHz: sdrSettings.tuningStepHz,
        onTuningStepChange: handleTuningStepChange,
        isRecording: recorderState.isRecording,
        recordingDurationSec: recorderState.durationSec,
        recordingEstimatedBytes: recorderState.estimatedBytes,
        hasRecording: recorderState.hasRecording,
        onStartRecording: handleStartRecording,
        onStopRecording: recorderActions.stopRecording,
        onExportRecording: recorderActions.exportWav,
        onDiscardRecording: recorderActions.discardRecording,
      },
      interaction: {
        onPickFrequencyHz: handlePickFrequencyHz,
        onSelectRangeHz: handleSelectRangeHz,
        onWheelTune: handleWheelTune,
        onWaterfallViewChange: handleWaterfallViewChange,
      },
      isMobile,
      lastDaemonStatus: lastStatus,
    }),
    [
      effectiveState,
      connectedDeviceId,
      smeterById,
      fftEnabled,
      audioEnabled,
      selectedDevice,
      canControlConnected,
      canStreamFft,
      canStreamAudio,
      daemonConnected,
      daemonError,
      lastResponseError,
      lastFftFrame,
      audioFftFrame,
      waterfallView,
      tuningOverlay,
      waterfallOverlays,
      sdrSettings,
      ft8Decoder.enabled,
      ft8Decoder.mode,
      ft8Decoder.cycleProgress,
      ft8Decoder.stats,
      ft8Decoder.error,
      handleFt8Toggle,
      ft8Decoder.setMode,
      wsjtxStatus,
      wsjtxDecodes,
      clusterSpots,
      freqInput,
      freqUnit,
      handleTune,
      handleModeChange,
      handleGainChange,
      handleAgcToggle,
      handleAgcModeChange,
      handleAntennaChange,
      handleFilterChange,
      handleNrChange,
      handleNbChange,
      handleVfoChange,
      handlePttChange,
      handleToggleFft,
      handleToggleAudio,
      handleRitToggle,
      handleRitOffset,
      handleXitToggle,
      handleXitOffset,
      handleSplitToggle,
      handleAnfToggle,
      handleQskToggle,
      handleVoxToggle,
      handleIfShift,
      handleCwSpeed,
      handleLockToggle,
      handleNoiseGateToggle,
      handleNoiseGateThresholdChange,
      handleClientNrToggle,
      handleClientNrLevelChange,
      handleAddEqBand,
      handleRemoveEqBand,
      handleUpdateEqBand,
      handleUpdateEqBandType,
      handleToggleEqBand,
      handleEqBandQChange,
      handleTuningStepChange,
      handlePickFrequencyHz,
      handleSelectRangeHz,
      handleWheelTune,
      handleWaterfallViewChange,
      recorderState.isRecording,
      recorderState.durationSec,
      recorderState.estimatedBytes,
      recorderState.hasRecording,
      handleStartRecording,
      recorderActions.stopRecording,
      recorderActions.exportWav,
      recorderActions.discardRecording,
      isMobile,
      lastStatus,
    ],
  );

  // ── Render ──────────────────────────────────────────────────

  const SkinComponent =
    activeSkin === "fate"
      ? FateSkin
      : activeSkin === "flexible"
        ? FlexibleSkin
        : ClassicSkin;

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
      <SdrSettingsModal
        isOpen={sdrSettingsOpen}
        onClose={() => setSdrSettingsOpen(false)}
      />
      <div className="flex flex-col h-[calc(100vh-3.5rem)]">
        <SdrConsoleHeader
          daemonConnected={daemonConnected}
          daemonConnecting={daemonConnecting}
          daemonUrl={daemonUrl}
          devices={devices}
          selectedDeviceId={selectedDeviceId}
          selectedDevice={selectedDevice}
          connectedDeviceId={connectedDeviceId}
          canControlDevice={canControlDevice}
          canControlConnected={canControlConnected}
          onDeviceSelect={setSelectedDeviceId}
          onConnectRadio={handleConnectRadio}
          onDisconnectRadio={handleDisconnectRadio}
          onOpenDevicePicker={openDevicePicker}
          onOpenSdrSettings={openSdrSettings}
          activeSkin={activeSkin}
          onSkinChange={handleSkinChange}
          isMobile={isMobile}
        />
        <div className="flex-1 min-h-0 overflow-y-auto">
          <SkinComponent {...skinProps} />
        </div>
      </div>
    </>
  );
}

export default SdrConsole;
