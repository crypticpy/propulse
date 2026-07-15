import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchSolarResource, SolarClientError } from "./solarClient";
import { SOLAR_SCHEMA_VERSION, type SolarEnvelope } from "@/lib/solar/contracts";
import { invalidateSolarCache } from "@/lib/utils/idbCache";

const SOURCE = "noaa-k-index" as const;

function envelope(ageMs = 0, value = 2): SolarEnvelope<Array<{ kp: number }>> {
  const now = Date.now();
  return {
    schemaVersion: SOLAR_SCHEMA_VERSION,
    sourceId: SOURCE,
    provider: "NOAA SWPC",
    product: "3-hour observed, estimated, and predicted planetary Kp",
    data: [{ kp: value }],
    observedAt: new Date(now - ageMs).toISOString(),
    fetchedAt: new Date(now).toISOString(),
    sourceUrl: "https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json",
  };
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("solar query client cache contract", () => {
  beforeEach(async () => {
    await invalidateSolarCache(SOURCE);
  });

  it("uses a fresh validated cache entry without another network request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(envelope()));
    vi.stubGlobal("fetch", fetchMock);

    expect((await fetchSolarResource(SOURCE)).cacheOutcome).toBe("network");
    expect((await fetchSolarResource(SOURCE)).cacheOutcome).toBe("fresh-cache");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("preserves a soft-expired last-good response when revalidation fails", async () => {
    const lastGood = envelope(6 * 60_000, 3);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(lastGood))
      .mockRejectedValueOnce(new TypeError("offline"));
    vi.stubGlobal("fetch", fetchMock);

    expect((await fetchSolarResource(SOURCE)).state).toBe("stale");
    const fallback = await fetchSolarResource(SOURCE);
    expect(fallback.state).toBe("stale");
    expect(fallback.cacheOutcome).toBe("stale-on-error");
    expect(fallback.envelope.data).toEqual([{ kp: 3 }]);
    expect(fallback.lastError?.error.code).toBe("NETWORK_ERROR");
  });

  it("replaces stale data after a successful revalidation", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(envelope(6 * 60_000, 1)))
      .mockResolvedValueOnce(jsonResponse(envelope(0, 5)));
    vi.stubGlobal("fetch", fetchMock);

    await fetchSolarResource(SOURCE);
    const refreshed = await fetchSolarResource<Array<{ kp: number }>>(SOURCE);
    expect(refreshed.cacheOutcome).toBe("revalidated");
    expect(refreshed.state).toBe("fresh");
    expect(refreshed.envelope.data[0]?.kp).toBe(5);
  });

  it("rejects provider data beyond the hard usability limit", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(envelope(31 * 60_000))));

    await expect(fetchSolarResource(SOURCE)).rejects.toMatchObject({
      body: { error: { code: "HARD_EXPIRED" } },
    });
  });

  it("does not serve a hard-expired cached response after an outage", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(envelope(31 * 60_000)))
      .mockRejectedValueOnce(new TypeError("offline"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchSolarResource(SOURCE)).rejects.toBeInstanceOf(SolarClientError);
    await expect(fetchSolarResource(SOURCE)).rejects.toMatchObject({
      body: { error: { code: "NETWORK_ERROR" } },
    });
  });

  it("rejects contract-incompatible service-worker responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ ...envelope(), schemaVersion: 0 })),
    );

    await expect(fetchSolarResource(SOURCE)).rejects.toMatchObject({
      body: { error: { code: "CONTRACT_MISMATCH" } },
    });
  });

  it("rejects non-JSON success responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<!doctype html>", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        }),
      ),
    );

    await expect(fetchSolarResource(SOURCE)).rejects.toMatchObject({
      body: { error: { code: "WRONG_CONTENT_TYPE" } },
    });
  });

  it("de-duplicates simultaneous requests for one source", async () => {
    let release!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const fetchMock = vi.fn().mockReturnValue(pending);
    vi.stubGlobal("fetch", fetchMock);

    const first = fetchSolarResource(SOURCE);
    const second = fetchSolarResource(SOURCE);
    release(jsonResponse(envelope()));

    const [left, right] = await Promise.all([first, second]);
    expect(left.envelope).toEqual(right.envelope);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
