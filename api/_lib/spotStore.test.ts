import { afterEach, describe, expect, it, vi } from "vitest";
import { spotCacheHeaders } from "./spotResponse";
import { meterBandNumber, readStoredSpots } from "./spotStore";

const NOW = Date.parse("2026-07-19T14:00:00Z");
const CONFIG = {
  baseUrl: "https://project.supabase.co",
  anonKey: "anon-key",
};

function row(overrides: Record<string, unknown> = {}) {
  return {
    source: "pskreporter",
    spotted_at: "2026-07-19T13:55:00Z",
    tx_callsign: "K0ABC",
    tx_grid: "EM10AA",
    tx_lat: 30.02,
    tx_lon: -97.95,
    rx_callsign: "N0XYZ",
    rx_grid: "DM79AA",
    rx_lat: 39.02,
    rx_lon: -105.95,
    frequency_khz: 14074,
    band: "20m",
    mode: "FT8",
    snr: -12,
    wpm: null,
    comment: null,
    dxcc: null,
    continent: "NA",
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("central spot store", () => {
  it("queries the grid-filtered store and accepts only current validated rows", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify([row(), { source: "pskreporter" }]), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    const result = await readStoredSpots(
      "pskreporter",
      { limit: 50, grid: "dm79", modes: ["FT8"] },
      { fetcher, now: () => NOW, storageConfig: () => CONFIG },
    );

    expect(result.status).toBe("ok");
    expect(result.rows).toHaveLength(1);
    expect(result.observedAt).toBe("2026-07-19T13:55:00Z");
    const [requestUrl, requestInit] = fetcher.mock.calls[0];
    const url = new URL(String(requestUrl));
    expect(url.pathname).toBe("/rest/v1/spot_history");
    expect(url.searchParams.get("source")).toBe("eq.pskreporter");
    expect(url.searchParams.get("spotted_at")).toBe(
      "gte.2026-07-19T13:30:00.000Z",
    );
    expect(url.searchParams.get("rx_grid")).toBe("ilike.DM79*");
    expect(url.searchParams.get("mode")).toBe("in.(FT8)");
    expect(requestInit?.headers).toMatchObject({
      apikey: "anon-key",
      Authorization: "Bearer anon-key",
    });
  });

  it("enforces the stored meter-band contract centrally", async () => {
    expect(meterBandNumber("20m")).toBe(20);
    expect(meterBandNumber("70cm")).toBeNull();
    const result = await readStoredSpots(
      "rbn",
      { limit: 50 },
      {
        fetcher: async () =>
          new Response(JSON.stringify([row({ source: "rbn", band: "invalid" })])),
        now: () => NOW,
        storageConfig: () => CONFIG,
      },
    );
    expect(result).toMatchObject({ rows: [], status: "stale" });
  });

  it("does not serve stale observations as live spots", async () => {
    const result = await readStoredSpots(
      "rbn",
      { limit: 50 },
      {
        fetcher: async () =>
          new Response(
            JSON.stringify([
              row({ source: "rbn", spotted_at: "2026-07-19T12:00:00Z" }),
            ]),
          ),
        now: () => NOW,
        storageConfig: () => CONFIG,
      },
    );

    expect(result).toMatchObject({
      rows: [],
      status: "stale",
      observedAt: "2026-07-19T12:00:00Z",
    });
    expect(spotCacheHeaders(result)).toMatchObject({
      "X-Propulse-Spot-Status": "stale",
    });
  });

  it("degrades without throwing when storage is missing or rejects the request", async () => {
    const missing = await readStoredSpots(
      "dxcluster",
      { limit: 50 },
      { now: () => NOW, storageConfig: () => null },
    );
    expect(missing).toMatchObject({ rows: [], status: "unavailable" });

    const rejected = await readStoredSpots(
      "dxcluster",
      { limit: 50 },
      {
        fetcher: async () => new Response("nope", { status: 503 }),
        now: () => NOW,
        storageConfig: () => CONFIG,
      },
    );
    expect(rejected).toMatchObject({ rows: [], status: "unavailable" });
  });

  it("rejects oversized store responses before parsing them", async () => {
    const result = await readStoredSpots(
      "pskreporter",
      { limit: 50 },
      {
        fetcher: async () =>
          new Response("[]", {
            headers: { "Content-Length": String(512 * 1024 + 1) },
          }),
        now: () => NOW,
        storageConfig: () => CONFIG,
      },
    );
    expect(result).toMatchObject({ rows: [], status: "unavailable" });
  });
});
