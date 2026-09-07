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
  vi.unstubAllEnvs();
});

describe("central spot store", () => {
  it("prefers server-side Supabase configuration in edge routes", async () => {
    vi.stubEnv("SUPABASE_URL", "https://server-project.supabase.co");
    vi.stubEnv("SUPABASE_ANON_KEY", "server-anon-key");
    vi.stubEnv("VITE_SUPABASE_URL", "https://client-project.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "client-anon-key");
    const fetcher = vi.fn(async () => new Response(JSON.stringify([row()])));

    const result = await readStoredSpots(
      "pskreporter",
      { limit: 50 },
      { fetcher, now: () => NOW },
    );

    expect(result.status).toBe("ok");
    expect(String(fetcher.mock.calls[0][0])).toContain(
      "https://server-project.supabase.co/rest/v1/spot_history_live",
    );
    expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({
      apikey: "server-anon-key",
    });
  });

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
    expect(url.pathname).toBe("/rest/v1/spot_history_live");
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

  it("never caches a live response beyond its remaining freshness", () => {
    const headers = spotCacheHeaders({
      rows: [],
      status: "ok",
      observedAt: "2026-07-19T13:31:00Z",
      fetchedAt: "2026-07-19T14:00:00Z",
      staleAfterSeconds: 30 * 60,
      failureReason: null,
      upstreamStatus: null,
    });
    expect(headers["Cache-Control"]).toBe(
      "s-maxage=30, stale-while-revalidate=30, stale-if-error=30",
    );
  });

  it("degrades without throwing when storage is missing or rejects the request", async () => {
    const missing = await readStoredSpots(
      "dxcluster",
      { limit: 50 },
      { now: () => NOW, storageConfig: () => null },
    );
    expect(missing).toMatchObject({
      rows: [],
      status: "unavailable",
      failureReason: "configuration_missing",
      upstreamStatus: null,
    });

    const rejected = await readStoredSpots(
      "dxcluster",
      { limit: 50 },
      {
        fetcher: async () => new Response("nope", { status: 503 }),
        now: () => NOW,
        storageConfig: () => CONFIG,
      },
    );
    expect(rejected).toMatchObject({
      rows: [],
      status: "unavailable",
      failureReason: "upstream_http",
      upstreamStatus: 503,
    });
    expect(spotCacheHeaders(rejected)).toMatchObject({
      "X-Propulse-Spot-Failure": "upstream_http",
      "X-Propulse-Spot-Upstream-Status": "503",
    });
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
    expect(result).toMatchObject({
      rows: [],
      status: "unavailable",
      failureReason: "response_too_large",
    });
  });
});

it.each([15, 30, 60] as const)("bounds a %s-minute history independently of freshness", async (windowMinutes) => {
  const old = new Date(NOW - 45 * 60_000).toISOString();
  const recent = new Date(NOW - 10 * 60_000).toISOString();
  const fetcher = vi.fn(async () => new Response(JSON.stringify([
    row({ spotted_at: old }), row({ spotted_at: recent }),
    row({ spotted_at: new Date(NOW - 61 * 60_000).toISOString() }),
    row({ spotted_at: new Date(NOW + 60_000).toISOString() }),
  ])));
  const result = await readStoredSpots("pskreporter", { limit: 200, windowMinutes }, {
    fetcher, now: () => NOW, storageConfig: () => CONFIG,
  });
  expect(new URL(String(fetcher.mock.calls[0][0])).searchParams.get("spotted_at")).toBe(
    `gte.${new Date(NOW - Math.max(windowMinutes, 30) * 60_000).toISOString()}`,
  );
  expect(result.rows.map(row => row.spotted_at)).toEqual(windowMinutes === 60 ? [recent, old] : [recent]);
  expect(result.observedAt).toBe(recent);
  expect(result.status).toBe("ok");
  expect(result.staleAfterSeconds).toBe(1800);
});

it("retains requested historical reports with stale source state and original timestamps", async () => {
  const observedAt = new Date(NOW - 45 * 60_000).toISOString();
  const result = await readStoredSpots("pskreporter", { limit: 50, windowMinutes: 60 }, {
    fetcher: async () => new Response(JSON.stringify([row({ spotted_at: observedAt })])),
    now: () => NOW, storageConfig: () => CONFIG,
  });
  expect(result.status).toBe("stale");
  expect(result.rows[0].spotted_at).toBe(observedAt);
  expect(result.observedAt).toBe(observedAt);
  expect(result.fetchedAt).toBe(new Date(NOW).toISOString());
  expect(spotCacheHeaders(result)["X-Propulse-Spot-Status"]).toBe("stale");
});

it("keeps inclusive window boundaries, result caps, and bounded storage reads", async () => {
  const boundary = new Date(NOW - 60 * 60_000).toISOString();
  const fetcher = vi.fn(async () => new Response(JSON.stringify([
    row({ spotted_at: boundary }), row(), row(),
  ])));
  const result = await readStoredSpots("pskreporter", { limit: 2, windowMinutes: 60 }, {
    fetcher, now: () => NOW, storageConfig: () => CONFIG,
  });
  expect(result.rows).toHaveLength(2);
  expect(result.rows.every(row => row.spotted_at !== boundary)).toBe(true);
  expect(new URL(String(fetcher.mock.calls[0][0])).searchParams.get("limit")).toBe("8");
  const inclusive = await readStoredSpots("pskreporter", { limit: 3, windowMinutes: 60 }, {
    fetcher, now: () => NOW, storageConfig: () => CONFIG,
  });
  expect(inclusive.rows.at(-1)?.spotted_at).toBe(boundary);
});


it("assesses 30-minute freshness even when the requested history is only 15 minutes", async () => {
  const observedAt = new Date(NOW - 20 * 60_000).toISOString();
  const fetcher = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const lower = Date.parse(url.searchParams.get("spotted_at")!.slice(4));
    return new Response(JSON.stringify(Date.parse(observedAt) >= lower ? [row({ spotted_at: observedAt })] : []));
  });
  const result = await readStoredSpots("pskreporter", { limit: 50, windowMinutes: 15 }, {
    fetcher, now: () => NOW, storageConfig: () => CONFIG,
  });
  expect(result).toMatchObject({ status: "ok", observedAt, rows: [], staleAfterSeconds: 1800 });
});

it("excludes future rows at storage before they can exhaust the row cap", async () => {
  const future = Array.from({ length: 800 }, () => row({ spotted_at: new Date(NOW + 60_000).toISOString() }));
  const fetcher = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const upperFilter = url.searchParams.get("and");
    const upper = upperFilter?.startsWith("(spotted_at.lte.")
      ? Date.parse(upperFilter.slice("(spotted_at.lte.".length, -1))
      : Number.POSITIVE_INFINITY;
    const rows = [...future, row()]
      .filter(r => Date.parse(r.spotted_at) <= upper)
      .slice(0, Number(url.searchParams.get("limit")));
    return new Response(JSON.stringify(rows));
  });
  const result = await readStoredSpots("pskreporter", { limit: 200, windowMinutes: 60 }, {
    fetcher, now: () => NOW, storageConfig: () => CONFIG,
  });
  expect(result.status).toBe("ok");
  expect(result.rows).toHaveLength(1);
});
