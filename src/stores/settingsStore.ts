/**
 * Zustand store for UI/UX preferences
 * Decomposed from the monolithic userStore.ts
 * Persists to localStorage with key 'propulse-settings'
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  ITURegion,
  LicenseClass,
  FavoredBands,
  BandId,
  NotificationPreferences,
  SpotClusteringPreferences,
  CompassRosePreferences,
  SpotAgePreferences,
  WatchAlertPreferences,
  UIInteractionPreferences,
  BandPreset,
  ForecastDisplayPreferences,
  TextScale,
} from "@/types/user";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  DEFAULT_FAVORED_BANDS,
  DEFAULT_SPOT_CLUSTERING,
  DEFAULT_COMPASS_ROSE,
  DEFAULT_SPOT_AGE,
  DEFAULT_WATCH_ALERT_PREFERENCES,
  DEFAULT_UI_INTERACTION,
  DEFAULT_FORECAST_DISPLAY,
} from "@/types/user";
import type { ColorBlindMode } from "@/lib/themes/colorblind";
import type { AntennaType } from "@/lib/data/antennas";
import type { NoiseEnvironment } from "@/lib/utils/noiseModel";
import type { WaterfallPaletteName } from "@/components/sdr/waterfallPalette";
import type { SdrSkinName } from "@/components/sdr/skins/types";
import type { EqBand } from "@/lib/audio/eqTypes";

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_BAND_PRESETS = 5;
const EMPTY_BAND_PRESETS: BandPreset[] = [];

// ─── State type (flat — not nested under "preferences") ─────────────────────

export interface SettingsState {
  units: "metric";
  timeFormat: "12h" | "24h";
  theme: "dark" | "light";
  ituRegion: ITURegion;
  licenseClass: LicenseClass;
  textScale: TextScale;
  colorBlindMode: ColorBlindMode;
  /** High contrast mode for accessibility */
  highContrast: boolean;
  noiseEnvironment: NoiseEnvironment;
  antennaType: AntennaType;
  bridgeEnabled: boolean;
  preferTestedSpecs: boolean;
  favoredBands: FavoredBands;
  bandPresets: BandPreset[];
  notifications: NotificationPreferences;
  spotClustering: SpotClusteringPreferences;
  compassRose: CompassRosePreferences;
  spotAge: SpotAgePreferences;
  watchAlerts: WatchAlertPreferences;
  uiInteraction: UIInteractionPreferences;
  forecastDisplay: ForecastDisplayPreferences;
  /** SDR Console waterfall color palette */
  sdrWaterfallPalette: WaterfallPaletteName;
  /** SDR waterfall dB floor (mapped to black) */
  sdrWaterfallMinDb: number;
  /** SDR waterfall dB ceiling (mapped to palette high end) */
  sdrWaterfallMaxDb: number;
  /** SDR waterfall scroll speed multiplier */
  sdrWaterfallSpeed: number;
  /** SDR spectrum scope peak hold enabled */
  sdrSpectrumPeakHold: boolean;
  /** SDR spectrum scope gradient fill enabled */
  sdrSpectrumGradientFill: boolean;
  /** Spectrum scope background color (CSS hex) */
  sdrSpectrumBgColor: string;
  /** Number of horizontal grid lines (0-8) */
  sdrSpectrumGridLines: number;
  /** Number of vertical grid lines (0-16) */
  sdrSpectrumVerticalGridLines: number;
  /** Grid line opacity (0-0.3) */
  sdrSpectrumGridOpacity: number;
  /** Smoothing passes on FFT data (0=raw, 10=very smooth) */
  sdrSpectrumSmoothing: number;
  /** Spectrum trace line color (hex or "auto" = derive from palette) */
  sdrSpectrumLineColor: string;
  /** Spectrum trace line width in pixels (1-4) */
  sdrSpectrumLineWidth: number;
  /** Gradient fill opacity under the trace (0-1) */
  sdrSpectrumFillOpacity: number;
  /** Enable drop shadow on the spectrum trace */
  sdrSpectrumLineShadow: boolean;
  /** Drop shadow blur radius in pixels (2-20) */
  sdrSpectrumLineShadowBlur: number;
  /** Passband blend mode on waterfall */
  sdrPassbandBlendMode: string;
  /** Passband blend opacity (0-0.3) */
  sdrPassbandOpacity: number;
  /** SDR Console skin layout */
  sdrSkinName: SdrSkinName;
  /** Slice flag background color (CSS), default teal */
  sdrSliceBgColor: string;
  /** Tuning step size in Hz for click-to-tune snapping */
  sdrTuningStepHz: number;
  /** Waterfall texture interpolation mode */
  sdrWaterfallInterpolation: "nearest" | "linear";
  /** Waterfall gamma/contrast curve (1.0 = linear) */
  sdrWaterfallGamma: number;
  /** Waterfall row height in pixels per FFT line */
  sdrWaterfallRowHeight: number;
  /** DX News Ticker position */
  tickerPosition: "bottom" | "above-panels" | "top";
  /** Whether the first-time contest weather tooltip has been dismissed */
  contestWeatherFirstTimeSeen?: boolean;
  /** Whether to show the QuietBandNav widget in the logbook */
  showQuietBandNav?: boolean;
  /** ISO timestamp until which the contest weather card is temporarily dismissed */
  contestWeatherDismissedUntil?: string;
  /** Whether spot alert sounds are enabled (default true) */
  alertSoundEnabled?: boolean;
  /** Spot alert sound volume 0-100 (default 50) */
  alertSoundVolume?: number;
  /** Whether spot alert browser notifications are enabled (default true) */
  alertBrowserNotifications?: boolean;
  /** Active contest alert profile ID (default 'normal') */
  contestAlertProfileId?: string;
  /** Whether to auto-switch to contest profile during contests (default true) */
  autoSwitchContestProfile?: boolean;
  /** Contest alert throttle multiplier (default 4 = alert once per 20min instead of 5min) */
  contestAlertThrottleMultiplier?: number;
  /** SDR parametric EQ bands (persisted, max 16) — replaces old sdrNotchFilters */
  sdrEqBands: EqBand[];
  /** Client-side noise gate enabled */
  sdrNoiseGateEnabled: boolean;
  /** Client-side noise gate threshold in dBFS (range -80 to -20) */
  sdrNoiseGateThreshold: number;
  /** Client-side spectral noise reduction enabled */
  sdrNrEnabled: boolean;
  /** Client-side spectral NR level (0-10) */
  sdrNrLevel: number;
  /** Tuning indicator line color (CSS hex) */
  sdrTuningLineColor: string;
  /** Tuning indicator arrow color (CSS hex) */
  sdrTuningArrowColor: string;
  /** Native FT8/FT4 decoder enabled */
  sdrFt8DecoderEnabled: boolean;
  /** FT8 audio source type */
  sdrFt8AudioSource: "getUserMedia" | "bridge";
  /** FT8 audio device ID for getUserMedia (null = system default) */
  sdrFt8AudioDeviceId: string | null;
  /** FT8/FT4 mode selection */
  sdrFt8Mode: "FT8" | "FT4";
}

// ─── Store interface ─────────────────────────────────────────────────────────

interface SettingsStore extends SettingsState {
  updatePreferences: (prefs: Partial<SettingsState>) => void;
  resetPreferences: () => void;
  setITURegion: (region: ITURegion) => void;
  setLicenseClass: (licenseClass: LicenseClass) => void;
  setFavoredBands: (bands: FavoredBands) => void;
  toggleFavoredBand: (band: BandId) => void;
  toggleHiddenBand: (band: BandId) => void;
  updateNotifications: (prefs: Partial<NotificationPreferences>) => void;
  updateSpotClustering: (prefs: Partial<SpotClusteringPreferences>) => void;
  toggleSpotClustering: () => void;
  updateCompassRose: (prefs: Partial<CompassRosePreferences>) => void;
  toggleCompassRose: () => void;
  updateSpotAge: (prefs: Partial<SpotAgePreferences>) => void;
  toggleSpotAge: () => void;
  addBandPreset: (
    name: string,
    bands: string[],
  ) => { ok: true; id: string } | { ok: false; error: string };
  removeBandPreset: (id: string) => void;
  updateBandPreset: (
    id: string,
    updates: Partial<Omit<BandPreset, "id">>,
  ) => { ok: true } | { ok: false; error: string };
  updateForecastDisplay: (prefs: Partial<ForecastDisplayPreferences>) => void;
  setColorBlindMode: (mode: ColorBlindMode) => void;
  setAntennaType: (type: AntennaType) => void;
  setNoiseEnvironment: (env: NoiseEnvironment) => void;
  setHighContrast: (enabled: boolean) => void;
  updateUIInteraction: (partial: Partial<UIInteractionPreferences>) => void;
  setSdrSliceBgColor: (color: string) => void;
}

// ─── Defaults ────────────────────────────────────────────────────────────────

const defaultSettings: SettingsState = {
  units: "metric",
  timeFormat: "12h",
  theme: "dark",
  ituRegion: "ITU2" as ITURegion,
  licenseClass: "GENERAL" as LicenseClass,
  textScale: "md" as TextScale,
  colorBlindMode: "none" as ColorBlindMode,
  highContrast: false,
  noiseEnvironment: "residential" as NoiseEnvironment,
  antennaType: "isotropic" as AntennaType,
  bridgeEnabled: false,
  preferTestedSpecs: true,
  favoredBands: DEFAULT_FAVORED_BANDS,
  bandPresets: [],
  notifications: DEFAULT_NOTIFICATION_PREFERENCES,
  spotClustering: DEFAULT_SPOT_CLUSTERING,
  compassRose: DEFAULT_COMPASS_ROSE,
  spotAge: DEFAULT_SPOT_AGE,
  watchAlerts: DEFAULT_WATCH_ALERT_PREFERENCES,
  uiInteraction: DEFAULT_UI_INTERACTION,
  forecastDisplay: DEFAULT_FORECAST_DISPLAY,
  sdrWaterfallPalette: "classic",
  sdrWaterfallMinDb: -125,
  sdrWaterfallMaxDb: -40,
  sdrWaterfallSpeed: 1,
  sdrSpectrumPeakHold: true,
  sdrSpectrumGradientFill: true,
  sdrSpectrumBgColor: "#000000",
  sdrSpectrumGridLines: 3,
  sdrSpectrumVerticalGridLines: 6,
  sdrSpectrumGridOpacity: 0.08,
  sdrSpectrumSmoothing: 0,
  sdrSpectrumLineColor: "auto",
  sdrSpectrumLineWidth: 2,
  sdrSpectrumFillOpacity: 0.3,
  sdrSpectrumLineShadow: true,
  sdrSpectrumLineShadowBlur: 8,
  sdrPassbandBlendMode: "screen",
  sdrPassbandOpacity: 0.08,
  sdrSkinName: "classic" as SdrSkinName,
  sdrSliceBgColor: "rgba(0, 40, 60, 0.85)",
  sdrTuningStepHz: 1000,
  sdrWaterfallInterpolation: "nearest",
  sdrWaterfallGamma: 1.0,
  sdrWaterfallRowHeight: 1,
  tickerPosition: "bottom",
  contestWeatherFirstTimeSeen: false,
  showQuietBandNav: true,
  contestWeatherDismissedUntil: undefined,
  alertSoundEnabled: true,
  alertSoundVolume: 50,
  alertBrowserNotifications: true,
  contestAlertProfileId: "normal",
  autoSwitchContestProfile: true,
  contestAlertThrottleMultiplier: 4,
  sdrEqBands: [],
  sdrNoiseGateEnabled: false,
  sdrNoiseGateThreshold: -40,
  sdrNrEnabled: false,
  sdrNrLevel: 3,
  sdrTuningLineColor: "#00ebff",
  sdrTuningArrowColor: "#00ebff",
  sdrFt8DecoderEnabled: false,
  sdrFt8AudioSource: "getUserMedia" as const,
  sdrFt8AudioDeviceId: null,
  sdrFt8Mode: "FT8" as const,
};

// ─── Store ───────────────────────────────────────────────────────────────────

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      ...defaultSettings,

      updatePreferences: (prefs) => set(prefs),

      resetPreferences: () => set(defaultSettings),

      setITURegion: (region) => set({ ituRegion: region }),

      setLicenseClass: (licenseClass) => set({ licenseClass }),

      setFavoredBands: (bands) => set({ favoredBands: bands }),

      toggleFavoredBand: (band) =>
        set((state) => {
          const current = state.favoredBands ?? DEFAULT_FAVORED_BANDS;
          const isPrimary = current.primary.includes(band);

          const primary = isPrimary
            ? current.primary.filter((b) => b !== band)
            : [...current.primary, band];

          const hidden = isPrimary
            ? current.hidden
            : current.hidden.filter((b) => b !== band);

          return { favoredBands: { primary, hidden } };
        }),

      toggleHiddenBand: (band) =>
        set((state) => {
          const current = state.favoredBands ?? DEFAULT_FAVORED_BANDS;
          const isHidden = current.hidden.includes(band);

          const hidden = isHidden
            ? current.hidden.filter((b) => b !== band)
            : [...current.hidden, band];

          const primary = isHidden
            ? current.primary
            : current.primary.filter((b) => b !== band);

          return { favoredBands: { primary, hidden } };
        }),

      updateNotifications: (prefs) =>
        set((state) => ({
          notifications: {
            ...(state.notifications ?? DEFAULT_NOTIFICATION_PREFERENCES),
            ...prefs,
          },
        })),

      updateSpotClustering: (prefs) =>
        set((state) => ({
          spotClustering: {
            ...(state.spotClustering ?? DEFAULT_SPOT_CLUSTERING),
            ...prefs,
          },
        })),

      toggleSpotClustering: () =>
        set((state) => {
          const current = state.spotClustering ?? DEFAULT_SPOT_CLUSTERING;
          return {
            spotClustering: { ...current, enabled: !current.enabled },
          };
        }),

      updateCompassRose: (prefs) =>
        set((state) => ({
          compassRose: {
            ...(state.compassRose ?? DEFAULT_COMPASS_ROSE),
            ...prefs,
          },
        })),

      toggleCompassRose: () =>
        set((state) => {
          const current = state.compassRose ?? DEFAULT_COMPASS_ROSE;
          return { compassRose: { ...current, enabled: !current.enabled } };
        }),

      updateSpotAge: (prefs) =>
        set((state) => ({
          spotAge: {
            ...(state.spotAge ?? DEFAULT_SPOT_AGE),
            ...prefs,
          },
        })),

      toggleSpotAge: () =>
        set((state) => {
          const current = state.spotAge ?? DEFAULT_SPOT_AGE;
          return { spotAge: { ...current, enabled: !current.enabled } };
        }),

      addBandPreset: (name, bands) => {
        const trimmedName = name.trim();
        if (!trimmedName) {
          return { ok: false, error: "Preset name is required" };
        }
        if (bands.length === 0) {
          return { ok: false, error: "At least one band must be selected" };
        }

        const id = crypto.randomUUID();
        let result: { ok: true; id: string } | { ok: false; error: string } = {
          ok: true,
          id,
        };

        set((state) => {
          const existing = state.bandPresets ?? [];

          if (existing.length >= MAX_BAND_PRESETS) {
            result = {
              ok: false,
              error: `Maximum of ${MAX_BAND_PRESETS} presets allowed`,
            };
            return state;
          }

          const normalized = trimmedName.toLowerCase();
          const hasDuplicate = existing.some(
            (p) => p.name.toLowerCase() === normalized,
          );
          if (hasDuplicate) {
            result = {
              ok: false,
              error: `A preset named "${trimmedName}" already exists`,
            };
            return state;
          }

          const newPreset: BandPreset = {
            id,
            name: trimmedName,
            bands: [...bands],
          };

          return { bandPresets: [...existing, newPreset] };
        });

        return result;
      },

      removeBandPreset: (id) =>
        set((state) => ({
          bandPresets: (state.bandPresets ?? []).filter((p) => p.id !== id),
        })),

      updateBandPreset: (id, updates) => {
        let result: { ok: true } | { ok: false; error: string } = { ok: true };

        set((state) => {
          const existing = state.bandPresets ?? [];
          const idx = existing.findIndex((p) => p.id === id);

          if (idx === -1) {
            result = { ok: false, error: "Preset not found" };
            return state;
          }

          const nextName =
            typeof updates.name === "string"
              ? updates.name.trim()
              : existing[idx].name;

          if (!nextName) {
            result = { ok: false, error: "Preset name is required" };
            return state;
          }

          const normalized = nextName.toLowerCase();
          const hasDuplicate = existing.some(
            (p, i) => i !== idx && p.name.toLowerCase() === normalized,
          );
          if (hasDuplicate) {
            result = {
              ok: false,
              error: `A preset named "${nextName}" already exists`,
            };
            return state;
          }

          const nextBands = Array.isArray(updates.bands)
            ? updates.bands
            : existing[idx].bands;

          if (nextBands.length === 0) {
            result = { ok: false, error: "At least one band must be selected" };
            return state;
          }

          const nextPresets = existing.map((p, i) =>
            i === idx ? { ...p, name: nextName, bands: [...nextBands] } : p,
          );

          return { bandPresets: nextPresets };
        });

        return result;
      },

      updateForecastDisplay: (prefs) =>
        set((state) => ({
          forecastDisplay: {
            ...(state.forecastDisplay ?? DEFAULT_FORECAST_DISPLAY),
            ...prefs,
          },
        })),

      setColorBlindMode: (mode) => set({ colorBlindMode: mode }),

      setAntennaType: (type) => set({ antennaType: type }),

      setNoiseEnvironment: (env) => set({ noiseEnvironment: env }),

      setHighContrast: (enabled) => set({ highContrast: enabled }),

      updateUIInteraction: (partial) =>
        set((state) => ({
          uiInteraction: {
            ...(state.uiInteraction ?? DEFAULT_UI_INTERACTION),
            ...partial,
          },
        })),

      setSdrSliceBgColor: (color) => set({ sdrSliceBgColor: color }),
    }),
    {
      name: "propulse-settings",
      version: 21,
      storage: createJSONStorage(() => localStorage),
      migrate: (persisted: unknown, version: number) => {
        const state = persisted as Record<string, unknown>;
        if (version < 2) {
          // Added in v2: highContrast, forecastDisplay, uiInteraction, bandPresets, spotClustering, compassRose, spotAge
          if (state.highContrast === undefined) state.highContrast = false;
        }
        if (version < 3) {
          // Fix holdDurationMs — clamp any value above slider max (2000) back to default (500)
          const ui = state.uiInteraction as Record<string, unknown> | undefined;
          if (
            ui &&
            typeof ui.holdDurationMs === "number" &&
            ui.holdDurationMs > 2000
          ) {
            ui.holdDurationMs = 500;
          }
        }
        if (version < 4) {
          // Re-run holdDurationMs fix for users already on v3 with stale 2500ms value
          const ui = state.uiInteraction as Record<string, unknown> | undefined;
          if (
            ui &&
            typeof ui.holdDurationMs === "number" &&
            ui.holdDurationMs > 2000
          ) {
            ui.holdDurationMs = 500;
          }
          // Add new scale preferences with defaults
          if (ui) {
            if (ui.spotDotScale === undefined) ui.spotDotScale = 1.0;
            if (ui.mapPinScale === undefined) ui.mapPinScale = 1.0;
          }
        }
        if (version < 5) {
          // Add showHoverTooltips preference
          const ui = state.uiInteraction as Record<string, unknown> | undefined;
          if (ui && ui.showHoverTooltips === undefined) {
            ui.showHoverTooltips = true;
          }
        }
        if (version < 6) {
          // Add alertDisplayStyle to notification preferences
          const notif = state.notifications as
            | Record<string, unknown>
            | undefined;
          if (notif && notif.alertDisplayStyle === undefined) {
            notif.alertDisplayStyle = "toast";
          }
        }
        if (version < 7) {
          // Add contest weather preferences
          if (state.contestWeatherFirstTimeSeen === undefined)
            state.contestWeatherFirstTimeSeen = false;
          if (state.showQuietBandNav === undefined)
            state.showQuietBandNav = true;
          // contestWeatherDismissedUntil defaults to undefined (no dismissal)
        }
        if (version < 8) {
          // Add spot alert sound and notification preferences
          if (state.alertSoundEnabled === undefined)
            state.alertSoundEnabled = true;
          if (state.alertSoundVolume === undefined) state.alertSoundVolume = 50;
          if (state.alertBrowserNotifications === undefined)
            state.alertBrowserNotifications = true;
        }
        if (version < 9) {
          // Add contest alert profile preferences
          if (state.contestAlertProfileId === undefined)
            state.contestAlertProfileId = "normal";
          if (state.autoSwitchContestProfile === undefined)
            state.autoSwitchContestProfile = true;
          if (state.contestAlertThrottleMultiplier === undefined)
            state.contestAlertThrottleMultiplier = 4;
        }
        if (version < 10) {
          // Add SDR waterfall/spectrum settings
          if (state.sdrWaterfallMinDb === undefined)
            state.sdrWaterfallMinDb = -125;
          if (state.sdrWaterfallMaxDb === undefined)
            state.sdrWaterfallMaxDb = -40;
          if (state.sdrWaterfallSpeed === undefined)
            state.sdrWaterfallSpeed = 1;
          if (state.sdrSpectrumPeakHold === undefined)
            state.sdrSpectrumPeakHold = true;
          if (state.sdrSpectrumGradientFill === undefined)
            state.sdrSpectrumGradientFill = true;
        }
        if (version < 11) {
          // Add SDR Console skin preference
          if (state.sdrSkinName === undefined) state.sdrSkinName = "classic";
        }
        if (version < 12) {
          if (state.sdrSpectrumBgColor === undefined)
            state.sdrSpectrumBgColor = "#000000";
          if (state.sdrSpectrumGridLines === undefined)
            state.sdrSpectrumGridLines = 3;
          if (state.sdrSpectrumGridOpacity === undefined)
            state.sdrSpectrumGridOpacity = 0.08;
          if (state.sdrSpectrumSmoothing === undefined)
            state.sdrSpectrumSmoothing = 0;
          if (state.sdrSpectrumLineColor === undefined)
            state.sdrSpectrumLineColor = "auto";
          if (state.sdrSpectrumLineWidth === undefined)
            state.sdrSpectrumLineWidth = 2;
          if (state.sdrSpectrumFillOpacity === undefined)
            state.sdrSpectrumFillOpacity = 0.3;
          if (state.sdrSpectrumLineShadow === undefined)
            state.sdrSpectrumLineShadow = true;
          if (state.sdrSpectrumLineShadowBlur === undefined)
            state.sdrSpectrumLineShadowBlur = 8;
          if (state.sdrPassbandBlendMode === undefined)
            state.sdrPassbandBlendMode = "screen";
          if (state.sdrPassbandOpacity === undefined)
            state.sdrPassbandOpacity = 0.08;
        }
        if (version < 13) {
          if (state.sdrSliceBgColor === undefined)
            state.sdrSliceBgColor = "rgba(0, 40, 60, 0.85)";
        }
        if (version < 14) {
          if (state.sdrWaterfallInterpolation === undefined)
            state.sdrWaterfallInterpolation = "nearest";
          if (state.sdrWaterfallGamma === undefined)
            state.sdrWaterfallGamma = 1.0;
          if (state.sdrWaterfallRowHeight === undefined)
            state.sdrWaterfallRowHeight = 1;
        }
        if (version < 15) {
          if (state.sdrNotchFilters === undefined) state.sdrNotchFilters = [];
        }
        if (version < 16) {
          if (state.sdrNoiseGateEnabled === undefined)
            state.sdrNoiseGateEnabled = false;
          if (state.sdrNoiseGateThreshold === undefined)
            state.sdrNoiseGateThreshold = -40;
          if (state.sdrNrEnabled === undefined) state.sdrNrEnabled = false;
          if (state.sdrNrLevel === undefined) state.sdrNrLevel = 3;
        }
        if (version < 17) {
          if (state.sdrSpectrumVerticalGridLines === undefined)
            state.sdrSpectrumVerticalGridLines = 6;
        }
        if (version < 18) {
          if (state.sdrTuningStepHz === undefined) state.sdrTuningStepHz = 1000;
        }
        if (version < 19) {
          if (state.sdrTuningLineColor === undefined)
            state.sdrTuningLineColor = "#00ebff";
          if (state.sdrTuningArrowColor === undefined)
            state.sdrTuningArrowColor = "#00ebff";
        }
        if (version < 20) {
          if (state.sdrFt8DecoderEnabled === undefined)
            state.sdrFt8DecoderEnabled = false;
          if (state.sdrFt8AudioSource === undefined)
            state.sdrFt8AudioSource = "getUserMedia";
          if (state.sdrFt8AudioDeviceId === undefined)
            state.sdrFt8AudioDeviceId = null;
          if (state.sdrFt8Mode === undefined) state.sdrFt8Mode = "FT8";
        }
        if (version < 21) {
          // Migrate sdrNotchFilters to sdrEqBands
          const oldNotches = (state as Record<string, unknown>)
            .sdrNotchFilters as
            | Array<{ id: string; freqHz: number; q: number; enabled: boolean }>
            | undefined;
          if (oldNotches && oldNotches.length > 0) {
            (state as Record<string, unknown>).sdrEqBands = oldNotches.map(
              (n) => ({
                id: n.id,
                freqHz: n.freqHz,
                q: n.q,
                gainDb: 0,
                filterType: "notch" as const,
                category: "notch" as const,
                enabled: n.enabled,
              }),
            );
          } else {
            (state as Record<string, unknown>).sdrEqBands = [];
          }
          delete (state as Record<string, unknown>).sdrNotchFilters;
        }
        return state as unknown as SettingsState & SettingsStore;
      },
    },
  ),
);

// ─── Hooks ───────────────────────────────────────────────────────────────────

export function useSpotClusteringPrefs(): SpotClusteringPreferences {
  return useSettingsStore((s) => s.spotClustering ?? DEFAULT_SPOT_CLUSTERING);
}

export function useCompassRosePrefs(): CompassRosePreferences {
  return useSettingsStore((s) => s.compassRose ?? DEFAULT_COMPASS_ROSE);
}

export function useSpotAgePrefs(): SpotAgePreferences {
  return useSettingsStore((s) => s.spotAge ?? DEFAULT_SPOT_AGE);
}

export function useWatchAlertPrefs(): WatchAlertPreferences {
  return useSettingsStore(
    (s) => s.watchAlerts ?? DEFAULT_WATCH_ALERT_PREFERENCES,
  );
}

export function useUIInteractionPrefs(): UIInteractionPreferences {
  return useSettingsStore((s) => s.uiInteraction ?? DEFAULT_UI_INTERACTION);
}

export function useBandPresets(): BandPreset[] {
  return useSettingsStore((s) => s.bandPresets ?? EMPTY_BAND_PRESETS);
}

export function useForecastDisplayPrefs(): ForecastDisplayPreferences {
  return useSettingsStore((s) => s.forecastDisplay ?? DEFAULT_FORECAST_DISPLAY);
}

export function useColorBlindMode(): ColorBlindMode {
  return useSettingsStore((s) => s.colorBlindMode ?? "none");
}

export function usePreferTestedSpecs(): boolean {
  return useSettingsStore((s) => s.preferTestedSpecs ?? true);
}
