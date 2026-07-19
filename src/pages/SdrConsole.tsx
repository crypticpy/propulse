/**
 * SDR Console — data/logic layer.
 * All rendering is delegated to the active skin component.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DevicePicker } from "@/components/sdr/DevicePicker";
import { useAudioStreamPlayer } from "@/hooks/useAudioStreamPlayer";
import { useAudioFft, type AudioFrameData } from "@/hooks/useAudioFft";
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
import {
  useAudioDspChain,
  getSharedAudioContext,
  primeAudioContextForPlayback,
  resetSharedAudioContext,
} from "@/hooks/useAudioDspChain";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { useFt8DecodeEnricher } from "@/hooks/useFt8DecodeEnricher";
import { useFt8TimeSync } from "@/hooks/useFt8TimeSync";
import { useFt8SessionStore } from "@/stores/ft8SessionStore";
import { freqToBand } from "@/lib/ft8/ft8BandPresets";
import type { Ft8BandPreset } from "@/lib/ft8/ft8BandPresets";
import { DEFAULT_FFT_STREAM_FPS } from "@/lib/sdr/fftStreamParams";

const DEFAULT_DAEMON_URL = "ws://127.0.0.1:9867";
const LS_DAEMON_URL_KEY = "propulse-radio-daemon-url";
const LS_LAST_DEVICE_KEY = "propulse-radio-daemon-device";

type StreamKind = "fft" | "audio";
type StreamAction = "start" | "stop";
type DaemonSendCommand = (
  type: string,
  payload?: Record<string, unknown>,
) => string | null;

export function SdrConsole() {
  const isMobile = useIsMobile();
  // Keep daemon FFT stream rate stable; waterfall "speed" is a client-side
  // scroll multiplier (rows appended per received frame).
  const showAudioDebug = useMemo(() => {
    // Allow forcing this on via URL for quick field debugging.
    try {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get("audioDebug") === "1") return true;
    } catch {
      // ignore
    }

    if (!import.meta.env.DEV) return false;
    try {
      return localStorage.getItem("sdr-audio-debug") === "1";
    } catch {
      return false;
    }
  }, []);

  // ── Skin selection ──────────────────────────────────────────
  const sdrSkinName = useSettingsStore((s) => s.sdrSkinName ?? "classic");
  const pttSafetyLockout = useSettingsStore((s) => s.catPttLockout);
  const daemonAuthToken = useSettingsStore((s) => s.radioDaemonAuthToken);
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
        // Persist decodes with the current dial frequency / band / callsign so
        // IndexedDB history rows aren't stored with undefined context.
        const radio = useRadioStore.getState();
        const deviceId = radio.connectedDeviceId;
        const dialHz = deviceId
          ? radio.radioStateById[deviceId]?.freq
          : undefined;
        const band = dialHz != null ? freqToBand(dialHz) : undefined;
        const myCallsign =
          useFt8SessionStore.getState().myCallsign || undefined;
        ft8AddDecodes(decodes, dialHz, band, myCallsign);
      },
      [ft8AddDecodes],
    ),
  });

  // ── FT8 enriched decodes + time sync + session ───────────────
  const ft8MyCallsign = useFt8SessionStore((s) => s.myCallsign);
  const ft8MyGrid = useFt8SessionStore((s) => s.myGrid);
  const ft8EnrichedDecodes = useFt8DecodeEnricher({
    myCallsign: ft8MyCallsign || undefined,
    myGrid: ft8MyGrid || undefined,
  });
  const { syncResult: ft8TimeSyncResult } = useFt8TimeSync(ft8Decoder.enabled);
  const autoConnectAttemptedRef = useRef(false);
  const autoConfigAttemptedRef = useRef(false);
  const autoFftStartRef = useRef<Record<string, boolean>>({});
  const audioRestartAttemptsRef = useRef<Record<string, number>>({});
  // Latest WSJT-X dial frequency (Hz) for tagging external decodes; a ref so
  // the WS message handler doesn't depend on wsjtxStatus state.
  const wsjtxDialRef = useRef<number | undefined>(undefined);
  const lastAudioFrameAtRef = useRef(0);
  const [waterfallSpanHz, setWaterfallSpanHz] = useState<number | null>(null);

  // ── Radio store ─────────────────────────────────────────────
  const devices = useRadioStore((s) => s.devices);
  const selectedDeviceId = useRadioStore((s) => s.selectedDeviceId);
  const connectedDeviceId = useRadioStore((s) => s.connectedDeviceId);
  const radioStateById = useRadioStore((s) => s.radioStateById);
  const smeterById = useRadioStore((s) => s.smeterDbmById);
  const lastStatus = useRadioStore((s) => s.lastDaemonStatus);

  const resetRadioStore = useRadioStore((s) => s.reset);
  const markTransportDisconnected = useRadioStore(
    (s) => s.markTransportDisconnected,
  );
  const setDevices = useRadioStore((s) => s.setDevices);
  const setSelectedDeviceId = useRadioStore((s) => s.setSelectedDeviceId);
  const upsertRadioState = useRadioStore((s) => s.upsertRadioState);
  const setSmeterDbm = useRadioStore((s) => s.setSmeterDbm);
  const setLastDaemonStatus = useRadioStore((s) => s.setLastDaemonStatus);

  // ── SDR store ───────────────────────────────────────────────
  const fftEnabled = useSdrStore((s) => s.fftEnabled);
  const audioEnabled = useSdrStore((s) => s.audioEnabled);
  const lastFftFrame = useSdrStore((s) => s.lastFftFrame);
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
  const pushAudioPlaybackRef = useRef<(frame: AudioFrameData) => void>(() => {
    // no-op until hooks initialize
  });
  const pushAudioFftRef = useRef<(frame: AudioFrameData) => void>(() => {
    // no-op until hooks initialize
  });
  const sharedAudioCtxRef = useRef<AudioContext | null>(null);
  const playbackPushCountRef = useRef(0);
  const fftPushCountRef = useRef(0);
  const audioPeakRef = useRef<number | null>(null);
  const [beepCount, setBeepCount] = useState(0);
  const [audioDebug, setAudioDebug] = useState<{
    ctxState: AudioContextState | null;
    lastFrameAgeMs: number | null;
    playbackPushCount: number;
    fftPushCount: number;
    peak: number | null;
    ctxSampleRate: number | null;
  }>({
    ctxState: null,
    lastFrameAgeMs: null,
    playbackPushCount: 0,
    fftPushCount: 0,
    peak: null,
    ctxSampleRate: null,
  });
  const lastBeepAtRef = useRef(0);
  const desiredFftRef = useRef(false);
  const desiredAudioRef = useRef(false);
  const pendingStreamCommandsRef = useRef(
    new Map<
      string,
      { kind: StreamKind; action: StreamAction; deviceId: string }
    >(),
  );
  const streamStartTimeoutsRef = useRef<
    Partial<Record<StreamKind, number>>
  >({});
  const commandResponseHandlerRef = useRef<
    (id: string, success: boolean) => boolean
  >(() => false);

  const clearStreamStartTimeout = useCallback((kind: StreamKind) => {
    const timeout = streamStartTimeoutsRef.current[kind];
    if (timeout !== undefined) {
      window.clearTimeout(timeout);
      delete streamStartTimeoutsRef.current[kind];
    }
  }, []);

  const trackStreamCommand = useCallback(
    (
      id: string | null,
      kind: StreamKind,
      action: StreamAction,
      deviceId: string,
    ) => {
      if (!id) {
        if (kind === "fft") {
          desiredFftRef.current = false;
          setFftEnabled(false);
        } else {
          desiredAudioRef.current = false;
          setAudioEnabled(false);
        }
        setLastResponseError(`Unable to send ${kind.toUpperCase()} stream command`);
        return false;
      }
      pendingStreamCommandsRef.current.set(id, { kind, action, deviceId });
      return true;
    },
    [setAudioEnabled, setFftEnabled],
  );

  const requestFftStart = useCallback(
    (sendCommand: DaemonSendCommand, deviceId: string) => {
      desiredFftRef.current = true;
      setFftEnabled(false);
      clearStreamStartTimeout("fft");
      const storedPort = parseInt(
        localStorage.getItem("propulse-civ-port") || "4580",
        10,
      );
      const id = sendCommand("stream:fft:start", {
        device_id: deviceId,
        fft_size: 4096,
        fps: DEFAULT_FFT_STREAM_FPS,
        averaging: 4,
        civ_port: storedPort > 0 ? storedPort : 4580,
      });
      return trackStreamCommand(id, "fft", "start", deviceId);
    },
    [clearStreamStartTimeout, setFftEnabled, trackStreamCommand],
  );

  const requestAudioStart = useCallback(
    (sendCommand: DaemonSendCommand, deviceId: string) => {
      desiredAudioRef.current = true;
      setAudioEnabled(false);
      clearStreamStartTimeout("audio");
      audioRestartAttemptsRef.current[deviceId] = 0;
      lastAudioFrameAtRef.current = performance.now();
      const id = sendCommand("stream:audio:start", {
        device_id: deviceId,
        sample_rate: 48000,
        format: "pcm_i16",
      });
      return trackStreamCommand(id, "audio", "start", deviceId);
    },
    [clearStreamStartTimeout, setAudioEnabled, trackStreamCommand],
  );

  const debugBeep = useCallback(() => {
    const now = performance.now();
    if (now - lastBeepAtRef.current < 250) return;
    lastBeepAtRef.current = now;

    const ctx = sharedAudioCtxRef.current ?? getSharedAudioContext();
    sharedAudioCtxRef.current = ctx;
    void ctx.resume().catch(() => undefined);

    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.02);
    g.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
    osc.frequency.value = 880;
    osc.connect(g);
    g.connect(ctx.destination);
    const t0 = ctx.currentTime + 0.01;
    osc.start(t0);
    osc.stop(t0 + 0.45);
    setBeepCount((c) => c + 1);
  }, []);

  const debugResetCtx = useCallback(() => {
    resetSharedAudioContext();
    sharedAudioCtxRef.current = getSharedAudioContext();
    primeAudioContextForPlayback();
  }, []);

  useEffect(() => {
    if (!showAudioDebug) return;
    const w = window as unknown as {
      __sdrAudioDebug?: { beep: () => void; resetCtx: () => void };
    };
    w.__sdrAudioDebug = { beep: debugBeep, resetCtx: debugResetCtx };
    return () => {
      delete w.__sdrAudioDebug;
    };
  }, [debugBeep, debugResetCtx, showAudioDebug]);

  // ── Daemon message handler ──────────────────────────────────
  const handleDaemonMessage = useCallback(
    (
      msg: DaemonIncomingMessage,
      api: Pick<ReturnType<typeof useRadioDaemon>, "sendCommand">,
    ) => {
      if (isDevicesListMessage(msg)) {
        setDevices(msg.devices);

        // If the bridge reports no devices but we have a configured backend
        // in settingsStore, send radio:connect with the stored config so
        // the bridge starts the right rig controller.
        if (msg.devices.length === 0 && !autoConfigAttemptedRef.current) {
          autoConfigAttemptedRef.current = true;
          const s = useSettingsStore.getState();
          if (
            s.catBackend &&
            s.catBackend !== "auto" &&
            s.catBackend !== "disabled"
          ) {
            const configPayload: Record<string, unknown> = {
              backend: s.catBackend,
            };
            if (s.catBackend === "icom-serial" && s.catIcomSerialPort) {
              configPayload.serialPort = s.catIcomSerialPort;
              configPayload.baudRate = s.catIcomBaudRate;
              configPayload.radioAddress = s.catIcomRadioAddress;
            } else if (
              s.catBackend === "icom-network" &&
              s.catIcomNetworkHost
            ) {
              configPayload.host = s.catIcomNetworkHost;
              configPayload.username = s.catIcomNetworkUsername;
              configPayload.password = s.catIcomNetworkPassword;
            } else if (s.catBackend === "hamlib") {
              configPayload.host = s.catHamlibHost;
              configPayload.port = s.catHamlibPort;
            } else if (s.catBackend === "flrig") {
              configPayload.host = s.catFlrigHost;
              configPayload.port = s.catFlrigPort;
            }
            api.sendCommand("radio:connect", configPayload);
          }
        }
        return;
      }
      if (isDevicesAddedMessage(msg) || isDevicesRemovedMessage(msg)) {
        api.sendCommand("devices:enumerate");
        return;
      }
      if (isRadioStateMessage(msg)) {
        upsertRadioState(msg.device_id, msg.state);

        // Re-subscribe to streams on reconnect (after radio confirms connected)
        if (msg.state.connected && needsStreamResyncRef.current) {
          needsStreamResyncRef.current = false;
          if (desiredFftRef.current) {
            // Mark auto-start as done so the auto-start effect doesn't also
            // emit a duplicate stream:fft:start for this device.
            autoFftStartRef.current[msg.device_id] = true;
            requestFftStart(api.sendCommand, msg.device_id);
          }
          if (desiredAudioRef.current) {
            requestAudioStart(api.sendCommand, msg.device_id);
          }
        }
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
        const streamCommand = pendingStreamCommandsRef.current.get(msg.id);
        if (streamCommand) {
          pendingStreamCommandsRef.current.delete(msg.id);
          const { kind, action, deviceId } = streamCommand;
          clearStreamStartTimeout(kind);

          if (!msg.success) {
            if (kind === "fft") {
              desiredFftRef.current = false;
              setFftEnabled(false);
            } else {
              desiredAudioRef.current = false;
              setAudioEnabled(false);
            }
          } else if (action === "start") {
            const desired =
              kind === "fft" ? desiredFftRef.current : desiredAudioRef.current;
            const activeDeviceId = useRadioStore.getState().connectedDeviceId;
            if (!desired || activeDeviceId !== deviceId) {
              api.sendCommand(`stream:${kind}:stop`, { device_id: deviceId });
              commandResponseHandlerRef.current(msg.id, msg.success);
              return;
            }
            const timeoutMs = kind === "fft" ? 30_000 : 8_000;
            streamStartTimeoutsRef.current[kind] = window.setTimeout(() => {
              delete streamStartTimeoutsRef.current[kind];
              const desired =
                kind === "fft" ? desiredFftRef.current : desiredAudioRef.current;
              const active =
                kind === "fft"
                  ? useSdrStore.getState().fftEnabled
                  : useSdrStore.getState().audioEnabled;
              if (!desired || active) return;

              if (kind === "fft") {
                desiredFftRef.current = false;
                setFftEnabled(false);
              } else {
                desiredAudioRef.current = false;
                setAudioEnabled(false);
              }
              api.sendCommand(`stream:${kind}:stop`, { device_id: deviceId });
              setLastResponseError(
                `${kind.toUpperCase()} stream started but produced no usable frames`,
              );
            }, timeoutMs);
          }
        }
        commandResponseHandlerRef.current(msg.id, msg.success);
        const err =
          typeof msg.error === "string" ? msg.error : "Command failed";
        if (!msg.success) setLastResponseError(err);
        return;
      }
      if (isDaemonDiscoveryDaemonsMessage(msg)) {
        setDiscoveredDaemons(msg.daemons);
        return;
      }
      if (isWsjtxStatusMessage(msg)) {
        wsjtxDialRef.current = msg.status.frequency;
        setWsjtxStatus(msg.status);
        return;
      }
      if (isWsjtxDecodeMessage(msg)) {
        const dialHz = wsjtxDialRef.current;
        const band = dialHz != null ? freqToBand(dialHz) : undefined;
        const myCallsign =
          useFt8SessionStore.getState().myCallsign || undefined;
        ft8AddDecodes([msg.decode], dialHz, band, myCallsign);
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
      clearStreamStartTimeout,
      requestAudioStart,
      requestFftStart,
      setAudioEnabled,
      setDevices,
      setFftEnabled,
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
      if (frame.kind === "fft") {
        if (!desiredFftRef.current) return;
        clearStreamStartTimeout("fft");
        if (!useSdrStore.getState().fftEnabled) setFftEnabled(true);
        setFrame(frame);
        return;
      }

      if (!desiredAudioRef.current) return;
      clearStreamStartTimeout("audio");
      if (!useSdrStore.getState().audioEnabled) setAudioEnabled(true);

      const audioFrame: AudioFrameData = {
        sampleRate: frame.sampleRate,
        samples: frame.samples,
      };
      lastAudioFrameAtRef.current = performance.now();
      if (showAudioDebug) {
        let peak = 0;
        const s = audioFrame.samples;
        for (let i = 0; i < s.length; i++)
          peak = Math.max(peak, Math.abs(s[i]));
        audioPeakRef.current = peak;
      }
      pushAudioPlaybackRef.current(audioFrame);
      pushAudioFftRef.current(audioFrame);
    },
    [
      clearStreamStartTimeout,
      setAudioEnabled,
      setFftEnabled,
      setFrame,
      showAudioDebug,
    ],
  );

  const daemon = useRadioDaemon({
    enabled: true,
    url: daemonUrl,
    authToken: daemonAuthToken || undefined,
    onMessage: handleDaemonMessage,
    onFrame: handleDaemonFrame,
    trackLastMessage: false,
    trackLastFrame: false,
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
  const connectedDevice = useMemo(
    () =>
      connectedDeviceId
        ? (devices.find((d) => d.device_id === connectedDeviceId) ?? null)
        : null,
    [connectedDeviceId, devices],
  );
  const controlDevice = connectedDevice ?? selectedDevice;

  // ── Extracted hooks ─────────────────────────────────────────

  // Hook 1: Radio command handlers + draftState + effectiveState
  const {
    draftState: _draftState,
    setDraftState,
    effectiveState,
    handleConnectRadio,
    handleDisconnectRadio: requestDisconnectRadio,
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
    handleCommandResponse,
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
  commandResponseHandlerRef.current = handleCommandResponse;

  const handleDisconnectRadio = useCallback(() => {
    desiredFftRef.current = false;
    desiredAudioRef.current = false;
    pendingStreamCommandsRef.current.clear();
    clearStreamStartTimeout("fft");
    clearStreamStartTimeout("audio");
    requestDisconnectRadio();
  }, [clearStreamStartTimeout, requestDisconnectRadio]);

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
    handleUpdateEqBandSlope,
  } = useEqBands();

  // Hook 4: Client-side DSP controls
  const {
    handleNoiseGateToggle,
    handleNoiseGateThresholdChange,
    handleClientNrToggle,
    handleClientNrLevelChange,
    handleSweetenToggle,
    handleSweetenAmountChange,
    handleExpanderToggle,
    handleExpanderThresholdChange,
    handleExpanderRatioChange,
    handleExpanderAttackMsChange,
    handleExpanderReleaseMsChange,
    handleExpanderRangeDbChange,
    handleCompressorToggle,
    handleCompressorThresholdChange,
    handleCompressorRatioChange,
    handleCompressorAttackMsChange,
    handleCompressorReleaseMsChange,
    handleCompressorKneeChange,
    handleCompressorMakeupDbChange,
    handleSpectralTamingToggle,
    handleSpectralTamingTameAmountChange,
    handleSpectralTamingRecoverAmountChange,
    handleSpectralTamingSpeedChange,
    handleLevelerToggle,
    handleLevelerTargetLevelChange,
    handleLevelerSpeedChange,
    handleLevelerMaxGainDbChange,
  } = useClientDsp();

  // ── Stream toggle handlers (inline — used by useFt8AutoConfig) ──

  const handleToggleFft = useCallback(() => {
    if (!connectedDeviceId) return;
    if (desiredFftRef.current) {
      desiredFftRef.current = false;
      clearStreamStartTimeout("fft");
      const id = daemonSendCommand("stream:fft:stop", {
        device_id: connectedDeviceId,
      });
      trackStreamCommand(id, "fft", "stop", connectedDeviceId);
      setFftEnabled(false);
    } else {
      requestFftStart(daemonSendCommand, connectedDeviceId);
    }
  }, [
    clearStreamStartTimeout,
    connectedDeviceId,
    daemonSendCommand,
    requestFftStart,
    setFftEnabled,
    trackStreamCommand,
  ]);

  const ensureFftStarted = useCallback(() => {
    if (!connectedDeviceId || desiredFftRef.current) return;
    requestFftStart(daemonSendCommand, connectedDeviceId);
  }, [connectedDeviceId, daemonSendCommand, requestFftStart]);

  const handleToggleAudio = useCallback(() => {
    if (!connectedDeviceId) return;
    if (desiredAudioRef.current) {
      desiredAudioRef.current = false;
      clearStreamStartTimeout("audio");
      const id = daemonSendCommand("stream:audio:stop", {
        device_id: connectedDeviceId,
      });
      trackStreamCommand(id, "audio", "stop", connectedDeviceId);
      setAudioEnabled(false);
      sharedAudioCtxRef.current = null;
      resetSharedAudioContext();
    } else {
      // Ensure the shared WebAudio context is unlocked by this user gesture.
      sharedAudioCtxRef.current = getSharedAudioContext();
      primeAudioContextForPlayback();
      requestAudioStart(daemonSendCommand, connectedDeviceId);
    }
  }, [
    clearStreamStartTimeout,
    connectedDeviceId,
    daemonSendCommand,
    requestAudioStart,
    setAudioEnabled,
    trackStreamCommand,
  ]);

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
    ensureFftStarted,
  });

  // Hook 6: Audio DSP chain lifecycle
  const processingChain = useAudioDspChain({
    audioEnabled,
    noiseGateEnabled: sdrSettings.sdrNoiseGateEnabled,
    noiseGateThreshold: sdrSettings.sdrNoiseGateThreshold,
    clientNrEnabled: sdrSettings.sdrNrEnabled,
    clientNrLevel: sdrSettings.sdrNrLevel,
    sweetenEnabled: sdrSettings.sdrSweetenEnabled,
    sweetenAmount: sdrSettings.sdrSweetenAmount,
    expanderEnabled: sdrSettings.sdrExpanderEnabled,
    expanderThreshold: sdrSettings.sdrExpanderThreshold,
    expanderRatio: sdrSettings.sdrExpanderRatio,
    expanderAttackMs: sdrSettings.sdrExpanderAttackMs,
    expanderReleaseMs: sdrSettings.sdrExpanderReleaseMs,
    expanderRangeDb: sdrSettings.sdrExpanderRangeDb,
    compressorEnabled: sdrSettings.sdrCompressorEnabled,
    compressorThreshold: sdrSettings.sdrCompressorThreshold,
    compressorRatio: sdrSettings.sdrCompressorRatio,
    compressorAttackMs: sdrSettings.sdrCompressorAttackMs,
    compressorReleaseMs: sdrSettings.sdrCompressorReleaseMs,
    compressorKnee: sdrSettings.sdrCompressorKnee,
    compressorMakeupDb: sdrSettings.sdrCompressorMakeupDb,
    spectralTamingEnabled: sdrSettings.sdrSpectralTamingEnabled,
    spectralTamingTameAmount: sdrSettings.sdrSpectralTamingTameAmount,
    spectralTamingRecoverAmount: sdrSettings.sdrSpectralTamingRecoverAmount,
    spectralTamingSpeed: sdrSettings.sdrSpectralTamingSpeed,
    levelerEnabled: sdrSettings.sdrLevelerEnabled,
    levelerTargetLevel: sdrSettings.sdrLevelerTargetLevel,
    levelerSpeed: sdrSettings.sdrLevelerSpeed,
    levelerMaxGainDb: sdrSettings.sdrLevelerMaxGainDb,
  });
  useEffect(() => {
    if (!showAudioDebug) return;
    const timer = window.setInterval(() => {
      const ctx =
        sharedAudioCtxRef.current ?? processingChain?.getAudioContext() ?? null;
      const lastAt = lastAudioFrameAtRef.current;
      setAudioDebug({
        ctxState: ctx?.state ?? null,
        lastFrameAgeMs: lastAt ? performance.now() - lastAt : null,
        playbackPushCount: playbackPushCountRef.current,
        fftPushCount: fftPushCountRef.current,
        peak: audioPeakRef.current,
        ctxSampleRate: ctx?.sampleRate ?? null,
      });
    }, 500);
    return () => window.clearInterval(timer);
  }, [processingChain, showAudioDebug]);

  // Hook 7: Audio recording
  const [recorderState, recorderActions] = useAudioRecorder();
  const handleStartRecording = useCallback(() => {
    if (processingChain) recorderActions.startRecording(processingChain);
  }, [processingChain, recorderActions]);

  // ── Side effects ────────────────────────────────────────────

  // Sync draftState from connectedState
  const draftDeviceIdRef = useRef<string | null>(null);
  useEffect(() => {
    const deviceChanged = draftDeviceIdRef.current !== connectedDeviceId;
    draftDeviceIdRef.current = connectedDeviceId;
    setDraftState((current) =>
      connectedState
        ? {
            ...connectedState,
            lock: deviceChanged
              ? connectedState.lock
              : (current?.lock ?? connectedState.lock),
          }
        : null,
    );
  }, [connectedDeviceId, connectedState, setDraftState]);

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
    autoConfigAttemptedRef.current = false;
    setDiscoveredDaemons([]);
    setWsjtxStatus(null);
    wsjtxDialRef.current = undefined;
    ft8ClearDecodes();
    setClusterSpots([]);
    setWaterfallSpanHz(null);
    autoFftStartRef.current = {};
    audioRestartAttemptsRef.current = {};
    lastAudioFrameAtRef.current = 0;
    desiredFftRef.current = false;
    desiredAudioRef.current = false;
    pendingStreamCommandsRef.current.clear();
    clearStreamStartTimeout("fft");
    clearStreamStartTimeout("audio");
  }, [
    clearStreamStartTimeout,
    daemonUrl,
    ft8ClearDecodes,
    resetRadioStore,
    setAudioEnabled,
    setFftEnabled,
  ]);

  useEffect(
    () => () => {
      clearStreamStartTimeout("fft");
      clearStreamStartTimeout("audio");
      pendingStreamCommandsRef.current.clear();
    },
    [clearStreamStartTimeout],
  );

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

  const needsStreamResyncRef = useRef(false);

  useEffect(() => {
    if (!daemonConnected) {
      const streamState = useSdrStore.getState();
      desiredFftRef.current ||= streamState.fftEnabled;
      desiredAudioRef.current ||= streamState.audioEnabled;
      setFftEnabled(false);
      setAudioEnabled(false);
      pendingStreamCommandsRef.current.clear();
      clearStreamStartTimeout("fft");
      clearStreamStartTimeout("audio");
      markTransportDisconnected();
      needsStreamResyncRef.current = true;
      return;
    }
    autoConnectAttemptedRef.current = false;
    autoConfigAttemptedRef.current = false;
    autoFftStartRef.current = {};
    audioRestartAttemptsRef.current = {};
    lastAudioFrameAtRef.current = 0;
    needsStreamResyncRef.current = true;
  }, [
    clearStreamStartTimeout,
    daemonConnected,
    daemonUrl,
    markTransportDisconnected,
    setAudioEnabled,
    setFftEnabled,
  ]);

  useEffect(() => {
    if (!daemonConnected) return;
    daemonSendCommand("safety:configure", {
      ptt_lockout: pttSafetyLockout,
    });
  }, [daemonConnected, daemonSendCommand, pttSafetyLockout]);

  // Auto-reconnect to last selected radio (best-effort).
  useEffect(() => {
    if (!daemonConnected) return;
    if (devices.length === 0) return;
    if (autoConnectAttemptedRef.current) return;

    let lastDevice: string | null = null;
    try {
      lastDevice = localStorage.getItem(LS_LAST_DEVICE_KEY);
    } catch {
      lastDevice = null;
    }

    const targetDevice = connectedDeviceId ?? lastDevice;
    if (!targetDevice) {
      autoConnectAttemptedRef.current = true;
      return;
    }
    if (!devices.some((d) => d.device_id === targetDevice)) {
      autoConnectAttemptedRef.current = true;
      return;
    }

    autoConnectAttemptedRef.current = true;
    setSelectedDeviceId(targetDevice);
    daemonSendCommand("radio:connect", { device_id: targetDevice });
  }, [
    connectedDeviceId,
    daemonConnected,
    daemonSendCommand,
    devices,
    setSelectedDeviceId,
  ]);

  // Keep frequency input synced to connected radio state. Keyed on the numeric
  // frequency (not the connectedState object, which gets a fresh identity on
  // every radio:state push) so unchanged polls don't clobber in-progress edits.
  const freqInputRef = useRef(freqInput);
  freqInputRef.current = freqInput;
  useEffect(() => {
    const freq = connectedState?.freq;
    if (freq == null) return;
    // Don't overwrite the field while the user is actively editing it.
    const active = document.activeElement;
    if (
      active instanceof HTMLInputElement &&
      active.value === freqInputRef.current
    ) {
      return;
    }
    const base =
      freqUnit === "MHz"
        ? freq / 1_000_000
        : freqUnit === "kHz"
          ? freq / 1_000
          : freq;
    const text =
      freqUnit === "MHz"
        ? base.toFixed(6)
        : freqUnit === "kHz"
          ? base.toFixed(3)
          : Math.round(base).toString();
    setFreqInput(text);
  }, [connectedState?.freq, freqUnit]);

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
    requestFftStart(daemonSendCommand, connectedDeviceId);
  }, [
    connectedDeviceId,
    daemonConnected,
    daemonSendCommand,
    devices,
    fftEnabled,
    requestFftStart,
  ]);

  // Audio start must be user-initiated (browser autoplay policy + explicit UX).

  // Watchdog: if audio is enabled but no PCM frames arrive, retry stream start.
  useEffect(() => {
    if (!daemonConnected) return;
    if (!connectedDeviceId) return;
    if (!audioEnabled) return;
    const dev = devices.find((d) => d.device_id === connectedDeviceId);
    if (!dev?.capabilities.can_stream_audio) return;

    const timer = window.setInterval(() => {
      const sinceLastFrameMs = performance.now() - lastAudioFrameAtRef.current;
      if (sinceLastFrameMs < 3000) return;

      const attempts = audioRestartAttemptsRef.current[connectedDeviceId] ?? 0;
      if (attempts >= 3) {
        desiredAudioRef.current = false;
        setAudioEnabled(false);
        clearStreamStartTimeout("audio");
        daemonSendCommand("stream:audio:stop", {
          device_id: connectedDeviceId,
        });
        setLastResponseError("Audio stream stopped after three frame-loss retries");
        return;
      }

      audioRestartAttemptsRef.current[connectedDeviceId] = attempts + 1;
      lastAudioFrameAtRef.current = performance.now();

      daemonSendCommand("stream:audio:start", {
        device_id: connectedDeviceId,
        sample_rate: 48000,
        format: "pcm_i16",
      });
    }, 1500);

    return () => {
      window.clearInterval(timer);
    };
  }, [
    connectedDeviceId,
    daemonConnected,
    daemonSendCommand,
    devices,
    audioEnabled,
    clearStreamStartTimeout,
    setAudioEnabled,
  ]);

  const canControlDevice = daemonConnected && !!selectedDeviceId;
  const canControlConnected = daemonConnected && !!connectedDeviceId;

  // ── Audio stream player ─────────────────────────────────────

  const pushAudioPlaybackFrame = useAudioStreamPlayer({
    enabled: audioEnabled,
    audioContext: sharedAudioCtxRef.current,
    processingChain,
  });
  useEffect(() => {
    pushAudioPlaybackRef.current = (frame) => {
      playbackPushCountRef.current += 1;
      pushAudioPlaybackFrame(frame);
    };
  }, [pushAudioPlaybackFrame]);

  // ── FT8 band detection + preset handler ────────────────────

  const ft8CurrentBand = useMemo(() => {
    const freq = effectiveState?.freq;
    if (freq == null) return null;
    return freqToBand(freq) ?? null;
  }, [effectiveState?.freq]);

  const handleFt8BandPresetSelect = useCallback(
    (preset: Ft8BandPreset) => {
      if (!connectedDeviceId) return;
      if (effectiveState?.lock) {
        setLastResponseError("Frequency is locked");
        return;
      }
      // Tune to the dial frequency
      const mhz = (preset.dialFreqHz / 1_000_000).toFixed(6);
      setFreqInput(mhz);
      // Send tune command directly
      daemonSendCommand("radio:tune", {
        device_id: connectedDeviceId,
        freq: preset.dialFreqHz,
      });
      // Switch to USB mode (standard for FT8/FT4)
      handleModeChange("USB");
      // Set appropriate filter
      handleFilterChange(preset.audioRangeLow, preset.audioRangeHigh);
      // Update FT8 decoder mode
      ft8Decoder.setMode(preset.mode);
      // Update session store band
      useFt8SessionStore
        .getState()
        .setCurrentBand(preset.band, preset.dialFreqHz);
    },
    [
      connectedDeviceId,
      effectiveState?.lock,
      daemonSendCommand,
      handleModeChange,
      handleFilterChange,
      ft8Decoder,
      setFreqInput,
    ],
  );

  const handleFt8CallsignClick = useCallback((callsign: string) => {
    // For now, log to console. Will be extended in Phase 2 for callsign lookup.
    console.log("[FT8] Callsign clicked:", callsign);
  }, []);

  const handleFt8CallsignDoubleClick = useCallback((callsign: string) => {
    // Will start a QSO in Phase 2. For now just log.
    console.log("[FT8] Callsign double-clicked:", callsign);
  }, []);

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

  const canStreamFft = controlDevice?.capabilities.can_stream_fft ?? false;
  const canStreamAudio = controlDevice?.capabilities.can_stream_audio ?? false;

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
  const { frame: audioFftFrame, pushAudioFrame: pushAudioFftFrame } =
    useAudioFft({
      enabled: audioEnabled,
      tuning: tuningOverlay,
    });
  useEffect(() => {
    pushAudioFftRef.current = (frame) => {
      fftPushCountRef.current += 1;
      pushAudioFftFrame(frame);
    };
  }, [pushAudioFftFrame]);

  const handleWaterfallViewChange = useCallback((next: WaterfallView) => {
    setWaterfallSpanHz(next.spanHz);
  }, []);

  // ── Assemble skin props (memoised) ─────────────────────────

  const openDevicePicker = useCallback(() => setDevicePickerOpen(true), []);
  const openSdrSettings = useCallback(() => setSdrSettingsOpen(true), []);

  // Isolate the connected device's S-meter so another device's ticks (which
  // mutate the smeterById map) don't rebuild skinProps and re-render the skin.
  const smeterDbm = connectedDeviceId
    ? smeterById[connectedDeviceId]
    : undefined;

  const skinProps: SdrSkinProps = useMemo(
    () => ({
      radio: {
        effectiveState,
        smeterDbm,
        fftEnabled,
        audioEnabled,
        selectedDevice: controlDevice,
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
        ft8EnrichedDecodes,
        ft8CurrentBand,
        ft8TimeSyncResult,
        onFt8BandPresetSelect: handleFt8BandPresetSelect,
        onFt8CallsignClick: handleFt8CallsignClick,
        onFt8CallsignDoubleClick: handleFt8CallsignDoubleClick,
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
        sweetenEnabled: sdrSettings.sdrSweetenEnabled,
        sweetenAmount: sdrSettings.sdrSweetenAmount,
        onSweetenToggle: handleSweetenToggle,
        onSweetenAmountChange: handleSweetenAmountChange,
        expanderEnabled: sdrSettings.sdrExpanderEnabled,
        expanderThreshold: sdrSettings.sdrExpanderThreshold,
        expanderRatio: sdrSettings.sdrExpanderRatio,
        expanderAttackMs: sdrSettings.sdrExpanderAttackMs,
        expanderReleaseMs: sdrSettings.sdrExpanderReleaseMs,
        expanderRangeDb: sdrSettings.sdrExpanderRangeDb,
        onExpanderToggle: handleExpanderToggle,
        onExpanderThresholdChange: handleExpanderThresholdChange,
        onExpanderRatioChange: handleExpanderRatioChange,
        onExpanderAttackMsChange: handleExpanderAttackMsChange,
        onExpanderReleaseMsChange: handleExpanderReleaseMsChange,
        onExpanderRangeDbChange: handleExpanderRangeDbChange,
        compressorEnabled: sdrSettings.sdrCompressorEnabled,
        compressorThreshold: sdrSettings.sdrCompressorThreshold,
        compressorRatio: sdrSettings.sdrCompressorRatio,
        compressorAttackMs: sdrSettings.sdrCompressorAttackMs,
        compressorReleaseMs: sdrSettings.sdrCompressorReleaseMs,
        compressorKnee: sdrSettings.sdrCompressorKnee,
        compressorMakeupDb: sdrSettings.sdrCompressorMakeupDb,
        onCompressorToggle: handleCompressorToggle,
        onCompressorThresholdChange: handleCompressorThresholdChange,
        onCompressorRatioChange: handleCompressorRatioChange,
        onCompressorAttackMsChange: handleCompressorAttackMsChange,
        onCompressorReleaseMsChange: handleCompressorReleaseMsChange,
        onCompressorKneeChange: handleCompressorKneeChange,
        onCompressorMakeupDbChange: handleCompressorMakeupDbChange,
        eqBands: sdrSettings.sdrEqBands,
        onAddEqBand: handleAddEqBand,
        onRemoveEqBand: handleRemoveEqBand,
        onUpdateEqBand: handleUpdateEqBand,
        onUpdateEqBandType: handleUpdateEqBandType,
        onToggleEqBand: handleToggleEqBand,
        onEqBandQChange: handleEqBandQChange,
        onUpdateEqBandSlope: handleUpdateEqBandSlope,
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
        spectralTamingEnabled: sdrSettings.sdrSpectralTamingEnabled,
        spectralTamingTameAmount: sdrSettings.sdrSpectralTamingTameAmount,
        spectralTamingRecoverAmount: sdrSettings.sdrSpectralTamingRecoverAmount,
        spectralTamingSpeed: sdrSettings.sdrSpectralTamingSpeed,
        onSpectralTamingToggle: handleSpectralTamingToggle,
        onSpectralTamingTameAmountChange: handleSpectralTamingTameAmountChange,
        onSpectralTamingRecoverAmountChange:
          handleSpectralTamingRecoverAmountChange,
        onSpectralTamingSpeedChange: handleSpectralTamingSpeedChange,
        levelerEnabled: sdrSettings.sdrLevelerEnabled,
        levelerTargetLevel: sdrSettings.sdrLevelerTargetLevel,
        levelerSpeed: sdrSettings.sdrLevelerSpeed,
        levelerMaxGainDb: sdrSettings.sdrLevelerMaxGainDb,
        onLevelerToggle: handleLevelerToggle,
        onLevelerTargetLevelChange: handleLevelerTargetLevelChange,
        onLevelerSpeedChange: handleLevelerSpeedChange,
        onLevelerMaxGainDbChange: handleLevelerMaxGainDbChange,
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
      smeterDbm,
      fftEnabled,
      audioEnabled,
      controlDevice,
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
      ft8EnrichedDecodes,
      ft8CurrentBand,
      ft8TimeSyncResult,
      handleFt8BandPresetSelect,
      handleFt8CallsignClick,
      handleFt8CallsignDoubleClick,
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
      handleSweetenToggle,
      handleSweetenAmountChange,
      handleExpanderToggle,
      handleExpanderThresholdChange,
      handleExpanderRatioChange,
      handleExpanderAttackMsChange,
      handleExpanderReleaseMsChange,
      handleExpanderRangeDbChange,
      handleCompressorToggle,
      handleCompressorThresholdChange,
      handleCompressorRatioChange,
      handleCompressorAttackMsChange,
      handleCompressorReleaseMsChange,
      handleCompressorKneeChange,
      handleCompressorMakeupDbChange,
      handleAddEqBand,
      handleRemoveEqBand,
      handleUpdateEqBand,
      handleUpdateEqBandType,
      handleToggleEqBand,
      handleEqBandQChange,
      handleUpdateEqBandSlope,
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
      handleSpectralTamingToggle,
      handleSpectralTamingTameAmountChange,
      handleSpectralTamingRecoverAmountChange,
      handleSpectralTamingSpeedChange,
      handleLevelerToggle,
      handleLevelerTargetLevelChange,
      handleLevelerSpeedChange,
      handleLevelerMaxGainDbChange,
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
      {showAudioDebug ? (
        <div
          className="fixed bottom-2 right-2 z-[2147483647] rounded bg-black/70 text-white text-[11px] px-2 py-1 pointer-events-auto"
          onPointerDown={(e) => {
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.stopPropagation();
          }}
          onWheel={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
        >
          <div>audioEnabled: {String(audioEnabled)}</div>
          <div>ctx: {audioDebug.ctxState ?? "n/a"}</div>
          <div>ctxSampleRate: {audioDebug.ctxSampleRate ?? "n/a"}</div>
          <div>
            lastFrameAgeMs:{" "}
            {audioDebug.lastFrameAgeMs == null
              ? "n/a"
              : Math.round(audioDebug.lastFrameAgeMs)}
          </div>
          <div>playbackPush: {audioDebug.playbackPushCount ?? 0}</div>
          <div>fftPush: {audioDebug.fftPushCount ?? 0}</div>
          <div>peak(i16): {audioDebug.peak ?? "n/a"}</div>
          <div>beepCount: {beepCount}</div>
          <button
            type="button"
            className="mt-1 px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 border border-white/10"
            onPointerDown={(e) => e.stopPropagation()}
            onClickCapture={(e) => e.stopPropagation()}
            onClick={debugBeep}
          >
            Beep
          </button>
          <button
            type="button"
            className="mt-1 ml-1 px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 border border-white/10"
            onPointerDown={(e) => e.stopPropagation()}
            onClickCapture={(e) => e.stopPropagation()}
            onClick={debugResetCtx}
          >
            ResetCtx
          </button>
        </div>
      ) : null}
      <DevicePicker
        isOpen={devicePickerOpen}
        onClose={() => setDevicePickerOpen(false)}
        currentUrl={daemonUrl}
        onSelect={({ url, deviceId }) => {
          try {
            if (deviceId) {
              localStorage.setItem(LS_LAST_DEVICE_KEY, deviceId);
            } else {
              localStorage.removeItem(LS_LAST_DEVICE_KEY);
            }
          } catch {
            // ignore
          }
          if (url === daemonUrl) {
            setSelectedDeviceId(deviceId);
            if (
              deviceId &&
              deviceId !== connectedDeviceId &&
              daemonConnected
            ) {
              desiredFftRef.current ||= fftEnabled;
              desiredAudioRef.current ||= audioEnabled;
              setFftEnabled(false);
              setAudioEnabled(false);
              pendingStreamCommandsRef.current.clear();
              clearStreamStartTimeout("fft");
              clearStreamStartTimeout("audio");
              needsStreamResyncRef.current = true;
              daemonSendCommand("radio:connect", { device_id: deviceId });
            }
          }
          setDaemonUrl(url);
        }}
        daemons={discoveredDaemons}
        canRefresh={daemonConnected}
        onRefresh={refreshDiscovery}
        authToken={daemonAuthToken}
        onAuthTokenChange={(token) =>
          updatePreferences({ radioDaemonAuthToken: token })
        }
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
          selectedDevice={controlDevice}
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
