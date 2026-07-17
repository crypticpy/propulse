/**
 * userStore — Backward-compatible bridge shim (v15)
 *
 * All state is delegated to the three canonical stores:
 *   - profileStore (station, savedTargets, license, serviceCredentials)
 *   - settingsStore (UI/UX preferences)
 *   - shackStore (radios, customRadios, activeRadioId)
 *
 * This bridge reconstructs the legacy `{ station, preferences, savedTargets, serviceCredentials }`
 * shape so that all 62+ existing consumers continue to work unchanged.
 *
 * No `persist` middleware — persistence is handled by the canonical stores.
 */

import { create } from "zustand";
import type {
  UserStation,
  UserPreferences,
  ITURegion,
  LicenseClass,
  OperatingLocation,
  LocationType,
  LicenseInfo,
  FavoredBands,
  BandId,
  NotificationPreferences,
  SpotClusteringPreferences,
  CompassRosePreferences,
  SpotAgePreferences,
  BandPreset,
  ForecastDisplayPreferences,
} from "../types/user";
import type { ColorBlindMode } from "../lib/themes/colorblind";
import type { AntennaType } from "../lib/data/antennas";
import type { NoiseEnvironment } from "../lib/utils/noiseModel";
import type { UserRadio, RadioEquipment } from "../types/radio";
import { getRadioById } from "../lib/data/radios";

import { useProfileStore } from "./profileStore";
import type { SavedTarget, ServiceCredentials } from "./profileStore";
import { useSettingsStore } from "./settingsStore";
import {
  useShackStore,
  useActiveRadio,
  useUserRadios,
  useActiveUserRadio,
} from "./shackStore";

// Re-export types that consumers import from userStore
export type { SavedTarget, ServiceCredentials };

// ─── Store interface (matches original exactly) ──────────────────────────────

interface UserStore {
  station: UserStation | null;
  preferences: Omit<UserPreferences, "station">;
  savedTargets: SavedTarget[];
  serviceCredentials: ServiceCredentials;

  setStation: (station: UserStation | null) => void;
  setServiceCredentials: (creds: Partial<ServiceCredentials>) => void;
  updatePreferences: (prefs: Partial<Omit<UserPreferences, "station">>) => void;
  resetPreferences: () => void;
  addTarget: (target: Omit<SavedTarget, "id" | "createdAt">) => void;
  removeTarget: (id: string) => void;
  clearTargets: () => void;
  setITURegion: (region: ITURegion) => void;
  setLicenseClass: (licenseClass: LicenseClass) => void;
  addRadio: (radioId: string, nickname?: string) => string | null;
  addRadioInstance: (radioId: string, nickname?: string) => string | null;
  updateRadioInstance: (
    id: string,
    updates: Partial<Omit<UserRadio, "id" | "equipmentId" | "addedAt">>,
  ) => { ok: true } | { ok: false; error: string };
  addCustomRadio: (
    radio: Omit<RadioEquipment, "id">,
  ) => { ok: true; id: string } | { ok: false; error: string };
  updateCustomRadio: (
    id: string,
    updates: Partial<Omit<RadioEquipment, "id">>,
  ) => { ok: true } | { ok: false; error: string };
  removeCustomRadio: (id: string) => void;
  removeRadio: (radioId: string) => void;
  setActiveRadio: (radioId: string | null) => void;
  getActiveRadio: () => RadioEquipment | null;

  // Location management
  addLocation: (
    location: Omit<OperatingLocation, "id" | "createdAt">,
  ) => string;
  updateLocation: (
    id: string,
    updates: Partial<Omit<OperatingLocation, "id" | "createdAt">>,
  ) => void;
  removeLocation: (id: string) => void;
  setActiveLocation: (id: string | null) => void;
  setTemporaryLocation: (
    grid: string,
    lat: number,
    lon: number,
    name?: string,
    type?: LocationType,
  ) => string;
  clearTemporaryLocation: () => void;

  // License
  setLicense: (license: LicenseInfo | null) => void;

  // Favorites & Notifications
  setFavoredBands: (bands: FavoredBands) => void;
  toggleFavoredBand: (band: BandId) => void;
  toggleHiddenBand: (band: BandId) => void;
  updateNotifications: (prefs: Partial<NotificationPreferences>) => void;

  // Spot Clustering
  updateSpotClustering: (prefs: Partial<SpotClusteringPreferences>) => void;
  toggleSpotClustering: () => void;

  // Compass Rose
  updateCompassRose: (prefs: Partial<CompassRosePreferences>) => void;
  toggleCompassRose: () => void;

  // Spot Age
  updateSpotAge: (prefs: Partial<SpotAgePreferences>) => void;
  toggleSpotAge: () => void;

  // Band Presets
  addBandPreset: (
    name: string,
    bands: string[],
  ) => { ok: true; id: string } | { ok: false; error: string };
  removeBandPreset: (id: string) => void;
  updateBandPreset: (
    id: string,
    updates: Partial<Omit<BandPreset, "id">>,
  ) => { ok: true } | { ok: false; error: string };

  // Forecast Display
  updateForecastDisplay: (prefs: Partial<ForecastDisplayPreferences>) => void;

  // Accessibility
  setColorBlindMode: (mode: ColorBlindMode) => void;
  setAntennaType: (type: AntennaType) => void;
  setNoiseEnvironment: (env: NoiseEnvironment) => void;
}

// ─── State derivation ────────────────────────────────────────────────────────

function derivePreferences(): Omit<UserPreferences, "station"> {
  const settings = useSettingsStore.getState();
  const shack = useShackStore.getState();
  const profile = useProfileStore.getState();

  return {
    units: settings.units,
    timeFormat: settings.timeFormat,
    theme: settings.theme,
    ituRegion: settings.ituRegion,
    licenseClass: settings.licenseClass,
    textScale: settings.textScale,
    colorBlindMode: settings.colorBlindMode,
    noiseEnvironment: settings.noiseEnvironment,
    antennaType: settings.antennaType,
    bridgeEnabled: settings.bridgeEnabled,
    preferTestedSpecs: settings.preferTestedSpecs,
    favoredBands: settings.favoredBands,
    bandPresets: settings.bandPresets,
    notifications: settings.notifications,
    spotClustering: settings.spotClustering,
    compassRose: settings.compassRose,
    spotAge: settings.spotAge,
    watchAlerts: settings.watchAlerts,
    uiInteraction: settings.uiInteraction,
    forecastDisplay: settings.forecastDisplay,
    // Shack fields
    radios: shack.radios,
    customRadios: shack.customRadios,
    activeRadioId: shack.activeRadioId,
    // Profile fields in preferences
    license: profile.license,
  };
}

function computeState() {
  const profile = useProfileStore.getState();
  return {
    station: profile.station,
    preferences: derivePreferences(),
    savedTargets: profile.savedTargets,
    serviceCredentials: profile.serviceCredentials,
  };
}

function shallowRecordEqual(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): boolean {
  const leftKeys = Object.keys(left);
  if (leftKeys.length !== Object.keys(right).length) return false;
  return leftKeys.every((key) => Object.is(left[key], right[key]));
}

// ─── Key routing for updatePreferences ────────────────────────────────────────

const SETTINGS_KEYS = new Set([
  "units",
  "timeFormat",
  "theme",
  "ituRegion",
  "licenseClass",
  "textScale",
  "colorBlindMode",
  "noiseEnvironment",
  "antennaType",
  "bridgeEnabled",
  "preferTestedSpecs",
  "favoredBands",
  "bandPresets",
  "notifications",
  "spotClustering",
  "compassRose",
  "spotAge",
  "watchAlerts",
  "uiInteraction",
  "forecastDisplay",
]);
const SHACK_KEYS = new Set(["radios", "customRadios", "activeRadioId"]);
const PROFILE_KEYS = new Set(["license"]);

// ─── Bridge store ────────────────────────────────────────────────────────────

export const useUserStore = create<UserStore>()(() => ({
  // Initial derived state
  ...computeState(),

  // === Profile actions (forwarded) ===

  setStation: (station) => {
    useProfileStore.getState().setStation(station);
  },

  setServiceCredentials: (creds) => {
    useProfileStore.getState().setServiceCredentials(creds);
  },

  addTarget: (target) => {
    useProfileStore.getState().addTarget(target);
  },

  removeTarget: (id) => {
    useProfileStore.getState().removeTarget(id);
  },

  clearTargets: () => {
    useProfileStore.getState().clearTargets();
  },

  addLocation: (location) => {
    return useProfileStore.getState().addLocation(location);
  },

  updateLocation: (id, updates) => {
    useProfileStore.getState().updateLocation(id, updates);
  },

  removeLocation: (id) => {
    useProfileStore.getState().removeLocation(id);
  },

  setActiveLocation: (id) => {
    useProfileStore.getState().setActiveLocation(id);
  },

  setTemporaryLocation: (grid, lat, lon, name, type) => {
    return useProfileStore
      .getState()
      .setTemporaryLocation(grid, lat, lon, name, type);
  },

  clearTemporaryLocation: () => {
    useProfileStore.getState().clearTemporaryLocation();
  },

  setLicense: (license) => {
    useProfileStore.getState().setLicense(license);
  },

  // === Settings actions (forwarded) ===

  updatePreferences: (prefs) => {
    // Route preference keys to the appropriate canonical stores
    const settingsUpdate: Record<string, unknown> = {};
    const shackUpdate: Record<string, unknown> = {};
    const profileUpdate: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(prefs)) {
      if (SETTINGS_KEYS.has(key)) {
        settingsUpdate[key] = value;
      } else if (SHACK_KEYS.has(key)) {
        shackUpdate[key] = value;
      } else if (PROFILE_KEYS.has(key)) {
        profileUpdate[key] = value;
      } else if (import.meta.env.DEV) {
        console.warn(
          `[userStore bridge] updatePreferences: unrecognized key "${key}" was dropped`,
        );
      }
    }

    if (Object.keys(settingsUpdate).length > 0) {
      useSettingsStore.getState().updatePreferences(settingsUpdate as never);
    }
    if (Object.keys(shackUpdate).length > 0) {
      useShackStore.setState(shackUpdate);
    }
    if (profileUpdate.license !== undefined) {
      useProfileStore.setState({
        license: profileUpdate.license as LicenseInfo | undefined,
      });
    }
  },

  resetPreferences: () => {
    // Matches original: full factory reset across all stores
    useSettingsStore.getState().resetPreferences();
    useShackStore.setState({
      radios: [],
      customRadios: [],
      activeRadioId: null,
    });
    useProfileStore.setState({
      station: null,
      savedTargets: [],
      license: undefined,
    });
  },

  setITURegion: (region) => {
    useSettingsStore.getState().setITURegion(region);
  },

  setLicenseClass: (licenseClass) => {
    useSettingsStore.getState().setLicenseClass(licenseClass);
  },

  setFavoredBands: (bands) => {
    useSettingsStore.getState().setFavoredBands(bands);
  },

  toggleFavoredBand: (band) => {
    useSettingsStore.getState().toggleFavoredBand(band);
  },

  toggleHiddenBand: (band) => {
    useSettingsStore.getState().toggleHiddenBand(band);
  },

  updateNotifications: (prefs) => {
    useSettingsStore.getState().updateNotifications(prefs);
  },

  updateSpotClustering: (prefs) => {
    useSettingsStore.getState().updateSpotClustering(prefs);
  },

  toggleSpotClustering: () => {
    useSettingsStore.getState().toggleSpotClustering();
  },

  updateCompassRose: (prefs) => {
    useSettingsStore.getState().updateCompassRose(prefs);
  },

  toggleCompassRose: () => {
    useSettingsStore.getState().toggleCompassRose();
  },

  updateSpotAge: (prefs) => {
    useSettingsStore.getState().updateSpotAge(prefs);
  },

  toggleSpotAge: () => {
    useSettingsStore.getState().toggleSpotAge();
  },

  addBandPreset: (name, bands) => {
    return useSettingsStore.getState().addBandPreset(name, bands);
  },

  removeBandPreset: (id) => {
    useSettingsStore.getState().removeBandPreset(id);
  },

  updateBandPreset: (id, updates) => {
    return useSettingsStore.getState().updateBandPreset(id, updates);
  },

  updateForecastDisplay: (prefs) => {
    useSettingsStore.getState().updateForecastDisplay(prefs);
  },

  setColorBlindMode: (mode) => {
    useSettingsStore.getState().setColorBlindMode(mode);
  },

  setAntennaType: (type) => {
    useSettingsStore.getState().setAntennaType(type);
  },

  setNoiseEnvironment: (env) => {
    useSettingsStore.getState().setNoiseEnvironment(env);
  },

  // === Shack actions (forwarded) ===

  addRadio: (radioId, nickname) => {
    return useShackStore.getState().addRadio(radioId, nickname);
  },

  addRadioInstance: (radioId, nickname) => {
    return useShackStore.getState().addRadioInstance(radioId, nickname);
  },

  updateRadioInstance: (id, updates) => {
    return useShackStore.getState().updateRadioInstance(id, updates);
  },

  removeRadio: (radioId) => {
    useShackStore.getState().removeRadio(radioId);
  },

  setActiveRadio: (radioId) => {
    useShackStore.getState().setActiveRadio(radioId);
  },

  addCustomRadio: (radio) => {
    return useShackStore.getState().addCustomRadio(radio);
  },

  updateCustomRadio: (id, updates) => {
    return useShackStore.getState().updateCustomRadio(id, updates);
  },

  removeCustomRadio: (id) => {
    useShackStore.getState().removeCustomRadio(id);
  },

  getActiveRadio: () => {
    const shack = useShackStore.getState();
    if (!shack.activeRadioId) return null;
    const instance = shack.radios.find((r) => r.id === shack.activeRadioId);
    if (instance) {
      const custom = shack.customRadios?.find(
        (r) => r.id === instance.equipmentId,
      );
      if (custom) return custom;
      return getRadioById(instance.equipmentId) ?? null;
    }
    return null;
  },
}));

// ─── Cross-store subscriptions ───────────────────────────────────────────────
// Keep bridge state in sync when canonical stores change.
// Uses Zustand's internal setState to avoid routing loops.

const rawSet = useUserStore.setState.bind(useUserStore);

function syncBridgeState() {
  const current = useUserStore.getState();
  const next = computeState();
  const preferencesUnchanged = shallowRecordEqual(
    current.preferences as Record<string, unknown>,
    next.preferences as Record<string, unknown>,
  );
  if (
    current.station === next.station &&
    preferencesUnchanged &&
    current.savedTargets === next.savedTargets &&
    current.serviceCredentials === next.serviceCredentials
  ) {
    return;
  }
  rawSet({
    ...next,
    preferences: preferencesUnchanged ? current.preferences : next.preferences,
  });
}

useProfileStore.subscribe(syncBridgeState);
useSettingsStore.subscribe(syncBridgeState);
useShackStore.subscribe(syncBridgeState);

// ─── Re-exported hooks from canonical stores ─────────────────────────────────
// Consumers can continue importing these from userStore.

export { useActiveRadio, useUserRadios, useActiveUserRadio };

export {
  useSpotClusteringPrefs,
  useCompassRosePrefs,
  useSpotAgePrefs,
  useWatchAlertPrefs,
  useUIInteractionPrefs,
  useBandPresets,
  useForecastDisplayPrefs,
  useColorBlindMode,
  usePreferTestedSpecs,
} from "./settingsStore";
