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
  sdrWaterfallPalette: "classic" | "viridis" | "magma" | "gray";
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
    }),
    {
      name: "propulse-settings",
      version: 5,
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
