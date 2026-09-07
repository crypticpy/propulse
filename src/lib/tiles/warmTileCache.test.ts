import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildWarmTileUrls, warmTileCache } from "./warmTileCache";

function stubControlledNavigator(
  overrides: Partial<{
    onLine: boolean;
    saveData: boolean;
    controller: object | null;
  }> = {},
) {
  const { onLine = true, saveData = false, controller = {} } = overrides;
  vi.stubGlobal("navigator", {
    onLine,
    connection: { saveData },
    serviceWorker: controller ? { controller } : { controller: null },
  });
}

beforeEach(() => {
  stubControlledNavigator();
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildWarmTileUrls", () => {
  it("builds the 21 z0-z2 tile URLs with substituted coordinates", () => {
    const urls = buildWarmTileUrls("https://example.test/{z}/{x}/{y}.png", false);
    expect(urls).toHaveLength(21);
    expect(urls).toContain("https://example.test/0/0/0.png");
    expect(urls).toContain("https://example.test/2/3/3.png");
    expect(urls.every((u) => !u.includes("{"))).toBe(true);
  });

  it("adds z3 (64 more tiles, 85 total) when includeZoom3 is set", () => {
    const urls = buildWarmTileUrls("https://example.test/{z}/{x}/{y}.png", true);
    expect(urls).toHaveLength(85);
    expect(urls.filter((u) => u.startsWith("https://example.test/3/"))).toHaveLength(64);
  });
});

describe("warmTileCache", () => {
  it("fetches every source's tile set once when controlled and online", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response());
    vi.stubGlobal("fetch", fetchMock);

    await warmTileCache({
      sources: [
        { id: "esri-world", urlTemplate: "https://esri.test/{z}/{x}/{y}.png" },
        { id: "labels", urlTemplate: "https://carto.test/{z}/{x}/{y}.png" },
      ],
      includeZoom3: false,
      sessionKey: "esri-world:dark",
    });

    expect(fetchMock).toHaveBeenCalledTimes(42); // 21 tiles * 2 sources
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ priority: "low" });
  });

  it("does not re-warm the same session key twice", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response());
    vi.stubGlobal("fetch", fetchMock);

    const options = {
      sources: [{ id: "osm", urlTemplate: "https://osm.test/{z}/{x}/{y}.png" }],
      includeZoom3: false,
      sessionKey: "osm:dark",
    };
    await warmTileCache(options);
    await warmTileCache(options);

    expect(fetchMock).toHaveBeenCalledTimes(21);
  });

  it("skips warming when offline", async () => {
    stubControlledNavigator({ onLine: false });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await warmTileCache({
      sources: [{ id: "osm", urlTemplate: "https://osm.test/{z}/{x}/{y}.png" }],
      includeZoom3: false,
      sessionKey: "osm:offline",
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips warming when Save-Data is enabled", async () => {
    stubControlledNavigator({ saveData: true });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await warmTileCache({
      sources: [{ id: "osm", urlTemplate: "https://osm.test/{z}/{x}/{y}.png" }],
      includeZoom3: false,
      sessionKey: "osm:savedata",
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips warming when no service worker controls the page", async () => {
    stubControlledNavigator({ controller: null });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await warmTileCache({
      sources: [{ id: "osm", urlTemplate: "https://osm.test/{z}/{x}/{y}.png" }],
      includeZoom3: false,
      sessionKey: "osm:uncontrolled",
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not abort the batch when one tile fetch fails", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValue(new Response());
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      warmTileCache({
        sources: [{ id: "osm", urlTemplate: "https://osm.test/{z}/{x}/{y}.png" }],
        includeZoom3: false,
        sessionKey: "osm:partial-failure",
      }),
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(21);
  });

  it("attaches auth headers only for sources that require them", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response());
    vi.stubGlobal("fetch", fetchMock);

    await warmTileCache({
      sources: [
        { id: "mapbox-satellite", urlTemplate: "/api/tiles/proxy?z={z}&x={x}&y={y}", requiresAuth: true },
      ],
      includeZoom3: false,
      sessionKey: "mapbox-satellite:pro",
    });

    expect(fetchMock).toHaveBeenCalledTimes(21);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toBeDefined();
  });
});
