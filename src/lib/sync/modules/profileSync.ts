/**
 * Profile sync module — Tier 1 (Eager)
 *
 * Syncs `profiles` and `saved_locations` tables, and reads the account's own
 * `profile_billing` row (server-authoritative, never pushed).
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

    // --- Pull billing state (own row only, server-authoritative) ---
    // Subscription state moved off `profiles` in 20260909140000 so that
    // `profiles_select` — which exposes any row marked public — cannot leak it.
    // Pulled unconditionally rather than behind `since`: a Stripe webhook moves
    // this row without touching `profiles.updated_at`, so a delta on the
    // profile cursor would never see the change.
    //
    // A failure here must not abort the rest of the pull (saved_locations
    // etc. below); it's logged and treated as "unknown", which is distinct
    // from a query that succeeded and found no row (see `billingQueried`
    // below — that case resets to the free/inactive/null defaults). On a
    // failure, the persisted billing state is only kept if it is already
    // tagged (`billingUserId`) to this same account — see the `billingQueried`
    // handling below for the account-boundary reset.
    const { data: billingRow, error: billingError } = await supabase
      .from("profile_billing")
      .select("subscription_tier, subscription_status, subscription_period_end")
      .eq("user_id", userId)
      .maybeSingle();

    if (billingError) {
      console.warn(`Billing pull failed, skipping billing update: ${billingError.message}`);
    }
    const billingQueried = !billingError;

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

      const row = profileRows as Record<string, unknown>;

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

    // Subscription fields (server-authoritative via Stripe webhooks). Outside
    // the `profileRows` branch: a delta pull can skip the profile row entirely
    // and still need the current tier.
    //
    // Billing state is tagged with the account it belongs to
    // (`billingUserId`) so a transient read failure can never leak one
    // account's tier into another account's session. When the query
    // succeeds — row or no row — we write the fields and stamp
    // `billingUserId = userId` via `setBilling`: a row is applied as-is, and
    // no row means this account (e.g. a freshly signed-in free account
    // reusing a browser that last held a Pro session) has never subscribed
    // and must read as the documented free/inactive/null defaults
    // (`src/stores/profileStore.ts`), not whatever the persisted store
    // happened to have (#866 Codex round 2). When the query fails, we only
    // preserve the existing state if it already belongs to this same
    // account; otherwise (an account boundary — sign-out, account switch, or
    // the first-ever pull in this browser) we reset via `resetBilling()`
    // rather than risk showing a different account's Pro state (#866/#867
    // Codex round 4).
    if (billingQueried) {
      if (billingRow) {
        useProfileStore.getState().setBilling({
          userId,
          tier: billingRow.subscription_tier as "free" | "pro",
          status: billingRow.subscription_status as
            | "active"
            | "trialing"
            | "past_due"
            | "canceled"
            | "inactive",
          periodEnd: billingRow.subscription_period_end,
        });
      } else {
        useProfileStore.getState().setBilling({
          userId,
          tier: "free",
          status: "inactive",
          periodEnd: null,
        });
      }
    } else if (state.billingUserId !== userId) {
      useProfileStore.getState().resetBilling();
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
