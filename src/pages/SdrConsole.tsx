import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui";
import { BandScope } from "@/components/sdr/BandScope";
import { DevicePicker } from "@/components/sdr/DevicePicker";
import { SpectrumScope } from "@/components/sdr/SpectrumScope";
import { Waterfall } from "@/components/sdr/Waterfall";
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
import type { WaterfallView } from "@/components/sdr/waterfallPalette";

const DEFAULT_DAEMON_URL = "ws://127.0.0.1:9867";
const LS_DAEMON_URL_KEY = "propulse-radio-daemon-url";
const LS_LAST_DEVICE_KEY = "propulse-radio-daemon-device";

function formatHz(hz: number): string {
  if (!Number.isFinite(hz)) return "—";
  return `${(hz / 1_000_000).toFixed(6)} MHz`;
}

function formatUtcMsSinceMidnight(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const totalSeconds = Math.floor(ms / 1000);
  const hh = Math.floor(totalSeconds / 3600) % 24;
  const mm = Math.floor((totalSeconds % 3600) / 60);
  const ss = totalSeconds % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}Z`;
}

export function SdrConsole() {
  const isMobile = useIsMobile();
  const [daemonUrl, setDaemonUrl] = useState(() => {
    try {
      return localStorage.getItem(LS_DAEMON_URL_KEY) ?? DEFAULT_DAEMON_URL;
    } catch {
      return DEFAULT_DAEMON_URL;
    }
  });
  const daemon = useRadioDaemon({ enabled: true, url: daemonUrl });
  const daemonConnected = daemon.connected;
  const daemonConnecting = daemon.connecting;
  const daemonError = daemon.error;
  const daemonLastMessage = daemon.lastMessage;
  const daemonLastFrame = daemon.lastFrame;
  const daemonSendCommand = daemon.sendCommand;
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
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false);
  const [waterfallSpanHz, setWaterfallSpanHz] = useState<number | null>(null);

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

  const fftEnabled = useSdrStore((s) => s.fftEnabled);
  const audioEnabled = useSdrStore((s) => s.audioEnabled);
  const lastFftFrame = useSdrStore((s) => s.lastFftFrame);
  const lastAudioFrame = useSdrStore((s) => s.lastAudioFrame);
  const setFftEnabled = useSdrStore((s) => s.setFftEnabled);
  const setAudioEnabled = useSdrStore((s) => s.setAudioEnabled);
  const setFrame = useSdrStore((s) => s.setFrame);
  const waterfallPalette = useSettingsStore((s) => s.sdrWaterfallPalette);

  const [lastResponseError, setLastResponseError] = useState<string | null>(
    null,
  );
  const [freqInput, setFreqInput] = useState("");
  const [freqUnit, setFreqUnit] = useState<"MHz" | "kHz" | "Hz">("MHz");
  const [draftState, setDraftState] = useState<RadioState | null>(null);

  const selectedDevice = useMemo(
    () => devices.find((d) => d.device_id === selectedDeviceId) ?? null,
    [devices, selectedDeviceId],
  );
  const connectedState = connectedDeviceId
    ? radioStateById[connectedDeviceId] ?? null
    : null;
  const effectiveState = draftState ?? connectedState;

  useEffect(() => {
    setDraftState(connectedState);
  }, [connectedState]);

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

  // Keep frequency input synced to connected radio state (when not editing).
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

  // Auto-start FFT streaming once per device (best-effort) so SDR consoles show data immediately.
  useEffect(() => {
    if (!daemonConnected) return;
    if (!connectedDeviceId) return;
    if (fftEnabled) return;
    const dev = devices.find((d) => d.device_id === connectedDeviceId);
    if (!dev?.capabilities.can_stream_fft) return;
    if (autoFftStartRef.current[connectedDeviceId]) return;
    autoFftStartRef.current[connectedDeviceId] = true;
    daemonSendCommand("stream:fft:start", {
      device_id: connectedDeviceId,
      fft_size: 4096,
      fps: 20,
      averaging: 4,
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

  useEffect(() => {
    const msg = daemonLastMessage as DaemonIncomingMessage | null;
    if (!msg) return;

    if (isDevicesListMessage(msg)) {
      setDevices(msg.devices);
      return;
    }
    if (isDevicesAddedMessage(msg) || isDevicesRemovedMessage(msg)) {
      // Refresh the full list (device events are deltas only).
      daemonSendCommand("devices:enumerate");
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
      return;
    }
  }, [
    daemonLastMessage,
    daemonSendCommand,
    setDevices,
    setLastDaemonStatus,
    setSmeterDbm,
    upsertRadioState,
  ]);

  useEffect(() => {
    const frame = daemonLastFrame as RadioBinaryFrame | null;
    if (!frame) return;
    setFrame(frame);
  }, [daemonLastFrame, setFrame]);

  const canControlDevice = daemonConnected && !!selectedDeviceId;
  const canControlConnected = daemonConnected && !!connectedDeviceId;

  useAudioStreamPlayer(
    audioEnabled,
    lastAudioFrame
      ? { sampleRate: lastAudioFrame.sampleRate, samples: lastAudioFrame.samples }
      : null,
  );

  const handleConnectRadio = () => {
    if (!selectedDeviceId) return;
    daemonSendCommand("radio:connect", { device_id: selectedDeviceId });
  };

  const handleDisconnectRadio = () => {
    if (!connectedDeviceId) return;
    daemonSendCommand("radio:disconnect", { device_id: connectedDeviceId });
    setFftEnabled(false);
    setAudioEnabled(false);
    setDraftState(null);
  };

  const handleTune = () => {
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
  };

  const handleModeChange = (mode: string) => {
    if (!connectedDeviceId) return;
    daemonSendCommand("radio:mode", { device_id: connectedDeviceId, mode });
    setDraftState((s) => (s ? { ...s, mode } : s));
  };

  const handleGainChange = (stage: string, value: number) => {
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
  };

  const handleAgcToggle = (enabled: boolean) => {
    setDraftState((s) => (s ? { ...s, agc: enabled } : s));
    if (!connectedDeviceId) return;
    daemonSendCommand("radio:agc", { device_id: connectedDeviceId, enabled });
  };

  const handleAntennaChange = (port: string) => {
    setDraftState((s) => (s ? { ...s, antenna: port } : s));
    if (!connectedDeviceId) return;
    daemonSendCommand("radio:antenna", { device_id: connectedDeviceId, port });
  };

  const handleFilterChange = (low: number, high: number) => {
    const lo = Math.min(low, high);
    const hi = Math.max(low, high);
    setDraftState((s) =>
      s ? { ...s, filter: { low: Math.round(lo), high: Math.round(hi) } } : s,
    );
    if (!connectedDeviceId) return;
    if (filterDebounceRef.current) window.clearTimeout(filterDebounceRef.current);
    filterDebounceRef.current = window.setTimeout(() => {
      daemonSendCommand("radio:filter", {
        device_id: connectedDeviceId,
        low: Math.round(lo),
        high: Math.round(hi),
      });
    }, 75);
  };

  const handleNrChange = (enabled: boolean, level: number) => {
    setDraftState((s) =>
      s ? { ...s, nr: { enabled, level: Math.round(level) } } : s,
    );
    if (!connectedDeviceId) return;
    daemonSendCommand("radio:nr", {
      device_id: connectedDeviceId,
      enabled,
      level: Math.round(level),
    });
  };

  const handleNbChange = (enabled: boolean, threshold: number) => {
    setDraftState((s) =>
      s ? { ...s, nb: { enabled, threshold: Math.round(threshold) } } : s,
    );
    if (!connectedDeviceId) return;
    daemonSendCommand("radio:nb", {
      device_id: connectedDeviceId,
      enabled,
      threshold: Math.round(threshold),
    });
  };

  const handlePttChange = (active: boolean) => {
    setDraftState((s) => (s ? { ...s, ptt: active } : s));
    if (!connectedDeviceId) return;
    daemonSendCommand("radio:ptt", { device_id: connectedDeviceId, active });
  };

  const handleToggleFft = () => {
    if (!connectedDeviceId) return;
    if (fftEnabled) {
      daemonSendCommand("stream:fft:stop", { device_id: connectedDeviceId });
      setFftEnabled(false);
    } else {
      daemonSendCommand("stream:fft:start", {
        device_id: connectedDeviceId,
        fft_size: 4096,
        fps: 20,
        averaging: 4,
      });
      setFftEnabled(true);
    }
  };

  const handleToggleAudio = () => {
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
  };

  const refreshDiscovery = useCallback(() => {
    if (!daemonConnected) return;
    daemonSendCommand("discovery:mdns:browse");
  }, [daemonConnected, daemonSendCommand]);

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
    const centerHz = effectiveState?.freq ?? lastFftFrame.centerHz;
    const spanHz = waterfallSpanHz ?? lastFftFrame.spanHz;
    return { centerHz, spanHz: Math.min(spanHz, lastFftFrame.spanHz) };
  }, [effectiveState?.freq, lastFftFrame, waterfallSpanHz]);

  const handleWaterfallViewChange = useCallback((next: WaterfallView) => {
    setWaterfallSpanHz(next.spanHz);
  }, []);

  const handlePickFrequencyHz = useCallback(
    (hz: number) => {
      if (!connectedDeviceId) return;
      daemonSendCommand("radio:tune", { device_id: connectedDeviceId, freq: hz });
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

  const leftControls = (
    <div className="space-y-6">
      <Card className="p-4 space-y-3">
        <div className="text-sm font-semibold text-gray-200">Device</div>

        <label className="block text-xs text-gray-500">Radio</label>
        <select
          value={selectedDeviceId ?? ""}
          onChange={(e) => setSelectedDeviceId(e.target.value || null)}
          disabled={!daemon.connected}
          className="w-full px-3 py-2 bg-deep-space border border-white/10 rounded-lg text-white text-sm"
        >
          {devices.length === 0 && <option value="">No devices</option>}
          {devices.map((d) => (
            <option key={d.device_id} value={d.device_id}>
              {d.name}
            </option>
          ))}
        </select>

        {selectedDevice && (
          <div className="text-xs text-gray-500">
            <div className="flex justify-between">
              <span>Driver</span>
              <span className="text-gray-300 font-mono">{selectedDevice.driver}</span>
            </div>
            <div className="flex justify-between">
              <span>Type</span>
              <span className="text-gray-300 font-mono">{selectedDevice.type}</span>
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={handleConnectRadio}
            disabled={!canControlDevice || !!connectedDeviceId}
            className="flex-1 px-3 py-2 rounded-lg text-sm font-medium bg-white/5 border border-white/10 text-gray-200 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Connect
          </button>
          <button
            type="button"
            onClick={handleDisconnectRadio}
            disabled={!canControlConnected}
            className="flex-1 px-3 py-2 rounded-lg text-sm font-medium bg-alert-red/10 border border-alert-red/30 text-alert-red hover:bg-alert-red/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Disconnect
          </button>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="text-sm font-semibold text-gray-200">Radio Controls</div>

        <div className="grid grid-cols-3 gap-2 items-end">
          <div className="col-span-2">
            <label className="block text-xs text-gray-500 mb-1">Frequency</label>
            <input
              type="text"
              value={freqInput}
              onChange={(e) => setFreqInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleTune();
              }}
              disabled={!canControlConnected}
              className="w-full px-3 py-2 bg-deep-space border border-white/10 rounded-lg text-white text-sm font-mono"
            />
            <div className="mt-1 flex gap-1">
              {(["MHz", "kHz", "Hz"] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setFreqUnit(u)}
                  disabled={!canControlConnected}
                  className={`px-2 py-1 rounded text-[11px] border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    freqUnit === u
                      ? "bg-cosmic-cyan/10 border-cosmic-cyan/30 text-cosmic-cyan"
                      : "bg-white/5 border-white/10 text-gray-300 hover:bg-white/10"
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={handleTune}
            disabled={!canControlConnected}
            className="px-3 py-2 rounded-lg text-sm font-medium bg-white/5 border border-white/10 text-gray-200 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Tune
          </button>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Mode</label>
          <select
            value={effectiveState?.mode ?? ""}
            onChange={(e) => handleModeChange(e.target.value)}
            disabled={!canControlConnected || !selectedDevice}
            className="w-full px-3 py-2 bg-deep-space border border-white/10 rounded-lg text-white text-sm"
          >
            {(selectedDevice?.capabilities.modes ?? []).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        {selectedDevice && effectiveState && (
          <div className="space-y-3 pt-1">
            {/* TX / RX */}
            <div className="flex items-center justify-between">
              <div className="text-xs text-gray-500">Transmit</div>
              {selectedDevice.capabilities.can_transmit ? (
                <button
                  type="button"
                  onClick={() => handlePttChange(!effectiveState.ptt)}
                  disabled={!canControlConnected}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    effectiveState.ptt
                      ? "bg-alert-red/20 border-alert-red/40 text-alert-red"
                      : "bg-white/5 border-white/10 text-gray-200 hover:bg-white/10"
                  }`}
                  aria-pressed={!!effectiveState.ptt}
                >
                  {effectiveState.ptt ? "PTT ON" : "PTT"}
                </button>
              ) : (
                <span className="text-[11px] px-2 py-1 rounded border border-white/10 bg-white/5 text-gray-400">
                  RX Only
                </span>
              )}
            </div>

            {/* AGC */}
            <div className="flex items-center justify-between">
              <div className="text-xs text-gray-500">AGC</div>
              <button
                type="button"
                onClick={() => handleAgcToggle(!effectiveState.agc)}
                disabled={!canControlConnected}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  effectiveState.agc
                    ? "bg-signal-green/10 border-signal-green/30 text-signal-green"
                    : "bg-white/5 border-white/10 text-gray-200 hover:bg-white/10"
                }`}
                aria-pressed={effectiveState.agc}
              >
                {effectiveState.agc ? "On" : "Off"}
              </button>
            </div>

            {/* Antenna */}
            {selectedDevice.capabilities.antennas.length > 1 ? (
              <div>
                <label className="block text-xs text-gray-500 mb-1">Antenna</label>
                <select
                  value={effectiveState.antenna ?? ""}
                  onChange={(e) => handleAntennaChange(e.target.value)}
                  disabled={!canControlConnected}
                  className="w-full px-3 py-2 bg-deep-space border border-white/10 rounded-lg text-white text-sm"
                >
                  {selectedDevice.capabilities.antennas.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {/* Gain stages */}
            {selectedDevice.capabilities.gain_stages.length > 0 ? (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-gray-200">Gain</div>
                {selectedDevice.capabilities.gain_stages.map((st) => {
                  const value = effectiveState.gains?.[st.name] ?? st.min;
                  return (
                    <div key={st.name} className="space-y-1">
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>{st.name}</span>
                        <span className="text-gray-200 font-mono">
                          {Number.isFinite(value) ? value : "—"}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={st.min}
                        max={st.max}
                        step={st.step}
                        value={value}
                        onChange={(e) => handleGainChange(st.name, Number(e.target.value))}
                        disabled={!canControlConnected}
                        className="w-full"
                      />
                    </div>
                  );
                })}
              </div>
            ) : null}

            {/* DSP controls only when the device can stream audio (SDR) */}
            {selectedDevice.capabilities.can_stream_audio ? (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-gray-200">DSP</div>

                {/* Filter */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>Filter</span>
                    <span className="text-gray-200 font-mono">
                      {(effectiveState.filter?.low ?? 300).toFixed(0)}–
                      {(effectiveState.filter?.high ?? 2700).toFixed(0)} Hz
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="range"
                      min={0}
                      max={5000}
                      step={50}
                      value={effectiveState.filter?.low ?? 300}
                      onChange={(e) =>
                        handleFilterChange(
                          Number(e.target.value),
                          effectiveState.filter?.high ?? 2700,
                        )
                      }
                      disabled={!canControlConnected}
                      className="w-full"
                      aria-label="Filter low cutoff"
                    />
                    <input
                      type="range"
                      min={500}
                      max={15000}
                      step={50}
                      value={effectiveState.filter?.high ?? 2700}
                      onChange={(e) =>
                        handleFilterChange(
                          effectiveState.filter?.low ?? 300,
                          Number(e.target.value),
                        )
                      }
                      disabled={!canControlConnected}
                      className="w-full"
                      aria-label="Filter high cutoff"
                    />
                  </div>
                </div>

                {/* NR */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>NR</span>
                    <button
                      type="button"
                      onClick={() =>
                        handleNrChange(
                          !(effectiveState.nr?.enabled ?? false),
                          effectiveState.nr?.level ?? 3,
                        )
                      }
                      disabled={!canControlConnected}
                      className={`px-2 py-1 rounded border text-[11px] disabled:opacity-50 disabled:cursor-not-allowed ${
                        effectiveState.nr?.enabled
                          ? "bg-signal-green/10 border-signal-green/30 text-signal-green"
                          : "bg-white/5 border-white/10 text-gray-300 hover:bg-white/10"
                      }`}
                      aria-pressed={effectiveState.nr?.enabled ?? false}
                    >
                      {effectiveState.nr?.enabled ? "On" : "Off"}
                    </button>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={5}
                    step={1}
                    value={effectiveState.nr?.enabled ? effectiveState.nr?.level ?? 3 : 0}
                    onChange={(e) =>
                      handleNrChange(Number(e.target.value) > 0, Number(e.target.value))
                    }
                    disabled={!canControlConnected}
                    className="w-full"
                    aria-label="Noise reduction level"
                  />
                </div>

                {/* NB */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>NB</span>
                    <button
                      type="button"
                      onClick={() =>
                        handleNbChange(
                          !(effectiveState.nb?.enabled ?? false),
                          effectiveState.nb?.threshold ?? 50,
                        )
                      }
                      disabled={!canControlConnected}
                      className={`px-2 py-1 rounded border text-[11px] disabled:opacity-50 disabled:cursor-not-allowed ${
                        effectiveState.nb?.enabled
                          ? "bg-signal-green/10 border-signal-green/30 text-signal-green"
                          : "bg-white/5 border-white/10 text-gray-300 hover:bg-white/10"
                      }`}
                      aria-pressed={effectiveState.nb?.enabled ?? false}
                    >
                      {effectiveState.nb?.enabled ? "On" : "Off"}
                    </button>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={effectiveState.nb?.enabled ? effectiveState.nb?.threshold ?? 50 : 0}
                    onChange={(e) =>
                      handleNbChange(Number(e.target.value) > 0, Number(e.target.value))
                    }
                    disabled={!canControlConnected}
                    className="w-full"
                    aria-label="Noise blanker threshold"
                  />
                </div>
              </div>
            ) : null}
          </div>
        )}

        <div className="flex justify-between text-xs text-gray-500">
          <span>S-meter</span>
          <span className="text-gray-300 font-mono">
            {connectedDeviceId && smeterById[connectedDeviceId] !== undefined
              ? `${smeterById[connectedDeviceId].toFixed(1)} dBm`
              : "—"}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-2">
          <button
            type="button"
            onClick={handleToggleFft}
            disabled={!canControlConnected || !canStreamFft}
            className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              fftEnabled
                ? "bg-signal-green/10 border-signal-green/30 text-signal-green hover:bg-signal-green/20"
                : "bg-white/5 border-white/10 text-gray-200 hover:bg-white/10"
            }`}
          >
            {canStreamFft ? (fftEnabled ? "Stop FFT" : "Start FFT") : "FFT N/A"}
          </button>
          <button
            type="button"
            onClick={handleToggleAudio}
            disabled={!canControlConnected || !canStreamAudio}
            className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              audioEnabled
                ? "bg-plasma-orange/10 border-plasma-orange/30 text-plasma-orange hover:bg-plasma-orange/20"
                : "bg-white/5 border-white/10 text-gray-200 hover:bg-white/10"
            }`}
          >
            {canStreamAudio ? (audioEnabled ? "Stop Audio" : "Start Audio") : "Audio N/A"}
          </button>
        </div>
      </Card>

      {effectiveState && (
        <Card className="p-4 space-y-1.5">
          <div className="text-sm font-semibold text-gray-200">Status</div>
          <div className="text-xs text-gray-500 flex justify-between">
            <span>Frequency</span>
            <span className="text-gray-300 font-mono">{formatHz(effectiveState.freq)}</span>
          </div>
          <div className="text-xs text-gray-500 flex justify-between">
            <span>Mode</span>
            <span className="text-gray-300 font-mono">{effectiveState.mode}</span>
          </div>
          <div className="text-xs text-gray-500 flex justify-between">
            <span>AGC</span>
            <span className="text-gray-300 font-mono">{effectiveState.agc ? "on" : "off"}</span>
          </div>
        </Card>
      )}
    </div>
  );

  const rightPanels = (
    <div className="space-y-6">
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold text-gray-200">
            {canStreamFft ? "Waterfall" : "Band Scope"}
          </div>
          <div className="text-xs text-gray-500 font-mono">
            {effectiveState ? formatHz(effectiveState.freq) : "—"}
          </div>
        </div>

        <div className="space-y-3">
          {canStreamFft && fftEnabled ? (
            <div className="h-[120px]">
              <SpectrumScope
                frame={lastFftFrame}
                view={waterfallView}
                palette={waterfallPalette}
                overlays={waterfallOverlays}
              />
            </div>
          ) : null}

          <div className="h-[420px] lg:h-[640px]">
            {canStreamFft ? (
              fftEnabled ? (
                <Waterfall
                  frame={lastFftFrame}
                  view={waterfallView}
                  onViewChange={handleWaterfallViewChange}
                  palette={waterfallPalette}
                  overlays={waterfallOverlays}
                  onPickFrequencyHz={handlePickFrequencyHz}
                  onSelectRangeHz={({ startHz, endHz }) => {
                    const mid = Math.round((startHz + endHz) / 2);
                    handlePickFrequencyHz(mid);
                  }}
                />
              ) : (
                <div className="w-full h-full rounded-lg border border-white/10 bg-black/40 flex items-center justify-center text-sm text-gray-500">
                  Start FFT to show the waterfall.
                </div>
              )
            ) : effectiveState ? (
              <BandScope
                frequencyHz={effectiveState.freq}
                spots={clusterSpots}
                onPickFrequencyHz={handlePickFrequencyHz}
              />
            ) : (
              <div className="w-full h-full rounded-lg border border-white/10 bg-black/40 flex items-center justify-center text-sm text-gray-500">
                Connect a radio to show the band scope.
              </div>
            )}
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold text-gray-200">Decodes & Spots</div>
          <div className="text-xs text-gray-500">
            {wsjtxStatus ? "WSJT-X live" : "WSJT-X idle"} • {clusterSpots.length} spots
          </div>
        </div>

        {wsjtxStatus ? (
          <div className="text-xs text-gray-500 grid grid-cols-2 gap-x-4 gap-y-1 mb-3">
            <div className="flex justify-between">
              <span>Dial</span>
              <span className="text-gray-200 font-mono">{formatHz(wsjtxStatus.frequency)}</span>
            </div>
            <div className="flex justify-between">
              <span>Mode</span>
              <span className="text-gray-200 font-mono">{wsjtxStatus.mode}</span>
            </div>
            <div className="flex justify-between">
              <span>RX DF</span>
              <span className="text-gray-200 font-mono">{wsjtxStatus.rxDF} Hz</span>
            </div>
            <div className="flex justify-between">
              <span>TX DF</span>
              <span className="text-gray-200 font-mono">{wsjtxStatus.txDF} Hz</span>
            </div>
          </div>
        ) : (
          <div className="text-sm text-gray-400 mb-3">
            Start WSJT-X on this machine (UDP port 2237 by default) to see decodes here.
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="text-xs font-semibold text-gray-200">WSJT-X Decodes</div>
            {wsjtxDecodes.length === 0 ? (
              <div className="text-xs text-gray-500">No decodes received yet.</div>
            ) : (
              <div className="space-y-1 max-h-[260px] overflow-auto pr-1">
                {wsjtxDecodes.slice(0, 10).map((d, idx) => (
                  <div
                    key={`${d.time}-${d.deltaFrequency}-${idx}`}
                    className="flex items-center gap-2 text-xs px-2 py-1 rounded-md border border-white/10 bg-white/[0.03]"
                  >
                    <span className="font-mono text-gray-500 w-14">
                      {formatUtcMsSinceMidnight(d.time)}
                    </span>
                    <span className="font-mono text-gray-400 w-10 text-right">
                      {d.snr > 0 ? `+${d.snr}` : d.snr}
                    </span>
                    <span className="font-mono text-gray-400 w-14 text-right">
                      {d.deltaFrequency}Hz
                    </span>
                    <span className="text-gray-200 truncate min-w-0">{d.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold text-gray-200">DX Cluster Spots</div>
            {clusterSpots.length === 0 ? (
              <div className="text-xs text-gray-500">
                No spots received yet. Connect to a cluster in the daemon config or via the CLI/API.
              </div>
            ) : (
              <div className="space-y-1 max-h-[260px] overflow-auto pr-1">
                {clusterSpots.slice(0, 10).map((s, idx) => (
                  <div
                    key={`${s.id ?? "spot"}-${idx}`}
                    className="flex items-center gap-2 text-xs px-2 py-1 rounded-md border border-white/10 bg-white/[0.03]"
                  >
                    <span className="font-mono text-gray-400 w-16 truncate">{s.dx}</span>
                    <span className="font-mono text-gray-500 w-20 text-right">
                      {s.freq.toFixed(1)} kHz
                    </span>
                    <span className="text-gray-200 truncate min-w-0">{s.comment}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
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

      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">SDR Console</h2>
          <p className="text-sm text-gray-500">
            Connect to the local Propulse Radio Daemon for SDR/radio control and
            waterfall streaming.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              className="px-3 py-1.5 rounded-md text-xs bg-white/5 border border-white/10 text-gray-200 hover:bg-white/10"
              onClick={() => setDevicePickerOpen(true)}
            >
              Change Daemon
            </button>
            <div className="text-[11px] text-gray-500 font-mono truncate max-w-[min(520px,70vw)]">
              {daemonUrl}
            </div>
          </div>
        </div>

        <div className="text-right">
          <div className="text-xs text-gray-500">Daemon</div>
          <div className="text-sm text-gray-200 font-medium">
            {daemonConnected ? "Connected" : daemonConnecting ? "Connecting…" : "Offline"}
          </div>
          {lastStatus && (
            <div className="text-[11px] text-gray-500 font-mono">
              {lastStatus.platform} • {lastStatus.cpu_percent.toFixed(1)}% CPU
              • {lastStatus.memory_mb} MB
            </div>
          )}
        </div>
      </div>

      {(daemonError || lastResponseError) && (
        <div className="p-3 rounded-lg border border-alert-red/30 bg-alert-red/10 text-alert-red text-sm">
          {daemonError ?? lastResponseError}
        </div>
      )}

      {!daemonConnected && (
        <div className="p-4 rounded-lg border border-white/10 bg-white/[0.03] text-sm text-gray-300">
          <div className="font-semibold text-gray-200 mb-1">No Daemon Connected</div>
          <div className="text-gray-400">
            Start the daemon on the machine connected to your radio, then use{" "}
            <span className="text-gray-200">Change Daemon</span> to connect.
          </div>
          <div className="mt-2 text-[11px] text-gray-500 font-mono">
            Local dev: <span className="text-gray-400">cd daemon &amp;&amp; cargo run -p propulse-daemon</span>
          </div>
        </div>
      )}

      {isMobile ? (
        <>
          {rightPanels}

          <button
            type="button"
            onClick={() => setMobileControlsOpen(true)}
            className="fixed bottom-5 left-1/2 -translate-x-1/2 px-4 py-3 rounded-full bg-white/10 border border-white/20 backdrop-blur-md text-sm text-gray-100 hover:bg-white/15"
            style={{ minHeight: 44 }}
          >
            Controls
          </button>

          {mobileControlsOpen ? (
            <div
              className="fixed inset-0 z-[130] flex flex-col justify-end"
              role="dialog"
              aria-modal="true"
              aria-label="SDR controls"
              tabIndex={-1}
              onKeyDown={(e) => {
                if (e.key === "Escape") setMobileControlsOpen(false);
              }}
            >
              <div
                className="absolute inset-0 bg-black/50"
                onClick={() => setMobileControlsOpen(false)}
              />

              <div className="relative w-full max-h-[75dvh] bg-deep-space/95 backdrop-blur-md border-t border-white/10 rounded-t-2xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white truncate">Radio Controls</div>
                    <div className="text-[11px] text-gray-400 font-mono truncate">
                      {effectiveState ? formatHz(effectiveState.freq) : "—"}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMobileControlsOpen(false)}
                    className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-gray-200 hover:bg-white/10"
                    style={{ minHeight: 44 }}
                  >
                    Close
                  </button>
                </div>
                <div className="p-4 overflow-y-auto">{leftControls}</div>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">
          {leftControls}
          {rightPanels}
        </div>
      )}
    </div>
  );
}

export default SdrConsole;
