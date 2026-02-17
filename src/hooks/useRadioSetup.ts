/**
 * useRadioSetup — Auto-detection state machine hook for the Radio Setup Wizard.
 *
 * Manages a 4-step wizard: detecting → configuring → testing → complete
 *
 * Uses independent raw WebSocket probes to the bridge daemon (ws://127.0.0.1:9867)
 * so that the wizard can operate without affecting global bridge state.
 *
 * Steps:
 *  1. **Detecting**: Probes bridge, sends `devices:scan`, discovers ICOM radios
 *  2. **Configuring**: User reviews/edits auto-filled config (backend, port, baud, etc.)
 *  3. **Testing**: Sends `rig:test` with config, waits for ack/radio state
 *  4. **Complete**: Persists config to settingsStore, enables bridge
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { useSettingsStore } from "@/stores/settingsStore";

// ─── Bridge URL ──────────────────────────────────────────────────────────────

const BRIDGE_URL = "ws://127.0.0.1:9867";

// ─── Timeouts ────────────────────────────────────────────────────────────────

/** How long to wait for the bridge WebSocket to open */
const BRIDGE_PROBE_TIMEOUT_MS = 3_000;

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

/** Build the rig:test payload from the current config */
function buildTestPayload(config: RadioConfig): Record<string, unknown> {
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

  // ── Refs for WebSocket lifecycle ────────────────────────────────────────
  const probeWsRef = useRef<WebSocket | null>(null);
  const testWsRef = useRef<WebSocket | null>(null);
  const probeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const testTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  // ── Cleanup helper ──────────────────────────────────────────────────────
  const closeProbeWs = useCallback(() => {
    if (probeTimeoutRef.current) {
      clearTimeout(probeTimeoutRef.current);
      probeTimeoutRef.current = null;
    }
    if (probeWsRef.current) {
      try {
        probeWsRef.current.close(1000, "Probe cleanup");
      } catch {
        /* ignore */
      }
      probeWsRef.current = null;
    }
  }, []);

  const closeTestWs = useCallback(() => {
    if (testTimeoutRef.current) {
      clearTimeout(testTimeoutRef.current);
      testTimeoutRef.current = null;
    }
    if (testWsRef.current) {
      try {
        testWsRef.current.close(1000, "Test cleanup");
      } catch {
        /* ignore */
      }
      testWsRef.current = null;
    }
  }, []);

  // ── Unmount cleanup ─────────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      closeProbeWs();
      closeTestWs();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── startDetection ──────────────────────────────────────────────────────
  const startDetection = useCallback(() => {
    // Reset detection state
    closeProbeWs();
    setBridgeStatus("probing");
    setRadios([]);
    setSelectedRadio(undefined);
    setAutoBackend(undefined);
    setStep("detecting");

    let ws: WebSocket;
    try {
      ws = new WebSocket(BRIDGE_URL);
    } catch {
      if (mountedRef.current) {
        setBridgeStatus("not-found");
      }
      return;
    }
    probeWsRef.current = ws;

    // Timeout: if we don't connect + get scan results in time, give up
    probeTimeoutRef.current = setTimeout(() => {
      if (!mountedRef.current) return;
      // If still probing, the bridge didn't respond in time
      setBridgeStatus((prev) => (prev === "probing" ? "not-found" : prev));
      closeProbeWs();
    }, BRIDGE_PROBE_TIMEOUT_MS);

    ws.onopen = () => {
      if (!mountedRef.current) {
        ws.close();
        return;
      }
      // Bridge is reachable — mark found immediately
      setBridgeStatus("found");

      // Send device scan as flat daemon command (NO ts/timestamp — the
      // bridge's isDaemonCommand() rejects messages with those fields)
      ws.send(JSON.stringify({ type: "devices:scan" }));
    };

    ws.onmessage = (event: MessageEvent) => {
      if (!mountedRef.current) return;

      try {
        const msg = JSON.parse(event.data as string) as {
          type: string;
          radios?: DiscoveredRadio[];
        };

        if (msg.type === "devices:scan:result") {
          // Daemon protocol: radios is a flat top-level field (no payload wrapper)
          const discovered = msg.radios ?? [];
          setRadios(discovered);

          if (discovered.length > 0) {
            const first = discovered[0];
            setBridgeStatus("found");
            setSelectedRadio(first);
            setAutoBackend("icom-serial");

            // Pre-fill config from discovered radio
            setConfigState((prev) => ({
              ...prev,
              catBackend: "icom-serial" as CATBackend,
              icomSerialPort: first.port,
              icomBaudRate: first.baudRate,
              icomRadioAddress: first.radioAddress,
            }));
          } else {
            // Bridge is running but no radios found
            setBridgeStatus("found");
          }

          closeProbeWs();
        }
      } catch {
        // Ignore non-JSON or malformed messages
      }
    };

    ws.onerror = () => {
      if (!mountedRef.current) return;
      setBridgeStatus("not-found");
      closeProbeWs();
    };

    ws.onclose = () => {
      // If we haven't resolved yet and the socket closed, mark as not-found
      if (!mountedRef.current) return;
      setBridgeStatus((prev) => (prev === "probing" ? "not-found" : prev));
    };
  }, [closeProbeWs]);

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
    setTestResult({ status: "testing" });
    setStep("testing");

    let ws: WebSocket;
    try {
      ws = new WebSocket(BRIDGE_URL);
    } catch {
      if (mountedRef.current) {
        setTestResult({
          status: "error",
          errorMessage: "Could not open WebSocket to bridge",
        });
      }
      return;
    }
    testWsRef.current = ws;

    // Timeout for the entire test exchange
    testTimeoutRef.current = setTimeout(() => {
      if (!mountedRef.current) return;
      setTestResult({
        status: "error",
        errorMessage:
          "Test timed out — the radio did not respond within 5 seconds",
      });
      closeTestWs();
    }, RIG_TEST_TIMEOUT_MS);

    ws.onopen = () => {
      if (!mountedRef.current) {
        ws.close();
        return;
      }
      // Send as flat daemon command (NO ts/id — isDaemonCommand rejects those)
      ws.send(
        JSON.stringify({
          type: "rig:test",
          ...buildTestPayload(config),
        }),
      );
    };

    ws.onmessage = (event: MessageEvent) => {
      if (!mountedRef.current) return;

      try {
        const msg = JSON.parse(event.data as string) as {
          type: string;
          payload?: {
            rigModel?: string;
            frequency?: number;
            mode?: string;
            hasSpectrum?: boolean;
            error?: string;
            errorMessage?: string;
          };
        };

        // Only accept rig:test:ack as success (radio:state broadcasts interfere)
        if (msg.type === "rig:test:ack") {
          const p = msg.payload;
          if (p?.error || p?.errorMessage) {
            setTestResult({
              status: "error",
              errorMessage: p.error ?? p.errorMessage,
            });
          } else {
            setTestResult({
              status: "success",
              rigModel: p?.rigModel,
              frequency: p?.frequency,
              mode: p?.mode,
              hasSpectrum: p?.hasSpectrum,
            });
          }
          closeTestWs();
        }

        // Also handle explicit error response
        if (msg.type === "rig:test:error") {
          setTestResult({
            status: "error",
            errorMessage:
              msg.payload?.errorMessage ??
              msg.payload?.error ??
              "Unknown error from bridge",
          });
          closeTestWs();
        }
      } catch {
        // Ignore malformed
      }
    };

    ws.onerror = () => {
      if (!mountedRef.current) return;
      setTestResult({
        status: "error",
        errorMessage:
          "Bridge connection failed — is the bridge daemon running?",
      });
      closeTestWs();
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      // If test is still in "testing" state when socket closes, that's an error
      setTestResult((prev) =>
        prev.status === "testing"
          ? {
              status: "error",
              errorMessage: "Connection to bridge closed unexpectedly",
            }
          : prev,
      );
    };
  }, [config, closeTestWs]);

  // ── retryTest ───────────────────────────────────────────────────────────
  const retryTest = useCallback(() => {
    setTestResult({ status: "idle" });
    testConnection();
  }, [testConnection]);

  // ── saveAndComplete ─────────────────────────────────────────────────────
  const saveAndComplete = useCallback(() => {
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
