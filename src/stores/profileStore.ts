/**
 * Zustand store for user profile, station, and saved targets
 * Decomposed from the monolithic userStore.ts
 * Persists to localStorage with key 'propulse-profile'
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  UserStation,
  OperatingLocation,
  LocationType,
  LicenseInfo,
  LicenseClass,
  SocialLink,
} from "@/types/user";
import type { VisibilitySettings } from "@/types/social";
import { DEFAULT_VISIBILITY } from "@/types/social";
import type {
  InterestTag,
  OnAirStatus,
  SkedAvailability,
  FavoriteFrequency,
} from "@/types/social";
import type { OperatorRank, RankPreferences, RankTier } from "@/types/rank";
import { DEFAULT_OPERATOR_RANK } from "@/types/rank";

import { useSettingsStore } from "./settingsStore";
import { deleteImage } from "@/lib/db/imageStore";
import { syncMeta } from "@/lib/sync/syncMeta";

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * A single entry in the license upgrade history timeline
 */
export interface LicenseHistoryEntry {
  id: string;
  date: string; // ISO date
  class: string; // license class at that point
  notes?: string;
}

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

// ─── Constants ───────────────────────────────────────────────────────────────

/** Maximum number of saved targets allowed */
const MAX_SAVED_TARGETS = 10;
/** Stable slot used by the quick travel-location control. */
export const CURRENT_LOCATION_ID = "current-location";

// ─── Store interface ─────────────────────────────────────────────────────────

interface ProfileStore {
  station: UserStation | null;
  savedTargets: SavedTarget[];
  serviceCredentials: ServiceCredentials;
  license: LicenseInfo | undefined;
  licenseHistory: LicenseHistoryEntry[];
  bio: string;
  profileImageUrl: string;
  /** UUID referencing a stored profile image in IndexedDB */
  profileImageId: string | undefined;
  lastIngestedCallsign: string;
  socialLinks: SocialLink[];
  visibilitySettings: VisibilitySettings;

  /** Whether the encrypted credential vault has been set up with a passphrase */
  credentialStoreSetup: boolean;
  /** Timestamp (epoch ms) of last credential vault unlock — ephemeral, not persisted */
  lastCredentialUnlock: number;

  /** Interest tags selected by the operator */
  interests: InterestTag[];
  /** On Air / Listening / Offline status */
  onAirStatus: OnAirStatus;
  /** Schedule availability for QSOs */
  skedAvailability: SkedAvailability;
  /** Favorite monitoring frequencies */
  favoriteFreqs: FavoriteFrequency[];

  setStation: (station: UserStation | null) => void;
  setBio: (bio: string) => void;
  setProfileImageUrl: (url: string) => void;
  setProfileImageId: (imageId: string | undefined) => void;
  setLastIngestedCallsign: (callsign: string) => void;
  setSocialLinks: (links: SocialLink[]) => void;

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
  setCurrentLocation: (location: {
    grid: string;
    lat: number;
    lon: number;
    timezone?: string;
  }) => void;
  clearTemporaryLocation: () => void;

  // Targets
  addTarget: (target: Omit<SavedTarget, "id" | "createdAt">) => void;
  removeTarget: (id: string) => void;
  clearTargets: () => void;

  // Credentials
  setServiceCredentials: (creds: Partial<ServiceCredentials>) => void;
  setCredentialStoreSetup: (isSetup: boolean) => void;
  setLastCredentialUnlock: (timestamp: number) => void;
  /** Migrate plaintext serviceCredentials to vault and clear them */
  clearPlaintextCredentials: () => void;

  // License
  setLicense: (license: LicenseInfo | null) => void;

  // Visibility
  setVisibilitySettings: (updates: Partial<VisibilitySettings>) => void;

  // Social / Profile V2
  setInterests: (tags: InterestTag[]) => void;
  setOnAirStatus: (status: OnAirStatus) => void;
  setSkedAvailability: (avail: SkedAvailability) => void;
  setFavoriteFreqs: (freqs: FavoriteFrequency[]) => void;
  addFavoriteFreq: (freq: Omit<FavoriteFrequency, "id">) => void;
  removeFavoriteFreq: (id: string) => void;

  // License history
  addLicenseHistoryEntry: (entry: LicenseHistoryEntry) => void;
  removeLicenseHistoryEntry: (id: string) => void;

  // Subscription (server-authoritative via Stripe webhook → Supabase → sync)
  subscriptionTier: "free" | "pro";
  subscriptionStatus:
    | "active"
    | "trialing"
    | "past_due"
    | "canceled"
    | "inactive";
  subscriptionPeriodEnd: string | null;
  setSubscriptionTier: (tier: "free" | "pro") => void;
  setSubscriptionStatus: (
    status: "active" | "trialing" | "past_due" | "canceled" | "inactive",
  ) => void;
  setSubscriptionPeriodEnd: (periodEnd: string | null) => void;

  // Rank system
  operatorRank: OperatorRank;
  lastLoginDate: string | null; // ISO date "YYYY-MM-DD"
  loginStreakDays: number;
  rankCelebrationSeen: string | null; // ISO timestamp of last seen celebration

  // Rank actions
  updateRankData: (updates: Partial<OperatorRank>) => void;
  setCardSignature: (signature: string) => void;
  setRankPreferences: (prefs: Partial<RankPreferences>) => void;
  setRankOverride: (rank: RankTier | null) => void;
  recordLogin: () => void;
  markCelebrationSeen: () => void;

  // QSO sync tracking
  /** ISO timestamp of last successful QSO sync */
  lastQsoSyncAt: string | undefined;
  /** Stable device identifier for multi-device sync */
  syncDeviceId: string | undefined;
  setLastQsoSyncAt: (ts: string) => void;
  setSyncDeviceId: (id: string) => void;
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const useProfileStore = create<ProfileStore>()(
  persist(
    (set) => ({
      station: null,
      savedTargets: [],
      serviceCredentials: {},
      credentialStoreSetup: false,
      lastCredentialUnlock: 0,
      license: undefined,
      licenseHistory: [],
      bio: "",
      profileImageUrl: "",
      profileImageId: undefined,
      lastIngestedCallsign: "",
      socialLinks: [],
      visibilitySettings: { ...DEFAULT_VISIBILITY },
      interests: [],
      onAirStatus: { status: "offline" as const },
      skedAvailability: "offline" as SkedAvailability,
      favoriteFreqs: [],
      subscriptionTier: "free" as const,
      subscriptionStatus: "inactive" as const,
      subscriptionPeriodEnd: null,
      setSubscriptionTier: (tier) => set({ subscriptionTier: tier }),
      setSubscriptionStatus: (status) => set({ subscriptionStatus: status }),
      setSubscriptionPeriodEnd: (periodEnd) =>
        set({ subscriptionPeriodEnd: periodEnd }),
      operatorRank: DEFAULT_OPERATOR_RANK,
      lastLoginDate: null,
      loginStreakDays: 0,
      rankCelebrationSeen: null,
      lastQsoSyncAt: undefined,
      syncDeviceId: undefined,

      setStation: (station) =>
        set((state) => {
          // Auto-generate social links when callsign changes
          if (
            station?.callsign &&
            station.callsign !== state.station?.callsign
          ) {
            const callsign = station.callsign.toUpperCase();
            const autoLinks: SocialLink[] = [
              {
                type: "qrz",
                url: `https://www.qrz.com/db/${callsign}`,
                autoGenerated: true,
              },
              {
                type: "hamqth",
                url: `https://www.hamqth.com/${callsign}`,
                autoGenerated: true,
              },
            ];
            // Keep user's manual links, replace auto-generated ones
            const manualLinks = state.socialLinks.filter(
              (l) => !l.autoGenerated,
            );
            return { station, socialLinks: [...autoLinks, ...manualLinks] };
          }
          return { station };
        }),

      setBio: (bio) => set({ bio }),
      setProfileImageUrl: (url) => set({ profileImageUrl: url }),
      setProfileImageId: (imageId) =>
        set((state) => {
          // Delete the old blob from IndexedDB if replacing or clearing
          if (state.profileImageId && state.profileImageId !== imageId) {
            deleteImage(state.profileImageId).catch(() => {
              /* best-effort cleanup */
            });
          }
          return { profileImageId: imageId };
        }),
      setLastIngestedCallsign: (callsign) =>
        set({ lastIngestedCallsign: callsign }),
      setSocialLinks: (links) => set({ socialLinks: links }),

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
            station: { ...state.station, savedLocations },
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

          const activeId =
            state.station.activeLocationId ?? state.station.homeLocationId;
          const updatedLocation = savedLocations.find((loc) => loc.id === id);

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

          return { station: { ...state.station, savedLocations } };
        }),

      removeLocation: (id) =>
        set((state) => {
          if (!state.station) return state;
          if (id === state.station.homeLocationId) return state;

          const savedLocations = state.station.savedLocations.filter(
            (loc) => loc.id !== id,
          );

          const activeLocationId =
            state.station.activeLocationId === id
              ? null
              : state.station.activeLocationId;

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
            station: { ...state.station, savedLocations, activeLocationId },
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
              grid: location.grid,
              lat: location.lat,
              lon: location.lon,
              timezone: location.timezone,
            },
          };
        }),

      setTemporaryLocation: (grid, lat, lon, name, type) => {
        const id = crypto.randomUUID();
        const newLocation: OperatingLocation = {
          id,
          name: name ?? "Temporary",
          grid,
          lat,
          lon,
          type: type ?? "portable",
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
              grid,
              lat,
              lon,
            },
          };
        });

        return id;
      },

      // A quick travel update owns one stable saved-location slot. Replacing
      // that slot avoids accumulating a new hidden location on every GPS fix,
      // while the independently configured home QTH remains untouched.
      setCurrentLocation: ({ grid, lat, lon, timezone }) =>
        set((state) => {
          if (!state.station) return state;

          const now = new Date().toISOString();
          const existingLocations = state.station.savedLocations ?? [];
          const savedHome = existingLocations.find(
            (location) => location.id === state.station!.homeLocationId,
          );
          const typedHome = existingLocations.find(
            (location) => location.type === "home",
          );

          // Older profiles can contain only the legacy station mirrors. Turn
          // that synthetic Home into a real saved location before switching
          // away so "Use Home QTH" always has an immutable target to restore.
          const materializedHomeId =
            savedHome?.id ??
            typedHome?.id ??
            (state.station.homeLocationId &&
            state.station.homeLocationId !== CURRENT_LOCATION_ID
              ? state.station.homeLocationId
              : "legacy-home");
          const materializedHome: OperatingLocation | null =
            savedHome || typedHome || !state.station.grid
              ? null
              : {
                  id: materializedHomeId,
                  name: "Home",
                  grid: state.station.grid,
                  lat: state.station.lat ?? 0,
                  lon: state.station.lon ?? 0,
                  timezone: state.station.timezone,
                  type: "home",
                  createdAt: now,
                };
          const baseLocations = materializedHome
            ? [materializedHome, ...existingLocations]
            : existingLocations;
          const previous = baseLocations.find(
            (location) => location.id === CURRENT_LOCATION_ID,
          );
          const currentLocation: OperatingLocation = {
            id: CURRENT_LOCATION_ID,
            name: "Current location",
            grid,
            lat,
            lon,
            timezone,
            type: "mobile",
            createdAt: previous?.createdAt ?? now,
          };
          const savedLocations = previous
            ? baseLocations.map((location) =>
                location.id === CURRENT_LOCATION_ID
                  ? currentLocation
                  : location,
              )
            : [...baseLocations, currentLocation];

          // The server table has no updated_at column, so retain an explicit
          // persisted dirty token. profileSync uses it to keep an offline GPS
          // or grid edit from being replaced by the older server row on boot.
          syncMeta.markLocationDirty(CURRENT_LOCATION_ID);

          return {
            station: {
              ...state.station,
              homeLocationId: materializedHomeId,
              savedLocations,
              activeLocationId: CURRENT_LOCATION_ID,
              // Keep the legacy mirrors current because many map and weather
              // consumers still read these fields through userStore.
              grid,
              lat,
              lon,
              timezone,
            },
          };
        }),

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
              grid: homeLocation.grid,
              lat: homeLocation.lat,
              lon: homeLocation.lon,
              timezone: homeLocation.timezone,
            },
          };
        }),

      // === Targets ===

      addTarget: (target) =>
        set((state) => {
          const newTarget: SavedTarget = {
            ...target,
            id: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
          };
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

      // === Credentials ===

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

      setCredentialStoreSetup: (isSetup) =>
        set({ credentialStoreSetup: isSetup }),
      setLastCredentialUnlock: (timestamp) =>
        set({ lastCredentialUnlock: timestamp }),
      clearPlaintextCredentials: () => set({ serviceCredentials: {} }),

      // === License ===

      setLicense: (license) =>
        set(() => {
          // Cross-store side effect: sync licenseClass to settingsStore
          const currentClass = useSettingsStore.getState().licenseClass;
          useSettingsStore
            .getState()
            .setLicenseClass(
              license?.class ?? currentClass ?? ("GENERAL" as LicenseClass),
            );

          return { license: license ?? undefined };
        }),

      // === Visibility ===

      setVisibilitySettings: (updates) =>
        set((state) => ({
          visibilitySettings: { ...state.visibilitySettings, ...updates },
        })),

      // === Social / Profile V2 ===

      setInterests: (tags) => set({ interests: tags }),
      setOnAirStatus: (status) => set({ onAirStatus: status }),
      setSkedAvailability: (avail) => set({ skedAvailability: avail }),
      setFavoriteFreqs: (freqs) => set({ favoriteFreqs: freqs }),
      addFavoriteFreq: (freq) =>
        set((state) => ({
          favoriteFreqs: [
            ...state.favoriteFreqs,
            { ...freq, id: crypto.randomUUID() },
          ],
        })),
      removeFavoriteFreq: (id) =>
        set((state) => ({
          favoriteFreqs: state.favoriteFreqs.filter((f) => f.id !== id),
        })),

      // === License History ===

      addLicenseHistoryEntry: (entry) =>
        set((state) => ({
          licenseHistory: [...state.licenseHistory, entry].slice(-10),
        })),

      removeLicenseHistoryEntry: (id) =>
        set((state) => ({
          licenseHistory: state.licenseHistory.filter((e) => e.id !== id),
        })),

      // === Rank System ===

      updateRankData: (updates) =>
        set((state) => {
          const changed = (Object.keys(updates) as Array<keyof OperatorRank>)
            .some((key) => !Object.is(state.operatorRank[key], updates[key]));
          return changed
            ? { operatorRank: { ...state.operatorRank, ...updates } }
            : state;
        }),

      setCardSignature: (signature) =>
        set((state) => ({
          operatorRank: {
            ...state.operatorRank,
            cardSignature: signature.slice(0, 40),
          },
        })),

      setRankPreferences: (prefs) =>
        set((state) => ({
          operatorRank: {
            ...state.operatorRank,
            preferences: { ...state.operatorRank.preferences, ...prefs },
          },
        })),

      setRankOverride: (rank) =>
        set((state) => ({
          operatorRank: {
            ...state.operatorRank,
            rankOverride: rank,
          },
        })),

      recordLogin: () =>
        set((state) => {
          const today = new Date().toISOString().split("T")[0];
          if (state.lastLoginDate === today) return state;

          let loginStreakDays = 1;
          if (state.lastLoginDate) {
            const lastDate = new Date(state.lastLoginDate + "T00:00:00");
            const todayDate = new Date(today + "T00:00:00");
            const diffMs = todayDate.getTime() - lastDate.getTime();
            const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
            if (diffDays === 1) {
              loginStreakDays = state.loginStreakDays + 1;
            }
          }

          return { lastLoginDate: today, loginStreakDays };
        }),

      markCelebrationSeen: () =>
        set((state) => {
          // A synced transition may be ahead of this device's clock. Consume
          // the event itself, so suppressing it survives reload without replay.
          const timestamps = [state.rankCelebrationSeen, state.operatorRank.rankHistory.at(-1)?.timestamp]
            .map((value) => value ? Date.parse(value) : Number.NaN)
            .filter(Number.isFinite);
          return { rankCelebrationSeen: new Date(Math.max(Date.now(), ...timestamps)).toISOString() };
        }),

      // === QSO Sync ===

      setLastQsoSyncAt: (ts) => set({ lastQsoSyncAt: ts }),
      setSyncDeviceId: (id) => set({ syncDeviceId: id }),
    }),
    {
      name: "propulse-profile",
      version: 12,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        station: state.station,
        savedTargets: state.savedTargets,
        license: state.license,
        licenseHistory: state.licenseHistory,
        bio: state.bio,
        profileImageUrl: state.profileImageUrl,
        profileImageId: state.profileImageId,
        lastIngestedCallsign: state.lastIngestedCallsign,
        socialLinks: state.socialLinks,
        // NOTE: serviceCredentials intentionally excluded — use credentialStore (encrypted IDB) instead
        // NOTE: lastCredentialUnlock is ephemeral — not persisted
        credentialStoreSetup: state.credentialStoreSetup,
        visibilitySettings: state.visibilitySettings,
        interests: state.interests,
        onAirStatus: state.onAirStatus,
        skedAvailability: state.skedAvailability,
        favoriteFreqs: state.favoriteFreqs,
        operatorRank: state.operatorRank,
        lastLoginDate: state.lastLoginDate,
        loginStreakDays: state.loginStreakDays,
        rankCelebrationSeen: state.rankCelebrationSeen,
        subscriptionTier: state.subscriptionTier,
        subscriptionStatus: state.subscriptionStatus,
        subscriptionPeriodEnd: state.subscriptionPeriodEnd,
        lastQsoSyncAt: state.lastQsoSyncAt,
        syncDeviceId: state.syncDeviceId,
      }),
      migrate: (persisted: unknown, version: number) => {
        const state = persisted as Record<string, unknown>;
        if (version < 2) {
          if (!("bio" in state)) state.bio = "";
          if (!("socialLinks" in state)) state.socialLinks = [];
        }
        if (version < 3) {
          if (!("licenseHistory" in state)) state.licenseHistory = [];
        }
        if (version < 4) {
          if (!("profileImageUrl" in state)) state.profileImageUrl = "";
          if (!("serviceCredentials" in state)) state.serviceCredentials = {};
        }
        if (version < 5) {
          if (!("visibilitySettings" in state))
            state.visibilitySettings = { ...DEFAULT_VISIBILITY };
        }
        if (version < 6) {
          if (!("profileImageId" in state)) state.profileImageId = undefined;
        }
        if (version < 7) {
          if (!("operatorRank" in state)) {
            state.operatorRank = {
              currentRank: "novice",
              rankPoints: 0,
              rankHistory: [],
              unlockedBackgrounds: ["schematic"],
              preferences: {
                selectedBackground: "schematic",
                enableParticles: true,
                enableSound: false,
                enableMouseTilt: true,
              },
            };
          }
          if (!("lastLoginDate" in state)) state.lastLoginDate = null;
          if (!("loginStreakDays" in state)) state.loginStreakDays = 0;
          if (!("rankCelebrationSeen" in state))
            state.rankCelebrationSeen = null;
        }
        if (version < 8) {
          if (!("subscriptionTier" in state)) state.subscriptionTier = "free";
        }
        if (version < 9) {
          if (!("subscriptionStatus" in state))
            state.subscriptionStatus = "inactive";
          if (!("subscriptionPeriodEnd" in state))
            state.subscriptionPeriodEnd = null;
        }
        if (version < 10) {
          state.interests = state.interests ?? [];
          state.onAirStatus = state.onAirStatus ?? { status: "offline" };
          state.skedAvailability = state.skedAvailability ?? "offline";
          state.favoriteFreqs = state.favoriteFreqs ?? [];
        }
        if (version < 11) {
          state.credentialStoreSetup = state.credentialStoreSetup ?? false;
        }
        if (version < 12) {
          state.lastQsoSyncAt = state.lastQsoSyncAt ?? undefined;
          state.syncDeviceId = state.syncDeviceId ?? undefined;
        }
        return state as unknown as ProfileStore;
      },
    },
  ),
);
