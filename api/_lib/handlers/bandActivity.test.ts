import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  handleSpotsBandActivity,
  parseBandActivityRow,
} from "./bandActivity.js";

const RPC_ROW = {
  band: "20m",
  count_60m: 42,
  obs_20m: 7,
  reporters_20m: 4,
  count_10m_recent: 9,
  count_10m_prior: 6,
  source_counts_60m: { pskreporter: 30, rbn: 12 },
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

function stubRpc(body: unknown, status = 200): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    expect(url).toBe(
      "https://project.supabase.co/rest/v1/rpc/band_activity_counts",
    );
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
      meta: { schemaVersion: number };
    };
    expect(body.bands).toEqual([RPC_ROW]);
    expect(body.meta.schemaVersion).toBe(1);
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
