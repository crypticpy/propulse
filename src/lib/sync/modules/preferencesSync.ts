/**
 * Preferences sync module — Tier 1 (Eager)
 *
 * Syncs the `user_preferences` table (single JSONB blob per user).
 * The entire preferences object is stored as a `preferences` JSONB column.
 * A `version` column tracks the schema version (currently 14).
 *
 * Note: Radios are currently stored inside `preferences.radios[]`.
 * A future migration will extract them to the `user_radios` table.
 */

import { getSupabase } from "@/lib/supabase";
import { useSettingsStore } from "@/stores/settingsStore";
import { useShackStore } from "@/stores/shackStore";
import { useProfileStore } from "@/stores/profileStore";
import type { SyncModule, SyncableTable } from "../types";
import type { UserPreferences } from "@/types/user";
import type { Json } from "@/types/supabase";

/** Current preferences schema version — bumped for store decomposition */
const PREFERENCES_VERSION = 15;

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
          ...settingsFields
        } = prefsWithoutStation;

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
      }
    }

    return data.updated_at;
  },

  async push(userId: string): Promise<void> {
    const supabase = getSupabase();

    // Reconstruct the legacy preferences blob from 3 canonical stores
    const settings = useSettingsStore.getState();
    const shack = useShackStore.getState();
    const profile = useProfileStore.getState();

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
