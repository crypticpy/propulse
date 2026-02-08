import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui";
import { Waterfall } from "@/components/sdr/Waterfall";
import { useAudioStreamPlayer } from "@/hooks/useAudioStreamPlayer";
import { useRadioDaemon } from "@/hooks/useRadioDaemon";
import type { DaemonIncomingMessage } from "@/lib/radio/protocol";
import type { RadioBinaryFrame } from "@/lib/radio/protocol";
import {
  isDaemonResponseMessage,
  isDaemonStatusMessage,
  isDevicesListMessage,
  isRadioSmeterMessage,
  isRadioStateMessage,
} from "@/lib/radio/protocol";
import { useRadioStore } from "@/stores/radioStore";
import { useSdrStore } from "@/stores/sdrStore";

function formatHz(hz: number): string {
  if (!Number.isFinite(hz)) return "—";
  return `${(hz / 1_000_000).toFixed(6)} MHz`;
}

export function SdrConsole() {
  const daemon = useRadioDaemon({ enabled: true });

  const devices = useRadioStore((s) => s.devices);
  const selectedDeviceId = useRadioStore((s) => s.selectedDeviceId);
  const connectedDeviceId = useRadioStore((s) => s.connectedDeviceId);
  const radioStateById = useRadioStore((s) => s.radioStateById);
  const smeterById = useRadioStore((s) => s.smeterDbmById);
  const lastStatus = useRadioStore((s) => s.lastDaemonStatus);

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

  // Keep frequency input synced to connected radio state (when not editing).
  useEffect(() => {
    if (!connectedState) return;
    setFreqInput((connectedState.freq / 1_000_000).toFixed(6));
  }, [connectedState?.freq]);

  useEffect(() => {
    const msg = daemon.lastMessage as DaemonIncomingMessage | null;
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
    }
  }, [
    daemon.lastMessage,
    setDevices,
    setLastDaemonStatus,
    setSmeterDbm,
    upsertRadioState,
  ]);

  useEffect(() => {
    const frame = daemon.lastFrame as RadioBinaryFrame | null;
    if (!frame) return;
    setFrame(frame);
  }, [daemon.lastFrame, setFrame]);

  const canControlDevice = daemon.connected && !!selectedDeviceId;
  const canControlConnected = daemon.connected && !!connectedDeviceId;

  useAudioStreamPlayer(
    audioEnabled,
    lastAudioFrame
      ? { sampleRate: lastAudioFrame.sampleRate, samples: lastAudioFrame.samples }
      : null,
  );

  const handleConnectRadio = () => {
    if (!selectedDeviceId) return;
    daemon.sendCommand("radio:connect", { device_id: selectedDeviceId });
  };

  const handleDisconnectRadio = () => {
    if (!connectedDeviceId) return;
    daemon.sendCommand("radio:disconnect", { device_id: connectedDeviceId });
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
    daemon.sendCommand("radio:tune", { device_id: connectedDeviceId, freq: hz });
  };

  const handleModeChange = (mode: string) => {
    if (!connectedDeviceId) return;
    daemon.sendCommand("radio:mode", { device_id: connectedDeviceId, mode });
  };

  const handleToggleFft = () => {
    if (!connectedDeviceId) return;
    if (fftEnabled) {
      daemon.sendCommand("stream:fft:stop", { device_id: connectedDeviceId });
      setFftEnabled(false);
    } else {
      daemon.sendCommand("stream:fft:start", {
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
      daemon.sendCommand("stream:audio:stop", { device_id: connectedDeviceId });
      setAudioEnabled(false);
    } else {
      daemon.sendCommand("stream:audio:start", {
        device_id: connectedDeviceId,
        sample_rate: 48000,
        format: "pcm_i16",
      });
      setAudioEnabled(true);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">SDR Console</h2>
          <p className="text-sm text-gray-500">
            Connect to the local Propulse Radio Daemon for SDR/radio control and
            waterfall streaming.
          </p>
        </div>

        <div className="text-right">
          <div className="text-xs text-gray-500">Daemon</div>
          <div className="text-sm text-gray-200 font-medium">
            {daemon.connected ? "Connected" : daemon.connecting ? "Connecting…" : "Offline"}
          </div>
          {lastStatus && (
            <div className="text-[11px] text-gray-500 font-mono">
              {lastStatus.platform} • {lastStatus.cpu_percent.toFixed(1)}% CPU
              • {lastStatus.memory_mb} MB
            </div>
          )}
        </div>
      </div>

      {(daemon.error || lastResponseError) && (
        <div className="p-3 rounded-lg border border-alert-red/30 bg-alert-red/10 text-alert-red text-sm">
          {daemon.error ?? lastResponseError}
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

        {/* Right: Waterfall */}
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
      </div>
    </div>
  );
}

export default SdrConsole;
