import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { handleSpotsBandHistory } from "./bandHistory";
import {
  bandHistoryHours,
  parseStoredBandHistory,
} from "../../../src/lib/hamclock/bandHistory";

vi.mock("../rateLimit.js", () => ({ applyRateLimit: () => null }));
const row = {
  hour_utc: "2026-09-06T19:00:00Z",
  band: "20m",
  spot_count: 8,
  source_counts: { rbn: 8 },
  mode_counts: { CW: 8 },
};
const request = (suffix = "") =>
  new Request(`https://propulse.cloud/api/spots/band-history${suffix}`);
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-06T20:30:00Z"));
  vi.stubEnv("VITE_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-key");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("bounds the existing aggregate query to six completed UTC hours and selected fields", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify([row])));
  vi.stubGlobal("fetch", fetcher);
  const response = await handleSpotsBandHistory(request());
  expect(response.status).toBe(200);
  const url = new URL(String(fetcher.mock.calls[0][0]));
  expect(url.pathname).toBe("/rest/v1/band_hourly_stats");
  expect(url.searchParams.getAll("hour_utc")).toEqual([
    "gte.2026-09-06T14:00:00.000Z",
    "lt.2026-09-06T20:00:00.000Z",
  ]);
  expect(url.searchParams.get("select")).not.toContain("*");
  const body = await response.json();
  expect(body.scope).toBe("global");
  expect(bandHistoryHours(body).map((h) => h.count)).toEqual([
    null,
    null,
    null,
    null,
    null,
    8,
  ]);
});
it("does not silently replace scoped history with global counts", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  expect((await handleSpotsBandHistory(request("?continent=EU"))).status).toBe(
    400,
  );
  expect(fetcher).not.toHaveBeenCalled();
});
it.each(
  [
    [{ ...row, spot_count: -1 }],
    [row, row],
    [{ ...row, hour_utc: "2026-09-06T20:00:00Z" }],
    { error: "oops" },
  ].map((payload) => [payload]),
)(
  "rejects malformed, duplicate and incomplete-hour payloads",
  async (payload) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify(payload))),
    );
    expect((await handleSpotsBandHistory(request())).status).toBe(502);
  },
);
it("keeps a recorded zero distinct from a missing row", () => {
  expect(parseStoredBandHistory({ ...row, spot_count: 0 })?.count).toBe(0);
  expect(
    parseStoredBandHistory({ ...row, source_counts: { rbn: -1 } }),
  ).toBeNull();
});
it("returns no-store failure on upstream errors and rejects writes", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("down", { status: 503 })),
  );
  const response = await handleSpotsBandHistory(request());
  expect(response.status).toBe(502);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(
    (await handleSpotsBandHistory(new Request(request(), { method: "POST" })))
      .status,
  ).toBe(405);
});

it("aborts a stalled upstream request", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_input: unknown, options: RequestInit) =>
        new Promise((_resolve, reject) => {
          options.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    ),
  );
  const pending = handleSpotsBandHistory(request());
  await vi.advanceTimersByTimeAsync(5001);
  const response = await pending;
  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({ error: "Band history timed out" });
});

it("returns unknown hours for an empty successful aggregate read", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("[]")));
  const response = await handleSpotsBandHistory(request());
  expect(response.status).toBe(200);
  expect(
    bandHistoryHours(await response.json()).every(
      (hour) => hour.count === null,
    ),
  ).toBe(true);
});

it("keeps the timeout active while reading a stalled body", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn((_input: unknown, options: RequestInit) =>
      Promise.resolve(
        new Response(
          new ReadableStream({
            start(controller) {
              options.signal?.addEventListener("abort", () =>
                controller.error(new DOMException("Aborted", "AbortError")),
              );
            },
          }),
        ),
      ),
    ),
  );
  const pending = handleSpotsBandHistory(request());
  await vi.advanceTimersByTimeAsync(5001);
  expect((await pending).status).toBe(502);
});

it("rejects a bodyless success instead of inventing empty history", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null)));
  const response = await handleSpotsBandHistory(request());
  expect(response.status).toBe(502);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
});
