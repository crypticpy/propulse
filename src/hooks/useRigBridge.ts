/**
 * useRigBridge - Rig control hook for ProPulse Bridge
 *
 * Higher-level hook built on useBridge that provides:
 * - Rig status tracking (frequency, mode, band)
 * - Commands for setFrequency, setMode, setPTT
 * - Automatic subscription to rig.update messages
 * - Graceful handling when bridge is offline
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { useBridge } from "./useBridge";
import type {
  RigStatus,
  RigMode,
  RigBridgeState,
  SetFrequencyRequest,
  SetModeRequest,
  SetPTTRequest,
  BridgeMessage,
  RigUpdatePayload,
  BridgeConnectionOptions,
} from "@/types/bridge";
import { frequencyToBand } from "@/types/bridge";

/** Options for useRigBridge */
export interface UseRigBridgeOptions extends BridgeConnectionOptions {
  /** Initial frequency in Hz (used before first rig update) */
  initialFrequency?: number;
  /** Initial mode (used before first rig update) */
  initialMode?: RigMode | string;
}

/**
 * Hook for rig control via ProPulse Bridge
 *
 * @param options - Connection and initial state options
 * @returns RigBridgeState with current rig status and control methods
 *
 * @example
 * ```tsx
 * const { frequency, mode, band, connected, setFrequency, setMode } = useRigBridge();
 *
 * // Change frequency
 * setFrequency(14035000);
 *
 * // Change mode
 * setMode('CW');
 *
 * // Display current state
 * console.log(`${band} ${mode} @ ${frequency} Hz`);
 * ```
 */
export function useRigBridge(
  options: UseRigBridgeOptions = {},
): RigBridgeState {
  const {
    initialFrequency = 14035000,
    initialMode = "CW",
    ...bridgeOptions
  } = options;

  // Connect to bridge
  const bridge = useBridge(bridgeOptions);

  // Rig state
  const [status, setStatus] = useState<RigStatus | null>(null);
  const [frequency, setFrequencyState] = useState(initialFrequency);
  const [mode, setModeState] = useState<RigMode | string>(initialMode);
  const [band, setBand] = useState(frequencyToBand(initialFrequency));
  const [isCATControlled, setIsCATControlled] = useState(false);

  // Track last update time for stale detection
  const lastUpdateRef = useRef<number>(0);

  /**
   * Handle incoming rig update messages
   */
  useEffect(() => {
    if (!bridge.lastMessage) return;

    const message = bridge.lastMessage as BridgeMessage<RigUpdatePayload>;

    if (message.type === "rig.update" && message.payload) {
      const update = message.payload;

      setStatus(update);
      setFrequencyState(update.frequency);
      setModeState(update.mode);
      setBand(update.band || frequencyToBand(update.frequency));
      setIsCATControlled(update.catControlled ?? true);
      lastUpdateRef.current = Date.now();
    }
  }, [bridge.lastMessage]);

  /**
   * Send frequency change command to rig
   */
  const setFrequency = useCallback(
    (frequencyHz: number) => {
      if (!bridge.connected) return;

      const request: SetFrequencyRequest = {
        frequency: frequencyHz,
      };

      bridge.send("rig.setFrequency", request);

      // Optimistically update local state
      setFrequencyState(frequencyHz);
      setBand(frequencyToBand(frequencyHz));
    },
    [bridge],
  );

  /**
   * Send mode change command to rig
   */
  const setMode = useCallback(
    (newMode: RigMode | string) => {
      if (!bridge.connected) return;

      const request: SetModeRequest = {
        mode: newMode,
      };

      bridge.send("rig.setMode", request);

      // Optimistically update local state
      setModeState(newMode);
    },
    [bridge],
  );

  /**
   * Send PTT command to rig
   */
  const setPTT = useCallback(
    (ptt: boolean) => {
      if (!bridge.connected) return;

      const request: SetPTTRequest = {
        ptt,
      };

      bridge.send("rig.setPTT", request);
    },
    [bridge],
  );

  // Request initial rig status when connected
  useEffect(() => {
    if (bridge.connected) {
      bridge.send("rig.status", {});
    }
  }, [bridge.connected, bridge]);

  return {
    frequency,
    mode,
    band,
    status,
    connected: bridge.connected,
    connecting: bridge.connecting,
    error: bridge.error,
    setFrequency,
    setMode,
    setPTT,
    isCATControlled,
  };
}

export default useRigBridge;
