/**
 * useRadioCommands — Extracts the 12 core radio command handlers from SdrConsole.
 *
 * Manages draftState (optimistic local state) and provides handlers for:
 * connect, disconnect, tune, mode, gain, AGC, antenna, filter, NR, NB, PTT, VFO.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { RadioState } from "@/lib/radio/protocol";
import { useSettingsStore } from "@/stores/settingsStore";

// ── Options & return types ───────────────────────────────────────────────────

export interface UseRadioCommandsOptions {
  connectedDeviceId: string | null;
  selectedDeviceId: string | null;
  daemonSendCommand: (
    cmd: string,
    params?: Record<string, unknown>,
  ) => string | null;
  connectedState: RadioState | null;
  freqInput: string;
  freqUnit: "MHz" | "kHz" | "Hz";
  setLastResponseError: (e: string | null) => void;
  setFftEnabled: (v: boolean) => void;
  setAudioEnabled: (v: boolean) => void;
}

export interface RadioCommands {
  draftState: RadioState | null;
  setDraftState: React.Dispatch<React.SetStateAction<RadioState | null>>;
  effectiveState: RadioState | null;
  handleConnectRadio: () => void;
  handleDisconnectRadio: () => void;
  handleTune: () => void;
  handleModeChange: (mode: string) => void;
  handleGainChange: (stage: string, value: number) => void;
  handleAgcToggle: (enabled: boolean) => void;
  handleAgcModeChange: (mode: number) => void;
  handleAntennaChange: (port: string) => void;
  handleFilterChange: (low: number, high: number) => void;
  handleNrChange: (enabled: boolean, level: number) => void;
  handleNbChange: (enabled: boolean, threshold: number) => void;
  handlePttChange: (active: boolean) => void;
  handleVfoChange: (vfo: "A" | "B") => void;
  handleRitToggle: (enabled: boolean) => void;
  handleRitOffset: (offsetHz: number) => void;
  handleXitToggle: (enabled: boolean) => void;
  handleXitOffset: (offsetHz: number) => void;
  handleSplitToggle: (enabled: boolean) => void;
  handleAnfToggle: () => void;
  handleQskToggle: () => void;
  handleVoxToggle: () => void;
  handleIfShift: (hz: number) => void;
  handleCwSpeed: (wpm: number) => void;
  handleLockToggle: () => void;
  handleCommandResponse: (id: string, success: boolean) => boolean;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useRadioCommands(opts: UseRadioCommandsOptions): RadioCommands {
  const {
    connectedDeviceId,
    selectedDeviceId,
    daemonSendCommand,
    connectedState,
    freqInput,
    freqUnit,
    setLastResponseError,
    setFftEnabled,
    setAudioEnabled,
  } = opts;

  const [draftState, setDraftState] = useState<RadioState | null>(null);
  const effectiveState = draftState ?? connectedState;

  // Debounce refs
  const gainDebounceRef = useRef<Record<string, number>>({});
  const filterDebounceRef = useRef<number | null>(null);
  const pendingCommandIdsRef = useRef(new Set<string>());
  // Conservative eviction: drop a pending id if its response never arrives.
  const pendingTimeoutsRef = useRef<Record<string, number>>({});
  const connectedStateRef = useRef(connectedState);
  connectedStateRef.current = connectedState;

  const sendTrackedCommand = useCallback(
    (cmd: string, params?: Record<string, unknown>) => {
      setLastResponseError(null);
      const id = daemonSendCommand(cmd, params);
      if (!id) {
        setDraftState(connectedStateRef.current);
        setLastResponseError("Radio command could not be sent");
        return null;
      }
      pendingCommandIdsRef.current.add(id);
      pendingTimeoutsRef.current[id] = window.setTimeout(() => {
        pendingCommandIdsRef.current.delete(id);
        delete pendingTimeoutsRef.current[id];
        // A command that never gets a response would leave its optimistic
        // draft applied forever. Reconcile to confirmed daemon state — but
        // only when nothing newer is in flight, so an old timeout can't
        // clobber a newer command's optimistic state.
        if (pendingCommandIdsRef.current.size === 0) {
          setDraftState(connectedStateRef.current);
          setLastResponseError("Radio command timed out");
        }
      }, 10_000);
      return id;
    },
    [daemonSendCommand, setLastResponseError],
  );

  const handleCommandResponse = useCallback((id: string, success: boolean) => {
    if (!pendingCommandIdsRef.current.delete(id)) return false;
    const timeout = pendingTimeoutsRef.current[id];
    if (timeout !== undefined) {
      window.clearTimeout(timeout);
      delete pendingTimeoutsRef.current[id];
    }
    if (!success) setDraftState(connectedStateRef.current);
    return true;
  }, []);

  const clearDelayedCommands = useCallback(() => {
    for (const timeout of Object.values(gainDebounceRef.current)) {
      window.clearTimeout(timeout);
    }
    gainDebounceRef.current = {};
    if (filterDebounceRef.current !== null) {
      window.clearTimeout(filterDebounceRef.current);
      filterDebounceRef.current = null;
    }
  }, []);

  useEffect(() => {
    const pendingCommandIds = pendingCommandIdsRef.current;
    const pendingTimeouts = pendingTimeoutsRef.current;
    return () => {
      clearDelayedCommands();
      for (const id of Object.keys(pendingTimeouts)) {
        window.clearTimeout(pendingTimeouts[id]);
        delete pendingTimeouts[id];
      }
      pendingCommandIds.clear();
    };
  }, [clearDelayedCommands, connectedDeviceId]);

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleConnectRadio = useCallback(() => {
    if (!selectedDeviceId) return;
    sendTrackedCommand("radio:connect", { device_id: selectedDeviceId });
  }, [selectedDeviceId, sendTrackedCommand]);

  const handleDisconnectRadio = useCallback(() => {
    if (!connectedDeviceId) return;
    clearDelayedCommands();
    sendTrackedCommand("radio:disconnect", { device_id: connectedDeviceId });
    setFftEnabled(false);
    setAudioEnabled(false);
    setDraftState(null);
  }, [
    clearDelayedCommands,
    connectedDeviceId,
    sendTrackedCommand,
    setAudioEnabled,
    setFftEnabled,
  ]);

  const handleTune = useCallback(() => {
    if (!connectedDeviceId) return;
    if (effectiveState?.lock) {
      setLastResponseError("Frequency is locked");
      return;
    }
    const value = Number(freqInput);
    if (!Number.isFinite(value) || value <= 0) {
      setLastResponseError("Invalid frequency");
      return;
    }
    const hz =
      freqUnit === "MHz"
        ? Math.round(value * 1_000_000)
        : freqUnit === "kHz"
          ? Math.round(value * 1_000)
          : Math.round(value);
    setDraftState((s) => (s ? { ...s, freq: hz } : s));
    sendTrackedCommand("radio:tune", { device_id: connectedDeviceId, freq: hz });
  }, [
    connectedDeviceId,
    effectiveState?.lock,
    freqInput,
    freqUnit,
    setLastResponseError,
    sendTrackedCommand,
  ]);

  const handleModeChange = useCallback(
    (mode: string) => {
      if (!connectedDeviceId) return;
      setDraftState((s) => (s ? { ...s, mode } : s));
      sendTrackedCommand("radio:mode", { device_id: connectedDeviceId, mode });
    },
    [connectedDeviceId, sendTrackedCommand],
  );

  const handleGainChange = useCallback(
    (stage: string, value: number) => {
      setDraftState((s) => {
        if (!s) return s;
        return { ...s, gains: { ...s.gains, [stage]: value } };
      });
      if (!connectedDeviceId) return;

      const existing = gainDebounceRef.current[stage];
      if (existing) window.clearTimeout(existing);
      gainDebounceRef.current[stage] = window.setTimeout(() => {
        if (stage.trim().toUpperCase() === "SQL") {
          sendTrackedCommand("radio:squelch", {
            device_id: connectedDeviceId,
            level: value,
          });
        } else {
          sendTrackedCommand("radio:gain", {
            device_id: connectedDeviceId,
            stage,
            value,
          });
        }
      }, 50);
    },
    [connectedDeviceId, sendTrackedCommand],
  );

  const handleAgcToggle = useCallback(
    (enabled: boolean) => {
      const mode = enabled ? 3 : 0; // Default: enabled → SLOW (3), disabled → OFF (0)
      setDraftState((s) => (s ? { ...s, agc: enabled, agcMode: mode } : s));
      if (!connectedDeviceId) return;
      sendTrackedCommand("radio:agc", {
        device_id: connectedDeviceId,
        enabled,
        mode,
      });
    },
    [connectedDeviceId, sendTrackedCommand],
  );

  const handleAgcModeChange = useCallback(
    (mode: number) => {
      const enabled = mode > 0;
      setDraftState((s) => (s ? { ...s, agc: enabled, agcMode: mode } : s));
      if (!connectedDeviceId) return;
      sendTrackedCommand("radio:agc", {
        device_id: connectedDeviceId,
        enabled,
        mode,
      });
    },
    [connectedDeviceId, sendTrackedCommand],
  );

  const handleAntennaChange = useCallback(
    (port: string) => {
      setDraftState((s) => (s ? { ...s, antenna: port } : s));
      if (!connectedDeviceId) return;
      sendTrackedCommand("radio:antenna", {
        device_id: connectedDeviceId,
        port,
      });
    },
    [connectedDeviceId, sendTrackedCommand],
  );

  const handleFilterChange = useCallback(
    (low: number, high: number) => {
      const lo = Math.min(low, high);
      const hi = Math.max(low, high);
      setDraftState((s) =>
        s ? { ...s, filter: { low: Math.round(lo), high: Math.round(hi) } } : s,
      );
      if (!connectedDeviceId) return;
      if (filterDebounceRef.current)
        window.clearTimeout(filterDebounceRef.current);
      filterDebounceRef.current = window.setTimeout(() => {
        sendTrackedCommand("radio:filter", {
          device_id: connectedDeviceId,
          low: Math.round(lo),
          high: Math.round(hi),
        });
      }, 75);
    },
    [connectedDeviceId, sendTrackedCommand],
  );

  const handleNrChange = useCallback(
    (enabled: boolean, level: number) => {
      setDraftState((s) =>
        s ? { ...s, nr: { enabled, level: Math.round(level) } } : s,
      );
      if (!connectedDeviceId) return;
      sendTrackedCommand("radio:nr", {
        device_id: connectedDeviceId,
        enabled,
        level: Math.round(level),
      });
    },
    [connectedDeviceId, sendTrackedCommand],
  );

  const handleNbChange = useCallback(
    (enabled: boolean, threshold: number) => {
      setDraftState((s) =>
        s ? { ...s, nb: { enabled, threshold: Math.round(threshold) } } : s,
      );
      if (!connectedDeviceId) return;
      sendTrackedCommand("radio:nb", {
        device_id: connectedDeviceId,
        enabled,
        threshold: Math.round(threshold),
      });
    },
    [connectedDeviceId, sendTrackedCommand],
  );

  const handlePttChange = useCallback(
    (active: boolean) => {
      if (active && useSettingsStore.getState().catPttLockout) {
        setLastResponseError("PTT safety lockout is enabled");
        return;
      }
      setDraftState((s) => (s ? { ...s, ptt: active } : s));
      if (!connectedDeviceId) return;
      sendTrackedCommand("radio:ptt", {
        device_id: connectedDeviceId,
        active,
      });
    },
    [connectedDeviceId, sendTrackedCommand, setLastResponseError],
  );

  const handleVfoChange = useCallback(
    (vfo: "A" | "B") => {
      if (!connectedDeviceId) return;
      setDraftState((s) => (s ? { ...s, vfo } : s));
      sendTrackedCommand("radio:vfo", { device_id: connectedDeviceId, vfo });
    },
    [connectedDeviceId, sendTrackedCommand],
  );

  const handleRitToggle = useCallback(
    (enabled: boolean) => {
      setDraftState((s) =>
        s ? { ...s, rit: { enabled, offsetHz: s.rit?.offsetHz ?? 0 } } : s,
      );
      if (!connectedDeviceId) return;
      sendTrackedCommand("radio:rit", {
        device_id: connectedDeviceId,
        enabled,
      });
    },
    [connectedDeviceId, sendTrackedCommand],
  );

  const handleRitOffset = useCallback(
    (offsetHz: number) => {
      setDraftState((s) =>
        s ? { ...s, rit: { enabled: true, offsetHz } } : s,
      );
      if (!connectedDeviceId) return;
      sendTrackedCommand("radio:rit", {
        device_id: connectedDeviceId,
        enabled: true,
        offsetHz,
      });
    },
    [connectedDeviceId, sendTrackedCommand],
  );

  const handleXitToggle = useCallback(
    (enabled: boolean) => {
      setDraftState((s) =>
        s ? { ...s, xit: { enabled, offsetHz: s.xit?.offsetHz ?? 0 } } : s,
      );
      if (!connectedDeviceId) return;
      sendTrackedCommand("radio:xit", {
        device_id: connectedDeviceId,
        enabled,
      });
    },
    [connectedDeviceId, sendTrackedCommand],
  );

  const handleXitOffset = useCallback(
    (offsetHz: number) => {
      setDraftState((s) =>
        s ? { ...s, xit: { enabled: true, offsetHz } } : s,
      );
      if (!connectedDeviceId) return;
      sendTrackedCommand("radio:xit", {
        device_id: connectedDeviceId,
        enabled: true,
        offsetHz,
      });
    },
    [connectedDeviceId, sendTrackedCommand],
  );

  const handleSplitToggle = useCallback(
    (enabled: boolean) => {
      setDraftState((s) => (s ? { ...s, split: enabled } : s));
      if (!connectedDeviceId) return;
      sendTrackedCommand("radio:split", {
        device_id: connectedDeviceId,
        enabled,
      });
    },
    [connectedDeviceId, sendTrackedCommand],
  );

  const handleAnfToggle = useCallback(() => {
    const next = !(effectiveState?.anf ?? false);
    setDraftState((s) => (s ? { ...s, anf: next } : s));
    if (!connectedDeviceId) return;
    sendTrackedCommand("radio:anf", {
      device_id: connectedDeviceId,
      enabled: next,
    });
  }, [connectedDeviceId, effectiveState?.anf, sendTrackedCommand]);

  const handleQskToggle = useCallback(() => {
    const next = !(effectiveState?.qsk ?? false);
    setDraftState((s) => (s ? { ...s, qsk: next } : s));
    if (!connectedDeviceId) return;
    sendTrackedCommand("radio:qsk", {
      device_id: connectedDeviceId,
      enabled: next,
    });
  }, [connectedDeviceId, effectiveState?.qsk, sendTrackedCommand]);

  const handleVoxToggle = useCallback(() => {
    const next = !(effectiveState?.vox ?? false);
    setDraftState((s) => (s ? { ...s, vox: next } : s));
    if (!connectedDeviceId) return;
    sendTrackedCommand("radio:vox", {
      device_id: connectedDeviceId,
      enabled: next,
    });
  }, [connectedDeviceId, effectiveState?.vox, sendTrackedCommand]);

  const handleIfShift = useCallback(
    (hz: number) => {
      setDraftState((s) => (s ? { ...s, ifShift: hz } : s));
      if (!connectedDeviceId) return;
      sendTrackedCommand("radio:ifshift", {
        device_id: connectedDeviceId,
        hz,
      });
    },
    [connectedDeviceId, sendTrackedCommand],
  );

  const handleCwSpeed = useCallback(
    (wpm: number) => {
      setDraftState((s) => (s ? { ...s, cwSpeed: wpm } : s));
      if (!connectedDeviceId) return;
      sendTrackedCommand("radio:cwspeed", {
        device_id: connectedDeviceId,
        wpm,
      });
    },
    [connectedDeviceId, sendTrackedCommand],
  );

  const handleLockToggle = useCallback(() => {
    setDraftState((s) => (s ? { ...s, lock: !(s.lock ?? false) } : s));
  }, []);

  return {
    draftState,
    setDraftState,
    effectiveState,
    handleConnectRadio,
    handleDisconnectRadio,
    handleTune,
    handleModeChange,
    handleGainChange,
    handleAgcToggle,
    handleAgcModeChange,
    handleAntennaChange,
    handleFilterChange,
    handleNrChange,
    handleNbChange,
    handlePttChange,
    handleVfoChange,
    handleRitToggle,
    handleRitOffset,
    handleXitToggle,
    handleXitOffset,
    handleSplitToggle,
    handleAnfToggle,
    handleQskToggle,
    handleVoxToggle,
    handleIfShift,
    handleCwSpeed,
    handleLockToggle,
    handleCommandResponse,
  };
}
