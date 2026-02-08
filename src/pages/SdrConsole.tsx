import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui";
import { DevicePicker } from "@/components/sdr/DevicePicker";
import { Waterfall } from "@/components/sdr/Waterfall";
import { useAudioStreamPlayer } from "@/hooks/useAudioStreamPlayer";
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
  isDevicesListMessage,
  isRadioSmeterMessage,
  isRadioStateMessage,
  isWsjtxDecodeMessage,
  isWsjtxStatusMessage,
} from "@/lib/radio/protocol";
import { useRadioStore } from "@/stores/radioStore";
import { useSdrStore } from "@/stores/sdrStore";

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

  const [lastResponseError, setLastResponseError] = useState<string | null>(
    null,
  );
  const [freqInput, setFreqInput] = useState("");

  const selectedDevice = useMemo(
    () => devices.find((d) => d.device_id === selectedDeviceId) ?? null,
    [devices, selectedDeviceId],
  );
  const connectedState = connectedDeviceId
    ? radioStateById[connectedDeviceId] ?? null
    : null;

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
    setFreqInput((connectedState.freq / 1_000_000).toFixed(6));
  }, [connectedState]);

  useEffect(() => {
    const msg = daemonLastMessage as DaemonIncomingMessage | null;
    if (!msg) return;

    if (isDevicesListMessage(msg)) {
      setDevices(msg.devices);
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
  };

  const handleTune = () => {
    if (!connectedDeviceId) return;
    const mhz = Number(freqInput);
    if (!Number.isFinite(mhz) || mhz <= 0) {
      setLastResponseError("Invalid frequency");
      return;
    }
    const hz = Math.round(mhz * 1_000_000);
    daemonSendCommand("radio:tune", { device_id: connectedDeviceId, freq: hz });
  };

  const handleModeChange = (mode: string) => {
    if (!connectedDeviceId) return;
    daemonSendCommand("radio:mode", { device_id: connectedDeviceId, mode });
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

  useEffect(() => {
    if (!devicePickerOpen) return;
    refreshDiscovery();
  }, [devicePickerOpen, refreshDiscovery]);

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

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">
        {/* Left: Controls */}
        <div className="space-y-6">
          <Card className="p-4 space-y-3">
            <div className="text-sm font-semibold text-gray-200">
              Device
            </div>

            <label className="block text-xs text-gray-500">Radio</label>
            <select
              value={selectedDeviceId ?? ""}
              onChange={(e) =>
                setSelectedDeviceId(e.target.value || null)
              }
              disabled={!daemon.connected}
              className="w-full px-3 py-2 bg-deep-space border border-white/10 rounded-lg text-white text-sm"
            >
              {devices.length === 0 && (
                <option value="">No devices</option>
              )}
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
                  <span className="text-gray-300 font-mono">
                    {selectedDevice.driver}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Type</span>
                  <span className="text-gray-300 font-mono">
                    {selectedDevice.type}
                  </span>
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
            <div className="text-sm font-semibold text-gray-200">
              Radio Controls
            </div>

            <div className="grid grid-cols-3 gap-2 items-end">
              <div className="col-span-2">
                <label className="block text-xs text-gray-500 mb-1">
                  Frequency (MHz)
                </label>
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
                value={connectedState?.mode ?? ""}
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
                disabled={!canControlConnected}
                className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  fftEnabled
                    ? "bg-signal-green/10 border-signal-green/30 text-signal-green hover:bg-signal-green/20"
                    : "bg-white/5 border-white/10 text-gray-200 hover:bg-white/10"
                }`}
              >
                {fftEnabled ? "Stop FFT" : "Start FFT"}
              </button>
              <button
                type="button"
                onClick={handleToggleAudio}
                disabled={!canControlConnected}
                className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  audioEnabled
                    ? "bg-plasma-orange/10 border-plasma-orange/30 text-plasma-orange hover:bg-plasma-orange/20"
                    : "bg-white/5 border-white/10 text-gray-200 hover:bg-white/10"
                }`}
              >
                {audioEnabled ? "Stop Audio" : "Start Audio"}
              </button>
            </div>
          </Card>

          {connectedState && (
            <Card className="p-4 space-y-1.5">
              <div className="text-sm font-semibold text-gray-200">
                Status
              </div>
              <div className="text-xs text-gray-500 flex justify-between">
                <span>Frequency</span>
                <span className="text-gray-300 font-mono">
                  {formatHz(connectedState.freq)}
                </span>
              </div>
              <div className="text-xs text-gray-500 flex justify-between">
                <span>Mode</span>
                <span className="text-gray-300 font-mono">
                  {connectedState.mode}
                </span>
              </div>
              <div className="text-xs text-gray-500 flex justify-between">
                <span>AGC</span>
                <span className="text-gray-300 font-mono">
                  {connectedState.agc ? "on" : "off"}
                </span>
              </div>
            </Card>
          )}
        </div>

        {/* Right: Waterfall + Decodes */}
        <div className="space-y-6">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-gray-200">
                Waterfall
              </div>
              <div className="text-xs text-gray-500 font-mono">
                {connectedState ? formatHz(connectedState.freq) : "—"}
              </div>
            </div>

            <div className="h-[420px] lg:h-[640px]">
              {fftEnabled ? (
                <Waterfall frame={lastFftFrame} />
              ) : (
                <div className="w-full h-full rounded-lg border border-white/10 bg-black/40 flex items-center justify-center text-sm text-gray-500">
                  Start FFT to show the waterfall.
                </div>
              )}
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-gray-200">
                Decodes & Spots
              </div>
              <div className="text-xs text-gray-500">
                {wsjtxStatus ? "WSJT-X live" : "WSJT-X idle"} • {clusterSpots.length} spots
              </div>
            </div>

            {wsjtxStatus ? (
              <div className="text-xs text-gray-500 grid grid-cols-2 gap-x-4 gap-y-1 mb-3">
                <div className="flex justify-between">
                  <span>Dial</span>
                  <span className="text-gray-200 font-mono">
                    {formatHz(wsjtxStatus.frequency)}
                  </span>
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
                <div className="text-xs font-semibold text-gray-200">
                  WSJT-X Decodes
                </div>
                {wsjtxDecodes.length === 0 ? (
                  <div className="text-xs text-gray-500">
                    No decodes received yet.
                  </div>
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
                        <span className="text-gray-200 truncate min-w-0">
                          {d.message}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="text-xs font-semibold text-gray-200">
                  DX Cluster Spots
                </div>
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
                        <span className="font-mono text-gray-400 w-16 truncate">
                          {s.dx}
                        </span>
                        <span className="font-mono text-gray-500 w-20 text-right">
                          {s.freq.toFixed(1)} kHz
                        </span>
                        <span className="text-gray-200 truncate min-w-0">
                          {s.comment}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default SdrConsole;
