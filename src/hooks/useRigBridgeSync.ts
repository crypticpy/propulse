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

import { useEffect } from "react";
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
  const bridgeEnabled = useSettingsStore((s) => s.bridgeEnabled);
  const { connected: bridgeConnected, lastMessage, send } = useBridge({
    enabled: bridgeEnabled,
  });

  const catEnabled = useRigStore((s) => s.catEnabled);
  const pendingFrequency = useRigStore((s) => s.pendingFrequency);
  const pendingMode = useRigStore((s) => s.pendingMode);
  const clearPending = useRigStore((s) => s.clearPending);
  const setConnected = useRigStore((s) => s.setConnected);
  const updateStatus = useRigStore((s) => s.updateStatus);

  // If the WebSocket drops, reflect it in rigStore.
  useEffect(() => {
    if (!bridgeConnected) {
      setConnected(false);
    }
  }, [bridgeConnected, setConnected]);

  // Request initial rig status after connecting (when CAT enabled).
  useEffect(() => {
    if (bridgeConnected && catEnabled) {
      send("rig.status", {});
    }
  }, [bridgeConnected, catEnabled, send]);

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
  }, [lastMessage, setConnected, updateStatus]);

  // Dispatch staged tuning commands.
  useEffect(() => {
    if (!bridgeConnected || !catEnabled) return;
    if (pendingFrequency === null && pendingMode === null) return;

    let didSend = false;
    if (pendingFrequency !== null) {
      didSend = send("rig.setFrequency", { frequency: pendingFrequency }) || didSend;
    }
    if (pendingMode !== null) {
      didSend = send("rig.setMode", { mode: pendingMode }) || didSend;
    }
    if (didSend) clearPending();
  }, [
    bridgeConnected,
    catEnabled,
    pendingFrequency,
    pendingMode,
    clearPending,
    send,
  ]);
}

export default useRigBridgeSync;
