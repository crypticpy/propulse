/**
 * Profile sync module — Tier 1 (Eager)
 *
 * Syncs `profiles` and `saved_locations` tables.
 * Pushes the full profile blob and all saved locations on every push.
 * Pulls delta on `profiles.updated_at`; saved_locations are always full-pulled
 * (the table has no `updated_at` column).
 */

import { getSupabase } from "@/lib/supabase";
import { useProfileStore } from "@/stores/profileStore";
import type { SyncModule, SyncableTable } from "../types";
import type { Tables, TablesInsert } from "@/types/supabase";
import type { OperatingLocation } from "@/types/user";

/**
 * Return the latest `updated_at` from a list of ISO timestamps.
 * Returns null if the list is empty.
 */
function maxTimestamp(
  timestamps: (string | null | undefined)[],
): string | null {
  let max: string | null = null;
  for (const ts of timestamps) {
    if (ts && (!max || ts > max)) {
      max = ts;
    }
  }
  return max;
}

/**
 * Map a Supabase `saved_locations` row to a local `OperatingLocation`.
 */
function rowToLocation(row: Tables<"saved_locations">): OperatingLocation {
  return {
    id: row.id,
    name: row.name,
    grid: row.grid,
    lat: row.lat,
    lon: row.lon,
    timezone: row.timezone ?? undefined,
    type: row.type as OperatingLocation["type"],
    activationRef: row.activation_ref ?? undefined,
    createdAt: row.created_at,
  };
}

/**
 * Map a local `OperatingLocation` to a Supabase `saved_locations` insert row.
 */
function locationToRow(
  loc: OperatingLocation,
  userId: string,
): TablesInsert<"saved_locations"> {
  return {
    id: loc.id,
    user_id: userId,
    name: loc.name,
    grid: loc.grid,
    lat: loc.lat,
    lon: loc.lon,
    timezone: loc.timezone ?? null,
    type: loc.type,
    activation_ref: loc.activationRef ?? null,
    created_at: loc.createdAt,
  };
}

export const profileSync: SyncModule = {
  name: "profile",
  tier: "eager",
  tables: ["profiles", "saved_locations"] as SyncableTable[],

  async pull(userId: string, since: string | null): Promise<string | null> {
    const supabase = getSupabase();
    const timestamps: string[] = [];

    // --- Pull profile ---
    let profileQuery = supabase.from("profiles").select("*").eq("id", userId);

    if (since) {
      profileQuery = profileQuery.gt("updated_at", since);
    }

    const { data: profileRows, error: profileError } =
      await profileQuery.maybeSingle();

    if (profileError) {
      throw new Error(`Profile pull failed: ${profileError.message}`);
    }

    // --- Pull saved locations (always full pull — no updated_at column) ---
    const { data: locationRows, error: locationError } = await supabase
      .from("saved_locations")
      .select("*")
      .eq("user_id", userId);

    if (locationError) {
      throw new Error(`Saved locations pull failed: ${locationError.message}`);
    }

    // Build merged station in a single pass, then apply one setState
    const state = useProfileStore.getState();
    let updatedStation = state.station;

    if (profileRows) {
      timestamps.push(profileRows.updated_at);

      if (updatedStation) {
        // Legacy compat fields (grid/lat/lon/timezone) are @deprecated on
        // UserStation in favor of saved_locations, but are still needed for
        // Supabase profile row sync. TS6385 deprecation warnings expected.
        updatedStation = {
          ...updatedStation,
          callsign: profileRows.callsign ?? updatedStation.callsign,
          operatorName:
            profileRows.operator_name ?? updatedStation.operatorName,
          grid: profileRows.grid ?? updatedStation.grid, // eslint-disable-line deprecation/deprecation
          lat: profileRows.lat ?? updatedStation.lat,
          lon: profileRows.lon ?? updatedStation.lon,
          timezone: profileRows.timezone ?? updatedStation.timezone,
          homeLocationId:
            profileRows.home_location_id ?? updatedStation.homeLocationId,
          activeLocationId:
            profileRows.active_location_id ?? updatedStation.activeLocationId,
        };
      } else if (profileRows.callsign) {
        // No local station — bootstrap from server profile
        updatedStation = {
          callsign: profileRows.callsign,
          operatorName: profileRows.operator_name ?? undefined,
          grid: profileRows.grid ?? "",
          lat: profileRows.lat ?? 0,
          lon: profileRows.lon ?? 0,
          timezone: profileRows.timezone ?? undefined,
          homeLocationId: profileRows.home_location_id ?? "",
          activeLocationId: profileRows.active_location_id ?? null,
          savedLocations: [],
        };
      }
    }

    if (locationRows && locationRows.length > 0 && updatedStation) {
      const serverLocations = locationRows.map(rowToLocation);

      for (const row of locationRows) {
        timestamps.push(row.created_at);
      }

      // Merge: server locations take precedence, local-only locations are kept
      const serverIdSet = new Set(serverLocations.map((l) => l.id));
      const localOnly = updatedStation.savedLocations.filter(
        (l) => !serverIdSet.has(l.id),
      );
      updatedStation = {
        ...updatedStation,
        savedLocations: [...serverLocations, ...localOnly],
      };
    }

    // Single setState call for the entire pull
    if (updatedStation !== state.station) {
      useProfileStore.setState({ station: updatedStation });
    }

    return maxTimestamp(timestamps);
  },

  async push(userId: string): Promise<void> {
    const supabase = getSupabase();
    const { station } = useProfileStore.getState();

    if (!station) return;

    // --- Upsert profile ---
    const { error: profileError } = await supabase.from("profiles").upsert(
      {
        id: userId,
        callsign: station.callsign,
        operator_name: station.operatorName ?? null,
        grid: station.grid,
        lat: station.lat,
        lon: station.lon,
        timezone: station.timezone ?? null,
        home_location_id: station.homeLocationId,
        active_location_id: station.activeLocationId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

    if (profileError) {
      throw new Error(`Profile push failed: ${profileError.message}`);
    }

    // --- Upsert saved locations ---
    if (station.savedLocations.length > 0) {
      const locationRows = station.savedLocations.map((loc) =>
        locationToRow(loc, userId),
      );

      const { error: locationError } = await supabase
        .from("saved_locations")
        .upsert(locationRows, { onConflict: "id" });

      if (locationError) {
        throw new Error(
          `Saved locations push failed: ${locationError.message}`,
        );
      }
    }

    // Note: We intentionally do NOT delete server-side locations missing from
    // the local set. In a multi-device scenario, another device may have added
    // locations that this device hasn't pulled yet. Orphan cleanup should be
    // handled via explicit delete operations through the write queue.
  },
};
