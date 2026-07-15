/**
 * CATSettings Component
 *
 * CAT Control (rig integration) settings panel.
 * - Backend selection: Auto / Hamlib / Flrig / ICOM Direct / ICOM Network / Disabled
 * - Host/port inputs for each backend
 * - Connection status indicator
 * - Test Connection button
 * - PTT safety lockout toggle
 * - Current rig info display when connected (model, frequency, mode)
 * - S-meter visualization
 */

import { useState, useCallback, useEffect, useRef, memo } from "react";
import { useRigStore } from "@/stores/rigStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useProfileStore } from "@/stores/profileStore";
import { formatFrequency } from "@/types/bridge";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { useShallow } from "zustand/react/shallow";
import type { BridgeMessage } from "@/types/bridge";
import {
  getCredential,
  isUnlocked,
  saveCredential,
} from "@/lib/db/credentialStore";

// ─── Types ───────────────────────────────────────────────────────────────────

type CATBackend =
  | "auto"
  | "hamlib"
  | "flrig"
  | "icom-serial"
  | "icom-network"
  | "none";

/** Discovered serial port from bridge `devices:scan` */
interface DiscoveredPort {
  port: string;
  radioAddress: number;
  modelName: string;
  baudRate: number;
}

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
  /** Optional bridge send function for rig:test / rig.connect */
  bridgeSend?: <T>(type: string, payload: T) => boolean;
  /** Bridge request sender that exposes the correlation ID */
  bridgeSendRequest?: <T>(type: string, payload: T) => string | null;
  /** Optional bridge connection state */
  bridgeConnected?: boolean;
  /** Whether the ProPulse Bridge is enabled */
  bridgeEnabled?: boolean;
  /** Callback to toggle bridge enabled state */
  onBridgeEnabledChange?: (enabled: boolean) => void;
  /** Last message from bridge (for device scan results) */
  lastMessage?: BridgeMessage<unknown> | null;
}

export const CATSettings = memo(function CATSettings({
  className = "",
  bridgeSend,
  bridgeSendRequest,
  bridgeConnected = false,
  bridgeEnabled = false,
  onBridgeEnabledChange,
  lastMessage,
}: CATSettingsProps) {
  const {
    connected,
    catEnabled,
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

  // Read persisted config from settingsStore as initial values
  const savedConfig = useSettingsStore(useShallow((s) => ({
    catBackend: s.catBackend,
    hamlibHost: s.catHamlibHost,
    hamlibPort: s.catHamlibPort,
    civPort: s.catCivPort,
    flrigHost: s.catFlrigHost,
    flrigPort: s.catFlrigPort,
    icomSerialPort: s.catIcomSerialPort,
    icomBaudRate: s.catIcomBaudRate,
    icomRadioAddress: s.catIcomRadioAddress,
    icomNetworkHost: s.catIcomNetworkHost,
    icomNetworkUsername: s.catIcomNetworkUsername,
    icomNetworkPassword: s.catIcomNetworkPassword,
    pttLockout: s.catPttLockout,
  })));
  const updatePreferences = useSettingsStore((s) => s.updatePreferences);
  const lastCredentialUnlock = useProfileStore(
    (state) => state.lastCredentialUnlock,
  );

  // Local form state (initialized from persisted store)
  const [selectedBackend, setSelectedBackend] = useState<CATBackend>(() =>
    savedConfig.catBackend === "disabled"
      ? "none"
      : (savedConfig.catBackend as CATBackend),
  );
  const [hamlibHost, setHamlibHost] = useState(savedConfig.hamlibHost);
  const [hamlibPort, setHamlibPort] = useState(String(savedConfig.hamlibPort));
  const [civPort, setCivPort] = useState(String(savedConfig.civPort));
  const [flrigHost, setFlrigHost] = useState(savedConfig.flrigHost);
  const [flrigPort, setFlrigPort] = useState(String(savedConfig.flrigPort));
  const [testStatus, setTestStatus] = useState<
    "idle" | "testing" | "success" | "error"
  >("idle");
  const [testRequestId, setTestRequestId] = useState<string | null>(null);

  // ICOM Direct (serial) state
  const [icomSerialPorts, setIcomSerialPorts] = useState<DiscoveredPort[]>([]);
  const [icomSerialPort, setIcomSerialPort] = useState(
    savedConfig.icomSerialPort,
  );
  const [icomBaudRate, setIcomBaudRate] = useState(
    String(savedConfig.icomBaudRate),
  );
  const [icomRadioAddress, setIcomRadioAddress] = useState(
    `0x${savedConfig.icomRadioAddress.toString(16).toUpperCase()}`,
  );
  const [icomModelDisplay, setIcomModelDisplay] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanRequestId, setScanRequestId] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  // ICOM Network (RS-BA1) state
  const [icomNetHost, setIcomNetHost] = useState(savedConfig.icomNetworkHost);
  const [icomNetUser, setIcomNetUser] = useState(
    savedConfig.icomNetworkUsername,
  );
  const [icomNetPass, setIcomNetPass] = useState(
    savedConfig.icomNetworkPassword,
  );
  const [credentialMessage, setCredentialMessage] = useState<string | null>(
    null,
  );
  const scanTimeoutRef = useRef<number | null>(null);
  const testTimeoutRef = useRef<number | null>(null);
  const statusResetTimeoutRef = useRef<number | null>(null);

  const clearRequestTimeout = useCallback((kind: "scan" | "test") => {
    const ref = kind === "scan" ? scanTimeoutRef : testTimeoutRef;
    if (ref.current !== null) {
      window.clearTimeout(ref.current);
      ref.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      clearRequestTimeout("scan");
      clearRequestTimeout("test");
      if (statusResetTimeoutRef.current !== null) {
        window.clearTimeout(statusResetTimeoutRef.current);
      }
    },
    [clearRequestTimeout],
  );

  const saveIcomCredentialIfPossible = useCallback(() => {
    if (!icomNetPass) return;
    updatePreferences({
      catIcomNetworkUsername: icomNetUser,
      catIcomNetworkPassword: icomNetPass,
    });
    if (!isUnlocked()) {
      setCredentialMessage(
        "Credential vault is locked. The password is available only for this session until the vault is unlocked.",
      );
      return;
    }
    void saveCredential("icom-network", icomNetUser, icomNetPass)
      .then(() => setCredentialMessage("Password saved in the encrypted credential vault."))
      .catch((error: unknown) =>
        setCredentialMessage(
          error instanceof Error ? error.message : "Unable to save credential",
        ),
      );
  }, [icomNetPass, icomNetUser, updatePreferences]);

  useEffect(() => {
    if (!isUnlocked()) {
      if (savedConfig.icomNetworkPassword) saveIcomCredentialIfPossible();
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        if (savedConfig.icomNetworkPassword) {
          await saveCredential(
            "icom-network",
            savedConfig.icomNetworkUsername,
            savedConfig.icomNetworkPassword,
          );
          if (!cancelled) {
            setCredentialMessage(
              "Legacy password moved to the encrypted credential vault.",
            );
          }
          return;
        }
        const credential = await getCredential("icom-network");
        if (!credential || cancelled) return;
        setIcomNetUser(credential.username);
        setIcomNetPass(credential.password);
        updatePreferences({
          catIcomNetworkUsername: credential.username,
          catIcomNetworkPassword: credential.password,
        });
      } catch (error: unknown) {
        if (!cancelled) {
          setCredentialMessage(
            error instanceof Error ? error.message : "Unable to load credential",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    savedConfig.icomNetworkPassword,
    savedConfig.icomNetworkUsername,
    lastCredentialUnlock,
    saveIcomCredentialIfPossible,
    updatePreferences,
  ]);

  // Handle devices:scan:result from bridge (daemon protocol = flat JSON, no payload wrapper)
  useEffect(() => {
    if (!lastMessage) return;
    const msg = lastMessage as unknown as Record<string, unknown>;
    if (
      msg.type === "devices:scan:result" &&
      scanRequestId !== null &&
      msg.id === scanRequestId
    ) {
      const payload =
        typeof msg.payload === "object" && msg.payload !== null
          ? (msg.payload as Record<string, unknown>)
          : msg;
      const radios = (
        Array.isArray(payload.radios) ? payload.radios : []
      ) as DiscoveredPort[];
      setIcomSerialPorts(radios);
      clearRequestTimeout("scan");
      setScanning(false);
      setScanRequestId(null);
      setScanError(null);
      // Auto-select first radio if none selected
      if (radios.length > 0 && !icomSerialPort) {
        setIcomSerialPort(radios[0].port);
        setIcomBaudRate(String(radios[0].baudRate));
        setIcomRadioAddress(
          `0x${radios[0].radioAddress.toString(16).toUpperCase()}`,
        );
        setIcomModelDisplay(radios[0].modelName);
      }
    }
    if (scanRequestId && msg.id === scanRequestId && msg.type === "error") {
      const payload =
        typeof msg.payload === "object" && msg.payload !== null
          ? (msg.payload as Record<string, unknown>)
          : {};
      clearRequestTimeout("scan");
      setScanning(false);
      setScanRequestId(null);
      setScanError(
        typeof payload.message === "string"
          ? payload.message
          : "Radio scan failed",
      );
    }
    if (
      testStatus === "testing" &&
      testRequestId &&
      msg.id === testRequestId
    ) {
      const payload =
        typeof msg.payload === "object" && msg.payload !== null
          ? (msg.payload as Record<string, unknown>)
          : {};
      if (msg.type === "rig:test.ack" && payload.success === true) {
        setTestStatus("success");
      } else if (msg.type === "error" || payload.success === false) {
        setTestStatus("error");
      } else {
        return;
      }
      clearRequestTimeout("test");
      if (statusResetTimeoutRef.current !== null) {
        window.clearTimeout(statusResetTimeoutRef.current);
      }
      setTestRequestId(null);
      statusResetTimeoutRef.current = window.setTimeout(
        () => setTestStatus("idle"),
        3000,
      );
    }
  }, [
    lastMessage,
    icomSerialPort,
    scanRequestId,
    testRequestId,
    testStatus,
    clearRequestTimeout,
  ]);

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

  // Scan for ICOM serial devices when backend is icom-serial
  const handleScanPorts = useCallback(() => {
    if (!bridgeSendRequest) return;
    setScanning(true);
    setScanError(null);
    const id = bridgeSendRequest("devices:scan", {});
    if (!id) {
      setScanning(false);
      setScanError("Bridge is not connected");
      return;
    }
    setScanRequestId(id);
    clearRequestTimeout("scan");
    scanTimeoutRef.current = window.setTimeout(() => {
      setScanning(false);
      setScanRequestId((current) => (current === id ? null : current));
      setScanError("Radio scan timed out");
      scanTimeoutRef.current = null;
    }, 12_000);
  }, [bridgeSendRequest, clearRequestTimeout]);

  // Backend change handler — also persist to settingsStore
  const handleBackendChange = useCallback(
    (newBackend: CATBackend) => {
      setSelectedBackend(newBackend);
      if (newBackend === "none") {
        setBackend("none");
      } else if (newBackend === "hamlib") {
        setBackend("hamlib");
      } else if (newBackend === "flrig") {
        setBackend("flrig");
      } else if (newBackend === "icom-serial") {
        setBackend("icom-serial");
      } else if (newBackend === "icom-network") {
        setBackend("icom-network");
      }
      // Persist to settings store
      updatePreferences({
        catBackend: newBackend === "none" ? "disabled" : newBackend,
      });
      setTestStatus("idle");
    },
    [setBackend, updatePreferences],
  );

  // Auto-scan when switching to ICOM Direct
  useEffect(() => {
    if (selectedBackend === "icom-serial" && bridgeSend && bridgeConnected) {
      handleScanPorts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBackend, bridgeConnected]);

  // Toggle CAT enabled
  const handleCATToggle = useCallback(
    (enabled: boolean) => {
      if (enabled && selectedBackend === "icom-network") {
        saveIcomCredentialIfPossible();
      }
      setCATEnabled(enabled);
      const parsedRadioAddress = Number(icomRadioAddress);
      updatePreferences({
        catHamlibHost: hamlibHost,
        catHamlibPort: Number(hamlibPort),
        catFlrigHost: flrigHost,
        catFlrigPort: Number(flrigPort),
        catIcomSerialPort: icomSerialPort,
        catIcomBaudRate: Number(icomBaudRate),
        catIcomRadioAddress:
          Number.isInteger(parsedRadioAddress) &&
          parsedRadioAddress >= 0 &&
          parsedRadioAddress <= 0xff
            ? parsedRadioAddress
            : savedConfig.icomRadioAddress,
        catIcomNetworkHost: icomNetHost,
        catIcomNetworkUsername: icomNetUser,
        catIcomNetworkPassword: icomNetPass,
      });
      if (enabled && bridgeSend) {
        let config: Record<string, unknown>;
        if (selectedBackend === "hamlib") {
          config = {
            backend: "hamlib",
            host: hamlibHost,
            port: Number(hamlibPort),
          };
        } else if (selectedBackend === "flrig") {
          config = {
            backend: "flrig",
            host: flrigHost,
            port: Number(flrigPort),
          };
        } else if (selectedBackend === "icom-serial") {
          config = {
            backend: "icom-serial",
            serialPort: icomSerialPort,
            baudRate: Number(icomBaudRate),
            radioAddress:
              Number.isInteger(parsedRadioAddress) &&
              parsedRadioAddress >= 0 &&
              parsedRadioAddress <= 0xff
                ? parsedRadioAddress
                : savedConfig.icomRadioAddress,
          };
        } else if (selectedBackend === "icom-network") {
          config = {
            backend: "icom-network",
            host: icomNetHost,
            username: icomNetUser,
            password: icomNetPass,
          };
        } else if (selectedBackend === "auto") {
          config = { backend: "auto" };
        } else {
          config = { backend: "none" };
        }
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
      icomSerialPort,
      icomBaudRate,
      icomRadioAddress,
      icomNetHost,
      icomNetUser,
      icomNetPass,
      savedConfig.icomRadioAddress,
      saveIcomCredentialIfPossible,
      updatePreferences,
    ],
  );

  // Test connection
  const handleTestConnection = useCallback(() => {
    if (!bridgeSend) return;
    if (statusResetTimeoutRef.current !== null) {
      window.clearTimeout(statusResetTimeoutRef.current);
      statusResetTimeoutRef.current = null;
    }
    setTestStatus("testing");
    if (selectedBackend === "icom-network") {
      saveIcomCredentialIfPossible();
    }

    let config: Record<string, unknown>;
    if (selectedBackend === "hamlib") {
      config = {
        backend: "hamlib",
        host: hamlibHost,
        port: Number(hamlibPort),
      };
    } else if (selectedBackend === "flrig") {
      config = { backend: "flrig", host: flrigHost, port: Number(flrigPort) };
    } else if (selectedBackend === "icom-serial") {
      config = {
        backend: "icom-serial",
        serialPort: icomSerialPort,
        baudRate: Number(icomBaudRate),
        radioAddress: Number(icomRadioAddress),
      };
    } else if (selectedBackend === "icom-network") {
      config = {
        backend: "icom-network",
        host: icomNetHost,
        username: icomNetUser,
        password: icomNetPass,
      };
    } else {
      config = { backend: "auto" };
    }

    const requestId = bridgeSendRequest?.("rig:test", config) ?? null;
    if (!requestId) {
      setTestStatus("error");
      setTestRequestId(null);
      statusResetTimeoutRef.current = window.setTimeout(
        () => setTestStatus("idle"),
        3000,
      );
      return;
    }
    setTestRequestId(requestId);
    clearRequestTimeout("test");
    testTimeoutRef.current = window.setTimeout(() => {
      setTestRequestId((current) => (current === requestId ? null : current));
      setTestStatus("error");
      statusResetTimeoutRef.current = window.setTimeout(
        () => setTestStatus("idle"),
        3000,
      );
      testTimeoutRef.current = null;
    }, 12_000);
  }, [
    bridgeSend,
    bridgeSendRequest,
    selectedBackend,
    hamlibHost,
    hamlibPort,
    flrigHost,
    flrigPort,
    icomSerialPort,
    icomBaudRate,
    icomRadioAddress,
    icomNetHost,
    icomNetUser,
    icomNetPass,
    saveIcomCredentialIfPossible,
    clearRequestTimeout,
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
        <div className="grid grid-cols-3 gap-1.5">
          {(
            [
              { id: "auto", label: "Auto" },
              { id: "hamlib", label: "Hamlib" },
              { id: "flrig", label: "Flrig" },
              { id: "icom-serial", label: "ICOM Direct" },
              { id: "icom-network", label: "ICOM Network" },
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
              placeholder="4533"
              disabled={connected}
              className="w-full px-3 py-2 bg-deep-space border border-white/10 rounded-lg
                         text-white text-sm font-mono placeholder-gray-500
                         focus:outline-none focus:border-plasma-orange/50
                         disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>
        </div>
      )}

      {/* WFView CI-V Spectrum Port (Hamlib only) */}
      {selectedBackend === "hamlib" && (
        <div className="mt-2 flex items-end gap-2">
          <div className="w-28">
            <label
              htmlFor="civ-port"
              className="block text-xs text-gray-400 mb-1"
            >
              CI-V Port
            </label>
            <input
              type="number"
              id="civ-port"
              value={civPort}
              onChange={(e) => {
                setCivPort(e.target.value);
                updatePreferences({
                  catCivPort: Number(e.target.value) || 4580,
                });
              }}
              placeholder="4580"
              disabled={connected}
              className="w-full px-3 py-2 bg-deep-space border border-white/10 rounded-lg
                         text-white text-sm font-mono placeholder-gray-500
                         focus:outline-none focus:border-plasma-orange/50
                         disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>
          <p className="text-[11px] text-gray-500 pb-2">
            WFView CI-V TCP server for waterfall data
          </p>
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

      {/* ICOM Direct (USB Serial CI-V) */}
      {selectedBackend === "icom-serial" && (
        <div className="space-y-2">
          {/* Serial port dropdown + scan button */}
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label
                htmlFor="icom-serial-port"
                className="block text-xs text-gray-400 mb-1"
              >
                Serial Port
              </label>
              <select
                id="icom-serial-port"
                value={icomSerialPort}
                onChange={(e) => {
                  setIcomSerialPort(e.target.value);
                  // Auto-fill model name and baud rate from discovery
                  const match = icomSerialPorts.find(
                    (p) => p.port === e.target.value,
                  );
                  if (match) {
                    setIcomBaudRate(String(match.baudRate));
                    setIcomModelDisplay(match.modelName);
                    setIcomRadioAddress(
                      `0x${match.radioAddress.toString(16).toUpperCase()}`,
                    );
                  }
                }}
                disabled={connected}
                className="w-full px-3 py-2 bg-deep-space border border-white/10 rounded-lg
                           text-white text-sm font-mono
                           focus:outline-none focus:border-plasma-orange/50
                           disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">
                  {scanning ? "Scanning..." : "Select a port"}
                </option>
                {icomSerialPorts.map((p) => (
                  <option key={p.port} value={p.port}>
                    {p.port} - {p.modelName}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={handleScanPorts}
              disabled={connected || scanning || !bridgeSendRequest}
              className="px-3 py-2 rounded-lg text-xs font-medium bg-white/5 border border-white/10
                         text-gray-300 hover:bg-white/10 transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {scanning ? "Scanning..." : "Scan"}
            </button>
          </div>
          {scanError ? (
            <div className="text-xs text-alert-red">{scanError}</div>
          ) : null}

          {/* Baud rate and CI-V address */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label
                htmlFor="icom-baud"
                className="block text-xs text-gray-400 mb-1"
              >
                Baud Rate
              </label>
              <select
                id="icom-baud"
                value={icomBaudRate}
                onChange={(e) => setIcomBaudRate(e.target.value)}
                disabled={connected}
                className="w-full px-3 py-2 bg-deep-space border border-white/10 rounded-lg
                           text-white text-sm font-mono
                           focus:outline-none focus:border-plasma-orange/50
                           disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="9600">9600</option>
                <option value="19200">19200</option>
                <option value="115200">115200</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="icom-radio-address"
                className="block text-xs text-gray-400 mb-1"
              >
                CI-V Address
              </label>
              <input
                id="icom-radio-address"
                value={icomRadioAddress}
                onChange={(e) => setIcomRadioAddress(e.target.value)}
                disabled={connected}
                placeholder="0x94"
                className="w-full px-3 py-2 bg-deep-space border border-white/10 rounded-lg
                           text-white text-sm font-mono focus:outline-none focus:border-plasma-orange/50
                           disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>

            {/* Radio model display (auto-detected) */}
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Radio Model
              </label>
              <div
                className="px-3 py-2 bg-deep-space/50 border border-white/5 rounded-lg
                              text-sm font-mono text-gray-400 min-h-[38px] flex items-center"
              >
                {icomModelDisplay || "Auto-detect"}
              </div>
            </div>
          </div>

          <p className="text-[11px] text-gray-500">
            Direct USB serial connection via CI-V protocol. Spectrum data flows
            through the same connection.
          </p>
        </div>
      )}

      {/* ICOM Network (RS-BA1) */}
      {selectedBackend === "icom-network" && (
        <div className="space-y-2">
          <div>
            <label
              htmlFor="icom-net-host"
              className="block text-xs text-gray-400 mb-1"
            >
              Host IP
            </label>
            <input
              type="text"
              id="icom-net-host"
              value={icomNetHost}
              onChange={(e) => setIcomNetHost(e.target.value)}
              placeholder="192.168.1.100"
              disabled={connected}
              className="w-full px-3 py-2 bg-deep-space border border-white/10 rounded-lg
                         text-white text-sm font-mono placeholder-gray-500
                         focus:outline-none focus:border-plasma-orange/50
                         disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label
                htmlFor="icom-net-user"
                className="block text-xs text-gray-400 mb-1"
              >
                Username
              </label>
              <input
                type="text"
                id="icom-net-user"
                value={icomNetUser}
                onChange={(e) => setIcomNetUser(e.target.value)}
                placeholder="admin"
                disabled={connected}
                className="w-full px-3 py-2 bg-deep-space border border-white/10 rounded-lg
                           text-white text-sm font-mono placeholder-gray-500
                           focus:outline-none focus:border-plasma-orange/50
                           disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
            <div>
              <label
                htmlFor="icom-net-pass"
                className="block text-xs text-gray-400 mb-1"
              >
                Password
              </label>
              <input
                type="password"
                id="icom-net-pass"
                value={icomNetPass}
                onChange={(e) => setIcomNetPass(e.target.value)}
                placeholder="password"
                disabled={connected}
                className="w-full px-3 py-2 bg-deep-space border border-white/10 rounded-lg
                           text-white text-sm font-mono placeholder-gray-500
                           focus:outline-none focus:border-plasma-orange/50
                           disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
          </div>
          <p className="text-[11px] text-gray-500">
            RS-BA1 network connection. Requires ICOM RS-BA1 IP Remote Control
            Software running on the radio or gateway.
          </p>
          {credentialMessage ? (
            <p className="text-[11px] text-caution-yellow">
              {credentialMessage}
            </p>
          ) : null}
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
          checked={savedConfig.pttLockout}
          onChange={(checked) =>
            updatePreferences({ catPttLockout: checked })
          }
          label="PTT Safety Lockout"
          description="Prevent accidental transmissions via CAT control"
        />
        {savedConfig.pttLockout && (
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
          Enable the ProPulse Bridge above, then choose a CAT backend.{" "}
          <strong className="text-gray-400">ICOM Direct</strong> connects via
          USB serial (CI-V) for best latency and built-in spectrum.{" "}
          <strong className="text-gray-400">ICOM Network</strong> uses RS-BA1
          for remote operation.{" "}
          <strong className="text-gray-400">Hamlib</strong> and{" "}
          <strong className="text-gray-400">Flrig</strong> support most other
          radios. Auto-detect tries all available backends.
        </p>
      </div>

      {/* Re-run wizard */}
      <div className="pt-1 text-center">
        <button
          type="button"
          onClick={() => updatePreferences({ radioSetupCompleted: false })}
          className="text-xs text-plasma-orange/70 hover:text-plasma-orange transition-colors"
        >
          Re-run Radio Setup Wizard
        </button>
      </div>
    </div>
  );
});

export default CATSettings;
