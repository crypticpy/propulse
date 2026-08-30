import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  handleSpotsBandLadder,
  parseVerdictScopeRow,
} from "./bandLadder.js";

const STATE_ROW = {
  band: "20m",
  scope_type: "global",
  scope_key: "",
  state: "verified",
  stable_since: "2026-08-30T12:05:00.000Z",
  candidate: null,
  candidate_since: null,
  surprise: false,
  opened_at: "2026-08-30T12:05:00.000Z",
  inputs: { obs_20m: 8, reporters_20m: 4, trend: "steady" },
  updated_at: "2026-08-30T12:30:00.000Z",
};

beforeEach(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function stubRead(body: unknown, status = 200): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    expect(url).toContain(
      "https://project.supabase.co/rest/v1/verdict_states?",
    );
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("parseVerdictScopeRow", () => {
  it("accepts a complete state row", () => {
    expect(parseVerdictScopeRow(STATE_ROW)).toEqual(STATE_ROW);
  });

  it("accepts a regional row with a candidate on hold", () => {
    const row = parseVerdictScopeRow({
      ...STATE_ROW,
      scope_type: "regional",
      scope_key: "EU",
      candidate: "hot",
      candidate_since: "2026-08-30T12:25:00.000Z",
      surprise: true,
    });
    expect(row).toMatchObject({
      scope_key: "EU",
      candidate: "hot",
      surprise: true,
    });
  });

  it("rejects rows with an unknown state or scope type", () => {
    expect(
      parseVerdictScopeRow({ ...STATE_ROW, state: "sizzling" }),
    ).toBeNull();
    expect(
      parseVerdictScopeRow({ ...STATE_ROW, scope_type: "galactic" }),
    ).toBeNull();
    expect(parseVerdictScopeRow({ ...STATE_ROW, band: "" })).toBeNull();
    expect(parseVerdictScopeRow(null)).toBeNull();
  });
});

describe("handleSpotsBandLadder", () => {
  it("returns parsed scopes in a versioned envelope with a 30s cache", async () => {
    stubRead([STATE_ROW, { band: 5 }]);
    const res = await handleSpotsBandLadder(
      new Request("https://propulse.cloud/api/spots/band-ladder"),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=30");
    const body = (await res.json()) as {
      scopes: unknown[];
      meta: { schemaVersion: number };
    };
    expect(body.scopes).toEqual([STATE_ROW]);
    expect(body.meta.schemaVersion).toBe(1);
  });

  it("answers OPTIONS preflight and rejects non-GET", async () => {
    const preflight = await handleSpotsBandLadder(
      new Request("https://propulse.cloud/api/spots/band-ladder", {
        method: "OPTIONS",
      }),
    );
    expect(preflight.status).toBe(204);

    const post = await handleSpotsBandLadder(
      new Request("https://propulse.cloud/api/spots/band-ladder", {
        method: "POST",
      }),
    );
    expect(post.status).toBe(405);
  });

  it("returns 502 with empty scopes when the store errors", async () => {
    stubRead({ message: "boom" }, 500);
    const res = await handleSpotsBandLadder(
      new Request("https://propulse.cloud/api/spots/band-ladder"),
    );
    expect(res.status).toBe(502);
    const body = (await res.json()) as { scopes: unknown[] };
    expect(body.scopes).toEqual([]);
  });

  it("returns 503 when Supabase is not configured", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_ANON_KEY", "");
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");
    const res = await handleSpotsBandLadder(
      new Request("https://propulse.cloud/api/spots/band-ladder"),
    );
    expect(res.status).toBe(503);
  });
});
