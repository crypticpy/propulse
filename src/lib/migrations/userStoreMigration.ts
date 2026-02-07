/**
 * One-time migration from monolithic userStore (v14) to decomposed stores.
 *
 * Reads propulse-user from localStorage, splits data into:
 * - propulse-profile (station, savedTargets, license)
 * - propulse-settings (preferences minus radios/customRadios/activeRadioId/license)
 * - propulse-shack (radios, customRadios, activeRadioId)
 *
 * Then bumps propulse-user to version 15. Idempotent: safe to run multiple times.
 */

import {
  DEFAULT_FAVORED_BANDS,
  DEFAULT_NOTIFICATION_PREFERENCES,
  DEFAULT_SPOT_CLUSTERING,
  DEFAULT_COMPASS_ROSE,
  DEFAULT_SPOT_AGE,
  DEFAULT_WATCH_ALERT_PREFERENCES,
  DEFAULT_FORECAST_DISPLAY,
} from "@/types/user";
import type { OperatingLocation } from "@/types/user";
import { getRadioById } from "@/lib/data/radios";

const LEGACY_KEY = "propulse-user";
const PROFILE_KEY = "propulse-profile";
const SETTINGS_KEY = "propulse-settings";
const SHACK_KEY = "propulse-shack";

// ─── Inline helpers for legacy radio migration ──────────────────────────────

interface LegacyRadio {
  radioId: string;
  nickname?: string;
  customPowerLimit?: number;
  addedAt?: string;
}

interface UserRadioShape {
  id: string;
  equipmentId: string;
  nickname?: string;
  customPowerLimit?: number;
  addedAt: string;
}

function isLegacyRadio(value: unknown): value is LegacyRadio {
  return (
    typeof value === "object" &&
    value !== null &&
    "radioId" in value &&
    typeof (value as { radioId: unknown }).radioId === "string"
  );
}

function isUserRadioShape(value: unknown): value is UserRadioShape {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "equipmentId" in value &&
    typeof (value as { id: unknown }).id === "string" &&
    typeof (value as { equipmentId: unknown }).equipmentId === "string"
  );
}

function createRadioInstance(params: {
  equipmentId: string;
  nickname?: string;
  customPowerLimit?: number;
  addedAt?: string;
}): UserRadioShape {
  return {
    id: crypto.randomUUID(),
    equipmentId: params.equipmentId,
    nickname: params.nickname,
    customPowerLimit: params.customPowerLimit,
    addedAt: params.addedAt ?? new Date().toISOString(),
  };
}

const MAX_RADIOS = 10;

// ─── Legacy v0→v14 migration chain ──────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
function legacyMigrateToV14(
  persistedState: Record<string, any>,
  version: number,
): Record<string, any> {
  const state = { ...persistedState };
  const preferencesRaw = (state.preferences || {}) as Record<string, any>;

  const nextPreferences: Record<string, any> = {
    // Defaults
    units: "metric",
    timeFormat: "12h",
    theme: "dark",
    ituRegion: "ITU2",
    licenseClass: "GENERAL",
    activeRadioId: null,
    preferTestedSpecs: true,
    textScale: "md",
    bridgeEnabled: false,
    antennaType: "isotropic",
    noiseEnvironment: "residential",
    // Merge existing
    ...preferencesRaw,
    radios: Array.isArray(preferencesRaw.radios)
      ? [...preferencesRaw.radios]
      : [],
    customRadios: Array.isArray(preferencesRaw.customRadios)
      ? [...preferencesRaw.customRadios]
      : [],
  };

  // v0-v6: Migrate legacy radio format
  if (version <= 6) {
    const incoming = nextPreferences.radios as unknown[];
    if (incoming.some((r) => isLegacyRadio(r))) {
      const legacy = incoming.filter(isLegacyRadio);
      const uniqueByEquipment = new Map<string, LegacyRadio>();
      for (const r of legacy) {
        if (!uniqueByEquipment.has(r.radioId)) {
          uniqueByEquipment.set(r.radioId, r);
        }
      }
      nextPreferences.radios = Array.from(uniqueByEquipment.values()).map((r) =>
        createRadioInstance({
          equipmentId: r.radioId,
          nickname: r.nickname,
          customPowerLimit: r.customPowerLimit,
          addedAt: r.addedAt,
        }),
      );
    } else if (incoming.every(isUserRadioShape)) {
      nextPreferences.radios = incoming;
    } else {
      nextPreferences.radios = [];
    }

    // Normalize activeRadioId
    const active = preferencesRaw.activeRadioId;
    if (typeof active === "string" && active.trim()) {
      const byId = (nextPreferences.radios as UserRadioShape[]).find(
        (r) => r.id === active,
      );
      if (byId) {
        nextPreferences.activeRadioId = byId.id;
      } else {
        const byEquipment = (nextPreferences.radios as UserRadioShape[]).find(
          (r) => r.equipmentId === active,
        );
        if (byEquipment) {
          nextPreferences.activeRadioId = byEquipment.id;
        } else {
          const hasEquipment =
            (nextPreferences.customRadios ?? []).some(
              (r: { id: string }) => r.id === active,
            ) || Boolean(getRadioById(active));
          if (
            hasEquipment &&
            (nextPreferences.radios as UserRadioShape[]).length < MAX_RADIOS
          ) {
            const instance = createRadioInstance({ equipmentId: active });
            nextPreferences.radios = [
              ...(nextPreferences.radios as UserRadioShape[]),
              instance,
            ];
            nextPreferences.activeRadioId = instance.id;
          } else {
            nextPreferences.activeRadioId = null;
          }
        }
      }
    } else {
      nextPreferences.activeRadioId = null;
    }

    if (
      !nextPreferences.activeRadioId &&
      (nextPreferences.radios as UserRadioShape[]).length === 1
    ) {
      nextPreferences.activeRadioId = (
        nextPreferences.radios as UserRadioShape[]
      )[0].id;
    }
  }

  // Harden radios array
  let normalizedRadios = Array.isArray(nextPreferences.radios)
    ? (nextPreferences.radios as unknown[]).filter(isUserRadioShape)
    : [];
  nextPreferences.radios = normalizedRadios;

  if (
    typeof nextPreferences.activeRadioId === "string" &&
    nextPreferences.activeRadioId.trim()
  ) {
    const activeId = nextPreferences.activeRadioId;
    if (!normalizedRadios.some((r) => r.id === activeId)) {
      const byEquipment = normalizedRadios.find(
        (r) => r.equipmentId === activeId,
      );
      if (byEquipment) {
        nextPreferences.activeRadioId = byEquipment.id;
      } else {
        const hasEquipment =
          (nextPreferences.customRadios ?? []).some(
            (r: { id: string }) => r.id === activeId,
          ) || Boolean(getRadioById(activeId));
        if (hasEquipment && normalizedRadios.length < MAX_RADIOS) {
          const instance = createRadioInstance({ equipmentId: activeId });
          normalizedRadios = [...normalizedRadios, instance];
          nextPreferences.radios = normalizedRadios;
          nextPreferences.activeRadioId = instance.id;
        } else {
          nextPreferences.activeRadioId = null;
        }
      }
    }
  }

  if (!nextPreferences.activeRadioId && normalizedRadios.length === 1) {
    nextPreferences.activeRadioId = normalizedRadios[0].id;
  }

  // v8→v9: Multi-location + structured license
  let migratedStation = state.station ?? null;

  if (version <= 8 && migratedStation) {
    const legacy = migratedStation as Record<string, any>;

    if (!legacy.homeLocationId || !Array.isArray(legacy.savedLocations)) {
      const homeLocationId = crypto.randomUUID();
      const homeLocation: OperatingLocation = {
        id: homeLocationId,
        name: legacy.name || "Home",
        grid: legacy.grid || "",
        lat: legacy.lat ?? 0,
        lon: legacy.lon ?? 0,
        timezone: legacy.timezone,
        type: "home",
        createdAt: new Date().toISOString(),
      };

      migratedStation = {
        callsign: legacy.callsign,
        homeLocationId,
        activeLocationId: null,
        savedLocations: [homeLocation],
        operatorName: legacy.operatorName || legacy.name,
        grid: homeLocation.grid,
        lat: homeLocation.lat,
        lon: homeLocation.lon,
        timezone: homeLocation.timezone,
        name: legacy.name,
      };
    }

    if (nextPreferences.licenseClass && !nextPreferences.license) {
      nextPreferences.license = {
        country: "US",
        class: nextPreferences.licenseClass,
        expirationDate: null,
      };
    }
  }

  // Initialize missing preference fields
  if (!nextPreferences.favoredBands)
    nextPreferences.favoredBands = DEFAULT_FAVORED_BANDS;
  if (!nextPreferences.notifications)
    nextPreferences.notifications = DEFAULT_NOTIFICATION_PREFERENCES;
  if (!nextPreferences.spotClustering)
    nextPreferences.spotClustering = DEFAULT_SPOT_CLUSTERING;
  if (!nextPreferences.compassRose)
    nextPreferences.compassRose = DEFAULT_COMPASS_ROSE;
  if (!nextPreferences.spotAge) nextPreferences.spotAge = DEFAULT_SPOT_AGE;
  if (!nextPreferences.watchAlerts)
    nextPreferences.watchAlerts = DEFAULT_WATCH_ALERT_PREFERENCES;
  if (!nextPreferences.bandPresets) nextPreferences.bandPresets = [];

  // v9→v10: Standardize on metric units
  if (nextPreferences.units !== "metric") nextPreferences.units = "metric";

  // v10→v11: Forecast display preferences
  if (!nextPreferences.forecastDisplay)
    nextPreferences.forecastDisplay = DEFAULT_FORECAST_DISPLAY;

  // v11→v12: Bridge disabled by default
  if (nextPreferences.bridgeEnabled === undefined)
    nextPreferences.bridgeEnabled = false;

  // v12→v13: Antenna type preference
  if (!nextPreferences.antennaType) nextPreferences.antennaType = "isotropic";

  // v13→v14: Noise environment preference
  if (!nextPreferences.noiseEnvironment)
    nextPreferences.noiseEnvironment = "residential";

  return {
    station: migratedStation,
    preferences: nextPreferences,
    savedTargets: Array.isArray(state.savedTargets) ? state.savedTargets : [],
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ─── Main migration function ────────────────────────────────────────────────

export function runStoreDecompositionMigration(): void {
  // 1. Idempotent: bail if already migrated
  if (localStorage.getItem(PROFILE_KEY)) return;

  // 2. Read legacy store
  const raw = localStorage.getItem(LEGACY_KEY);
  if (!raw) return;

  let parsed: { state: Record<string, unknown>; version: number };
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.warn(
      "[propulse] Skipping migration: corrupted localStorage for propulse-user",
      e,
    );
    return;
  }

  if (!parsed.state) return;

  // 3. Run legacy migration chain if needed
  if (typeof parsed.version === "number" && parsed.version < 14) {
    parsed.state = legacyMigrateToV14(
      parsed.state as Record<string, unknown>,
      parsed.version,
    );
    parsed.version = 14;
  }

  // Proceed from v14, or re-extract from v15+ if new stores were cleared
  if (parsed.version !== 14 && parsed.version !== 15) return;

  const { station, preferences, savedTargets } = parsed.state as {
    station: unknown;
    preferences: Record<string, unknown> | undefined;
    savedTargets: unknown[];
  };

  // 4. Extract profile data
  const profileState = {
    station: station ?? null,
    savedTargets: Array.isArray(savedTargets) ? savedTargets : [],
    serviceCredentials: {},
    license: preferences?.license ?? undefined,
  };

  // 5. Extract settings (everything from preferences except shack + license)
  const settingsState: Record<string, unknown> = {};
  if (preferences && typeof preferences === "object") {
    const shackKeys = new Set([
      "radios",
      "customRadios",
      "activeRadioId",
      "license",
    ]);
    for (const [key, value] of Object.entries(preferences)) {
      if (!shackKeys.has(key)) {
        settingsState[key] = value;
      }
    }
  }

  // 6. Extract shack data
  const shackState = {
    radios: Array.isArray(preferences?.radios) ? preferences!.radios : [],
    customRadios: Array.isArray(preferences?.customRadios)
      ? preferences!.customRadios
      : [],
    activeRadioId: preferences?.activeRadioId ?? null,
    antennas: [],
    feedlines: [],
    accessories: [],
    stationPresets: [],
  };

  // 7. Write to new keys in Zustand persist format
  localStorage.setItem(
    PROFILE_KEY,
    JSON.stringify({ state: profileState, version: 1 }),
  );
  localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({ state: settingsState, version: 1 }),
  );
  localStorage.setItem(
    SHACK_KEY,
    JSON.stringify({ state: shackState, version: 1 }),
  );

  // 8. Mark legacy store as migrated
  parsed.version = 15;
  (parsed.state as Record<string, unknown>)._migrated = true;
  localStorage.setItem(LEGACY_KEY, JSON.stringify(parsed));
}
