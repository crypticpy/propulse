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

  // ── Manual selection (persisted) ──────────────────────────────────────────

  /** User's manually selected band */
  manualBand: BandId;
  /** User's manually selected mode */
  manualMode: UIMode;

  // ── CAT override flag (persisted) ─────────────────────────────────────────

  /** When true, manual selection overrides CAT — user deliberately changed band */
  catOverridden: boolean;

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

  /** Set manual band — overrides CAT if connected */
  setManualBand: (band: BandId) => void;
  /** Set manual mode */
  setManualMode: (mode: UIMode) => void;
  /** Set both manual band and mode — overrides CAT if connected */
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
       */
      function resolve() {
        const s = get();

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

        set({ activeBand, activeMode, activeSource, activeFrequency });
      }

      return {
        // ── Resolved state ────────────────────────────────────────────────
        activeBand: DEFAULT_BAND,
        activeMode: DEFAULT_MODE,
        activeSource: "manual" as OperatingSource,
        activeFrequency: DEFAULT_FREQUENCY,

        // ── Manual (persisted) ────────────────────────────────────────────
        manualBand: DEFAULT_BAND,
        manualMode: DEFAULT_MODE,

        // ── CAT override (persisted) ──────────────────────────────────────
        catOverridden: false,

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
          const shouldOverride = get()._catConnected;
          set({
            manualBand: band,
            catOverridden: shouldOverride ? true : get().catOverridden,
          });
          resolve();
        },

        setManualMode(mode) {
          set({ manualMode: mode });
          resolve();
        },

        setManualBandMode(band, mode) {
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
      };
    },
    {
      name: "propulse-operating",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        manualBand: state.manualBand,
        manualMode: state.manualMode,
        catOverridden: state.catOverridden,
      }),
    },
  ),
);
