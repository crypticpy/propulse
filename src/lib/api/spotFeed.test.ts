import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPSKReporterFeed } from "./pskreporter";
import { fetchRBNFeed } from "./rbn";
import { fetchClusterFeed, fetchClusterSpots } from "./dxcluster";
import { readSpotFeedMetadata, spotFeedWindowParameter, type SpotWindowMinutes } from "./spotFeed";

const fetchedAt = "2026-09-07T02:00:00.000Z";
const observedAt = "2026-09-07T01:15:00.000Z";
const clients = [
  { source: "pskreporter" as const, read: (window?: SpotWindowMinutes) => fetchPSKReporterFeed(undefined, undefined, 200, window),
    row: { senderCallsign: "K0TEST", receiverCallsign: "N0TEST", senderLocator: "FN31", receiverLocator: "EM38", frequency: 14074000, mode: "FT8", flowStartSeconds: Date.parse(observedAt) / 1000 } },
  { source: "rbn" as const, read: (window?: SpotWindowMinutes) => fetchRBNFeed(200, window),
    row: { callsign: "K0TEST", de_pfx: "N0TEST", de_cont: "NA", dx_pfx: "K", dx_cont: "NA", freq: 14074, band: 20, mode: "CW", db: 10, wpm: 20, time: Date.parse(observedAt) / 1000, spotted_time: observedAt } },
  { source: "dxcluster" as const, read: (window?: SpotWindowMinutes) => fetchClusterFeed(200, window),
    row: { id: "one", dx: "K0TEST", spotter: "N0TEST", frequency: 14074, time: observedAt, mode: "FT8", band: "20M" } },
];
function meta(source: string, windowMinutes = 60) {
  return { schemaVersion: 1, source, status: "stale", observedAt, fetchedAt, staleAfterSeconds: 1800, windowMinutes };
}
function respond(body: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } })));
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe.each(clients)("$source history feed", ({ source, read, row }) => {
  it("preserves stale reports, metadata and original observation time", async () => {
    respond({ spots: [row], meta: meta(source) });
    const feed = await read(60);
    expect(feed.spots[0].time.getTime()).toBe(Date.parse(observedAt));
    expect(feed.metadata).toEqual({ source, status: "stale", observedAt: Date.parse(observedAt), fetchedAt: Date.parse(fetchedAt), staleAfterSeconds: 1800, windowMinutes: 60 });
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain("windowMinutes=60");
  });
  it.each([15, 30, 60] as const)("requests and verifies a %s-minute window", async (minutes) => {
    respond({ spots: [], meta: { ...meta(source, minutes), status: "stale", observedAt: null } });
    expect((await read(minutes)).metadata.windowMinutes).toBe(minutes);
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain(`windowMinutes=${minutes}`);
  });
  it("rejects an unavailable HTTP-200 envelope", async () => {
    respond({ spots: [], meta: { status: "unavailable" } });
    await expect(read(60)).rejects.toThrow(/unavailable/);
  });
  it("rejects wrong-source, mismatched-window and invalid timestamp metadata", async () => {
    for (const patch of [{ source: "wrong" }, { windowMinutes: 30 }, { fetchedAt: "invalid" }, { observedAt: "2026-09-07T03:00:00.000Z" }]) {
      respond({ spots: [row], meta: { ...meta(source), ...patch } });
      await expect(read(60)).rejects.toThrow();
    }
  });
  it("does not silently accept an old deployment for an explicit window", async () => {
    respond({ spots: [row], meta: { ...meta(source), windowMinutes: undefined } });
    await expect(read(60)).rejects.toThrow(/confirm/);
    respond({ spots: [row] });
    await expect(read(60)).rejects.toThrow(/confirm/);
  });
  it("marks legacy payloads unknown without inventing source timestamps", async () => {
    respond([row]);
    const feed = await read();
    expect(feed.spots).toHaveLength(1);
    expect(feed.metadata).toMatchObject({ status: "unknown", windowMinutes: null, fetchedAt: null, observedAt: null });
  });
  it("rejects transport and HTTP failures for evidence consumers", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    await expect(read(60)).rejects.toThrow(/offline/);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
    await expect(read(60)).rejects.toThrow(/503/);
  });
});

it("does not manufacture a current DX report from an invalid time or frequency", async () => {
  for (const patch of [{ time: "invalid" }, { time: "2460" }, { frequency: "14074junk" }]) {
    respond({ spots: [{ ...clients[2].row, ...patch }], meta: meta("dxcluster") });
    await expect(fetchClusterFeed(200, 60)).rejects.toThrow(/valid reports/);
  }
});

it("keeps the legacy DX array fallback while the feed API exposes errors", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
  await expect(fetchClusterSpots()).resolves.toEqual([]);
});

it("rejects invalid windows before any source request and malformed versioned metadata", () => {
  expect(() => spotFeedWindowParameter(360 as SpotWindowMinutes)).toThrow(/Unsupported/);
  for (const patch of [{ schemaVersion: 2 }, { windowMinutes: "60" }, { status: "bogus" }, { staleAfterSeconds: -1 }]) {
    expect(() => readSpotFeedMetadata({ meta: { ...meta("rbn"), ...patch } }, "rbn", 60)).toThrow(/invalid/);
  }
});


it("filters invalid CSV dates/times/frequencies without manufacturing a current report", async () => {
  const valid = "W3LPL^28022.0^EA6EJ^CW heard^1606 2026-02-05^L^E^EU^10M";
  const invalid = [
    valid.replace("1606 2026-02-05", "broken"),
    valid.replace("1606", "2460"),
    valid.replace("2026-02-05", "2026-02-30"),
    valid.replace("28022.0", "nope"),
    valid.replace("28022.0", "28022junk"),
    valid.replace("28022.0", "0"),
  ];
  vi.stubGlobal("fetch", vi.fn(async () => new Response([valid, ...invalid].join("\n"), { headers: { "Content-Type": "text/plain" } })));
  const feed = await fetchClusterFeed();
  expect(feed.spots).toHaveLength(1);
  expect(feed.spots[0].time.toISOString()).toBe("2026-02-05T16:06:00.000Z");
  expect(feed.metadata.status).toBe("unknown");
});

it("uses UTC rollover for valid time-only CSV reports", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-07T00:01:00Z"));
  vi.stubGlobal("fetch", vi.fn(async () => new Response("W3LPL^14074^EA6EJ^FT8^2359^L^E^EU^20M", { headers: { "Content-Type": "text/plain" } })));
  expect((await fetchClusterFeed()).spots[0].time.toISOString()).toBe("2026-09-06T23:59:00.000Z");
});


it("requests and verifies the DX-only two-hour source contract", async () => {
  respond({ spots: [clients[2].row], meta: meta("dxcluster", 120) });
  const feed = await fetchClusterFeed(200, 120);
  expect(feed.metadata.windowMinutes).toBe(120);
  expect(feed.spots[0].time.toISOString()).toBe(observedAt);
  expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain("windowMinutes=120");
  respond({ spots: [], meta: meta("dxcluster", 60) });
  await expect(fetchClusterFeed(200, 120)).rejects.toThrow(/does not confirm/);
  for (const source of ["pskreporter", "rbn"] as const) {
    expect(() => readSpotFeedMetadata({ meta: meta(source, 120) }, source)).toThrow(/invalid feed metadata/);
    expect(() => spotFeedWindowParameter(120, source)).toThrow(/Unsupported/);
  }
});
