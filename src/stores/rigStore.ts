/**
 * Zustand store for rig control state management
 * Manages transient hardware state from CAT control (hamlib/flrig)
 * via the bridge WebSocket. This is not persisted.
 */

import { create } from "zustand";
import type { RigMode, RotorStatusPayload } from "@/types/bridge";
import { frequencyToBand } from "@/types/bridge";

// ─── Constants ──────────────────────────────────────────────────────────────

/** S0 in dB relative to S9 */
const S0_DB = -54;
/** dB per S-unit */
const DB_PER_S_UNIT = 6;

// ─── Store State ────────────────────────────────────────────────────────────

export interface RigState {
  // Radio status
  /** Current VFO-A frequency in Hz */
  frequency: number;
  /** Current operating mode */
  mode: RigMode | string;
  /** Current band designation (derived from frequency) */
  band: string;
  /** Active VFO */
  vfo: "A" | "B" | string;
  /** Split operation enabled */
  split: boolean;
  /** TX frequency in Hz (relevant when split is active) */
  txFrequency: number;
  /** PTT (push-to-talk) state */
  ptt: boolean;
  /** S-meter reading in dB relative to S9 (negative = below S9) */
  sMeter: number;
  /** RF power output in watts */
  power: number;

  // Connection state
  /** Whether the rig is connected via CAT */
  connected: boolean;
  /** Whether CAT control is enabled in settings */
  catEnabled: boolean;
  /** CAT backend in use */
  backend: "hamlib" | "flrig" | "icom-serial" | "icom-network" | "none";
  /** Rig model identifier string */
  rigModel: string;
  /** Timestamp of last status update */
  lastUpdate: number;

  // Bridge session
  /** Whether the bridge WebSocket transport is currently open */
  bridgeConnected: boolean;
  /** Capabilities advertised by the bridge welcome message (e.g. "rotor") */
  bridgeCapabilities: string[];
  /** Latest rotor status pushed by the bridge, or null when unknown */
  rotorStatus: RotorStatusPayload | null;
  /** Record the bridge transport state */
  setBridgeConnected: (connected: boolean) => void;
  /** Replace the advertised bridge capabilities */
  setBridgeCapabilities: (capabilities: string[]) => void;
  /** Store the latest rotor status */
  setRotorStatus: (status: RotorStatusPayload | null) => void;

  // Actions
  /** Update rig status fields (partial update) */
  updateStatus: (status: Partial<RigState>) => void;
  /** Set connection state */
  setConnected: (connected: boolean) => void;
  /** Enable or disable CAT control */
  setCATEnabled: (enabled: boolean) => void;
  /** Set the CAT backend */
  setBackend: (
    backend: "hamlib" | "flrig" | "icom-serial" | "icom-network" | "none",
  ) => void;

  /**
   * Directly set VFO-A frequency (e.g., from band map click-to-tune).
   * Unlike setPendingFrequency (which stages a command for bridge dispatch),
   * this immediately updates the local frequency state and derived band.
   */
  setFrequency: (hz: number) => void;

  // Pending commands (staged for bridge WebSocket dispatch)
  /** Frequency pending to be sent to rig, or null */
  pendingFrequency: number | null;
  /** Mode pending to be sent to rig, or null */
  pendingMode: string | null;
  /** Rotator heading pending to be sent to the bridge, or null */
  pendingRotorHeading: { azimuth: number; elevation?: number } | null;
  /** Stage a frequency change command */
  setPendingFrequency: (hz: number) => void;
  /** Stage a mode change command */
  setPendingMode: (mode: string) => void;
  /** Stage a rotator heading command */
  setPendingRotorHeading: (heading: {
    azimuth: number;
    elevation?: number;
  }) => void;
  clearPendingFrequency: () => void;
  clearPendingMode: () => void;
  clearPendingRotorHeading: () => void;

  // Derived selectors
  /** Get the current band derived from frequency */
  getCurrentBand: () => string;
  /** Get a human-readable S-meter string (e.g., "S7", "S9+10dB") */
  getSMeterText: () => string;
}

// ─── Store ──────────────────────────────────────────────────────────────────

export const useRigStore = create<RigState>()((set, get) => ({
  // Default state — 20m USB, disconnected
  frequency: 14_074_000,
  mode: "USB",
  band: "20m",
  vfo: "A",
  split: false,
  txFrequency: 14_074_000,
  ptt: false,
  sMeter: S0_DB,
  power: 0,
  connected: false,
  catEnabled: false,
  backend: "none",
  rigModel: "",
  lastUpdate: 0,

  // Bridge session
  bridgeConnected: false,
  bridgeCapabilities: [],
  rotorStatus: null,

  // Pending commands
  pendingFrequency: null,
  pendingMode: null,
  pendingRotorHeading: null,

  setBridgeConnected: (connected) => set({ bridgeConnected: connected }),

  setBridgeCapabilities: (capabilities) => set({ bridgeCapabilities: capabilities }),

  setRotorStatus: (status) => set({ rotorStatus: status }),

  // Actions
  updateStatus: (status) =>
    set((state) => {
      const updated = { ...state, ...status, lastUpdate: Date.now() };
      // Derive band from frequency if frequency was updated
      if (status.frequency !== undefined) {
        updated.band = frequencyToBand(status.frequency);
      }
      return updated;
    }),

  setConnected: (connected) =>
    set({
      connected,
      lastUpdate: Date.now(),
      // Reset pending commands when disconnecting
      ...(connected ? {} : { pendingFrequency: null, pendingMode: null }),
    }),

  setCATEnabled: (enabled) =>
    set({
      catEnabled: enabled,
      // If disabling CAT, also mark as disconnected
      ...(enabled ? {} : { connected: false }),
    }),

  setBackend: (backend) =>
    set({
      backend,
      // Reset connection when switching backends
      connected: false,
      pendingFrequency: null,
      pendingMode: null,
    }),

  setFrequency: (hz) => {
    get().updateStatus({ frequency: hz });
  },

  setPendingFrequency: (hz) => set({ pendingFrequency: hz }),

  setPendingMode: (mode) => set({ pendingMode: mode }),

  setPendingRotorHeading: (heading) => set({ pendingRotorHeading: heading }),

  clearPendingFrequency: () => set({ pendingFrequency: null }),
  clearPendingMode: () => set({ pendingMode: null }),
  clearPendingRotorHeading: () => set({ pendingRotorHeading: null }),

  // Derived selectors
  getCurrentBand: () => {
    const { frequency } = get();
    return frequencyToBand(frequency);
  },

  getSMeterText: () => {
    const { sMeter } = get();

    if (sMeter >= 0) {
      // At or above S9
      if (sMeter === 0) {
        return "S9";
      }
      return `S9+${sMeter}dB`;
    }

    // Below S9: convert dB to S-units
    // S9 = 0dB, S8 = -6dB, S7 = -12dB, ..., S0 = -54dB
    const sUnit = Math.max(0, Math.round((sMeter - S0_DB) / DB_PER_S_UNIT));
    return `S${sUnit}`;
  },
}));
