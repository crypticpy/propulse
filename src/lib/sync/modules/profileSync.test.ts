import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabase } from "@/lib/supabase";
import { syncMeta } from "../syncMeta";
import {
  CURRENT_LOCATION_ID,
  useProfileStore,
} from "@/stores/profileStore";
import { profileSync } from "./profileSync";

vi.mock("@/lib/supabase", () => ({
  getSupabase: vi.fn(),
}));

const originalState = useProfileStore.getState();

describe("profileSync location conflict handling", () => {
  beforeEach(() => {
    syncMeta.clear();
    useProfileStore.setState({
      ...originalState,
      station: {
        callsign: "N0QA",
        homeLocationId: "home",
        activeLocationId: null,
        savedLocations: [
          {
            id: "home",
            name: "Home",
            grid: "EM10",
            lat: 30.5,
            lon: -97,
            timezone: "America/Chicago",
            type: "home",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        grid: "EM10",
        lat: 30.5,
        lon: -97,
        timezone: "America/Chicago",
      },
    });
  });

  it("keeps an offline quick-location edit over the stale server row", async () => {
    useProfileStore.getState().setCurrentLocation({
      grid: "DM79",
      lat: 39.5,
      lon: -105,
      timezone: "America/Denver",
    });

    const profileRow = {
      id: "user-1",
      callsign: "N0QA",
      operator_name: null,
      grid: "FN31",
      lat: 41.5,
      lon: -72.5,
      timezone: "America/New_York",
      home_location_id: "home",
      active_location_id: CURRENT_LOCATION_ID,
      bio: null,
      social_links: null,
      subscription_tier: null,
      subscription_status: null,
      subscription_period_end: null,
      rank_override: null,
      interests: null,
      on_air_status: null,
      sked_availability: null,
      favorite_freqs: null,
      updated_at: "2026-08-31T12:00:00.000Z",
    };
    const locationRows = [
      {
        id: "home",
        user_id: "user-1",
        name: "Home",
        grid: "EM10",
        lat: 30.5,
        lon: -97,
        timezone: "America/Chicago",
        type: "home",
        activation_ref: null,
        created_at: "2026-01-01T00:00:00.000Z",
      },
      {
        id: CURRENT_LOCATION_ID,
        user_id: "user-1",
        name: "Current location",
        grid: "FN31",
        lat: 41.5,
        lon: -72.5,
        timezone: "America/New_York",
        type: "mobile",
        activation_ref: null,
        created_at: "2026-02-01T00:00:00.000Z",
      },
    ];

    vi.mocked(getSupabase).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "profiles") {
          const query = {
            select: vi.fn(() => query),
            eq: vi.fn(() => query),
            maybeSingle: vi.fn(async () => ({
              data: profileRow,
              error: null,
            })),
          };
          return query;
        }

        const query = {
          select: vi.fn(() => query),
          eq: vi.fn(async () => ({ data: locationRows, error: null })),
        };
        return query;
      }),
    } as never);

    await profileSync.pull("user-1", null);

    const station = useProfileStore.getState().station!;
    const current = station.savedLocations.find(
      (location) => location.id === CURRENT_LOCATION_ID,
    );
    expect(current?.grid).toBe("DM79");
    expect(current?.timezone).toBe("America/Denver");
    expect(station.grid).toBe("DM79");
    expect(station.lon).toBe(-105);
  });

  it("clears only the dirty token that completed its push", () => {
    const first = syncMeta.markLocationDirty(CURRENT_LOCATION_ID);
    const second = syncMeta.markLocationDirty(CURRENT_LOCATION_ID);

    syncMeta.clearLocationDirty(CURRENT_LOCATION_ID, first);
    expect(syncMeta.getLocationDirtyToken(CURRENT_LOCATION_ID)).toBe(second);

    syncMeta.clearLocationDirty(CURRENT_LOCATION_ID, second);
    expect(syncMeta.getLocationDirtyToken(CURRENT_LOCATION_ID)).toBeNull();
  });
});
