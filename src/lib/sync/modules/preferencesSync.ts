/**
 * Preferences sync module — Tier 1 (Eager)
 *
 * Syncs the `user_preferences` table (single JSONB blob per user).
 * The entire preferences object is stored as a `preferences` JSONB column.
 * A `version` column tracks the schema version.
 *
 * Consolidates preferences from multiple stores:
 * - settingsStore: units, bands, notifications, display prefs
 * - shackStore: radios, customRadios, activeRadioId (legacy compat)
 * - profileStore: license
 * - themeStore: theme ID, accent, custom colors
 * - mapStore: time scenarios, region presets, panel states, label options, map style
 * - dxStore: DX cluster filter prefs (bands, modes, maxAge, neededOnly, sortByNeeded)
 */

import { getSupabase } from "@/lib/supabase";
import { useSettingsStore } from "@/stores/settingsStore";
import { useShackStore } from "@/stores/shackStore";
import { useProfileStore } from "@/stores/profileStore";
import { useThemeStore } from "@/stores/themeStore";
import { useMapStore } from "@/stores/mapStore";
import { useDXStore } from "@/stores/dxStore";
import type { SyncModule, SyncableTable } from "../types";
import type { UserPreferences } from "@/types/user";
import type { Json } from "@/types/supabase";

/** Current preferences schema version — bumped for theme/map/DX consolidation */
const PREFERENCES_VERSION = 16;

export const preferencesSync: SyncModule = {
  name: "preferences",
  tier: "eager",
  tables: ["user_preferences"] as SyncableTable[],

  async pull(userId: string, since: string | null): Promise<string | null> {
    const supabase = getSupabase();

    let query = supabase
      .from("user_preferences")
      .select("*")
      .eq("user_id", userId);

    if (since) {
      query = query.gt("updated_at", since);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      throw new Error(`Preferences pull failed: ${error.message}`);
    }

    if (!data) {
      return null;
    }

    // Server has newer preferences — split into canonical stores
    const serverPrefs = data.preferences as Record<string, unknown> | null;
    if (
      serverPrefs &&
      typeof serverPrefs === "object" &&
      !Array.isArray(serverPrefs)
    ) {
      const localUpdatedAt = since;

      // Last-write-wins on `updated_at`
      if (!localUpdatedAt || data.updated_at > localUpdatedAt) {
        // Strip `station` — not part of preferences
        const { station: _station, ...prefsWithoutStation } =
          serverPrefs as Partial<UserPreferences> & { station?: unknown };

        // Route keys to the appropriate canonical stores
        const {
          radios,
          customRadios,
          activeRadioId,
          license,
          // Theme fields
          _theme: serverTheme,
          // Map preference fields
          _mapPrefs: serverMapPrefs,
          // DX filter fields
          _dxFilters: serverDxFilters,
          ...settingsFields
        } = prefsWithoutStation as Partial<UserPreferences> & {
          station?: unknown;
          _theme?: {
            themeId: string;
            accentId: string;
            customPrimary: string | null;
            customSecondary: string | null;
          };
          _mapPrefs?: {
            timeScenarios: unknown[];
            regionPresets: unknown[];
            panelStates: unknown;
            labelOptions: unknown;
            mapStyle: string;
            activePresetId: string | null;
          };
          _dxFilters?: {
            bands: string[];
            modes: string[];
            maxAge: number;
            neededOnly: boolean;
            sortByNeeded: boolean;
          };
        };

        // Settings store (flat merge)
        const currentSettings = useSettingsStore.getState();
        useSettingsStore.setState({
          ...currentSettings,
          ...settingsFields,
        } as never);

        // Shack store (radio equipment)
        if (
          radios !== undefined ||
          customRadios !== undefined ||
          activeRadioId !== undefined
        ) {
          const currentShack = useShackStore.getState();
          useShackStore.setState({
            ...(radios !== undefined
              ? { radios }
              : { radios: currentShack.radios }),
            ...(customRadios !== undefined
              ? { customRadios }
              : { customRadios: currentShack.customRadios }),
            ...(activeRadioId !== undefined
              ? { activeRadioId }
              : { activeRadioId: currentShack.activeRadioId }),
          });
        }

        // Profile store (license)
        if (license !== undefined) {
          useProfileStore.setState({ license });
        }

        // Theme store
        if (serverTheme) {
          useThemeStore.setState({
            themeId: serverTheme.themeId as ReturnType<
              typeof useThemeStore.getState
            >["themeId"],
            accentId: serverTheme.accentId,
            customPrimary: serverTheme.customPrimary,
            customSecondary: serverTheme.customSecondary,
          });
        }

        // Map preferences (manual localStorage stores)
        if (serverMapPrefs) {
          const map = useMapStore.getState();
          if (serverMapPrefs.timeScenarios) {
            useMapStore.setState({
              timeScenarios:
                serverMapPrefs.timeScenarios as typeof map.timeScenarios,
            });
          }
          if (serverMapPrefs.regionPresets) {
            useMapStore.setState({
              regionPresets:
                serverMapPrefs.regionPresets as typeof map.regionPresets,
            });
          }
          if (serverMapPrefs.panelStates) {
            useMapStore.setState({
              panelStates: {
                ...map.panelStates,
                ...(serverMapPrefs.panelStates as Partial<
                  typeof map.panelStates
                >),
              },
            });
          }
          if (serverMapPrefs.labelOptions) {
            useMapStore.setState({
              labelOptions: {
                ...map.labelOptions,
                ...(serverMapPrefs.labelOptions as Partial<
                  typeof map.labelOptions
                >),
              },
            });
          }
          if (serverMapPrefs.mapStyle) {
            useMapStore.setState({
              mapStyle: serverMapPrefs.mapStyle as typeof map.mapStyle,
            });
          }
          if (serverMapPrefs.activePresetId !== undefined) {
            useMapStore.setState({
              activePresetId: serverMapPrefs.activePresetId,
            });
          }
        }

        // DX cluster filter preferences
        if (serverDxFilters) {
          const dx = useDXStore.getState();
          useDXStore.setState({
            filters: { ...dx.filters, ...serverDxFilters },
          });
        }
      }
    }

    return data.updated_at;
  },

  async push(userId: string): Promise<void> {
    const supabase = getSupabase();

    // Reconstruct the preferences blob from all canonical stores
    const settings = useSettingsStore.getState();
    const shack = useShackStore.getState();
    const profile = useProfileStore.getState();
    const theme = useThemeStore.getState();
    const map = useMapStore.getState();
    const dx = useDXStore.getState();

    const preferences: Record<string, unknown> = {
      // Settings fields
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
      // Profile fields
      license: profile.license,
      // Theme fields (namespaced to avoid collisions)
      _theme: {
        themeId: theme.themeId,
        accentId: theme.accentId,
        customPrimary: theme.customPrimary,
        customSecondary: theme.customSecondary,
      },
      // Map preference fields (only persisted prefs, not runtime state)
      _mapPrefs: {
        timeScenarios: map.timeScenarios,
        regionPresets: map.regionPresets.filter(
          (p) => !("isBuiltIn" in p && p.isBuiltIn),
        ),
        panelStates: map.panelStates,
        labelOptions: map.labelOptions,
        mapStyle: map.mapStyle,
        activePresetId: map.activePresetId,
      },
      // DX cluster filter preferences (only persisted filter fields)
      _dxFilters: {
        bands: dx.filters.bands ?? [],
        modes: dx.filters.modes ?? [],
        maxAge: dx.filters.maxAge ?? 30,
        neededOnly: dx.filters.neededOnly ?? false,
        sortByNeeded: dx.filters.sortByNeeded ?? false,
      },
    };

    const { error } = await supabase.from("user_preferences").upsert(
      {
        user_id: userId,
        preferences: preferences as unknown as Json,
        version: PREFERENCES_VERSION,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    if (error) {
      throw new Error(`Preferences push failed: ${error.message}`);
    }
  },
};
