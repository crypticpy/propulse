/**
 * useRigBridgeSync
 *
 * Keeps the transient rigStore in sync with the bridge/daemon connection:
 * - Listens for `rig.update` messages and updates rigStore fields.
 * - Records the bridge welcome capabilities and `rotor.status` pushes.
 * - Dispatches staged `pendingFrequency`/`pendingMode`/`pendingRotorHeading`
 *   commands to the bridge.
 *
 * This allows "click-to-tune" workflows (spots, satellites, band advisor) to
 * work without every component needing direct bridge access.
 */

import { useEffect, useMemo, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { useBridge } from "@/hooks/useBridge";
import { useSettingsStore } from "@/stores/settingsStore";
import { useRigStore } from "@/stores/rigStore";
import { ingestWSJTXMessage } from "@/lib/radio/wsjtxIngestion";
import { useWSJTXStore } from "@/stores/wsjtxStore";
import type { BridgeMessage, RotorStatusPayload } from "@/types/bridge";

type RigUpdatePayload = {
  connected?: boolean;
  backend?: string;
  frequency?: number;
  mode?: string;
  band?: string;
  ptt?: boolean;
};

interface RigUpdateFields {
  /** `undefined` when the payload carried no `connected` field. */
  connected?: boolean;
  /** Fields to apply via rigStore.updateStatus (may be empty). */
  status: Partial<Pick<RigUpdatePayload, "frequency" | "mode" | "band" | "ptt">>;
}

/**
 * Pick out the fields a `rig.update`/`rig.status` payload carries. `ptt`
 * reflects the rig's own polled hardware state (footswitch, front panel,
 * etc.), not just bridge-initiated PTT.
 */
export function parseRigUpdatePayload(payload: RigUpdatePayload): RigUpdateFields {
  const status: RigUpdateFields["status"] = {};
  if (typeof payload.frequency === "number") status.frequency = payload.frequency;
  if (typeof payload.mode === "string") status.mode = payload.mode;
  if (typeof payload.band === "string") status.band = payload.band;
  if (typeof payload.ptt === "boolean") status.ptt = payload.ptt;
  return {
    connected: typeof payload.connected === "boolean" ? payload.connected : undefined,
    status,
  };
}

function readCapabilities(payload: unknown): string[] {
  const raw = (payload as { capabilities?: unknown } | null)?.capabilities;
  return Array.isArray(raw)
    ? raw.filter((item): item is string => typeof item === "string")
    : [];
}

export function useRigBridgeSync() {
  const settings = useSettingsStore(
    useShallow((state) => ({
      bridgeEnabled: state.bridgeEnabled,
      catBackend: state.catBackend,
      catHamlibHost: state.catHamlibHost,
      catHamlibPort: state.catHamlibPort,
      catFlrigHost: state.catFlrigHost,
      catFlrigPort: state.catFlrigPort,
      catIcomSerialPort: state.catIcomSerialPort,
      catIcomBaudRate: state.catIcomBaudRate,
      catIcomRadioAddress: state.catIcomRadioAddress,
      catIcomNetworkHost: state.catIcomNetworkHost,
      catIcomNetworkUsername: state.catIcomNetworkUsername,
      catIcomNetworkPassword: state.catIcomNetworkPassword,
      catPttLockout: state.catPttLockout,
    })),
  );
  const { connected: bridgeConnected, lastMessage, send, sendRequest } = useBridge({
    enabled: settings.bridgeEnabled,
    onMessage: ingestWSJTXMessage,
  });

  useEffect(() => {
    if (!bridgeConnected) useWSJTXStore.getState().setConnected(false);
  }, [bridgeConnected]);
  useEffect(() => () => useWSJTXStore.getState().setConnected(false), []);

  const catConfigured =
    settings.catBackend !== "disabled";
  const rigConnected = useRigStore((s) => s.connected);
  const backend = useRigStore((s) => s.backend);
  const pendingFrequency = useRigStore((s) => s.pendingFrequency);
  const pendingMode = useRigStore((s) => s.pendingMode);
  const pendingRotorHeading = useRigStore((s) => s.pendingRotorHeading);
  const clearPendingFrequency = useRigStore((s) => s.clearPendingFrequency);
  const clearPendingMode = useRigStore((s) => s.clearPendingMode);
  const clearPendingRotorHeading = useRigStore(
    (s) => s.clearPendingRotorHeading,
  );
  const setBridgeConnected = useRigStore((s) => s.setBridgeConnected);
  const setBridgeCapabilities = useRigStore((s) => s.setBridgeCapabilities);
  const setRotorStatus = useRigStore((s) => s.setRotorStatus);
  const setConnected = useRigStore((s) => s.setConnected);
  const setCATEnabled = useRigStore((s) => s.setCATEnabled);
  const setBackend = useRigStore((s) => s.setBackend);
  const updateStatus = useRigStore((s) => s.updateStatus);
  const connectRequestIdRef = useRef<string | null>(null);
  const pendingTuneRequestRef = useRef<{
    id: string;
    frequency: number | null;
    mode: string | null;
  } | null>(null);
  const pendingRotorRequestRef = useRef<{
    id: string;
    value: { azimuth: number; elevation?: number };
  } | null>(null);

  const connectPayload = useMemo(() => {
    switch (settings.catBackend) {
      case "hamlib":
        return {
          backend: "hamlib",
          host: settings.catHamlibHost,
          port: settings.catHamlibPort,
        };
      case "flrig":
        return {
          backend: "flrig",
          host: settings.catFlrigHost,
          port: settings.catFlrigPort,
        };
      case "icom-serial":
        return {
          backend: "icom-serial",
          serialPort: settings.catIcomSerialPort,
          baudRate: settings.catIcomBaudRate,
          radioAddress: settings.catIcomRadioAddress,
        };
      case "icom-network":
        return {
          backend: "icom-network",
          host: settings.catIcomNetworkHost,
          username: settings.catIcomNetworkUsername,
          password: settings.catIcomNetworkPassword,
          radioAddress: settings.catIcomRadioAddress,
        };
      default:
        return { backend: "auto" };
    }
  }, [
    settings.catBackend,
    settings.catFlrigHost,
    settings.catFlrigPort,
    settings.catHamlibHost,
    settings.catHamlibPort,
    settings.catIcomBaudRate,
    settings.catIcomNetworkHost,
    settings.catIcomNetworkPassword,
    settings.catIcomNetworkUsername,
    settings.catIcomRadioAddress,
    settings.catIcomSerialPort,
  ]);

  useEffect(() => {
    setCATEnabled(catConfigured);
    setBackend(
      settings.catBackend === "disabled" || settings.catBackend === "auto"
        ? "none"
        : settings.catBackend,
    );
  }, [catConfigured, setBackend, setCATEnabled, settings.catBackend]);

  const resetRequestRefs = () => {
    connectRequestIdRef.current = null;
    pendingTuneRequestRef.current = null;
  };

  useEffect(() => {
    if (!bridgeConnected || catConfigured) return;
    resetRequestRefs();
    setConnected(false);
    send("rig.disconnect", {});
  }, [bridgeConnected, catConfigured, send, setConnected]);

  // Mirror the transport state so footers and status chips can read it
  // without opening a second socket.
  useEffect(() => {
    setBridgeConnected(bridgeConnected);
  }, [bridgeConnected, setBridgeConnected]);

  // If the WebSocket drops, reflect it in rigStore.
  useEffect(() => {
    if (!bridgeConnected) {
      setConnected(false);
      resetRequestRefs();
      pendingRotorRequestRef.current = null;
      // Capabilities and rotor state belong to the dropped session.
      setBridgeCapabilities([]);
      setRotorStatus(null);
      clearPendingRotorHeading();
      clearPendingFrequency();
      clearPendingMode();
    }
  }, [
    bridgeConnected,
    clearPendingFrequency,
    clearPendingMode,
    clearPendingRotorHeading,
    setBridgeCapabilities,
    setConnected,
    setRotorStatus,
  ]);

  // Reconnect the persisted backend after transport reconnect or config changes.
  useEffect(() => {
    if (!bridgeConnected || !catConfigured || connectRequestIdRef.current) return;
    connectRequestIdRef.current = sendRequest("rig.connect", connectPayload);
  }, [
    bridgeConnected,
    catConfigured,
    connectPayload,
    sendRequest,
  ]);

  // Safety policy changes do not require restarting the radio backend.
  useEffect(() => {
    if (!bridgeConnected) return;
    send("safety.configure", { pttLockout: settings.catPttLockout });
  }, [bridgeConnected, send, settings.catPttLockout]);

  // Apply incoming rig updates to rigStore.
  useEffect(() => {
    if (!lastMessage) return;

    if (lastMessage.type === "bridge.welcome") {
      setBridgeCapabilities(readCapabilities(lastMessage.payload));
    }
    if (lastMessage.type === "rotor.status" && lastMessage.payload) {
      setRotorStatus(lastMessage.payload as RotorStatusPayload);
    }

    const msg = lastMessage as BridgeMessage<RigUpdatePayload>;

    if ((msg.type === "rig.update" || msg.type === "rig.status") && msg.payload) {
      const { connected, status } = parseRigUpdatePayload(msg.payload);
      if (connected !== undefined) setConnected(connected);
      if (Object.keys(status).length > 0) updateStatus(status);
    }

    if (msg.id && msg.id === connectRequestIdRef.current) {
      if (msg.type === "rig.connect.ack") {
        connectRequestIdRef.current = null;
        const resolved = msg.payload?.backend;
        if (resolved === "hamlib" || resolved === "flrig" || resolved === "icom-serial" || resolved === "icom-network" || resolved === "none") {
          setBackend(resolved);
        }
        if (typeof msg.payload?.connected === "boolean") setConnected(msg.payload.connected);
        send("rig.status", {});
      } else if (msg.type === "error") {
        connectRequestIdRef.current = null;
        setConnected(false);
      }
    }

    const tune = pendingTuneRequestRef.current;
    if (tune && msg.id === tune.id && (msg.type === "rig.set.ack" || msg.type === "error")) {
      pendingTuneRequestRef.current = null;
      // A newer target may have arrived while this request was in flight.
      const current = useRigStore.getState();
      if (current.pendingFrequency === tune.frequency && current.pendingMode === tune.mode) {
        clearPendingFrequency();
        clearPendingMode();
      }
      if (msg.type === "error") console.error("Rig tune command failed", msg.payload);
    }
    if (msg.id && msg.id === pendingRotorRequestRef.current?.id) {
      pendingRotorRequestRef.current = null;
      clearPendingRotorHeading();
      if (msg.type === "error") console.error("Rotor heading command failed", msg.payload);
    }
  }, [
    clearPendingFrequency,
    clearPendingMode,
    clearPendingRotorHeading,
    lastMessage,
    send,
    setBridgeCapabilities,
    setBackend,
    setConnected,
    setRotorStatus,
    updateStatus,
  ]);

  // The bridge's combined command awaits frequency then mode. Allow one
  // request in flight so successive clicks cannot overlap on Hamlib either.
  useEffect(() => {
    if (!settings.bridgeEnabled || !bridgeConnected || !catConfigured || !rigConnected || pendingTuneRequestRef.current) return;
    // The preceding acknowledgement effect may already have cleared these.
    const { pendingFrequency: frequency, pendingMode: mode } = useRigStore.getState();
    if (frequency === null && mode === null) return;
    const wireMode = mode === "CWR" && (backend === "icom-serial" || backend === "icom-network") ? "CW-R" : mode;
    const id = sendRequest("rig.set", {
      ...(frequency === null ? {} : { frequency }),
      ...(wireMode === null ? {} : { mode: wireMode }),
    });
    if (id) pendingTuneRequestRef.current = { id, frequency, mode };
  }, [
    settings.bridgeEnabled,
    bridgeConnected,
    catConfigured,
    rigConnected,
    backend,
    pendingFrequency,
    pendingMode,
    lastMessage,
    sendRequest,
  ]);

  // Dispatch staged rotator commands. Independent of CAT: the rotor is its own
  // bridge capability and turning the beam must not require a radio backend.
  useEffect(() => {
    if (!bridgeConnected || pendingRotorHeading === null) return;
    if (pendingRotorRequestRef.current?.value === pendingRotorHeading) return;

    const id = sendRequest("rotor.setHeading", pendingRotorHeading);
    if (id) {
      pendingRotorRequestRef.current = { id, value: pendingRotorHeading };
    }
  }, [bridgeConnected, pendingRotorHeading, sendRequest]);
}

export default useRigBridgeSync;
