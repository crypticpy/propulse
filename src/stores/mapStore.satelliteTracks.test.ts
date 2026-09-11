import { beforeEach, describe, expect, it, vi } from "vitest";

const SATELLITE_TRACKS_LS_KEY = "propulse-satellite-tracks";

/**
 * satelliteTracks' insertion-order tracker (for the oldest-dropped cap) is
 * seeded once at module init from localStorage — mirrors
 * mapStore.tileProvider.test.ts's `loadFreshStore` pattern for exercising
 * that load-on-init path per scenario.
 */
async function loadFreshStore() {
  vi.resetModules();
  const { useMapStore } = await import("./mapStore");
  return useMapStore;
}

describe("mapStore satellite orbit tracks (#994)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to no tracks when nothing is stored", async () => {
    const useMapStore = await loadFreshStore();
    expect(useMapStore.getState().satelliteTracks).toEqual({});
  });

  it("falls back to no tracks when the stored envelope has a stale version (migration default)", async () => {
    localStorage.setItem(
      SATELLITE_TRACKS_LS_KEY,
      JSON.stringify({
        version: 0,
        order: ["25544"],
        tracks: { "25544": { orbitsAhead: 1, showPast: false, showFootprint: false } },
      }),
    );
    const useMapStore = await loadFreshStore();
    expect(useMapStore.getState().satelliteTracks).toEqual({});
  });

  it("falls back to no tracks when the stored envelope is corrupt JSON", async () => {
    localStorage.setItem(SATELLITE_TRACKS_LS_KEY, "{not json");
    const useMapStore = await loadFreshStore();
    expect(useMapStore.getState().satelliteTracks).toEqual({});
  });

  it("trusts a stored payload from the current schema version", async () => {
    localStorage.setItem(
      SATELLITE_TRACKS_LS_KEY,
      JSON.stringify({
        version: 1,
        order: ["25544"],
        tracks: {
          "25544": { orbitsAhead: 2, showPast: true, showFootprint: false },
        },
      }),
    );
    const useMapStore = await loadFreshStore();
    expect(useMapStore.getState().satelliteTracks).toEqual({
      "25544": { orbitsAhead: 2, showPast: true, showFootprint: false },
    });
  });

  it("persists 5 tracks, reloads the module, and evicts the oldest STORED one when a 6th is added", async () => {
    localStorage.setItem(
      SATELLITE_TRACKS_LS_KEY,
      JSON.stringify({
        version: 1,
        order: ["1", "2", "3", "4", "5"],
        tracks: {
          "1": { orbitsAhead: 1, showPast: false, showFootprint: false },
          "2": { orbitsAhead: 1, showPast: false, showFootprint: false },
          "3": { orbitsAhead: 1, showPast: false, showFootprint: false },
          "4": { orbitsAhead: 1, showPast: false, showFootprint: false },
          "5": { orbitsAhead: 1, showPast: false, showFootprint: false },
        },
      }),
    );
    const useMapStore = await loadFreshStore();

    useMapStore.getState().setSatelliteTrack(6, {});

    const state = useMapStore.getState();
    expect(Object.keys(state.satelliteTracks).sort()).toEqual([
      "2",
      "3",
      "4",
      "5",
      "6",
    ]);
    expect(state.satelliteTracks["1"]).toBeUndefined();
    expect(state.satelliteTrackOrder).toEqual(["2", "3", "4", "5", "6"]);
    expect(state.satelliteTrackOrder).toHaveLength(5);
  });

  describe("setSatelliteTrack", () => {
    it("creates a track with defaults, merging in the patch", async () => {
      const useMapStore = await loadFreshStore();

      useMapStore.getState().setSatelliteTrack(43137, { orbitsAhead: 2 });

      expect(useMapStore.getState().satelliteTracks).toEqual({
        "43137": { orbitsAhead: 2, showPast: false, showFootprint: false },
      });
    });

    it("patches an existing track without clobbering its other fields", async () => {
      const useMapStore = await loadFreshStore();

      useMapStore.getState().setSatelliteTrack(43137, { showPast: true });
      useMapStore.getState().setSatelliteTrack(43137, { orbitsAhead: 3 });

      expect(useMapStore.getState().satelliteTracks["43137"]).toEqual({
        orbitsAhead: 3,
        showPast: true,
        showFootprint: false,
      });
    });

    it("persists the versioned envelope on every write", async () => {
      const useMapStore = await loadFreshStore();

      useMapStore.getState().setSatelliteTrack(25544, { showFootprint: true });

      expect(
        JSON.parse(localStorage.getItem(SATELLITE_TRACKS_LS_KEY) as string),
      ).toEqual({
        version: 1,
        order: ["25544"],
        tracks: {
          "25544": { orbitsAhead: 1, showPast: false, showFootprint: true },
        },
      });
    });

    it("caps at 5 simultaneous tracks, dropping the oldest by insertion order", async () => {
      const useMapStore = await loadFreshStore();
      const noradIds = [1, 2, 3, 4, 5, 6];

      for (const id of noradIds) {
        useMapStore.getState().setSatelliteTrack(id, {});
      }

      const tracks = useMapStore.getState().satelliteTracks;
      expect(Object.keys(tracks).sort()).toEqual(["2", "3", "4", "5", "6"]);
      expect(tracks["1"]).toBeUndefined();
    });

    it("re-tracking an existing satellite refreshes its recency instead of duplicating it in the cap", async () => {
      const useMapStore = await loadFreshStore();

      for (const id of [1, 2, 3, 4, 5]) {
        useMapStore.getState().setSatelliteTrack(id, {});
      }
      // Touch "1" again — it should now be the most recent, not the oldest.
      useMapStore.getState().setSatelliteTrack(1, { showPast: true });
      useMapStore.getState().setSatelliteTrack(6, {});

      const tracks = useMapStore.getState().satelliteTracks;
      expect(Object.keys(tracks).sort()).toEqual(["1", "3", "4", "5", "6"]);
      expect(tracks["2"]).toBeUndefined();
    });

    it("records a status-chip eviction notice naming the dropped satellite when a 6th track is added", async () => {
      const useMapStore = await loadFreshStore();
      expect(useMapStore.getState().satelliteTrackEviction).toBeNull();

      for (const id of [1, 2, 3, 4, 5]) {
        useMapStore.getState().setSatelliteTrack(id, {});
      }
      // No eviction yet -- the cap (5) hasn't been exceeded.
      expect(useMapStore.getState().satelliteTrackEviction).toBeNull();

      useMapStore.getState().setSatelliteTrack(6, {});

      const eviction = useMapStore.getState().satelliteTrackEviction;
      expect(eviction).not.toBeNull();
      expect(eviction?.noradId).toBe("1");
      expect(typeof eviction?.timestamp).toBe("number");
    });

    it("dismissSatelliteTrackEviction clears the notice", async () => {
      const useMapStore = await loadFreshStore();
      for (const id of [1, 2, 3, 4, 5, 6]) {
        useMapStore.getState().setSatelliteTrack(id, {});
      }
      expect(useMapStore.getState().satelliteTrackEviction).not.toBeNull();

      useMapStore.getState().dismissSatelliteTrackEviction();

      expect(useMapStore.getState().satelliteTrackEviction).toBeNull();
    });
  });

  describe("clearSatelliteTrack", () => {
    it("removes one satellite's track and persists the result", async () => {
      const useMapStore = await loadFreshStore();
      useMapStore.getState().setSatelliteTrack(25544, {});
      useMapStore.getState().setSatelliteTrack(43137, {});

      useMapStore.getState().clearSatelliteTrack(25544);

      expect(useMapStore.getState().satelliteTracks).toEqual({
        "43137": { orbitsAhead: 1, showPast: false, showFootprint: false },
      });
      expect(
        JSON.parse(localStorage.getItem(SATELLITE_TRACKS_LS_KEY) as string)
          .order,
      ).toEqual(["43137"]);
    });

    it("is a no-op when the satellite has no track", async () => {
      const useMapStore = await loadFreshStore();
      useMapStore.getState().setSatelliteTrack(25544, {});

      useMapStore.getState().clearSatelliteTrack(99999);

      expect(useMapStore.getState().satelliteTracks).toEqual({
        "25544": { orbitsAhead: 1, showPast: false, showFootprint: false },
      });
    });
  });

  describe("clearAllSatelliteTracks", () => {
    it("removes every track and clears the stored envelope", async () => {
      const useMapStore = await loadFreshStore();
      useMapStore.getState().setSatelliteTrack(25544, {});
      useMapStore.getState().setSatelliteTrack(43137, {});

      useMapStore.getState().clearAllSatelliteTracks();

      expect(useMapStore.getState().satelliteTracks).toEqual({});
      expect(
        JSON.parse(localStorage.getItem(SATELLITE_TRACKS_LS_KEY) as string),
      ).toEqual({ version: 1, order: [], tracks: {} });

      // The cap's insertion-order tracker must also reset — otherwise a
      // fresh track added after "clear all" would inherit stale history.
      useMapStore.getState().setSatelliteTrack(1, {});
      expect(
        JSON.parse(localStorage.getItem(SATELLITE_TRACKS_LS_KEY) as string)
          .order,
      ).toEqual(["1"]);
    });
  });
});
