/**
 * useRigBridgeSync
 *
 * Keeps the transient rigStore in sync with the bridge/daemon connection:
 * - Listens for `rig.update` messages and updates rigStore fields.
 * - Dispatches staged `pendingFrequency`/`pendingMode` commands to the bridge.
 *
 * This allows "click-to-tune" workflows (spots, satellites, band advisor) to
 * work without every component needing direct bridge access.
 */

import { useEffect, useMemo, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { useBridge } from "@/hooks/useBridge";
import { useSettingsStore } from "@/stores/settingsStore";
import { useRigStore } from "@/stores/rigStore";
import type { BridgeMessage } from "@/types/bridge";

type RigUpdatePayload = {
  connected?: boolean;
  frequency?: number;
  mode?: string;
  band?: string;
};

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
  });

  const catEnabled = useRigStore((s) => s.catEnabled);
  const pendingFrequency = useRigStore((s) => s.pendingFrequency);
  const pendingMode = useRigStore((s) => s.pendingMode);
  const clearPendingFrequency = useRigStore((s) => s.clearPendingFrequency);
  const clearPendingMode = useRigStore((s) => s.clearPendingMode);
  const setConnected = useRigStore((s) => s.setConnected);
  const setCATEnabled = useRigStore((s) => s.setCATEnabled);
  const setBackend = useRigStore((s) => s.setBackend);
  const updateStatus = useRigStore((s) => s.updateStatus);
  const connectRequestIdRef = useRef<string | null>(null);
  const pendingFrequencyRequestRef = useRef<{
    id: string;
    value: number;
  } | null>(null);
  const pendingModeRequestRef = useRef<{
    id: string;
    value: string;
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
    const enabled =
      settings.bridgeEnabled && settings.catBackend !== "disabled";
    setCATEnabled(enabled);
    setBackend(
      settings.catBackend === "disabled" || settings.catBackend === "auto"
        ? "none"
        : settings.catBackend,
    );
  }, [setBackend, setCATEnabled, settings.bridgeEnabled, settings.catBackend]);

  // If the WebSocket drops, reflect it in rigStore.
  useEffect(() => {
    if (!bridgeConnected) {
      setConnected(false);
      connectRequestIdRef.current = null;
      pendingFrequencyRequestRef.current = null;
      pendingModeRequestRef.current = null;
    }
  }, [bridgeConnected, setConnected]);

  // Reconnect the persisted backend after transport reconnect or config changes.
  useEffect(() => {
    if (!bridgeConnected || !catEnabled || connectRequestIdRef.current) return;
    connectRequestIdRef.current = sendRequest("rig.connect", connectPayload);
  }, [
    bridgeConnected,
    catEnabled,
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
    const msg = lastMessage as BridgeMessage<RigUpdatePayload>;

    if ((msg.type === "rig.update" || msg.type === "rig.status") && msg.payload) {
      const { connected, frequency, mode, band } = msg.payload;
      if (typeof connected === "boolean") setConnected(connected);
      if (typeof frequency === "number") updateStatus({ frequency });
      if (typeof mode === "string") updateStatus({ mode });
      if (typeof band === "string") updateStatus({ band });
    }

    if (msg.id && msg.id === connectRequestIdRef.current) {
      if (msg.type === "rig.connect.ack") {
        connectRequestIdRef.current = null;
        send("rig.status", {});
      } else if (msg.type === "error") {
        connectRequestIdRef.current = null;
        setConnected(false);
      }
    }

    if (msg.id && msg.id === pendingFrequencyRequestRef.current?.id) {
      if (msg.type === "rig.setFrequency.ack") {
        pendingFrequencyRequestRef.current = null;
        clearPendingFrequency();
      }
    }
    if (msg.id && msg.id === pendingModeRequestRef.current?.id) {
      if (msg.type === "rig.setMode.ack") {
        pendingModeRequestRef.current = null;
        clearPendingMode();
      }
    }
  }, [
    clearPendingFrequency,
    clearPendingMode,
    lastMessage,
    send,
    setConnected,
    updateStatus,
  ]);

  // Dispatch staged tuning commands.
  useEffect(() => {
    if (!bridgeConnected || !catEnabled) return;
    if (pendingFrequency === null && pendingMode === null) return;

    if (
      pendingFrequency !== null &&
      pendingFrequencyRequestRef.current?.value !== pendingFrequency
    ) {
      const id = sendRequest("rig.setFrequency", {
        frequency: pendingFrequency,
      });
      if (id) pendingFrequencyRequestRef.current = { id, value: pendingFrequency };
    }
    if (
      pendingMode !== null &&
      pendingModeRequestRef.current?.value !== pendingMode
    ) {
      const id = sendRequest("rig.setMode", { mode: pendingMode });
      if (id) pendingModeRequestRef.current = { id, value: pendingMode };
    }
  }, [
    bridgeConnected,
    catEnabled,
    pendingFrequency,
    pendingMode,
    sendRequest,
  ]);
}

export default useRigBridgeSync;
