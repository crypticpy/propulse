/**
 * Zustand store for active band/mode selection
 *
 * Manages the cascade of operating state from multiple sources:
 * contest session > CAT/WSJT-X > manual selection.
 *
 * Persists only manual preferences to localStorage with key 'propulse-operating'.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { BandId } from "@/types/user";
import type { UIMode } from "@/lib/utils/modeNormalize";
import { BAND_CENTER_FREQUENCIES } from "@/lib/data/feedlines";

// ─── Source Display Constants ────────────────────────────────────────────────

/** Display metadata for each operating source (used by OperatorProfile + BandModeModal) */
export const SOURCE_DISPLAY: Record<
  string,
  { color: string; label: string; badge: string }
> = {
  cat: {
    color: "#22c55e",
    label: "CAT",
    badge: "bg-green-500/15 text-green-400 border border-green-500/20",
  },
  wsjtx: {
    color: "#44DDFF",
    label: "WSJT-X",
    badge: "bg-cyan-500/15 text-cyan-400 border border-cyan-500/20",
  },
  contest: {
    color: "#eab308",
    label: "CONTEST",
    badge: "bg-amber-500/15 text-amber-400 border border-amber-500/20",
  },
};

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Where the current active band/mode originated from.
 *
 * - `"cat"`     — CAT (Computer Aided Transceiver) control via bridge
 * - `"wsjtx"`   — WSJT-X digital mode software
 * - `"contest"` — Active contest session override
 * - `"manual"`  — User-selected band/mode (or initial defaults)
 * - `"default"` — Reserved; in practice the cascade bottoms out at "manual"
 */
export type OperatingSource =
  | "cat"
  | "wsjtx"
  | "contest"
  | "manual"
  | "default";

// ─── Sub-band segment helper ────────────────────────────────────────────────

/** Segment definition: [lowerHz, upperHz, label] */
type SegmentDef = [number, number, string];

const SUB_BAND_SEGMENTS: Partial<Record<BandId, SegmentDef[]>> = {
  "160m": [
    [1_800_000, 1_840_000, "CW"],
    [1_840_000, 2_000_000, "Phone"],
  ],
  "80m": [
    [3_500_000, 3_525_000, "CW"],
    [3_525_000, 3_600_000, "Digital"],
    [3_600_000, 4_000_000, "Phone"],
  ],
  "60m": [[5_330_500, 5_405_000, "USB/Data"]],
  "40m": [
    [7_000_000, 7_025_000, "CW"],
    [7_025_000, 7_080_000, "Digital"],
    [7_080_000, 7_125_000, "Data"],
    [7_125_000, 7_300_000, "Phone"],
  ],
  "30m": [
    [10_100_000, 10_130_000, "CW"],
    [10_130_000, 10_150_000, "Digital"],
  ],
  "20m": [
    [14_000_000, 14_070_000, "CW"],
    [14_070_000, 14_112_000, "Digital"],
    [14_112_000, 14_150_000, "Data"],
    [14_150_000, 14_350_000, "Phone"],
  ],
  "17m": [
    [18_068_000, 18_095_000, "CW"],
    [18_095_000, 18_110_000, "Digital"],
    [18_110_000, 18_168_000, "Phone"],
  ],
  "15m": [
    [21_000_000, 21_070_000, "CW"],
    [21_070_000, 21_110_000, "Digital"],
    [21_110_000, 21_150_000, "Data"],
    [21_150_000, 21_450_000, "Phone"],
  ],
  "12m": [
    [24_890_000, 24_920_000, "CW"],
    [24_920_000, 24_940_000, "Digital"],
    [24_940_000, 24_990_000, "Phone"],
  ],
  "10m": [
    [28_000_000, 28_070_000, "CW"],
    [28_070_000, 28_150_000, "Digital"],
    [28_150_000, 28_300_000, "Data"],
    [28_300_000, 29_700_000, "Phone"],
  ],
  "6m": [
    [50_000_000, 50_100_000, "CW/Beacon"],
    [50_100_000, 50_300_000, "SSB"],
    [50_300_000, 54_000_000, "Digital/FM"],
  ],
};

/**
 * Determine sub-band segment from band and frequency.
 * Returns `null` for bands without defined segments (2m, 70cm) or if frequency
 * doesn't fall within any known segment.
 */
export function getSubBandSegment(
  band: BandId,
  frequencyHz: number,
): string | null {
  const segments = SUB_BAND_SEGMENTS[band];
  if (!segments) return null;
  for (const [lo, hi, label] of segments) {
    if (frequencyHz >= lo && frequencyHz < hi) return label;
  }
  return null;
}

// ─── State interface ─────────────────────────────────────────────────────────

export interface OperatingState {
  // ── Resolved active state (computed by _resolve) ──────────────────────────

  /** Currently active band — consumers read this */
  activeBand: BandId;
  /** Currently active mode — consumers read this */
  activeMode: UIMode;
  /** Source that determined the active band/mode */
  activeSource: OperatingSource;
  /** Active frequency in Hz */
  activeFrequency: number;
  /** Sub-band segment label (e.g. "CW", "Phone", "Digital") — computed */
  subBandSegment: string | null;

  // ── Manual selection (persisted) ──────────────────────────────────────────

  /** User's manually selected band */
  manualBand: BandId;
  /** User's manually selected mode */
  manualMode: UIMode;

  // ── CAT override flag (persisted) ─────────────────────────────────────────

  /** When true, manual selection overrides CAT — user deliberately changed band */
  catOverridden: boolean;

  // ── Band/mode history (persisted) ─────────────────────────────────────────

  /** Recent band/mode transitions, newest first, max 10 entries */
  bandModeHistory: Array<{ band: BandId; mode: UIMode; timestamp: number }>;

  // ── Presets (persisted) ───────────────────────────────────────────────────

  /** User-defined band/mode presets, max 8 */
  presets: Array<{ id: string; name: string; band: BandId; mode: UIMode }>;

  // ── Multi-band monitoring (persisted) ─────────────────────────────────────

  /** Bands the user is watching in addition to the active band, max 5 */
  watchedBands: BandId[];

  // ── Session timer (transient) ─────────────────────────────────────────────

  /** Timestamp when the current band session started — resets on band change */
  bandSessionStart: number | null;

  // ── Contest lock (transient) ──────────────────────────────────────────────

  /** When true, manual band/mode changes are blocked */
  contestLocked: boolean;

  // ── Internal CAT tracking (NOT persisted) ─────────────────────────────────

  /** @internal Band reported by CAT */
  _catBand: BandId | null;
  /** @internal Mode reported by CAT */
  _catMode: UIMode | null;
  /** @internal Frequency in Hz reported by CAT */
  _catFrequency: number | null;
  /** @internal Whether a CAT connection is active */
  _catConnected: boolean;

  // ── Internal WSJT-X tracking (NOT persisted) ──────────────────────────────

  /** @internal Band reported by WSJT-X */
  _wsjtxBand: BandId | null;
  /** @internal Mode reported by WSJT-X (knows exact digital sub-mode) */
  _wsjtxMode: UIMode | null;
  /** @internal Frequency in Hz reported by WSJT-X */
  _wsjtxFrequency: number | null;
  /** @internal Whether a WSJT-X connection is active */
  _wsjtxConnected: boolean;

  // ── Contest context (NOT persisted) ───────────────────────────────────────

  /** Active contest session ID, if any */
  contestSessionId: string | null;
  /** @internal Band set by the contest session */
  _contestBand: BandId | null;
  /** @internal Mode set by the contest session */
  _contestMode: UIMode | null;

  // ── Actions ───────────────────────────────────────────────────────────────

  /** Set manual band — overrides CAT if connected. No-op when contestLocked. */
  setManualBand: (band: BandId) => void;
  /** Set manual mode. No-op when contestLocked. */
  setManualMode: (mode: UIMode) => void;
  /** Set both manual band and mode — overrides CAT if connected. No-op when contestLocked. */
  setManualBandMode: (band: BandId, mode: UIMode) => void;
  /** Resume following CAT after a manual override */
  resumeCATFollow: () => void;
  /** Update state from CAT bridge data */
  updateFromCAT: (band: BandId, mode: UIMode, freq: number) => void;
  /** Update state from WSJT-X bridge data */
  updateFromWSJTX: (band: BandId, mode: UIMode, freq: number) => void;
  /** Set or clear the active contest session */
  setContestSession: (id: string | null) => void;
  /** Update band/mode from contest session */
  updateFromContest: (band: BandId, mode: UIMode) => void;
  /** @internal Mark CAT connection status */
  _setCATConnected: (connected: boolean) => void;
  /** @internal Mark WSJT-X connection status */
  _setWSJTXConnected: (connected: boolean) => void;

  // ── Preset actions ────────────────────────────────────────────────────────

  /** Add a band/mode preset (max 8) */
  addPreset: (name: string, band: BandId, mode: UIMode) => void;
  /** Remove a preset by id */
  removePreset: (id: string) => void;
  /** Apply a preset — sets manual band/mode from the preset */
  applyPreset: (id: string) => void;

  // ── Watched bands actions ─────────────────────────────────────────────────

  /** Add a band to the watch list (max 5) */
  addWatchedBand: (band: BandId) => void;
  /** Remove a band from the watch list */
  removeWatchedBand: (band: BandId) => void;
  /** Clear all watched bands */
  clearWatchedBands: () => void;

  // ── Contest lock action ───────────────────────────────────────────────────

  /** Lock or unlock manual band/mode changes */
  setContestLocked: (locked: boolean) => void;
}

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_BAND: BandId = "20m";
const DEFAULT_MODE: UIMode = "SSB";
const DEFAULT_FREQUENCY = 14_150_000; // 20m center in Hz

/** Convert band to center frequency in Hz using BAND_CENTER_FREQUENCIES (MHz → Hz) */
function bandToHz(band: BandId): number {
  const mhz = BAND_CENTER_FREQUENCIES[band];
  return mhz ? mhz * 1_000_000 : DEFAULT_FREQUENCY;
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const useOperatingStore = create<OperatingState>()(
  persist(
    (set, get) => {
      /**
       * Cascade resolver — determines activeBand/activeMode/activeSource/activeFrequency.
       *
       * Priority:
       *   1. Contest session (if active and _contestBand set)
       *   2. CAT + WSJT-X agreement (freq within 5 kHz → prefer WSJT-X mode)
       *   3. CAT alone
       *   4. WSJT-X alone (without CAT)
       *   5. Manual selection (always available as fallback)
       *
       * Also:
       *   - Tracks band/mode history when active values change
       *   - Resets bandSessionStart on band change
       *   - Computes subBandSegment from frequency
       */
      function resolve() {
        const s = get();

        // Capture previous values before computing new ones
        const prevBand = s.activeBand;
        const prevMode = s.activeMode;

        let activeBand: BandId;
        let activeMode: UIMode;
        let activeSource: OperatingSource;
        let activeFrequency: number;

        // 1. Contest override
        if (s.contestSessionId && s._contestBand) {
          activeBand = s._contestBand;
          activeMode = s._contestMode ?? s.manualMode;
          activeSource = "contest";
          activeFrequency = bandToHz(activeBand);
        }
        // 2–3. CAT connected and not overridden by user
        else if (s._catConnected && !s.catOverridden && s._catBand) {
          // 2. WSJT-X also connected and frequencies agree within 5 kHz
          if (
            s._wsjtxConnected &&
            s._wsjtxFrequency != null &&
            s._catFrequency != null &&
            Math.abs(s._wsjtxFrequency - s._catFrequency) <= 5000 &&
            s._wsjtxBand
          ) {
            activeBand = s._wsjtxBand;
            activeMode = s._wsjtxMode ?? s._catMode ?? s.manualMode;
            activeSource = "wsjtx";
            activeFrequency = s._wsjtxFrequency;
          }
          // 3. CAT only
          else {
            activeBand = s._catBand;
            activeMode = s._catMode ?? s.manualMode;
            activeSource = "cat";
            activeFrequency = s._catFrequency ?? bandToHz(s._catBand);
          }
        }
        // 4. WSJT-X without CAT, not overridden
        else if (s._wsjtxConnected && !s.catOverridden && s._wsjtxBand) {
          activeBand = s._wsjtxBand;
          activeMode = s._wsjtxMode ?? s.manualMode;
          activeSource = "wsjtx";
          activeFrequency = s._wsjtxFrequency ?? bandToHz(s._wsjtxBand);
        }
        // 5. Manual fallback (always available)
        else {
          activeBand = s.manualBand;
          activeMode = s.manualMode;
          activeSource = "manual";
          activeFrequency = bandToHz(s.manualBand);
        }

        // Compute sub-band segment
        const subBandSegment = getSubBandSegment(activeBand, activeFrequency);

        // Detect band/mode change for history and session timer
        const bandChanged = activeBand !== prevBand;
        const modeChanged = activeMode !== prevMode;

        const updates: Partial<OperatingState> = {
          activeBand,
          activeMode,
          activeSource,
          activeFrequency,
          subBandSegment,
        };

        if (bandChanged || modeChanged) {
          const entry = {
            band: activeBand,
            mode: activeMode,
            timestamp: Date.now(),
          };
          updates.bandModeHistory = [entry, ...s.bandModeHistory].slice(0, 10);
        }

        if (bandChanged) {
          updates.bandSessionStart = Date.now();
        }

        set(updates);
      }

      return {
        // ── Resolved state ────────────────────────────────────────────────
        activeBand: DEFAULT_BAND,
        activeMode: DEFAULT_MODE,
        activeSource: "manual" as OperatingSource,
        activeFrequency: DEFAULT_FREQUENCY,
        subBandSegment: null,

        // ── Manual (persisted) ────────────────────────────────────────────
        manualBand: DEFAULT_BAND,
        manualMode: DEFAULT_MODE,

        // ── CAT override (persisted) ──────────────────────────────────────
        catOverridden: false,

        // ── Band/mode history (persisted) ─────────────────────────────────
        bandModeHistory: [],

        // ── Presets (persisted) ───────────────────────────────────────────
        presets: [],

        // ── Watched bands (persisted) ────────────────────────────────────
        watchedBands: [],

        // ── Session timer (transient) ────────────────────────────────────
        bandSessionStart: null,

        // ── Contest lock (transient) ─────────────────────────────────────
        contestLocked: false,

        // ── Internal CAT ──────────────────────────────────────────────────
        _catBand: null,
        _catMode: null,
        _catFrequency: null,
        _catConnected: false,

        // ── Internal WSJT-X ───────────────────────────────────────────────
        _wsjtxBand: null,
        _wsjtxMode: null,
        _wsjtxFrequency: null,
        _wsjtxConnected: false,

        // ── Contest context ───────────────────────────────────────────────
        contestSessionId: null,
        _contestBand: null,
        _contestMode: null,

        // ── Actions ───────────────────────────────────────────────────────

        setManualBand(band) {
          if (get().contestLocked) return;
          const shouldOverride = get()._catConnected;
          set({
            manualBand: band,
            catOverridden: shouldOverride ? true : get().catOverridden,
          });
          resolve();
        },

        setManualMode(mode) {
          if (get().contestLocked) return;
          set({ manualMode: mode });
          resolve();
        },

        setManualBandMode(band, mode) {
          if (get().contestLocked) return;
          const shouldOverride = get()._catConnected;
          set({
            manualBand: band,
            manualMode: mode,
            catOverridden: shouldOverride ? true : get().catOverridden,
          });
          resolve();
        },

        resumeCATFollow() {
          set({ catOverridden: false });
          resolve();
        },

        updateFromCAT(band, mode, freq) {
          set({
            _catBand: band,
            _catMode: mode,
            _catFrequency: freq,
            _catConnected: true,
          });
          resolve();
        },

        updateFromWSJTX(band, mode, freq) {
          set({
            _wsjtxBand: band,
            _wsjtxMode: mode,
            _wsjtxFrequency: freq,
            _wsjtxConnected: true,
          });
          resolve();
        },

        setContestSession(id) {
          if (id === null) {
            set({
              contestSessionId: null,
              _contestBand: null,
              _contestMode: null,
            });
          } else {
            set({ contestSessionId: id });
          }
          resolve();
        },

        updateFromContest(band, mode) {
          set({ _contestBand: band, _contestMode: mode });
          resolve();
        },

        _setCATConnected(connected) {
          if (!connected) {
            set({
              _catConnected: false,
              _catBand: null,
              _catMode: null,
              _catFrequency: null,
            });
          } else {
            set({ _catConnected: true });
          }
          resolve();
        },

        _setWSJTXConnected(connected) {
          if (!connected) {
            set({
              _wsjtxConnected: false,
              _wsjtxBand: null,
              _wsjtxMode: null,
              _wsjtxFrequency: null,
            });
          } else {
            set({ _wsjtxConnected: true });
          }
          resolve();
        },

        // ── Preset actions ────────────────────────────────────────────────

        addPreset(name, band, mode) {
          const s = get();
          if (s.presets.length >= 8) return;
          const id = crypto.randomUUID();
          set({ presets: [...s.presets, { id, name, band, mode }] });
        },

        removePreset(id) {
          set({ presets: get().presets.filter((p) => p.id !== id) });
        },

        applyPreset(id) {
          const preset = get().presets.find((p) => p.id === id);
          if (!preset) return;
          get().setManualBandMode(preset.band, preset.mode);
        },

        // ── Watched bands actions ─────────────────────────────────────────

        addWatchedBand(band) {
          const s = get();
          if (s.watchedBands.includes(band) || s.watchedBands.length >= 5)
            return;
          set({ watchedBands: [...s.watchedBands, band] });
        },

        removeWatchedBand(band) {
          set({
            watchedBands: get().watchedBands.filter((b) => b !== band),
          });
        },

        clearWatchedBands() {
          set({ watchedBands: [] });
        },

        // ── Contest lock action ───────────────────────────────────────────

        setContestLocked(locked) {
          set({ contestLocked: locked });
        },
      };
    },
    {
      name: "propulse-operating",
      version: 2,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        manualBand: state.manualBand,
        manualMode: state.manualMode,
        catOverridden: state.catOverridden,
        bandModeHistory: state.bandModeHistory,
        presets: state.presets,
        watchedBands: state.watchedBands,
      }),
      migrate: (persisted, version) => {
        if (version === 1) {
          const old = persisted as Record<string, unknown>;
          return {
            ...old,
            bandModeHistory:
              (old.bandModeHistory as OperatingState["bandModeHistory"]) ?? [],
            presets: (old.presets as OperatingState["presets"]) ?? [],
            watchedBands:
              (old.watchedBands as OperatingState["watchedBands"]) ?? [],
          };
        }
        return persisted;
      },
    },
  ),
);
