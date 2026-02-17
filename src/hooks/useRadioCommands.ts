/**
 * useRadioCommands — Extracts the 12 core radio command handlers from SdrConsole.
 *
 * Manages draftState (optimistic local state) and provides handlers for:
 * connect, disconnect, tune, mode, gain, AGC, antenna, filter, NR, NB, PTT, VFO.
 */

import { useCallback, useRef, useState } from "react";
import type { RadioState } from "@/lib/radio/protocol";

// ── Options & return types ───────────────────────────────────────────────────

export interface UseRadioCommandsOptions {
  connectedDeviceId: string | null;
  selectedDeviceId: string | null;
  daemonSendCommand: (cmd: string, params?: Record<string, unknown>) => void;
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

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleConnectRadio = useCallback(() => {
    if (!selectedDeviceId) return;
    daemonSendCommand("radio:connect", { device_id: selectedDeviceId });
  }, [daemonSendCommand, selectedDeviceId]);

  const handleDisconnectRadio = useCallback(() => {
    if (!connectedDeviceId) return;
    daemonSendCommand("radio:disconnect", { device_id: connectedDeviceId });
    setFftEnabled(false);
    setAudioEnabled(false);
    setDraftState(null);
  }, [connectedDeviceId, daemonSendCommand, setAudioEnabled, setFftEnabled]);

  const handleTune = useCallback(() => {
    if (!connectedDeviceId) return;
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
    daemonSendCommand("radio:tune", { device_id: connectedDeviceId, freq: hz });
    setDraftState((s) => (s ? { ...s, freq: hz } : s));
  }, [
    connectedDeviceId,
    daemonSendCommand,
    freqInput,
    freqUnit,
    setLastResponseError,
  ]);

  const handleModeChange = useCallback(
    (mode: string) => {
      if (!connectedDeviceId) return;
      daemonSendCommand("radio:mode", { device_id: connectedDeviceId, mode });
      setDraftState((s) => (s ? { ...s, mode } : s));
    },
    [connectedDeviceId, daemonSendCommand],
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
        daemonSendCommand("radio:gain", {
          device_id: connectedDeviceId,
          stage,
          value,
        });
      }, 50);
    },
    [connectedDeviceId, daemonSendCommand],
  );

  const handleAgcToggle = useCallback(
    (enabled: boolean) => {
      const mode = enabled ? 3 : 0; // Default: enabled → SLOW (3), disabled → OFF (0)
      setDraftState((s) => (s ? { ...s, agc: enabled, agcMode: mode } : s));
      if (!connectedDeviceId) return;
      daemonSendCommand("radio:agc", {
        device_id: connectedDeviceId,
        mode,
      });
    },
    [connectedDeviceId, daemonSendCommand],
  );

  const handleAgcModeChange = useCallback(
    (mode: number) => {
      const enabled = mode > 0;
      setDraftState((s) => (s ? { ...s, agc: enabled, agcMode: mode } : s));
      if (!connectedDeviceId) return;
      daemonSendCommand("radio:agc", {
        device_id: connectedDeviceId,
        mode,
      });
    },
    [connectedDeviceId, daemonSendCommand],
  );

  const handleAntennaChange = useCallback(
    (port: string) => {
      setDraftState((s) => (s ? { ...s, antenna: port } : s));
      if (!connectedDeviceId) return;
      daemonSendCommand("radio:antenna", {
        device_id: connectedDeviceId,
        port,
      });
    },
    [connectedDeviceId, daemonSendCommand],
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
        daemonSendCommand("radio:filter", {
          device_id: connectedDeviceId,
          low: Math.round(lo),
          high: Math.round(hi),
        });
      }, 75);
    },
    [connectedDeviceId, daemonSendCommand],
  );

  const handleNrChange = useCallback(
    (enabled: boolean, level: number) => {
      setDraftState((s) =>
        s ? { ...s, nr: { enabled, level: Math.round(level) } } : s,
      );
      if (!connectedDeviceId) return;
      daemonSendCommand("radio:nr", {
        device_id: connectedDeviceId,
        enabled,
        level: Math.round(level),
      });
    },
    [connectedDeviceId, daemonSendCommand],
  );

  const handleNbChange = useCallback(
    (enabled: boolean, threshold: number) => {
      setDraftState((s) =>
        s ? { ...s, nb: { enabled, threshold: Math.round(threshold) } } : s,
      );
      if (!connectedDeviceId) return;
      daemonSendCommand("radio:nb", {
        device_id: connectedDeviceId,
        enabled,
        threshold: Math.round(threshold),
      });
    },
    [connectedDeviceId, daemonSendCommand],
  );

  const handlePttChange = useCallback(
    (active: boolean) => {
      setDraftState((s) => (s ? { ...s, ptt: active } : s));
      if (!connectedDeviceId) return;
      daemonSendCommand("radio:ptt", {
        device_id: connectedDeviceId,
        active,
      });
    },
    [connectedDeviceId, daemonSendCommand],
  );

  const handleVfoChange = useCallback(
    (vfo: "A" | "B") => {
      if (!connectedDeviceId) return;
      daemonSendCommand("radio:vfo", { device_id: connectedDeviceId, vfo });
      setDraftState((s) => (s ? { ...s, vfo } : s));
    },
    [connectedDeviceId, daemonSendCommand],
  );

  const handleRitToggle = useCallback(
    (enabled: boolean) => {
      setDraftState((s) =>
        s ? { ...s, rit: { enabled, offsetHz: s.rit?.offsetHz ?? 0 } } : s,
      );
      if (!connectedDeviceId) return;
      daemonSendCommand("radio:rit", {
        device_id: connectedDeviceId,
        enabled,
      });
    },
    [connectedDeviceId, daemonSendCommand],
  );

  const handleRitOffset = useCallback(
    (offsetHz: number) => {
      setDraftState((s) =>
        s ? { ...s, rit: { enabled: true, offsetHz } } : s,
      );
      if (!connectedDeviceId) return;
      daemonSendCommand("radio:rit", {
        device_id: connectedDeviceId,
        enabled: true,
        offsetHz,
      });
    },
    [connectedDeviceId, daemonSendCommand],
  );

  const handleXitToggle = useCallback(
    (enabled: boolean) => {
      setDraftState((s) =>
        s ? { ...s, xit: { enabled, offsetHz: s.xit?.offsetHz ?? 0 } } : s,
      );
      if (!connectedDeviceId) return;
      daemonSendCommand("radio:xit", {
        device_id: connectedDeviceId,
        enabled,
      });
    },
    [connectedDeviceId, daemonSendCommand],
  );

  const handleXitOffset = useCallback(
    (offsetHz: number) => {
      setDraftState((s) =>
        s ? { ...s, xit: { enabled: true, offsetHz } } : s,
      );
      if (!connectedDeviceId) return;
      daemonSendCommand("radio:xit", {
        device_id: connectedDeviceId,
        enabled: true,
        offsetHz,
      });
    },
    [connectedDeviceId, daemonSendCommand],
  );

  const handleSplitToggle = useCallback(
    (enabled: boolean) => {
      setDraftState((s) => (s ? { ...s, split: enabled } : s));
      if (!connectedDeviceId) return;
      daemonSendCommand("radio:split", {
        device_id: connectedDeviceId,
        enabled,
      });
    },
    [connectedDeviceId, daemonSendCommand],
  );

  const handleAnfToggle = useCallback(() => {
    const next = !(effectiveState?.anf ?? false);
    setDraftState((s) => (s ? { ...s, anf: next } : s));
    if (!connectedDeviceId) return;
    daemonSendCommand("radio:anf", {
      device_id: connectedDeviceId,
      enabled: next,
    });
  }, [connectedDeviceId, daemonSendCommand, effectiveState?.anf]);

  const handleQskToggle = useCallback(() => {
    const next = !(effectiveState?.qsk ?? false);
    setDraftState((s) => (s ? { ...s, qsk: next } : s));
    if (!connectedDeviceId) return;
    daemonSendCommand("radio:qsk", {
      device_id: connectedDeviceId,
      enabled: next,
    });
  }, [connectedDeviceId, daemonSendCommand, effectiveState?.qsk]);

  const handleVoxToggle = useCallback(() => {
    const next = !(effectiveState?.vox ?? false);
    setDraftState((s) => (s ? { ...s, vox: next } : s));
    if (!connectedDeviceId) return;
    daemonSendCommand("radio:vox", {
      device_id: connectedDeviceId,
      enabled: next,
    });
  }, [connectedDeviceId, daemonSendCommand, effectiveState?.vox]);

  const handleIfShift = useCallback(
    (hz: number) => {
      setDraftState((s) => (s ? { ...s, ifShift: hz } : s));
      if (!connectedDeviceId) return;
      daemonSendCommand("radio:ifshift", {
        device_id: connectedDeviceId,
        hz,
      });
    },
    [connectedDeviceId, daemonSendCommand],
  );

  const handleCwSpeed = useCallback(
    (wpm: number) => {
      setDraftState((s) => (s ? { ...s, cwSpeed: wpm } : s));
      if (!connectedDeviceId) return;
      daemonSendCommand("radio:cwspeed", {
        device_id: connectedDeviceId,
        wpm,
      });
    },
    [connectedDeviceId, daemonSendCommand],
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
  };
}
