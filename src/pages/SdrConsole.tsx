/**
 * SDR Console — data/logic layer.
 * All rendering is delegated to the active skin component.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DevicePicker } from "@/components/sdr/DevicePicker";
import { useAudioStreamPlayer } from "@/hooks/useAudioStreamPlayer";
import { useAudioFft } from "@/hooks/useAudioFft";
import { AudioProcessingChain } from "@/lib/audio/audioProcessingChain";
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
import { SdrSettingsModal } from "@/components/sdr/SdrSettingsModal";
import { useFt8Decoder } from "@/hooks/useFt8Decoder";
import { useFt8DecoderStore } from "@/stores/ft8DecoderStore";
import { ClassicSkin } from "@/components/sdr/skins/ClassicSkin";
import { FlexibleSkin } from "@/components/sdr/skins/FlexibleSkin";
import { FateSkin } from "@/components/sdr/skins/fate/FateSkin";
import type { SdrSkinProps, SdrSkinName } from "@/components/sdr/skins/types";
import { useSdrSettings } from "@/hooks/useSdrSettings";

const DEFAULT_DAEMON_URL = "ws://127.0.0.1:9867";
const LS_DAEMON_URL_KEY = "propulse-radio-daemon-url";
const LS_LAST_DEVICE_KEY = "propulse-radio-daemon-device";

/** Modes compatible with FT8/FT4 decoding (all upper-sideband digital variants). */
const FT8_USB_MODES = ["USB", "DIGU", "DATA-U", "DIGI-U", "USB-D"];
const isFt8CompatibleMode = (m: string) =>
  FT8_USB_MODES.includes(m.toUpperCase());

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

  // ── Settings (consolidated via shallow-equality hook) ──────
  const sdrSettings = useSdrSettings();

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
  const effectiveState = draftState ?? connectedState;
  const effectiveStateRef = useRef(effectiveState);
  effectiveStateRef.current = effectiveState;

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

  // ── Audio DSP chain (notch filters, noise gate, spectral NR) ──

  const audioChainRef = useRef<AudioProcessingChain | null>(null);

  // Lazily create the chain when audio becomes enabled
  const processingChain = useMemo(() => {
    if (!audioEnabled) {
      if (audioChainRef.current) {
        audioChainRef.current.dispose();
        audioChainRef.current = null;
      }
      return null;
    }
    if (!audioChainRef.current) {
      // AudioContext will be created by useAudioStreamPlayer — use a temporary
      // one here that the chain will connect to internally. The player hook
      // passes audio through chain.getInputNode() → chain.getOutputNode().
      audioChainRef.current = new AudioProcessingChain(new AudioContext());
    }
    return audioChainRef.current;
  }, [audioEnabled]);

  // Sync noise gate settings to chain
  useEffect(() => {
    if (!processingChain) return;
    processingChain.setNoiseGate(sdrSettings.sdrNoiseGateEnabled, {
      threshold: sdrSettings.sdrNoiseGateThreshold,
    });
  }, [
    processingChain,
    sdrSettings.sdrNoiseGateEnabled,
    sdrSettings.sdrNoiseGateThreshold,
  ]);

  // Sync spectral NR settings to chain
  useEffect(() => {
    if (!processingChain) return;
    processingChain.setSpectralNr(sdrSettings.sdrNrEnabled, {
      nrLevel: sdrSettings.sdrNrLevel,
    });
  }, [processingChain, sdrSettings.sdrNrEnabled, sdrSettings.sdrNrLevel]);

  // Cleanup chain on unmount
  useEffect(() => {
    return () => {
      audioChainRef.current?.dispose();
      audioChainRef.current = null;
    };
  }, []);

  useAudioStreamPlayer({
    enabled: audioEnabled,
    frame: lastAudioFrame
      ? {
          sampleRate: lastAudioFrame.sampleRate,
          samples: lastAudioFrame.samples,
        }
      : null,
    processingChain,
    notchFilters: sdrSettings.sdrNotchFilters,
  });

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

  const handleVfoChange = useCallback(
    (vfo: "A" | "B") => {
      if (!connectedDeviceId) return;
      daemonSendCommand("radio:vfo", { device_id: connectedDeviceId, vfo });
      setDraftState((s) => (s ? { ...s, vfo } : s));
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

  // ── FT8/FT4 toggle — full auto-configuration ─────────────
  //
  // FT8 decoding requires specific radio + DSP settings to work reliably.
  // When enabling:  save current state, configure radio for FT8, start streams.
  // When disabling: restore all previous settings.
  //
  // The decoder itself uses getUserMedia (system audio loopback), not the
  // bridge audio stream — but we auto-start FFT so the waterfall shows signals.

  const preFt8SettingsRef = useRef<{
    mode: string | null;
    filter: { low: number; high: number } | null;
    agc: boolean | null;
    nr: { enabled: boolean; level: number } | null;
    nb: { enabled: boolean; threshold?: number } | null;
    clientNr: boolean;
    noiseGate: boolean;
  } | null>(null);

  const handleFt8Toggle = useCallback(() => {
    const wasEnabled = ft8Decoder.enabled;
    ft8Decoder.toggle();

    if (!wasEnabled) {
      // ── ENABLING ──────────────────────────────────────────────
      const state = effectiveStateRef.current;
      const settings = useSettingsStore.getState();

      // 1. Snapshot current radio + client-side DSP settings
      preFt8SettingsRef.current = {
        mode: state?.mode ?? null,
        filter: state?.filter ? { ...state.filter } : null,
        agc: state?.agc ?? null,
        nr: state?.nr ? { ...state.nr } : null,
        nb: state?.nb ? { ...state.nb } : null,
        clientNr: settings.sdrNrEnabled,
        noiseGate: settings.sdrNoiseGateEnabled,
      };

      if (connectedDeviceId) {
        // 2. Mode → USB if not already an FT8-compatible sideband mode
        if (state?.mode && !isFt8CompatibleMode(state.mode)) {
          handleModeChange("USB");
        }

        // 3. Filter → 0–3000 Hz (full FT8 decode window)
        handleFilterChange(0, 3000);

        // 4. AGC off — prevents audio level modulation that corrupts decoding
        if (state?.agc !== false) {
          handleAgcToggle(false);
        }

        // 5. Hardware NR off — DSP noise reduction mangles FT8 waveforms
        if (state?.nr?.enabled) {
          handleNrChange(false, state.nr.level);
        }

        // 6. Hardware NB off — noise blanker clips FT8 signal pulses
        if (state?.nb?.enabled) {
          handleNbChange(false, state.nb.threshold ?? 0);
        }

        // 7. Auto-start FFT streaming so waterfall shows FT8 signals
        if (!useSdrStore.getState().fftEnabled) {
          handleToggleFft();
        }
      }

      // 8. Client-side NR off — same reason as hardware NR
      if (settings.sdrNrEnabled) {
        useSettingsStore.getState().updatePreferences({ sdrNrEnabled: false });
      }

      // 9. Client-side noise gate off — would squelch weak FT8 signals
      if (settings.sdrNoiseGateEnabled) {
        useSettingsStore
          .getState()
          .updatePreferences({ sdrNoiseGateEnabled: false });
      }
    } else {
      // ── DISABLING — restore previous settings ─────────────────
      const saved = preFt8SettingsRef.current;

      if (saved && connectedDeviceId) {
        // Restore mode (only if we changed it)
        if (saved.mode && !isFt8CompatibleMode(saved.mode)) {
          handleModeChange(saved.mode);
        }

        // Restore filter
        if (saved.filter) {
          handleFilterChange(saved.filter.low, saved.filter.high);
        }

        // Restore AGC
        if (saved.agc === true) {
          handleAgcToggle(true);
        }

        // Restore hardware NR
        if (saved.nr?.enabled) {
          handleNrChange(true, saved.nr.level);
        }

        // Restore hardware NB
        if (saved.nb?.enabled) {
          handleNbChange(true, saved.nb.threshold ?? 0);
        }
      }

      // Restore client-side DSP (works even without radio connection)
      if (saved) {
        if (saved.clientNr) {
          useSettingsStore.getState().updatePreferences({ sdrNrEnabled: true });
        }
        if (saved.noiseGate) {
          useSettingsStore
            .getState()
            .updatePreferences({ sdrNoiseGateEnabled: true });
        }
      }

      // Don't stop FFT/audio streaming — user may want those running
      preFt8SettingsRef.current = null;
    }
  }, [
    connectedDeviceId,
    ft8Decoder,
    handleAgcToggle,
    handleFilterChange,
    handleModeChange,
    handleNbChange,
    handleNrChange,
    handleToggleFft,
  ]);

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

  // ── Audio-derived FFT for zoom waterfall (~11.7 Hz/bin) ──
  const audioFftFrame = useAudioFft({
    enabled: audioEnabled,
    audioFrame: lastAudioFrame,
    tuning: tuningOverlay,
  });

  const handleWaterfallViewChange = useCallback((next: WaterfallView) => {
    setWaterfallSpanHz(next.spanHz);
  }, []);

  /**
   * Smart snap: find the center of a signal near clickedHz using FFT data.
   * Returns the centroid frequency if a signal is found above noise floor,
   * or null to fall back to step-size snapping.
   */
  const smartSnap = useCallback(
    (clickedHz: number): number | null => {
      const frame = lastFftFrame;
      if (!frame || frame.bins.length < 4) return null;

      const bins = frame.bins;
      const startHz = frame.centerHz - frame.spanHz / 2;
      const hzPerBin = frame.spanHz / bins.length;

      // Search window: +/- half the step size (min 2 kHz, max 10 kHz)
      const searchWindowHz = Math.max(
        2000,
        Math.min(10000, sdrSettings.tuningStepHz * 3),
      );
      const searchStartBin = Math.max(
        0,
        Math.floor((clickedHz - searchWindowHz - startHz) / hzPerBin),
      );
      const searchEndBin = Math.min(
        bins.length - 1,
        Math.ceil((clickedHz + searchWindowHz - startHz) / hzPerBin),
      );
      if (searchEndBin <= searchStartBin) return null;

      // Compute noise floor as the median of the search window
      const windowVals: number[] = [];
      for (let i = searchStartBin; i <= searchEndBin; i++) {
        windowVals.push(bins[i]);
      }
      windowVals.sort((a, b) => a - b);
      const noiseFloor = windowVals[Math.floor(windowVals.length / 2)];

      // Find the strongest bin above noise floor + threshold
      const threshold = 6; // dB above noise floor to count as a signal
      let peakBin = -1;
      let peakDb = -Infinity;
      for (let i = searchStartBin; i <= searchEndBin; i++) {
        if (bins[i] > peakDb && bins[i] > noiseFloor + threshold) {
          peakDb = bins[i];
          peakBin = i;
        }
      }
      if (peakBin === -1) return null; // No signal found

      // Refine center using power-weighted centroid around peak
      const refineBins = Math.max(2, Math.round(1500 / hzPerBin)); // ~1.5 kHz radius
      const lo = Math.max(0, peakBin - refineBins);
      const hi = Math.min(bins.length - 1, peakBin + refineBins);
      let weightedSum = 0;
      let weightSum = 0;
      for (let i = lo; i <= hi; i++) {
        // Convert dB to linear power for weighting; floor at noise level
        const dbAboveNoise = Math.max(0, bins[i] - noiseFloor);
        const linear = Math.pow(10, dbAboveNoise / 10);
        weightedSum += linear * i;
        weightSum += linear;
      }
      if (weightSum <= 0) return null;

      const centroidBin = weightedSum / weightSum;
      return startHz + centroidBin * hzPerBin;
    },
    [lastFftFrame, sdrSettings.tuningStepHz],
  );

  const handlePickFrequencyHz = useCallback(
    (hz: number) => {
      if (!connectedDeviceId) return;

      // Smart snap: try to find signal center, fall back to step-size snap
      let snappedHz: number;
      const signalCenter = smartSnap(hz);
      if (signalCenter !== null) {
        // Snap the signal center to the step grid for clean frequency
        snappedHz =
          Math.round(signalCenter / sdrSettings.tuningStepHz) *
          sdrSettings.tuningStepHz;
      } else {
        // No signal detected — snap to nearest step
        snappedHz =
          Math.round(hz / sdrSettings.tuningStepHz) * sdrSettings.tuningStepHz;
      }

      daemonSendCommand("radio:tune", {
        device_id: connectedDeviceId,
        freq: snappedHz,
      });
      setDraftState((s) => (s ? { ...s, freq: snappedHz } : s));
      const base =
        freqUnit === "MHz"
          ? snappedHz / 1_000_000
          : freqUnit === "kHz"
            ? snappedHz / 1_000
            : snappedHz;
      const text =
        freqUnit === "MHz"
          ? base.toFixed(6)
          : freqUnit === "kHz"
            ? base.toFixed(3)
            : Math.round(base).toString();
      setFreqInput(text);
    },
    [
      connectedDeviceId,
      daemonSendCommand,
      freqUnit,
      smartSnap,
      sdrSettings.tuningStepHz,
    ],
  );

  const handleTuningStepChange = useCallback(
    (stepHz: number) => updatePreferences({ sdrTuningStepHz: stepHz }),
    [updatePreferences],
  );

  const handleWheelTune = useCallback(
    (direction: number) => {
      if (!connectedDeviceId || !effectiveState) return;
      const currentHz = effectiveState.freq;
      const stepHz = sdrSettings.tuningStepHz;
      const candidateHz = currentHz + direction * stepHz;

      // Smart snap: look for a signal near the candidate, but ONLY accept
      // results that are in the same direction as travel (or at least not
      // behind the current frequency). This prevents the oscillation where
      // a strong signal behind you keeps pulling you backwards.
      let snappedHz: number;
      const signalCenter = smartSnap(candidateHz);
      if (signalCenter !== null) {
        const signalSnapped = Math.round(signalCenter / stepHz) * stepHz;
        // Accept the snap only if it moves in the intended direction
        const movedCorrectDirection =
          direction > 0 ? signalSnapped > currentHz : signalSnapped < currentHz;
        snappedHz = movedCorrectDirection
          ? signalSnapped
          : Math.round(candidateHz / stepHz) * stepHz;
      } else {
        snappedHz = Math.round(candidateHz / stepHz) * stepHz;
      }

      // Guard: if snapping somehow didn't move at all, force one step
      if (snappedHz === currentHz) {
        snappedHz = currentHz + direction * stepHz;
      }

      daemonSendCommand("radio:tune", {
        device_id: connectedDeviceId,
        freq: snappedHz,
      });
      setDraftState((s) => (s ? { ...s, freq: snappedHz } : s));
      const base =
        freqUnit === "MHz"
          ? snappedHz / 1_000_000
          : freqUnit === "kHz"
            ? snappedHz / 1_000
            : snappedHz;
      const text =
        freqUnit === "MHz"
          ? base.toFixed(6)
          : freqUnit === "kHz"
            ? base.toFixed(3)
            : Math.round(base).toString();
      setFreqInput(text);
    },
    [
      connectedDeviceId,
      daemonSendCommand,
      effectiveState,
      freqUnit,
      smartSnap,
      sdrSettings.tuningStepHz,
    ],
  );

  const handleAddNotch = useCallback((freqHz: number, q: number) => {
    const id = crypto.randomUUID?.() ?? `notch-${Date.now()}`;
    const current = useSettingsStore.getState().sdrNotchFilters;
    if (current.length >= 8) return; // max 8
    useSettingsStore.getState().updatePreferences({
      sdrNotchFilters: [...current, { id, freqHz, q, enabled: true }],
    });
  }, []);

  const handleRemoveNotch = useCallback((id: string) => {
    const current = useSettingsStore.getState().sdrNotchFilters;
    useSettingsStore.getState().updatePreferences({
      sdrNotchFilters: current.filter((n) => n.id !== id),
    });
  }, []);

  const handleUpdateNotch = useCallback(
    (id: string, freqHz: number, q: number) => {
      const current = useSettingsStore.getState().sdrNotchFilters;
      useSettingsStore.getState().updatePreferences({
        sdrNotchFilters: current.map((n) =>
          n.id === id ? { ...n, freqHz, q } : n,
        ),
      });
    },
    [],
  );

  const handleToggleNotch = useCallback((id: string, enabled: boolean) => {
    const current = useSettingsStore.getState().sdrNotchFilters;
    useSettingsStore.getState().updatePreferences({
      sdrNotchFilters: current.map((n) =>
        n.id === id ? { ...n, enabled } : n,
      ),
    });
  }, []);

  const handleNoiseGateToggle = useCallback((enabled: boolean) => {
    useSettingsStore.getState().updatePreferences({
      sdrNoiseGateEnabled: enabled,
    });
  }, []);

  const handleNoiseGateThresholdChange = useCallback((threshold: number) => {
    useSettingsStore.getState().updatePreferences({
      sdrNoiseGateThreshold: threshold,
    });
  }, []);

  const handleClientNrToggle = useCallback((enabled: boolean) => {
    useSettingsStore.getState().updatePreferences({ sdrNrEnabled: enabled });
  }, []);

  const handleClientNrLevelChange = useCallback((level: number) => {
    useSettingsStore.getState().updatePreferences({ sdrNrLevel: level });
  }, []);

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

  // ── Assemble skin props (memoised) ─────────────────────────

  const openDevicePicker = useCallback(() => setDevicePickerOpen(true), []);
  const openSdrSettings = useCallback(() => setSdrSettingsOpen(true), []);

  const skinProps: SdrSkinProps = useMemo(
    () => ({
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
      audioFftFrame,
      waterfallView,
      tuningOverlay,
      waterfallOverlays,

      waterfallPalette: sdrSettings.waterfallPalette,
      waterfallMinDb: sdrSettings.waterfallMinDb,
      waterfallMaxDb: sdrSettings.waterfallMaxDb,
      waterfallSpeed: sdrSettings.waterfallSpeed,
      waterfallInterpolation: sdrSettings.waterfallInterpolation,
      waterfallGamma: sdrSettings.waterfallGamma,
      waterfallRowHeight: sdrSettings.waterfallRowHeight,
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
      passbandBlendMode: sdrSettings.passbandBlendMode,
      passbandOpacity: sdrSettings.passbandOpacity,
      sliceBgColor: sdrSettings.sliceBgColor,
      tuningStepHz: sdrSettings.tuningStepHz,
      tuningLineColor: sdrSettings.tuningLineColor,
      tuningArrowColor: sdrSettings.tuningArrowColor,
      onTuningStepChange: handleTuningStepChange,
      onWheelTune: handleWheelTune,

      noiseGateEnabled: sdrSettings.sdrNoiseGateEnabled,
      noiseGateThreshold: sdrSettings.sdrNoiseGateThreshold,
      onNoiseGateToggle: handleNoiseGateToggle,
      onNoiseGateThresholdChange: handleNoiseGateThresholdChange,

      clientNrEnabled: sdrSettings.sdrNrEnabled,
      clientNrLevel: sdrSettings.sdrNrLevel,
      onClientNrToggle: handleClientNrToggle,
      onClientNrLevelChange: handleClientNrLevelChange,

      notchFilters: sdrSettings.sdrNotchFilters,
      onAddNotch: handleAddNotch,
      onRemoveNotch: handleRemoveNotch,
      onUpdateNotch: handleUpdateNotch,
      onToggleNotch: handleToggleNotch,

      freqInput,
      freqUnit,

      wsjtxStatus,
      wsjtxDecodes,
      clusterSpots,

      ft8DecoderEnabled: ft8Decoder.enabled,
      ft8DecoderMode: ft8Decoder.mode,
      ft8CycleProgress: ft8Decoder.cycleProgress,
      ft8DecoderStats: ft8Decoder.stats,
      ft8Error: ft8Decoder.error,
      onFt8Toggle: handleFt8Toggle,
      onFt8ModeChange: ft8Decoder.setMode,

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
      onVfoChange: handleVfoChange,
      onPttChange: handlePttChange,
      onToggleFft: handleToggleFft,
      onToggleAudio: handleToggleAudio,
      onDeviceSelect: setSelectedDeviceId,
      onWaterfallViewChange: handleWaterfallViewChange,
      onPickFrequencyHz: handlePickFrequencyHz,
      onSelectRangeHz: handleSelectRangeHz,
      onOpenDevicePicker: openDevicePicker,
      onOpenSdrSettings: openSdrSettings,
    }),
    [
      daemonConnected,
      daemonConnecting,
      daemonError,
      daemonUrl,
      lastResponseError,
      lastStatus,
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
      smeterById,
      fftEnabled,
      audioEnabled,
      lastFftFrame,
      audioFftFrame,
      waterfallView,
      tuningOverlay,
      waterfallOverlays,
      sdrSettings,
      handleTuningStepChange,
      handleWheelTune,
      handleNoiseGateToggle,
      handleNoiseGateThresholdChange,
      handleClientNrToggle,
      handleClientNrLevelChange,
      handleAddNotch,
      handleRemoveNotch,
      handleUpdateNotch,
      handleToggleNotch,
      freqInput,
      freqUnit,
      wsjtxStatus,
      wsjtxDecodes,
      clusterSpots,
      ft8Decoder.enabled,
      ft8Decoder.mode,
      ft8Decoder.cycleProgress,
      ft8Decoder.stats,
      ft8Decoder.error,
      handleFt8Toggle,
      ft8Decoder.setMode,
      isMobile,
      activeSkin,
      handleSkinChange,
      handleConnectRadio,
      handleDisconnectRadio,
      handleTune,
      handleModeChange,
      handleGainChange,
      handleAgcToggle,
      handleAntennaChange,
      handleFilterChange,
      handleNrChange,
      handleNbChange,
      handleVfoChange,
      handlePttChange,
      handleToggleFft,
      handleToggleAudio,
      setSelectedDeviceId,
      handleWaterfallViewChange,
      handlePickFrequencyHz,
      handleSelectRangeHz,
      openDevicePicker,
      openSdrSettings,
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
