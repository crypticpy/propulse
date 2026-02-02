/**
 * Zustand store for user preferences and station configuration
 * Persists to localStorage with key 'propulse-user'
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  UserStation,
  UserPreferences,
  ITURegion,
  LicenseClass,
  OperatingLocation,
  LicenseInfo,
  FavoredBands,
  BandId,
  NotificationPreferences,
} from "../types/user";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  DEFAULT_FAVORED_BANDS,
} from "../types/user";
import type {
  UserRadio,
  LegacyUserRadio,
  RadioEquipment,
} from "../types/radio";
import { getRadioById } from "../lib/data/radios";

/**
 * Saved target location for quick access
 */
export interface SavedTarget {
  id: string;
  name: string;
  lat: number;
  lon: number;
  grid?: string;
  createdAt: string;
}

/**
 * Credentials for QSL confirmation services
 */
export interface ServiceCredentials {
  eqsl?: { username: string; password: string };
  clublog?: { email: string; password: string; callsign: string };
  qrz?: { apiKey: string };
  lotw?: { enabled: boolean };
}

/** Maximum number of saved targets allowed */
const MAX_SAVED_TARGETS = 10;

/** Maximum number of radios allowed */
const MAX_RADIOS = 10;

/**
 * User store state and actions
 */
interface UserStore {
  /** Current station configuration, null if not set up */
  station: UserStation | null;
  /** User preferences for display and behavior */
  preferences: Omit<UserPreferences, "station">;
  /** Saved target locations for quick access (max 10) */
  savedTargets: SavedTarget[];
  /** Credentials for QSL services (eQSL, Club Log, etc.) */
  serviceCredentials: ServiceCredentials;
  /** Set or clear the station configuration */
  setStation: (station: UserStation | null) => void;
  /** Update service credentials */
  setServiceCredentials: (creds: Partial<ServiceCredentials>) => void;
  /** Partially update user preferences */
  updatePreferences: (prefs: Partial<Omit<UserPreferences, "station">>) => void;
  /** Reset all preferences to defaults */
  resetPreferences: () => void;
  /** Add a new saved target (max 10, oldest removed if full) */
  addTarget: (target: Omit<SavedTarget, "id" | "createdAt">) => void;
  /** Remove a saved target by ID */
  removeTarget: (id: string) => void;
  /** Clear all saved targets */
  clearTargets: () => void;
  /** Set ITU region for band plan compliance */
  setITURegion: (region: ITURegion) => void;
  /** Set license class for privilege checks */
  setLicenseClass: (licenseClass: LicenseClass) => void;
  /**
   * Add a radio equipment item to the user's collection.
   * Returns the user radio instance ID (existing or newly created), or null if not added.
   */
  addRadio: (radioId: string, nickname?: string) => string | null;
  /**
   * Add a new user-owned radio instance (allows multiple of the same model).
   * Returns the new instance ID, or null if not added.
   */
  addRadioInstance: (radioId: string, nickname?: string) => string | null;
  /** Update a user-owned radio instance */
  updateRadioInstance: (
    id: string,
    updates: Partial<Omit<UserRadio, "id" | "equipmentId" | "addedAt">>,
  ) => { ok: true } | { ok: false; error: string };
  /** Add a custom radio equipment definition (returns false if duplicate name) */
  addCustomRadio: (radio: Omit<RadioEquipment, "id">) =>
    | {
        ok: true;
        id: string;
      }
    | { ok: false; error: string };
  /** Update a custom radio equipment definition */
  updateCustomRadio: (
    id: string,
    updates: Partial<Omit<RadioEquipment, "id">>,
  ) => { ok: true } | { ok: false; error: string };
  /** Remove a custom radio equipment definition */
  removeCustomRadio: (id: string) => void;
  /** Remove a radio from the user's collection */
  removeRadio: (radioId: string) => void;
  /** Set the active radio */
  setActiveRadio: (radioId: string | null) => void;
  /** Get the active radio equipment details */
  getActiveRadio: () => RadioEquipment | null;

  // === Location Management ===

  /** Add a new operating location, returns the new location ID */
  addLocation: (
    location: Omit<OperatingLocation, "id" | "createdAt">,
  ) => string;
  /** Update an existing operating location */
  updateLocation: (
    id: string,
    updates: Partial<Omit<OperatingLocation, "id" | "createdAt">>,
  ) => void;
  /** Remove an operating location by ID */
  removeLocation: (id: string) => void;
  /** Set the active location (null = use home) */
  setActiveLocation: (id: string | null) => void;
  /** Quick-set a temporary location, returns the new location ID */
  setTemporaryLocation: (
    grid: string,
    lat: number,
    lon: number,
    name?: string,
  ) => string;
  /** Clear temporary location (set activeLocationId to null) */
  clearTemporaryLocation: () => void;

  // === License Management ===

  /** Set license information (or clear with null) */
  setLicense: (license: LicenseInfo | null) => void;

  // === Favorites & Notifications ===

  /** Set favored bands configuration */
  setFavoredBands: (bands: FavoredBands) => void;
  /** Toggle a band in/out of primary favorites */
  toggleFavoredBand: (band: BandId) => void;
  /** Toggle a band in/out of hidden list */
  toggleHiddenBand: (band: BandId) => void;
  /** Update notification preferences */
  updateNotifications: (prefs: Partial<NotificationPreferences>) => void;
}

/**
 * Default preference values
 */
const defaultPreferences: Omit<UserPreferences, "station"> = {
  units: "imperial",
  timeFormat: "12h",
  theme: "dark",
  ituRegion: "ITU2",
  licenseClass: "GENERAL",
  radios: [],
  customRadios: [],
  activeRadioId: null,
  preferTestedSpecs: true, // Default to tested/Sherwood specs when available
  textScale: "md", // Default text scale (100%)
  license: undefined,
  favoredBands: DEFAULT_FAVORED_BANDS,
  notifications: DEFAULT_NOTIFICATION_PREFERENCES,
};

function isLegacyUserRadio(value: unknown): value is LegacyUserRadio {
  return (
    typeof value === "object" &&
    value !== null &&
    "radioId" in value &&
    typeof (value as { radioId: unknown }).radioId === "string"
  );
}

function isUserRadio(value: unknown): value is UserRadio {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "equipmentId" in value &&
    typeof (value as { id: unknown }).id === "string" &&
    typeof (value as { equipmentId: unknown }).equipmentId === "string"
  );
}

function createUserRadioInstance(params: {
  equipmentId: string;
  nickname?: string;
  customPowerLimit?: number;
  addedAt?: string;
}): UserRadio {
  return {
    id: crypto.randomUUID(),
    equipmentId: params.equipmentId,
    nickname: params.nickname,
    customPowerLimit: params.customPowerLimit,
    addedAt: params.addedAt ?? new Date().toISOString(),
  };
}

/**
 * User preferences store with localStorage persistence
 *
 * @example
 * ```tsx
 * const { station, setStation } = useUserStore();
 *
 * // Set user's station
 * setStation({
 *   callsign: 'N5XXX',
 *   grid: 'EM10fp',
 *   lat: 30.2672,
 *   lon: -97.7431,
 *   name: 'Home'
 * });
 *
 * // Update preferences
 * updatePreferences({ theme: 'light', timeFormat: '24h' });
 * ```
 */
export const useUserStore = create<UserStore>()(
  persist(
    (set) => ({
      station: null,
      preferences: defaultPreferences,
      savedTargets: [],
      serviceCredentials: {},

      setStation: (station) => set({ station }),

      setServiceCredentials: (creds) =>
        set((state) => {
          const serviceCredentials: ServiceCredentials = {
            ...state.serviceCredentials,
          };

          for (const key of Object.keys(creds) as Array<
            keyof ServiceCredentials
          >) {
            const incoming = creds[key];
            if (incoming === undefined) {
              serviceCredentials[key] = undefined;
              continue;
            }

            const previous = state.serviceCredentials[key];
            serviceCredentials[key] = {
              ...(previous ? (previous as Record<string, unknown>) : {}),
              ...(incoming as Record<string, unknown>),
            } as never;
          }

          return { serviceCredentials };
        }),

      updatePreferences: (prefs) =>
        set((state) => ({
          preferences: { ...state.preferences, ...prefs },
        })),

      resetPreferences: () =>
        set({
          station: null,
          preferences: defaultPreferences,
          savedTargets: [],
        }),

      addTarget: (target) =>
        set((state) => {
          const newTarget: SavedTarget = {
            ...target,
            id: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
          };
          // Add to beginning, enforce max limit by removing oldest
          const updated = [newTarget, ...state.savedTargets];
          if (updated.length > MAX_SAVED_TARGETS) {
            updated.pop();
          }
          return { savedTargets: updated };
        }),

      removeTarget: (id) =>
        set((state) => ({
          savedTargets: state.savedTargets.filter((t) => t.id !== id),
        })),

      clearTargets: () => set({ savedTargets: [] }),

      setITURegion: (region) =>
        set((state) => ({
          preferences: { ...state.preferences, ituRegion: region },
        })),

      setLicenseClass: (licenseClass) =>
        set((state) => ({
          preferences: { ...state.preferences, licenseClass },
        })),

      addRadio: (radioId, nickname) => {
        let instanceId: string | null = null;

        set((state) => {
          const currentRadios = state.preferences.radios || [];
          const existing = currentRadios.find((r) => r.equipmentId === radioId);
          if (existing) {
            instanceId = existing.id;
            return state;
          }

          // Enforce max limit
          if (currentRadios.length >= MAX_RADIOS) {
            return state;
          }

          const newRadio = createUserRadioInstance({
            equipmentId: radioId,
            nickname,
          });
          instanceId = newRadio.id;

          const updatedRadios = [...currentRadios, newRadio];
          // If this is the first radio, make it active
          const activeRadioId =
            state.preferences.activeRadioId ||
            (updatedRadios.length === 1 ? newRadio.id : null);

          return {
            preferences: {
              ...state.preferences,
              radios: updatedRadios,
              activeRadioId,
            },
          };
        });

        return instanceId;
      },

      addRadioInstance: (radioId, nickname) => {
        let instanceId: string | null = null;

        set((state) => {
          const currentRadios = state.preferences.radios || [];
          if (currentRadios.length >= MAX_RADIOS) return state;

          const newRadio = createUserRadioInstance({
            equipmentId: radioId,
            nickname,
          });
          instanceId = newRadio.id;

          const updatedRadios = [...currentRadios, newRadio];
          const activeRadioId = state.preferences.activeRadioId || newRadio.id;

          return {
            preferences: {
              ...state.preferences,
              radios: updatedRadios,
              activeRadioId,
            },
          };
        });

        return instanceId;
      },

      updateRadioInstance: (id, updates) => {
        let result: { ok: true } | { ok: false; error: string } = { ok: true };

        set((state) => {
          const currentRadios = state.preferences.radios || [];
          const idx = currentRadios.findIndex((r) => r.id === id);
          if (idx === -1) {
            result = { ok: false, error: "Radio instance not found" };
            return state;
          }

          if (
            typeof updates.customPowerLimit === "number" &&
            (!Number.isFinite(updates.customPowerLimit) ||
              updates.customPowerLimit <= 0)
          ) {
            result = {
              ok: false,
              error: "Power limit must be a positive number",
            };
            return state;
          }

          const next = currentRadios.map((r, i) =>
            i === idx ? { ...r, ...updates } : r,
          );

          return {
            preferences: {
              ...state.preferences,
              radios: next,
            },
          };
        });

        return result;
      },

      addCustomRadio: (radio) => {
        const id = `custom-${crypto.randomUUID()}`;
        const displayName = radio.displayName?.trim();
        if (!displayName) {
          return { ok: false, error: "Custom radio name is required" };
        }

        let result: { ok: true; id: string } | { ok: false; error: string } = {
          ok: true,
          id,
        };

        set((state) => {
          const existing = state.preferences.customRadios || [];
          const normalized = displayName.toLowerCase();
          const hasDuplicate = existing.some(
            (r) => (r.displayName || "").trim().toLowerCase() === normalized,
          );
          if (hasDuplicate) {
            result = {
              ok: false,
              error: `A custom radio named "${displayName}" already exists`,
            };
            return state;
          }

          const nextCustom = [
            ...existing,
            {
              ...radio,
              id,
              displayName,
            },
          ];

          return {
            preferences: {
              ...state.preferences,
              customRadios: nextCustom,
            },
          };
        });

        return result;
      },

      updateCustomRadio: (id, updates) => {
        let result: { ok: true } | { ok: false; error: string } = { ok: true };

        set((state) => {
          const existing = state.preferences.customRadios || [];
          const idx = existing.findIndex((r) => r.id === id);
          if (idx === -1) {
            result = { ok: false, error: "Custom radio not found" };
            return state;
          }

          const nextDisplayName =
            typeof updates.displayName === "string"
              ? updates.displayName.trim()
              : existing[idx].displayName;

          if (!nextDisplayName) {
            result = { ok: false, error: "Custom radio name is required" };
            return state;
          }

          const normalized = nextDisplayName.toLowerCase();
          const hasDuplicate = existing.some(
            (r, i) =>
              i !== idx &&
              (r.displayName || "").trim().toLowerCase() === normalized,
          );
          if (hasDuplicate) {
            result = {
              ok: false,
              error: `A custom radio named "${nextDisplayName}" already exists`,
            };
            return state;
          }

          const nextCustom = existing.map((r, i) =>
            i === idx ? { ...r, ...updates, displayName: nextDisplayName } : r,
          );

          return {
            preferences: {
              ...state.preferences,
              customRadios: nextCustom,
            },
          };
        });

        return result;
      },

      removeCustomRadio: (id) =>
        set((state) => {
          const existing = state.preferences.customRadios || [];
          const nextCustom = existing.filter((r) => r.id !== id);

          const currentRadios = state.preferences.radios || [];
          const updatedRadios = currentRadios.filter(
            (r) => r.equipmentId !== id,
          );
          const currentActiveId = state.preferences.activeRadioId;
          const activeRadioId =
            currentActiveId &&
            updatedRadios.some((r) => r.id === currentActiveId)
              ? currentActiveId
              : updatedRadios.length > 0
                ? updatedRadios[0].id
                : null;

          return {
            preferences: {
              ...state.preferences,
              customRadios: nextCustom,
              radios: updatedRadios,
              activeRadioId,
            },
          };
        }),

      removeRadio: (radioId) =>
        set((state) => {
          const currentRadios = state.preferences.radios || [];
          const updatedRadios = currentRadios.filter((r) => r.id !== radioId);
          // If we removed the active radio, select the first available
          const activeRadioId =
            state.preferences.activeRadioId === radioId
              ? updatedRadios.length > 0
                ? updatedRadios[0].id
                : null
              : state.preferences.activeRadioId;
          return {
            preferences: {
              ...state.preferences,
              radios: updatedRadios,
              activeRadioId,
            },
          };
        }),

      setActiveRadio: (radioId) =>
        set((state) => ({
          preferences: { ...state.preferences, activeRadioId: radioId },
        })),

      getActiveRadio: () => {
        // Note: This returns null as a placeholder. Use the useActiveRadio hook instead.
        return null;
      },

      // === Location Management ===

      addLocation: (location) => {
        const id = crypto.randomUUID();
        const newLocation: OperatingLocation = {
          ...location,
          id,
          createdAt: new Date().toISOString(),
        };

        set((state) => {
          if (!state.station) return state;

          const savedLocations = [...state.station.savedLocations, newLocation];

          return {
            station: {
              ...state.station,
              savedLocations,
            },
          };
        });

        return id;
      },

      updateLocation: (id, updates) =>
        set((state) => {
          if (!state.station) return state;

          const savedLocations = state.station.savedLocations.map((loc) =>
            loc.id === id ? { ...loc, ...updates } : loc,
          );

          // Find the updated location to sync legacy fields if it's active
          const activeId =
            state.station.activeLocationId ?? state.station.homeLocationId;
          const updatedLocation = savedLocations.find((loc) => loc.id === id);

          // If the updated location is the active one, sync legacy fields
          if (updatedLocation && id === activeId) {
            return {
              station: {
                ...state.station,
                savedLocations,
                grid: updatedLocation.grid,
                lat: updatedLocation.lat,
                lon: updatedLocation.lon,
                timezone: updatedLocation.timezone,
              },
            };
          }

          return {
            station: {
              ...state.station,
              savedLocations,
            },
          };
        }),

      removeLocation: (id) =>
        set((state) => {
          if (!state.station) return state;

          // Don't allow removing the home location
          if (id === state.station.homeLocationId) return state;

          const savedLocations = state.station.savedLocations.filter(
            (loc) => loc.id !== id,
          );

          // If we're removing the active location, clear activeLocationId
          const activeLocationId =
            state.station.activeLocationId === id
              ? null
              : state.station.activeLocationId;

          // If activeLocationId changed, sync legacy fields to home
          if (
            state.station.activeLocationId === id &&
            activeLocationId === null
          ) {
            const homeLocation = savedLocations.find(
              (loc) => loc.id === state.station!.homeLocationId,
            );
            if (homeLocation) {
              return {
                station: {
                  ...state.station,
                  savedLocations,
                  activeLocationId,
                  grid: homeLocation.grid,
                  lat: homeLocation.lat,
                  lon: homeLocation.lon,
                  timezone: homeLocation.timezone,
                },
              };
            }
          }

          return {
            station: {
              ...state.station,
              savedLocations,
              activeLocationId,
            },
          };
        }),

      setActiveLocation: (id) =>
        set((state) => {
          if (!state.station) return state;

          const targetId = id ?? state.station.homeLocationId;
          const location = state.station.savedLocations.find(
            (loc) => loc.id === targetId,
          );

          if (!location) return state;

          return {
            station: {
              ...state.station,
              activeLocationId: id,
              // Sync legacy fields
              grid: location.grid,
              lat: location.lat,
              lon: location.lon,
              timezone: location.timezone,
            },
          };
        }),

      setTemporaryLocation: (grid, lat, lon, name) => {
        const id = crypto.randomUUID();
        const newLocation: OperatingLocation = {
          id,
          name: name ?? "Temporary",
          grid,
          lat,
          lon,
          type: "portable",
          createdAt: new Date().toISOString(),
        };

        set((state) => {
          if (!state.station) return state;

          const savedLocations = [...state.station.savedLocations, newLocation];

          return {
            station: {
              ...state.station,
              savedLocations,
              activeLocationId: id,
              // Sync legacy fields
              grid,
              lat,
              lon,
            },
          };
        });

        return id;
      },

      clearTemporaryLocation: () =>
        set((state) => {
          if (!state.station) return state;

          const homeLocation = state.station.savedLocations.find(
            (loc) => loc.id === state.station!.homeLocationId,
          );

          if (!homeLocation) return state;

          return {
            station: {
              ...state.station,
              activeLocationId: null,
              // Sync legacy fields to home
              grid: homeLocation.grid,
              lat: homeLocation.lat,
              lon: homeLocation.lon,
              timezone: homeLocation.timezone,
            },
          };
        }),

      // === License Management ===

      setLicense: (license) =>
        set((state) => ({
          preferences: {
            ...state.preferences,
            license: license ?? undefined,
            // Also update legacy licenseClass for backward compatibility
            licenseClass: license?.class ?? state.preferences.licenseClass,
          },
        })),

      // === Favorites & Notifications ===

      setFavoredBands: (bands) =>
        set((state) => ({
          preferences: {
            ...state.preferences,
            favoredBands: bands,
          },
        })),

      toggleFavoredBand: (band) =>
        set((state) => {
          const current =
            state.preferences.favoredBands ?? DEFAULT_FAVORED_BANDS;
          const isPrimary = current.primary.includes(band);

          const primary = isPrimary
            ? current.primary.filter((b) => b !== band)
            : [...current.primary, band];

          // If adding to primary, remove from hidden
          const hidden = isPrimary
            ? current.hidden
            : current.hidden.filter((b) => b !== band);

          return {
            preferences: {
              ...state.preferences,
              favoredBands: { primary, hidden },
            },
          };
        }),

      toggleHiddenBand: (band) =>
        set((state) => {
          const current =
            state.preferences.favoredBands ?? DEFAULT_FAVORED_BANDS;
          const isHidden = current.hidden.includes(band);

          const hidden = isHidden
            ? current.hidden.filter((b) => b !== band)
            : [...current.hidden, band];

          // If adding to hidden, remove from primary
          const primary = isHidden
            ? current.primary
            : current.primary.filter((b) => b !== band);

          return {
            preferences: {
              ...state.preferences,
              favoredBands: { primary, hidden },
            },
          };
        }),

      updateNotifications: (prefs) =>
        set((state) => ({
          preferences: {
            ...state.preferences,
            notifications: {
              ...(state.preferences.notifications ??
                DEFAULT_NOTIFICATION_PREFERENCES),
              ...prefs,
            },
          },
        })),
    }),
    {
      name: "propulse-user",
      version: 9,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        station: state.station,
        preferences: state.preferences,
        savedTargets: state.savedTargets,
        // NOTE: serviceCredentials intentionally NOT persisted for security
        // Credentials remain in-memory only and must be re-entered each session
      }),
      migrate: (persistedState, version) => {
        const state = persistedState as Partial<
          Pick<UserStore, "station" | "preferences" | "savedTargets">
        >;

        const preferencesRaw = (state.preferences || {}) as Partial<
          Omit<UserPreferences, "station">
        >;

        const nextPreferences: Omit<UserPreferences, "station"> = {
          ...defaultPreferences,
          ...preferencesRaw,
          radios: Array.isArray(preferencesRaw.radios)
            ? [...preferencesRaw.radios]
            : [],
          customRadios: Array.isArray(preferencesRaw.customRadios)
            ? [...preferencesRaw.customRadios]
            : [],
        };

        if (version <= 6) {
          // v6 and earlier stored radios as { radioId, ... } (equipment IDs)
          const incoming = nextPreferences.radios as unknown[];
          if (incoming.some((r) => isLegacyUserRadio(r))) {
            const legacy = incoming.filter(isLegacyUserRadio);
            const uniqueByEquipment = new Map<string, LegacyUserRadio>();
            for (const r of legacy) {
              if (!uniqueByEquipment.has(r.radioId))
                uniqueByEquipment.set(r.radioId, r);
            }
            nextPreferences.radios = Array.from(uniqueByEquipment.values()).map(
              (r) =>
                createUserRadioInstance({
                  equipmentId: r.radioId,
                  nickname: r.nickname,
                  customPowerLimit: r.customPowerLimit,
                  addedAt: r.addedAt,
                }),
            );
          } else if (incoming.every(isUserRadio)) {
            nextPreferences.radios = incoming as UserRadio[];
          } else {
            nextPreferences.radios = [];
          }

          // Normalize activeRadioId from equipment ID -> instance ID if needed
          const active = preferencesRaw.activeRadioId;
          if (typeof active === "string" && active.trim()) {
            const byId = (nextPreferences.radios as UserRadio[]).find(
              (r) => r.id === active,
            );
            if (byId) {
              nextPreferences.activeRadioId = byId.id;
            } else {
              const byEquipment = (nextPreferences.radios as UserRadio[]).find(
                (r) => r.equipmentId === active,
              );
              if (byEquipment) {
                nextPreferences.activeRadioId = byEquipment.id;
              } else {
                const hasEquipment =
                  (nextPreferences.customRadios ?? []).some(
                    (r) => r.id === active,
                  ) || Boolean(getRadioById(active));
                if (
                  hasEquipment &&
                  (nextPreferences.radios as UserRadio[]).length < MAX_RADIOS
                ) {
                  const instance = createUserRadioInstance({
                    equipmentId: active,
                  });
                  nextPreferences.radios = [
                    ...(nextPreferences.radios as UserRadio[]),
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
            (nextPreferences.radios as UserRadio[]).length === 1
          ) {
            nextPreferences.activeRadioId = (
              nextPreferences.radios as UserRadio[]
            )[0].id;
          }
        }

        // Hardening: ensure radios array matches the current shape, and normalize activeRadioId.
        let normalizedRadios = Array.isArray(nextPreferences.radios)
          ? (nextPreferences.radios as unknown[]).filter(isUserRadio)
          : [];
        nextPreferences.radios = normalizedRadios;

        if (
          typeof nextPreferences.activeRadioId === "string" &&
          nextPreferences.activeRadioId.trim()
        ) {
          const active = nextPreferences.activeRadioId;
          if (!normalizedRadios.some((r) => r.id === active)) {
            const byEquipment = normalizedRadios.find(
              (r) => r.equipmentId === active,
            );
            if (byEquipment) {
              nextPreferences.activeRadioId = byEquipment.id;
            } else {
              const hasEquipment =
                (nextPreferences.customRadios ?? []).some(
                  (r) => r.id === active,
                ) || Boolean(getRadioById(active));
              if (hasEquipment && normalizedRadios.length < MAX_RADIOS) {
                const instance = createUserRadioInstance({
                  equipmentId: active,
                });
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

        // v8 -> v9: Migrate to multi-location format and structured license
        let migratedStation = state.station ?? null;

        if (version <= 8 && migratedStation) {
          // Cast to legacy shape to access old fields
          const legacyStation = migratedStation as {
            callsign: string;
            grid?: string;
            lat?: number;
            lon?: number;
            timezone?: string;
            name?: string;
            operatorName?: string;
            homeLocationId?: string;
            savedLocations?: OperatingLocation[];
          };

          // Only migrate if not already in multi-location format
          if (
            !legacyStation.homeLocationId ||
            !Array.isArray(legacyStation.savedLocations)
          ) {
            const homeLocationId = crypto.randomUUID();
            const homeLocation: OperatingLocation = {
              id: homeLocationId,
              name: legacyStation.name || "Home",
              grid: legacyStation.grid || "",
              lat: legacyStation.lat ?? 0,
              lon: legacyStation.lon ?? 0,
              timezone: legacyStation.timezone,
              type: "home",
              createdAt: new Date().toISOString(),
            };

            migratedStation = {
              callsign: legacyStation.callsign,
              homeLocationId,
              activeLocationId: null,
              savedLocations: [homeLocation],
              operatorName: legacyStation.operatorName || legacyStation.name,
              // Legacy compatibility fields
              grid: homeLocation.grid,
              lat: homeLocation.lat,
              lon: homeLocation.lon,
              timezone: homeLocation.timezone,
              name: legacyStation.name,
            };
          }

          // Migrate licenseClass to structured license object
          if (nextPreferences.licenseClass && !nextPreferences.license) {
            nextPreferences.license = {
              country: "US", // Default to US for existing users
              class: nextPreferences.licenseClass,
              expirationDate: null,
            };
          }
        }

        // Initialize new preference fields with defaults if not present
        if (!nextPreferences.favoredBands) {
          nextPreferences.favoredBands = DEFAULT_FAVORED_BANDS;
        }
        if (!nextPreferences.notifications) {
          nextPreferences.notifications = DEFAULT_NOTIFICATION_PREFERENCES;
        }

        return {
          station: migratedStation,
          preferences: nextPreferences,
          savedTargets: Array.isArray(state.savedTargets)
            ? state.savedTargets
            : [],
        };
      },
    },
  ),
);

function resolveEquipmentById(
  id: string,
  customRadios: RadioEquipment[] | undefined,
): RadioEquipment | undefined {
  const custom = customRadios?.find((r) => r.id === id);
  return custom ?? getRadioById(id);
}

/**
 * Hook to get the active radio equipment details
 * Returns null if no radio is active or the radio isn't found
 */
export function useActiveRadio(): RadioEquipment | null {
  const activeRadioId = useUserStore(
    (state) => state.preferences.activeRadioId,
  );
  const radios = useUserStore((state) => state.preferences.radios) || [];
  const customRadios = useUserStore((state) => state.preferences.customRadios);
  if (!activeRadioId) return null;
  const activeInstance = radios.find((r) => r.id === activeRadioId);
  if (activeInstance) {
    return (
      resolveEquipmentById(activeInstance.equipmentId, customRadios) || null
    );
  }
  // Fallback for any legacy callers/data that still stores equipment IDs.
  return resolveEquipmentById(activeRadioId, customRadios) || null;
}

/**
 * Hook to get all user's radios with their equipment details
 */
export function useUserRadios(): Array<{
  userRadio: UserRadio;
  equipment: RadioEquipment | undefined;
}> {
  const radios = useUserStore((state) => state.preferences.radios) || [];
  const customRadios = useUserStore((state) => state.preferences.customRadios);
  return radios.map((userRadio) => ({
    userRadio,
    equipment: resolveEquipmentById(userRadio.equipmentId, customRadios),
  }));
}

/**
 * Hook to get the active user radio instance (metadata + per-radio overrides)
 */
export function useActiveUserRadio(): UserRadio | null {
  const activeRadioId = useUserStore(
    (state) => state.preferences.activeRadioId,
  );
  const radios = useUserStore((state) => state.preferences.radios) || [];
  if (!activeRadioId) return null;
  return radios.find((r) => r.id === activeRadioId) ?? null;
}

/**
 * Hook to get whether user prefers tested (Sherwood) specs over factory specs
 */
export function usePreferTestedSpecs(): boolean {
  return useUserStore((state) => state.preferences.preferTestedSpecs ?? true);
}
