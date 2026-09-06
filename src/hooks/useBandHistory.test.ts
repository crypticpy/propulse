import { afterEach, expect, it, vi } from "vitest";
import { fetchBandHistory } from "./useBandHistory";
afterEach(() => vi.unstubAllGlobals());
const payload = {
  scope: "global",
  windowStart: "2026-09-06T14:00:00Z",
  windowEnd: "2026-09-06T20:00:00Z",
  fetchedAt: "2026-09-06T20:10:00Z",
  rows: [],
};
it("retains empty successful history as missing data", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify(payload))),
  );
  expect(await fetchBandHistory()).toEqual(payload);
});
it.each([
  { ...payload, scope: "regional" },
  { ...payload, windowEnd: "bad" },
  { ...payload, rows: [null] },
])("rejects malformed history contracts", async (value) => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify(value))),
  );
  await expect(fetchBandHistory()).rejects.toThrow();
});
it("does not turn a failed request into a successful empty chart", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("down", { status: 502 })),
  );
  await expect(fetchBandHistory()).rejects.toThrow(
    "Band history unavailable (502)",
  );
});

it("rejects duplicate, out-of-window and unaligned history", async () => {
  const row = { hour: "2026-09-06T19:00:00Z", band: "20m", count: 3, sources: {}, modes: {} };
  for (const value of [
    { ...payload, rows: [row, row] },
    { ...payload, rows: [{ ...row, hour: payload.windowEnd }] },
    { ...payload, windowStart: "2026-09-06T14:30:00Z", windowEnd: "2026-09-06T20:30:00Z" },
  ]) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(value))));
    await expect(fetchBandHistory()).rejects.toThrow();
  }
});
