/**
 * Profile sync module — Tier 1 (Eager)
 *
 * Syncs `profiles` and `saved_locations` tables.
 * Pushes the full profile blob and all saved locations on every push.
 * Pulls delta on `profiles.updated_at`; saved_locations are always full-pulled
 * (the table has no `updated_at` column).
 */

import { getSupabase } from "@/lib/supabase";
import {
  CURRENT_LOCATION_ID,
  useProfileStore,
} from "@/stores/profileStore";
import { syncMeta } from "../syncMeta";
import type { SyncModule, SyncableTable } from "../types";
import type { Json, Tables, TablesInsert } from "@/types/supabase";
import type { OperatingLocation } from "@/types/user";
import type { RankTier } from "@/types/rank";
import { RANK_ORDER } from "@/lib/data/rankConstants";

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
    const dirtyCurrentToken = syncMeta.getLocationDirtyToken(
      CURRENT_LOCATION_ID,
    );
    const preserveLocalCurrent = Boolean(
      dirtyCurrentToken &&
        state.station?.savedLocations.some(
          (location) => location.id === CURRENT_LOCATION_ID,
        ),
    );

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
          grid: preserveLocalCurrent
            ? updatedStation.grid
            : (profileRows.grid ?? updatedStation.grid),
          lat: preserveLocalCurrent
            ? updatedStation.lat
            : (profileRows.lat ?? updatedStation.lat),
          lon: preserveLocalCurrent
            ? updatedStation.lon
            : (profileRows.lon ?? updatedStation.lon),
          timezone: preserveLocalCurrent
            ? updatedStation.timezone
            : (profileRows.timezone ?? updatedStation.timezone),
          homeLocationId:
            profileRows.home_location_id ?? updatedStation.homeLocationId,
          activeLocationId: preserveLocalCurrent
            ? updatedStation.activeLocationId
            : (profileRows.active_location_id ??
              updatedStation.activeLocationId),
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
      const localCurrent = preserveLocalCurrent
        ? updatedStation.savedLocations.find(
            (location) => location.id === CURRENT_LOCATION_ID,
          )
        : null;
      const serverLocations = locationRows.map((row) => {
        if (row.id === CURRENT_LOCATION_ID && localCurrent) {
          return localCurrent;
        }
        return rowToLocation(row);
      });

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

    // --- Pull bio, social links from profile row ---
    const stateUpdate: Record<string, unknown> = {};

    if (profileRows) {
      if (profileRows.bio != null) {
        stateUpdate.bio = profileRows.bio;
      }
      if (profileRows.social_links != null) {
        stateUpdate.socialLinks = profileRows.social_links;
      }

      // Subscription fields (server-authoritative via Stripe webhooks)
      const row = profileRows as Record<string, unknown>;
      if (row.subscription_tier != null) {
        stateUpdate.subscriptionTier = row.subscription_tier as string;
      }
      if (row.subscription_status != null) {
        stateUpdate.subscriptionStatus = row.subscription_status as string;
      }
      if (row.subscription_period_end != null) {
        stateUpdate.subscriptionPeriodEnd =
          row.subscription_period_end as string;
      }

      // Rank override (server-authoritative — admin can set this in Supabase)
      const serverOverride = profileRows.rank_override as string | null;
      const validOverride =
        serverOverride && RANK_ORDER.includes(serverOverride as RankTier)
          ? (serverOverride as RankTier)
          : null;
      const currentOverride = state.operatorRank.rankOverride ?? null;
      if (validOverride !== currentOverride) {
        stateUpdate.operatorRank = {
          ...state.operatorRank,
          ...(stateUpdate.operatorRank as Record<string, unknown> | undefined),
          rankOverride: validOverride,
        };
      }

      // Social / Profile V2 fields
      if (row.interests != null) {
        stateUpdate.interests = row.interests;
      }
      if (row.on_air_status != null) {
        stateUpdate.onAirStatus = row.on_air_status;
      } else {
        stateUpdate.onAirStatus = { status: "offline" };
      }
      if (row.sked_availability != null) {
        stateUpdate.skedAvailability = row.sked_availability;
      }
      if (row.favorite_freqs != null) {
        stateUpdate.favoriteFreqs = row.favorite_freqs;
      }
    }

    // Single setState call for the entire pull
    if (updatedStation !== state.station) {
      stateUpdate.station = updatedStation;
    }

    if (Object.keys(stateUpdate).length > 0) {
      useProfileStore.setState(stateUpdate);
    }

    return maxTimestamp(timestamps);
  },

  async push(userId: string): Promise<void> {
    const supabase = getSupabase();
    const dirtyCurrentToken = syncMeta.getLocationDirtyToken(
      CURRENT_LOCATION_ID,
    );
    const {
      station,
      bio,
      socialLinks,
      operatorRank,
      interests,
      onAirStatus,
      skedAvailability,
      favoriteFreqs,
    } = useProfileStore.getState();

    if (!station) return;

    // --- Upsert profile (including bio + social_links + rank) ---
    const socialLinksPayload = socialLinks.length > 0 ? socialLinks : null;
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
        bio: bio || null,
        social_links:
          socialLinksPayload as TablesInsert<"profiles">["social_links"],
        operator_rank: operatorRank.currentRank,
        rank_points: operatorRank.rankPoints,
        interests: interests as unknown as Json,
        on_air_status:
          onAirStatus.status !== "offline"
            ? (onAirStatus as unknown as Json)
            : null,
        sked_availability: skedAvailability,
        favorite_freqs:
          favoriteFreqs.length > 0 ? (favoriteFreqs as unknown as Json) : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

    if (profileError) {
      throw new Error(`Profile push failed: ${profileError.message}`);
    }

    const { data: cacheRow } = await supabase
      .from("profiles")
      .select("stats_cache")
      .eq("id", userId)
      .maybeSingle();
    const existingCache =
      cacheRow?.stats_cache &&
      typeof cacheRow.stats_cache === "object" &&
      !Array.isArray(cacheRow.stats_cache)
        ? (cacheRow.stats_cache as Record<string, unknown>)
        : {};
    const { pushPublicEquipmentCache } = await import(
      "./profileEquipmentCache"
    );
    await pushPublicEquipmentCache(userId, existingCache);

    // --- Upsert saved locations ---
    if (station.savedLocations.length > 0) {
      const locationRows = station.savedLocations.map((loc) =>
        locationToRow(loc, userId),
      );

      const { error: locationError } = await supabase
        .from("saved_locations")
        .upsert(locationRows, { onConflict: "user_id,id" });

      if (locationError) {
        throw new Error(
          `Saved locations push failed: ${locationError.message}`,
        );
      }
    }

    if (dirtyCurrentToken) {
      syncMeta.clearLocationDirty(CURRENT_LOCATION_ID, dirtyCurrentToken);
    }

    // Note: We intentionally do NOT delete server-side locations missing from
    // the local set. In a multi-device scenario, another device may have added
    // locations that this device hasn't pulled yet. Orphan cleanup should be
    // handled via explicit delete operations through the write queue.
  },
};
