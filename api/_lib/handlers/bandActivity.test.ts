import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  handleSpotsBandActivity,
  parseBandActivityRow,
  selectScope,
} from "./bandActivity.js";

const RPC_ROW = {
  band: "20m",
  count_60m: 42,
  obs_20m: 7,
  reporters_20m: 4,
  count_10m_recent: 9,
  count_10m_prior: 6,
  source_counts_60m: { pskreporter: 30, rbn: 12 },
  mode_obs_20m: { digital: 5, cw: 2 },
  p25: 10,
  p50: 22,
  p75: 35,
  p95: 60,
  sample_count: 88,
};

beforeEach(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function stubRpc(
  body: unknown,
  status = 200,
  expectedRpc = "band_activity_counts",
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    expect(url).toBe(
      `https://project.supabase.co/rest/v1/rpc/${expectedRpc}`,
    );
    expect(init?.body).toBeDefined();
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("parseBandActivityRow", () => {
  it("accepts a complete RPC row", () => {
    expect(parseBandActivityRow(RPC_ROW)).toEqual(RPC_ROW);
  });

  it("keeps null climatology fields for bands without a baseline", () => {
    const row = parseBandActivityRow({
      ...RPC_ROW,
      p25: null,
      p50: null,
      p75: null,
      p95: null,
      sample_count: null,
    });
    expect(row?.p95).toBeNull();
    expect(row?.count_60m).toBe(42);
  });

  it("carries the continent on regional rows and tolerates its absence", () => {
    const regional = parseBandActivityRow({ ...RPC_ROW, continent: "EU" });
    expect(regional?.continent).toBe("EU");
    expect(parseBandActivityRow(RPC_ROW)?.continent).toBeUndefined();
  });

  it("defaults missing mode/source maps (pair rows) to empty objects", () => {
    const row = parseBandActivityRow({
      band: "20m",
      count_60m: 5,
      obs_20m: 3,
      reporters_20m: 2,
      count_10m_recent: 2,
      count_10m_prior: 1,
    });
    expect(row?.source_counts_60m).toEqual({});
    expect(row?.mode_obs_20m).toEqual({});
  });

  it("rejects rows with missing or negative counts", () => {
    expect(parseBandActivityRow({ ...RPC_ROW, count_60m: -1 })).toBeNull();
    expect(parseBandActivityRow({ ...RPC_ROW, obs_20m: "7" })).toBeNull();
    expect(parseBandActivityRow({ ...RPC_ROW, band: "" })).toBeNull();
    expect(parseBandActivityRow(null)).toBeNull();
  });

  it("drops malformed source-count entries instead of failing the row", () => {
    const row = parseBandActivityRow({
      ...RPC_ROW,
      source_counts_60m: { pskreporter: 30, rbn: "bad" },
    });
    expect(row?.source_counts_60m).toEqual({ pskreporter: 30 });
  });
});

describe("selectScope", () => {
  const base = "https://propulse.cloud/api/spots/band-activity";

  it("routes bare requests to the global RPC", () => {
    expect(selectScope(new URL(base))).toEqual({
      rpc: "band_activity_counts",
      args: {},
      scope: { type: "global" },
    });
  });

  it("routes a continent to the regional RPC, uppercased", () => {
    expect(selectScope(new URL(`${base}?continent=eu`))).toEqual({
      rpc: "region_activity_counts",
      args: { target_continent: "EU" },
      scope: { type: "regional", continent: "EU" },
    });
  });

  it("routes a field pair to the pair RPC, uppercased", () => {
    expect(selectScope(new URL(`${base}?tx_field=em&rx_field=jo`))).toEqual({
      rpc: "band_pair_counts",
      args: { p_tx_field: "EM", p_rx_field: "JO" },
      scope: { type: "pair", tx_field: "EM", rx_field: "JO" },
    });
  });

  it("rejects invalid continents, invalid fields, and mixed params", () => {
    expect(selectScope(new URL(`${base}?continent=XX`))).toHaveProperty(
      "error",
    );
    expect(
      selectScope(new URL(`${base}?tx_field=ZZ&rx_field=JO`)),
    ).toHaveProperty("error");
    expect(selectScope(new URL(`${base}?tx_field=EM`))).toHaveProperty(
      "error",
    );
    expect(
      selectScope(new URL(`${base}?continent=EU&tx_field=EM&rx_field=JO`)),
    ).toHaveProperty("error");
  });
});

describe("handleSpotsBandActivity", () => {
  it("returns parsed bands in a versioned envelope with a 60s cache", async () => {
    stubRpc([RPC_ROW, { band: 5 }]);
    const res = await handleSpotsBandActivity(
      new Request("https://propulse.cloud/api/spots/band-activity"),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=60");
    const body = (await res.json()) as {
      bands: unknown[];
      meta: { schemaVersion: number; scope: { type: string } };
    };
    expect(body.bands).toEqual([RPC_ROW]);
    expect(body.meta.schemaVersion).toBe(1);
    expect(body.meta.scope).toEqual({ type: "global" });
  });

  it("calls the regional RPC for ?continent= and reports the scope", async () => {
    const fetchMock = stubRpc(
      [{ ...RPC_ROW, continent: "EU" }],
      200,
      "region_activity_counts",
    );
    const res = await handleSpotsBandActivity(
      new Request(
        "https://propulse.cloud/api/spots/band-activity?continent=EU",
      ),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      bands: Array<{ continent?: string }>;
      meta: { scope: Record<string, string> };
    };
    expect(body.meta.scope).toEqual({ type: "regional", continent: "EU" });
    expect(body.bands[0].continent).toBe("EU");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({ target_continent: "EU" });
  });

  it("rejects invalid scope params with 400 before touching the store", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await handleSpotsBandActivity(
      new Request(
        "https://propulse.cloud/api/spots/band-activity?continent=ZZ",
      ),
    );
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers OPTIONS preflight and rejects non-GET", async () => {
    const preflight = await handleSpotsBandActivity(
      new Request("https://propulse.cloud/api/spots/band-activity", {
        method: "OPTIONS",
      }),
    );
    expect(preflight.status).toBe(204);

    const post = await handleSpotsBandActivity(
      new Request("https://propulse.cloud/api/spots/band-activity", {
        method: "POST",
      }),
    );
    expect(post.status).toBe(405);
  });

  it("rejects an oversized RPC response without keeping it", async () => {
    // > 64 KiB body — the bounded reader must bail, not buffer-then-parse.
    stubRpc([{ ...RPC_ROW, band: "x".repeat(70 * 1024) }]);
    const res = await handleSpotsBandActivity(
      new Request("https://propulse.cloud/api/spots/band-activity"),
    );
    expect(res.status).toBe(502);
    const body = (await res.json()) as { bands: unknown[] };
    expect(body.bands).toEqual([]);
  });

  it("returns 502 with empty bands when the store errors", async () => {
    stubRpc({ message: "boom" }, 500);
    const res = await handleSpotsBandActivity(
      new Request("https://propulse.cloud/api/spots/band-activity"),
    );
    expect(res.status).toBe(502);
    const body = (await res.json()) as { bands: unknown[] };
    expect(body.bands).toEqual([]);
  });

  it("returns 503 when Supabase is not configured", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_ANON_KEY", "");
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");
    const res = await handleSpotsBandActivity(
      new Request("https://propulse.cloud/api/spots/band-activity"),
    );
    expect(res.status).toBe(503);
  });
});
