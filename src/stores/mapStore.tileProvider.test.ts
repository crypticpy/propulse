import { beforeEach, describe, expect, it, vi } from "vitest";
import { selectTileProvider } from "@/lib/tiles/providers";

const TILE_PROVIDER_LS_KEY = "propulse-tile-provider-id";

/**
 * The load-on-init logic only runs once, at module init, so these cases
 * reset the module registry and re-import the store fresh for each
 * scenario rather than reaching into a private loader function that
 * mapStore.ts does not export.
 */
async function loadFreshStore() {
  vi.resetModules();
  const { useMapStore } = await import("./mapStore");
  return useMapStore;
}

describe("mapStore tile provider persistence (HW-55, batch B6)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("is null when nothing is stored — 'no explicit choice', not a tier snapshot", async () => {
    const useMapStore = await loadFreshStore();

    expect(useMapStore.getState().tileProviderId).toBeNull();
  });

  it("lets selectTileProvider resolve the null id from mapStyle and tier, so a mid-session tier change is honoured", async () => {
    const useMapStore = await loadFreshStore();
    const { tileProviderId } = useMapStore.getState();

    expect(selectTileProvider("satellite", "free", tileProviderId).id).toBe(
      "esri-world",
    );
    // The same stored (null) id resolves differently once the tier changes —
    // nothing baked into mapStore state is holding it to the free-tier pick.
    expect(selectTileProvider("satellite", "pro", tileProviderId).id).toBe(
      "mapbox-satellite",
    );
  });

  it("trusts a stored id from the current schema version", async () => {
    localStorage.setItem(
      TILE_PROVIDER_LS_KEY,
      JSON.stringify({ version: 1, id: "carto-dark" }),
    );
    const useMapStore = await loadFreshStore();

    expect(useMapStore.getState().tileProviderId).toBe("carto-dark");
  });

  it("falls back to null when the stored envelope has a stale version", async () => {
    localStorage.setItem(
      TILE_PROVIDER_LS_KEY,
      JSON.stringify({ version: 0, id: "mapbox-satellite" }),
    );
    const useMapStore = await loadFreshStore();

    expect(useMapStore.getState().tileProviderId).toBeNull();
  });

  it("falls back to null when the stored envelope is corrupt JSON", async () => {
    localStorage.setItem(TILE_PROVIDER_LS_KEY, "{not json");
    const useMapStore = await loadFreshStore();

    expect(useMapStore.getState().tileProviderId).toBeNull();
  });

  describe("setTileProviderId", () => {
    it("persists a concrete id in the versioned envelope", async () => {
      const useMapStore = await loadFreshStore();

      useMapStore.getState().setTileProviderId("carto-dark");

      expect(useMapStore.getState().tileProviderId).toBe("carto-dark");
      expect(
        JSON.parse(localStorage.getItem(TILE_PROVIDER_LS_KEY) as string),
      ).toEqual({ version: 1, id: "carto-dark" });
    });

    it("clears the stored override instead of locking in a snapshot when set to null", async () => {
      const useMapStore = await loadFreshStore();

      useMapStore.getState().setTileProviderId("mapbox-satellite");
      expect(localStorage.getItem(TILE_PROVIDER_LS_KEY)).not.toBeNull();

      useMapStore.getState().setTileProviderId(null);

      expect(useMapStore.getState().tileProviderId).toBeNull();
      expect(localStorage.getItem(TILE_PROVIDER_LS_KEY)).toBeNull();
    });
  });
});
