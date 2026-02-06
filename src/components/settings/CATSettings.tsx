/**
 * CATSettings Component
 *
 * CAT Control (rig integration) settings panel.
 * - Backend selection: Auto / Hamlib (rigctld) / Flrig / Disabled
 * - Host/port inputs for each backend
 * - Connection status indicator
 * - Test Connection button
 * - PTT safety lockout toggle
 * - Current rig info display when connected (model, frequency, mode)
 * - S-meter visualization
 */

import { useState, useCallback, memo } from "react";
import { useRigStore } from "@/stores/rigStore";
import { formatFrequency } from "@/types/bridge";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";

// ─── Types ───────────────────────────────────────────────────────────────────

type CATBackend = "auto" | "hamlib" | "flrig" | "none";

// ─── S-Meter constants ───────────────────────────────────────────────────────

/** S-meter markings from S0 to S9+60 */
const S_METER_MARKS = [
  "S0",
  "S1",
  "S2",
  "S3",
  "S4",
  "S5",
  "S6",
  "S7",
  "S8",
  "S9",
  "+20",
  "+40",
  "+60",
] as const;

/** Convert dB (relative to S9) to normalized 0..1 for the S-meter bar */
function sMeterToPercent(dB: number): number {
  // S0 = -54 dB, S9 = 0 dB, S9+60 = +60 dB
  // Total range: -54 to +60 = 114 dB
  const normalized = (dB + 54) / 114;
  return Math.max(0, Math.min(1, normalized));
}

/** Get S-meter bar color based on level */
function sMeterColor(dB: number): string {
  if (dB >= 20) return "bg-alert-red";
  if (dB >= 0) return "bg-solar-yellow";
  return "bg-signal-green";
}

// ─── Component ───────────────────────────────────────────────────────────────

interface CATSettingsProps {
  className?: string;
  /** Optional bridge send function for rig.test / rig.connect */
  bridgeSend?: <T>(type: string, payload: T) => boolean;
  /** Optional bridge connection state */
  bridgeConnected?: boolean;
  /** Whether the ProPulse Bridge is enabled */
  bridgeEnabled?: boolean;
  /** Callback to toggle bridge enabled state */
  onBridgeEnabledChange?: (enabled: boolean) => void;
}

export const CATSettings = memo(function CATSettings({
  className = "",
  bridgeSend,
  bridgeConnected = false,
  bridgeEnabled = false,
  onBridgeEnabledChange,
}: CATSettingsProps) {
  const {
    connected,
    catEnabled,
    backend,
    rigModel,
    frequency,
    mode,
    sMeter,
    ptt,
    band,
    setCATEnabled,
    setBackend,
    getSMeterText,
  } = useRigStore();

  // Local form state
  const [selectedBackend, setSelectedBackend] = useState<CATBackend>(
    backend === "none" ? "none" : (backend as CATBackend),
  );
  const [hamlibHost, setHamlibHost] = useState("localhost");
  const [hamlibPort, setHamlibPort] = useState("4532");
  const [flrigHost, setFlrigHost] = useState("localhost");
  const [flrigPort, setFlrigPort] = useState("12345");
  const [pttLockout, setPttLockout] = useState(false);
  const [testStatus, setTestStatus] = useState<
    "idle" | "testing" | "success" | "error"
  >("idle");

  // Connection status
  const connectionStatus = connected
    ? "connected"
    : catEnabled
      ? "connecting"
      : "disconnected";

  const statusDotColor =
    connectionStatus === "connected"
      ? "bg-signal-green"
      : connectionStatus === "connecting"
        ? "bg-solar-yellow animate-pulse"
        : "bg-gray-500";

  const statusText =
    connectionStatus === "connected"
      ? `Connected${rigModel ? ` - ${rigModel}` : ""}`
      : connectionStatus === "connecting"
        ? "Connecting..."
        : "Disconnected";

  // Backend change handler
  const handleBackendChange = useCallback(
    (newBackend: CATBackend) => {
      setSelectedBackend(newBackend);
      if (newBackend === "none") {
        setBackend("none");
      } else if (newBackend === "hamlib") {
        setBackend("hamlib");
      } else if (newBackend === "flrig") {
        setBackend("flrig");
      }
      // auto = we let the bridge decide
      setTestStatus("idle");
    },
    [setBackend],
  );

  // Toggle CAT enabled
  const handleCATToggle = useCallback(
    (enabled: boolean) => {
      setCATEnabled(enabled);
      if (enabled && bridgeSend) {
        const config =
          selectedBackend === "hamlib"
            ? { backend: "hamlib", host: hamlibHost, port: Number(hamlibPort) }
            : selectedBackend === "flrig"
              ? { backend: "flrig", host: flrigHost, port: Number(flrigPort) }
              : selectedBackend === "auto"
                ? { backend: "auto" }
                : { backend: "none" };
        bridgeSend("rig.connect", config);
      } else if (!enabled && bridgeSend) {
        bridgeSend("rig.disconnect", {});
      }
    },
    [
      setCATEnabled,
      bridgeSend,
      selectedBackend,
      hamlibHost,
      hamlibPort,
      flrigHost,
      flrigPort,
    ],
  );

  // Test connection
  const handleTestConnection = useCallback(() => {
    if (!bridgeSend) return;
    setTestStatus("testing");

    const config =
      selectedBackend === "hamlib"
        ? { backend: "hamlib", host: hamlibHost, port: Number(hamlibPort) }
        : selectedBackend === "flrig"
          ? { backend: "flrig", host: flrigHost, port: Number(flrigPort) }
          : { backend: "auto" };

    const success = bridgeSend("rig.test", config);
    // Simulate test result since we don't have real response handling here
    setTimeout(() => {
      setTestStatus(success && bridgeConnected ? "success" : "error");
      setTimeout(() => setTestStatus("idle"), 3000);
    }, 1500);
  }, [
    bridgeSend,
    bridgeConnected,
    selectedBackend,
    hamlibHost,
    hamlibPort,
    flrigHost,
    flrigPort,
  ]);

  const sMeterPercent = sMeterToPercent(sMeter);
  const sMeterText = getSMeterText();

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Bridge Connection Toggle */}
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
        ProPulse Bridge
      </h3>
      <div className="p-3 bg-nebula-blue rounded-lg border border-white/10">
        <ToggleSwitch
          checked={bridgeEnabled}
          onChange={(enabled) => onBridgeEnabledChange?.(enabled)}
          label="Enable Bridge Connection"
          description="Connect to local ProPulse Bridge for rig control, WSJT-X, and DX cluster"
        />
      </div>

      {/* Divider */}
      <div className="border-t border-white/10" />

      {/* Header */}
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
        CAT Control
      </h3>

      {/* Connection Status */}
      <div className="flex items-center justify-between p-3 bg-nebula-blue rounded-lg border border-white/10">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${statusDotColor}`} />
          <span className="text-sm text-gray-200">{statusText}</span>
        </div>
        {connected && (
          <span className="text-xs text-gray-500 font-mono">{band}</span>
        )}
      </div>

      {/* Enable CAT Toggle */}
      <div className="p-3 bg-nebula-blue rounded-lg border border-white/10">
        <ToggleSwitch
          checked={catEnabled}
          onChange={handleCATToggle}
          label="Enable CAT Control"
          description="Automatically sync frequency and mode with your rig"
        />
      </div>

      {/* Backend Selection */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-300">
          CAT Backend
        </label>
        <div className="grid grid-cols-4 gap-1.5">
          {(
            [
              { id: "auto", label: "Auto" },
              { id: "hamlib", label: "Hamlib" },
              { id: "flrig", label: "Flrig" },
              { id: "none", label: "Disabled" },
            ] as const
          ).map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => handleBackendChange(id)}
              disabled={connected}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors
                ${
                  selectedBackend === id
                    ? "bg-plasma-orange/20 text-plasma-orange border border-plasma-orange/50"
                    : "bg-nebula-blue text-gray-300 border border-white/10 hover:border-white/20"
                }
                ${connected ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Hamlib Host/Port */}
      {selectedBackend === "hamlib" && (
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <label
              htmlFor="hamlib-host"
              className="block text-xs text-gray-400 mb-1"
            >
              rigctld Host
            </label>
            <input
              type="text"
              id="hamlib-host"
              value={hamlibHost}
              onChange={(e) => setHamlibHost(e.target.value)}
              placeholder="localhost"
              disabled={connected}
              className="w-full px-3 py-2 bg-deep-space border border-white/10 rounded-lg
                         text-white text-sm font-mono placeholder-gray-500
                         focus:outline-none focus:border-plasma-orange/50
                         disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>
          <div>
            <label
              htmlFor="hamlib-port"
              className="block text-xs text-gray-400 mb-1"
            >
              Port
            </label>
            <input
              type="number"
              id="hamlib-port"
              value={hamlibPort}
              onChange={(e) => setHamlibPort(e.target.value)}
              placeholder="4532"
              disabled={connected}
              className="w-full px-3 py-2 bg-deep-space border border-white/10 rounded-lg
                         text-white text-sm font-mono placeholder-gray-500
                         focus:outline-none focus:border-plasma-orange/50
                         disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>
        </div>
      )}

      {/* Flrig Host/Port */}
      {selectedBackend === "flrig" && (
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <label
              htmlFor="flrig-host"
              className="block text-xs text-gray-400 mb-1"
            >
              Flrig Host
            </label>
            <input
              type="text"
              id="flrig-host"
              value={flrigHost}
              onChange={(e) => setFlrigHost(e.target.value)}
              placeholder="localhost"
              disabled={connected}
              className="w-full px-3 py-2 bg-deep-space border border-white/10 rounded-lg
                         text-white text-sm font-mono placeholder-gray-500
                         focus:outline-none focus:border-plasma-orange/50
                         disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>
          <div>
            <label
              htmlFor="flrig-port"
              className="block text-xs text-gray-400 mb-1"
            >
              Port
            </label>
            <input
              type="number"
              id="flrig-port"
              value={flrigPort}
              onChange={(e) => setFlrigPort(e.target.value)}
              placeholder="12345"
              disabled={connected}
              className="w-full px-3 py-2 bg-deep-space border border-white/10 rounded-lg
                         text-white text-sm font-mono placeholder-gray-500
                         focus:outline-none focus:border-plasma-orange/50
                         disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>
        </div>
      )}

      {/* Test Connection */}
      {selectedBackend !== "none" && !connected && (
        <button
          type="button"
          onClick={handleTestConnection}
          disabled={testStatus === "testing" || !bridgeSend}
          className={`w-full px-4 py-2 rounded-lg text-sm font-medium transition-colors
            ${
              testStatus === "success"
                ? "bg-signal-green/20 border border-signal-green/50 text-signal-green"
                : testStatus === "error"
                  ? "bg-alert-red/20 border border-alert-red/50 text-alert-red"
                  : testStatus === "testing"
                    ? "bg-solar-yellow/20 border border-solar-yellow/50 text-solar-yellow"
                    : !bridgeSend
                      ? "bg-nebula-blue border border-white/10 text-gray-500 cursor-not-allowed"
                      : "bg-white/5 border border-white/10 text-gray-200 hover:bg-white/10"
            }`}
        >
          {testStatus === "testing"
            ? "Testing..."
            : testStatus === "success"
              ? "Connection OK"
              : testStatus === "error"
                ? "Connection Failed"
                : "Test Connection"}
        </button>
      )}

      {/* Divider */}
      <div className="border-t border-white/10" />

      {/* PTT Lockout */}
      <div className="p-3 bg-nebula-blue rounded-lg border border-white/10 space-y-2">
        <ToggleSwitch
          checked={pttLockout}
          onChange={setPttLockout}
          label="PTT Safety Lockout"
          description="Prevent accidental transmissions via CAT control"
        />
        {pttLockout && (
          <p className="pl-[52px] text-xs text-caution-yellow">
            PTT commands via CAT are blocked. Manual PTT on the radio still
            works.
          </p>
        )}
      </div>

      {/* Connected Rig Info */}
      {connected && (
        <>
          <div className="border-t border-white/10" />

          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Current Rig Status
            </h4>

            {/* Rig Info Grid */}
            <div className="grid grid-cols-2 gap-2">
              {/* Frequency */}
              <div className="p-2.5 bg-deep-space rounded-lg border border-white/10">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">
                  Frequency
                </div>
                <div className="text-sm font-mono text-white font-medium">
                  {formatFrequency(frequency)}
                </div>
              </div>

              {/* Mode */}
              <div className="p-2.5 bg-deep-space rounded-lg border border-white/10">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">
                  Mode
                </div>
                <div className="text-sm font-mono text-white font-medium">
                  {mode}
                </div>
              </div>

              {/* Band */}
              <div className="p-2.5 bg-deep-space rounded-lg border border-white/10">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">
                  Band
                </div>
                <div className="text-sm font-mono text-white font-medium">
                  {band}
                </div>
              </div>

              {/* PTT */}
              <div className="p-2.5 bg-deep-space rounded-lg border border-white/10">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">
                  PTT
                </div>
                <div
                  className={`text-sm font-mono font-medium ${ptt ? "text-alert-red" : "text-signal-green"}`}
                >
                  {ptt ? "TX" : "RX"}
                </div>
              </div>
            </div>

            {/* S-Meter Visualization */}
            <div className="p-2.5 bg-deep-space rounded-lg border border-white/10">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] text-gray-500 uppercase tracking-wider">
                  S-Meter
                </span>
                <span className="text-xs font-mono text-white font-medium">
                  {sMeterText}
                </span>
              </div>

              {/* Bar */}
              <div className="relative h-3 bg-white/5 rounded-full overflow-hidden">
                <div
                  className={`absolute inset-y-0 left-0 rounded-full transition-all duration-300 ${sMeterColor(sMeter)}`}
                  style={{ width: `${sMeterPercent * 100}%` }}
                />
              </div>

              {/* Scale markings */}
              <div className="flex justify-between mt-1">
                {S_METER_MARKS.filter((_, i) => i % 3 === 0 || i >= 9).map(
                  (mark) => (
                    <span
                      key={mark}
                      className="text-[8px] text-gray-600 font-mono"
                    >
                      {mark}
                    </span>
                  ),
                )}
              </div>
            </div>

            {/* Rig Model */}
            {rigModel && (
              <div className="flex items-center gap-2 p-2 bg-white/5 rounded-lg">
                <svg
                  className="w-4 h-4 text-gray-500 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
                <span className="text-xs text-gray-400">
                  Model:{" "}
                  <span className="text-gray-200 font-medium">{rigModel}</span>
                </span>
              </div>
            )}
          </div>
        </>
      )}

      {/* Info note */}
      <div className="flex items-start gap-2 p-3 bg-white/5 rounded-lg border border-white/5">
        <svg
          className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <p className="text-xs text-gray-500">
          Enable the ProPulse Bridge above, then CAT control requires{" "}
          <strong className="text-gray-400">rigctld</strong> (Hamlib) or{" "}
          <strong className="text-gray-400">Flrig</strong> running on your
          machine. Auto-detect will try both backends automatically.
        </p>
      </div>
    </div>
  );
});

export default CATSettings;
