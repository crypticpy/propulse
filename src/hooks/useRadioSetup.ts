/**
 * useRadioSetup — Auto-detection state machine hook for the Radio Setup Wizard.
 *
 * Manages a 4-step wizard: detecting → configuring → testing → complete
 *
 * Uses an independent extension-safe transport to the bridge daemon
 * (ws://127.0.0.1:9867) so the wizard does not affect global bridge state.
 *
 * Steps:
 *  1. **Detecting**: Probes bridge, sends `devices:scan`, discovers ICOM radios
 *  2. **Configuring**: User reviews/edits auto-filled config (backend, port, baud, etc.)
 *  3. **Testing**: Sends `rig:test` with config, waits for ack/radio state
 *  4. **Complete**: Persists config to settingsStore, enables bridge
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { useSettingsStore } from "@/stores/settingsStore";
import { useRadioDaemon } from "@/hooks/useRadioDaemon";
import type { DaemonIncomingMessage } from "@/lib/radio/protocol";
import { isUnlocked, saveCredential } from "@/lib/db/credentialStore";

// ─── Bridge URL ──────────────────────────────────────────────────────────────

const BRIDGE_URL = "ws://127.0.0.1:9867";

// ─── Timeouts ────────────────────────────────────────────────────────────────

/** How long to wait for the bridge and a complete device scan */
const BRIDGE_PROBE_TIMEOUT_MS = 12_000;

/** How long to wait for the rig:test response (probe + CI-V poll + audio resolve) */
const RIG_TEST_TIMEOUT_MS = 12_000;

// ─── Types ───────────────────────────────────────────────────────────────────

export type WizardStep = "detecting" | "configuring" | "testing" | "complete";

export type DetectionStatus = "pending" | "probing" | "found" | "not-found";

export interface DiscoveredRadio {
  port: string;
  radioAddress: number;
  modelName: string;
  baudRate: number;
  vid?: string;
  pid?: string;
  audioDevice?: {
    deviceId: string;
    deviceName: string;
    matchMethod: string;
  } | null;
}

export type CATBackend =
  | "auto"
  | "hamlib"
  | "flrig"
  | "icom-serial"
  | "icom-network"
  | "disabled";

export interface RadioConfig {
  catBackend: CATBackend;
  hamlibHost: string;
  hamlibPort: number;
  civPort: number;
  flrigHost: string;
  flrigPort: number;
  icomSerialPort: string;
  icomBaudRate: number;
  icomRadioAddress: number;
  icomNetworkHost: string;
  icomNetworkUsername: string;
  icomNetworkPassword: string;
}

export interface TestResult {
  status: "idle" | "testing" | "success" | "error";
  rigModel?: string;
  frequency?: number;
  mode?: string;
  hasSpectrum?: boolean;
  errorMessage?: string;
}

export interface UseRadioSetupReturn {
  step: WizardStep;
  detection: {
    bridgeStatus: DetectionStatus;
    radios: DiscoveredRadio[];
    selectedRadio?: DiscoveredRadio;
    autoBackend?: CATBackend;
  };
  config: RadioConfig;
  testResult: TestResult;
  startDetection: () => void;
  setConfig: (partial: Partial<RadioConfig>) => void;
  goToStep: (step: WizardStep) => void;
  testConnection: () => void;
  retryTest: () => void;
  saveAndComplete: () => void;
  skipSetup: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build the rig:test payload from the current config. */
export function buildRadioTestPayload(
  config: RadioConfig,
): Record<string, unknown> {
  switch (config.catBackend) {
    case "hamlib":
      return {
        backend: "hamlib",
        host: config.hamlibHost,
        port: config.hamlibPort,
      };
    case "flrig":
      return {
        backend: "flrig",
        host: config.flrigHost,
        port: config.flrigPort,
      };
    case "icom-serial":
      return {
        backend: "icom-serial",
        serialPort: config.icomSerialPort,
        baudRate: config.icomBaudRate,
        radioAddress: config.icomRadioAddress,
      };
    case "icom-network":
      return {
        backend: "icom-network",
        host: config.icomNetworkHost,
        username: config.icomNetworkUsername,
        password: config.icomNetworkPassword,
      };
    case "auto":
    default:
      return { backend: "auto" };
  }
}

/**
 * Interpret only the response correlated to a specific rig:test request.
 * Generic success responses are deliberately not accepted as proof that a
 * radio answered.
 */
export function parseRadioTestResult(
  incoming: unknown,
  requestId: string,
): TestResult | null {
  if (!incoming || typeof incoming !== "object") return null;
  const message = incoming as {
    type?: string;
    id?: string;
    success?: boolean;
    error?: string;
    payload?: {
      success?: boolean;
      rigModel?: string;
      frequency?: number;
      mode?: string;
      hasSpectrum?: boolean;
      error?: string;
      errorMessage?: string;
      message?: string;
    };
  };
  if (message.id !== requestId) return null;

  if (
    (message.type === "rig:test:ack" || message.type === "rig:test.ack") &&
    message.payload?.success === true
  ) {
    return {
      status: "success",
      rigModel: message.payload.rigModel,
      frequency: message.payload.frequency,
      mode: message.payload.mode,
      hasSpectrum: message.payload.hasSpectrum === true,
    };
  }

  if (
    message.type === "rig:test:error" ||
    message.type === "error" ||
    (message.type === "response" && message.success === false)
  ) {
    return {
      status: "error",
      errorMessage:
        message.payload?.errorMessage ??
        message.payload?.error ??
        message.payload?.message ??
        message.error ??
        "Radio connection test failed",
    };
  }

  return null;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useRadioSetup(): UseRadioSetupReturn {
  // ── Read initial config from settingsStore ──────────────────────────────
  const store = useSettingsStore.getState();

  // ── Wizard step ─────────────────────────────────────────────────────────
  const [step, setStep] = useState<WizardStep>("detecting");

  // ── Detection state ─────────────────────────────────────────────────────
  const [bridgeStatus, setBridgeStatus] = useState<DetectionStatus>("pending");
  const [radios, setRadios] = useState<DiscoveredRadio[]>([]);
  const [selectedRadio, setSelectedRadio] = useState<
    DiscoveredRadio | undefined
  >();
  const [autoBackend, setAutoBackend] = useState<CATBackend | undefined>();

  // ── Config state (pre-filled from store) ────────────────────────────────
  const [config, setConfigState] = useState<RadioConfig>({
    catBackend: store.catBackend as CATBackend,
    hamlibHost: store.catHamlibHost,
    hamlibPort: store.catHamlibPort,
    civPort: store.catCivPort,
    flrigHost: store.catFlrigHost,
    flrigPort: store.catFlrigPort,
    icomSerialPort: store.catIcomSerialPort,
    icomBaudRate: store.catIcomBaudRate,
    icomRadioAddress: store.catIcomRadioAddress,
    icomNetworkHost: store.catIcomNetworkHost,
    icomNetworkUsername: store.catIcomNetworkUsername,
    icomNetworkPassword: store.catIcomNetworkPassword,
  });

  // ── Test result state ───────────────────────────────────────────────────
  const [testResult, setTestResult] = useState<TestResult>({ status: "idle" });

  // ── Shared HTTPS-safe transport lifecycle ───────────────────────────────
  const [transportMode, setTransportMode] = useState<
    "idle" | "detect" | "test"
  >("idle");
  const requestIdRef = useRef<string | null>(null);
  const probeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const testTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  // ── Cleanup helper ──────────────────────────────────────────────────────
  const closeProbeWs = useCallback(() => {
    if (probeTimeoutRef.current) {
      clearTimeout(probeTimeoutRef.current);
      probeTimeoutRef.current = null;
    }
    requestIdRef.current = null;
    setTransportMode((mode) => (mode === "detect" ? "idle" : mode));
  }, []);

  const closeTestWs = useCallback(() => {
    if (testTimeoutRef.current) {
      clearTimeout(testTimeoutRef.current);
      testTimeoutRef.current = null;
    }
    requestIdRef.current = null;
    setTransportMode((mode) => (mode === "test" ? "idle" : mode));
  }, []);

  // ── Unmount cleanup ─────────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (probeTimeoutRef.current) clearTimeout(probeTimeoutRef.current);
      if (testTimeoutRef.current) clearTimeout(testTimeoutRef.current);
      requestIdRef.current = null;
    };
  }, []);

  const handleTransportMessage = useCallback(
    (incoming: DaemonIncomingMessage) => {
      if (!mountedRef.current) return;
      const message = incoming as DaemonIncomingMessage & {
        id?: string;
        radios?: DiscoveredRadio[];
        error?: string;
        payload?: {
          radios?: DiscoveredRadio[];
          success?: boolean;
          rigModel?: string;
          frequency?: number;
          mode?: string;
          hasSpectrum?: boolean;
          error?: string;
          errorMessage?: string;
          message?: string;
        };
        success?: boolean;
      };
      const requestId = requestIdRef.current;

      if (
        transportMode === "detect" &&
        message.type === "devices:scan:result" &&
        requestId !== null &&
        message.id === requestId
      ) {
        const discovered = message.radios ?? message.payload?.radios ?? [];
        setRadios(discovered);
        setBridgeStatus("found");

        const first = discovered[0];
        if (first) {
          setSelectedRadio(first);
          setAutoBackend("icom-serial");
          setConfigState((previous) => ({
            ...previous,
            catBackend: "icom-serial",
            icomSerialPort: first.port,
            icomBaudRate: first.baudRate,
            icomRadioAddress: first.radioAddress,
          }));
        }
        closeProbeWs();
        return;
      }

      if (
        transportMode === "detect" &&
        message.id === requestId &&
        (message.type === "error" ||
          (message.type === "response" && message.success === false))
      ) {
        // The bridge is reachable but scanning is unsupported or failed. Keep
        // the wizard on the manual-configuration path instead of claiming the
        // bridge itself was not found.
        setBridgeStatus("found");
        setRadios([]);
        closeProbeWs();
        return;
      }

      if (transportMode === "test" && message.id === requestId) {
        const result = parseRadioTestResult(message, requestId);
        if (result) {
          setTestResult(result);
          closeTestWs();
          return;
        }
      }
    },
    [closeProbeWs, closeTestWs, transportMode],
  );

  const transport = useRadioDaemon({
    enabled: transportMode !== "idle",
    url: BRIDGE_URL,
    autoReconnect: false,
    trackLastMessage: false,
    trackLastFrame: false,
    authToken: store.radioDaemonAuthToken || undefined,
    onMessage: handleTransportMessage,
  });

  useEffect(() => {
    if (!transport.connected || requestIdRef.current) return;
    if (transportMode === "detect") {
      setBridgeStatus("found");
      requestIdRef.current = transport.sendCommand("devices:scan");
    } else if (transportMode === "test") {
      requestIdRef.current = transport.sendCommand(
        "rig:test",
        buildRadioTestPayload(config),
      );
    }
  }, [config, transport, transportMode]);

  useEffect(() => {
    if (!transport.error || transportMode === "idle") return;
    if (transportMode === "detect") {
      setBridgeStatus("not-found");
      closeProbeWs();
    } else {
      setTestResult({ status: "error", errorMessage: transport.error });
      closeTestWs();
    }
  }, [closeProbeWs, closeTestWs, transport.error, transportMode]);

  // ── startDetection ──────────────────────────────────────────────────────
  const startDetection = useCallback(() => {
    closeProbeWs();
    closeTestWs();
    setBridgeStatus("probing");
    setRadios([]);
    setSelectedRadio(undefined);
    setAutoBackend(undefined);
    setStep("detecting");
    requestIdRef.current = null;
    setTransportMode("detect");

    probeTimeoutRef.current = setTimeout(() => {
      if (!mountedRef.current) return;
      setBridgeStatus((previous) =>
        previous === "probing" ? "not-found" : previous,
      );
      closeProbeWs();
    }, BRIDGE_PROBE_TIMEOUT_MS);
  }, [closeProbeWs, closeTestWs]);

  // ── setConfig (partial merge) ───────────────────────────────────────────
  const setConfig = useCallback((partial: Partial<RadioConfig>) => {
    setConfigState((prev) => ({ ...prev, ...partial }));
  }, []);

  // ── goToStep ────────────────────────────────────────────────────────────
  const goToStep = useCallback((target: WizardStep) => {
    setStep(target);
  }, []);

  // ── testConnection ──────────────────────────────────────────────────────
  const testConnection = useCallback(() => {
    closeTestWs();
    closeProbeWs();
    setTestResult({ status: "testing" });
    setStep("testing");

    requestIdRef.current = null;
    setTransportMode("test");

    // Timeout for the entire test exchange
    testTimeoutRef.current = setTimeout(() => {
      if (!mountedRef.current) return;
      setTestResult({
        status: "error",
        errorMessage:
          "Test timed out — the radio did not respond within 12 seconds",
      });
      closeTestWs();
    }, RIG_TEST_TIMEOUT_MS);
  }, [closeProbeWs, closeTestWs]);

  // ── retryTest ───────────────────────────────────────────────────────────
  const retryTest = useCallback(() => {
    setTestResult({ status: "idle" });
    testConnection();
  }, [testConnection]);

  // ── saveAndComplete ─────────────────────────────────────────────────────
  const saveAndComplete = useCallback(() => {
    if (
      config.catBackend === "icom-network" &&
      config.icomNetworkPassword &&
      isUnlocked()
    ) {
      void saveCredential(
        "icom-network",
        config.icomNetworkUsername,
        config.icomNetworkPassword,
      );
    }
    useSettingsStore.getState().updatePreferences({
      bridgeEnabled: true,
      radioSetupCompleted: true,
      catBackend: config.catBackend,
      catHamlibHost: config.hamlibHost,
      catHamlibPort: config.hamlibPort,
      catCivPort: config.civPort,
      catFlrigHost: config.flrigHost,
      catFlrigPort: config.flrigPort,
      catIcomSerialPort: config.icomSerialPort,
      catIcomBaudRate: config.icomBaudRate,
      catIcomRadioAddress: config.icomRadioAddress,
      catIcomNetworkHost: config.icomNetworkHost,
      catIcomNetworkUsername: config.icomNetworkUsername,
      catIcomNetworkPassword: config.icomNetworkPassword,
    });
    setStep("complete");
  }, [config]);

  // ── skipSetup ───────────────────────────────────────────────────────────
  const skipSetup = useCallback(() => {
    useSettingsStore.getState().updatePreferences({
      radioSetupCompleted: true,
    });
    setStep("complete");
  }, []);

  // ── Return value ────────────────────────────────────────────────────────

  return {
    step,
    detection: {
      bridgeStatus,
      radios,
      selectedRadio,
      autoBackend,
    },
    config,
    testResult,
    startDetection,
    setConfig,
    goToStep,
    testConnection,
    retryTest,
    saveAndComplete,
    skipSetup,
  };
}

export default useRadioSetup;
