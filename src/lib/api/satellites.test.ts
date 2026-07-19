import { afterEach, describe, expect, it, vi } from "vitest";

const TLE_TEXT = [
  "ISS (ZARYA)",
  "1 25544U 98067A   26199.50000000  .00000000  00000-0  00000-0 0  9999",
  "2 25544  51.6400 120.0000 0005000  10.0000 350.0000 15.50000000123456",
].join("\n");

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("satellite TLE source selection", () => {
  it("uses the same-origin proxy without contacting Celestrak from the browser", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          tle: TLE_TEXT,
          _meta: { collectedAt: "2026-07-18T23:00:00.000Z", source: "direct" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { fetchTLEData } = await import("./satellites");
    const result = await fetchTLEData();

    expect(result).toHaveLength(1);
    expect(result[0]?.noradId).toBe(25544);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/satellites/tle");
  });
});
