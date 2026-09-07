import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import dxClusterRoute from "./dxcluster.js";
import pskReporterRoute from "./pskreporter.js";
import rbnRoute from "./rbn.js";

const dxClusterHandler = dxClusterRoute.fetch;
const pskReporterHandler = pskReporterRoute.fetch;
const rbnHandler = rbnRoute.fetch;

const NOW = new Date("2026-07-19T14:00:00Z");
let requestedSources: string[];

function storedRow(source: "pskreporter" | "rbn" | "dxcluster") {
  return {
    source,
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
    mode: source === "rbn" ? "CW" : "FT8",
    snr: -12,
    wpm: source === "rbn" ? 24 : null,
    comment: source === "dxcluster" ? "FT8 heard" : null,
    dxcc: source === "dxcluster" ? 291 : null,
    continent: "NA",
  };
}

beforeEach(() => {
  requestedSources = [];
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("VITE_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-key");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      const rawSource = url.searchParams.get("source");
      if (
        rawSource !== "eq.pskreporter" &&
        rawSource !== "eq.rbn" &&
        rawSource !== "eq.dxcluster"
      ) {
        throw new Error(`Unexpected source query: ${rawSource}`);
      }
      requestedSources.push(rawSource);
      const source = rawSource.slice(3) as "pskreporter" | "rbn" | "dxcluster";
      return new Response(JSON.stringify([storedRow(source)]), {
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("stored spot routes", () => {
  it("preserves each existing spot shape inside a versioned envelope", async () => {
    const psk = await pskReporterHandler(
      new Request("https://propulse.cloud/api/spots/pskreporter?grid=DM79&limit=50"),
    );
    const rbn = await rbnHandler(
      new Request("https://propulse.cloud/api/spots/rbn?limit=50"),
    );
    const dx = await dxClusterHandler(
      new Request("https://propulse.cloud/api/spots/dxcluster?limit=50"),
    );

    expect([psk.status, rbn.status, dx.status]).toEqual([200, 200, 200]);
    expect(requestedSources).toEqual([
      "eq.pskreporter",
      "eq.rbn",
      "eq.dxcluster",
    ]);
    expect(psk.headers.get("X-Propulse-Spot-Status")).toBe("ok");
    expect(await psk.json()).toMatchObject({
      spots: [
        {
          senderCallsign: "K0ABC",
          receiverCallsign: "N0XYZ",
          frequency: 14_074_000,
          mode: "FT8",
        },
      ],
      meta: { schemaVersion: 1, source: "pskreporter", status: "ok" },
    });
    expect(await rbn.json()).toMatchObject({
      spots: [
        {
          callsign: "K0ABC",
          de_pfx: "N0XYZ",
          freq: 14074,
          band: 20,
          mode: "CW",
        },
      ],
      meta: { schemaVersion: 1, source: "rbn", status: "ok" },
    });
    expect(await dx.json()).toMatchObject({
      spots: [
        {
          spotter: "N0XYZ",
          dx: "K0ABC",
          frequency: 14074,
          band: "20m",
        },
      ],
      meta: { schemaVersion: 1, source: "dxcluster", status: "ok" },
    });
  });

  it("returns a cacheable 200 degraded envelope when the store is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("upstream down", { status: 503 })));
    const response = await rbnHandler(
      new Request("https://propulse.cloud/api/spots/rbn?limit=50"),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Propulse-Spot-Status")).toBe("unavailable");
    expect(response.headers.get("Cache-Control")).toContain("s-maxage=15");
    expect(await response.json()).toMatchObject({
      spots: [],
      meta: { source: "rbn", status: "unavailable" },
    });
  });

  it("rejects invalid requests without contacting storage", async () => {
    const invalidGrid = await pskReporterHandler(
      new Request("https://propulse.cloud/api/spots/pskreporter?grid=not-a-grid"),
    );
    const invalidBand = await rbnHandler(
      new Request("https://propulse.cloud/api/spots/rbn?band=20,,40"),
    );
    const invalidMode = await rbnHandler(
      new Request("https://propulse.cloud/api/spots/rbn?mode=CW,"),
    );
    const wrongMethod = await dxClusterHandler(
      new Request("https://propulse.cloud/api/spots/dxcluster", { method: "POST" }),
    );
    expect([
      invalidGrid.status,
      invalidBand.status,
      invalidMode.status,
      wrongMethod.status,
    ]).toEqual([400, 400, 400, 405]);
    expect(fetch).not.toHaveBeenCalled();
  });
});

const HISTORY_ROUTES = [
  ["dxcluster", dxClusterHandler], ["pskreporter", pskReporterHandler], ["rbn", rbnHandler],
] as const;

it.each(HISTORY_ROUTES)("%s exposes each bounded window and defaults to 30", async (source, handler) => {
  for (const minutes of [undefined, 15, 30, 60]) {
    const response = await handler(new Request(`https://propulse.cloud/api/spots/${source}${minutes ? `?windowMinutes=${minutes}` : ""}`));
    expect(response.status).toBe(200);
    expect((await response.json()).meta.windowMinutes).toBe(minutes ?? 30);
    const lastCall = vi.mocked(fetch).mock.calls.at(-1)!;
    expect(new URL(String(lastCall[0])).searchParams.get("spotted_at")).toBe(
      `gte.${new Date(NOW.getTime() - Math.max(minutes ?? 30, 30) * 60_000).toISOString()}`,
    );
  }
});

it.each(HISTORY_ROUTES)("%s rejects unsupported, malformed and duplicate windows before storage", async (source, handler) => {
  for (const query of ["0", "360", "1440", "60x", "30.0", "120x", "120.0", "", "30&windowMinutes=60"]) {
    const response = await handler(new Request(`https://propulse.cloud/api/spots/${source}?windowMinutes=${query}`));
    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  }
  expect(fetch).not.toHaveBeenCalled();
});

it.each(HISTORY_ROUTES)("%s carries historical rows without renewing stale source state", async (source, handler) => {
  const observedAt = "2026-07-19T13:15:00.000Z";
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify([
    { ...storedRow(source), spotted_at: observedAt },
  ])));
  const response = await handler(new Request(`https://propulse.cloud/api/spots/${source}?windowMinutes=60`));
  const body = await response.json();
  expect(body.spots).toHaveLength(1);
  expect(body.meta).toMatchObject({ status: "stale", observedAt, windowMinutes: 60, staleAfterSeconds: 1800 });
  expect(response.headers.get("X-Propulse-Spot-Status")).toBe("stale");
});


it("confirms two-hour history only for DX Cluster, without widening PSK or RBN", async () => {
  const response = await dxClusterHandler(new Request("https://propulse.cloud/api/spots/dxcluster?windowMinutes=120"));
  expect(response.status).toBe(200);
  expect((await response.json()).meta.windowMinutes).toBe(120);
  expect(new URL(String(vi.mocked(fetch).mock.calls.at(-1)![0])).searchParams.get("spotted_at"))
    .toBe(`gte.${new Date(NOW.getTime() - 120 * 60_000).toISOString()}`);
  vi.mocked(fetch).mockClear();
  for (const handler of [pskReporterHandler, rbnHandler]) {
    const rejected = await handler(new Request("https://propulse.cloud/api/spots/test?windowMinutes=120"));
    expect(rejected.status).toBe(400);
  }
  expect(fetch).not.toHaveBeenCalled();
});
