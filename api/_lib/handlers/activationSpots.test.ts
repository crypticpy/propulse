import { afterEach, describe, expect, it, vi } from "vitest";
import {
  handleActivationSpots,
  normalizePotaSpots,
  normalizeSotaSpots,
  normalizeWwffSpots,
} from "./activationSpots";
import type { ActivationSpotsResponse } from "../../../src/types/activationSpots";

const NOW = Date.parse("2026-08-31T14:00:00.000Z");

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("activation feed normalization", () => {
  it("normalizes live POTA rows and rejects stale, invalid, and QRT rows", () => {
    const base = {
      activator: "k5abc",
      reference: "US-1234",
      frequency: "14074",
      mode: "ft8",
      spotTime: "2026-08-31T13:50:00",
      latitude: "30.2",
      longitude: "-97.7",
      grid6: "EM10aa",
    };

    expect(
      normalizePotaSpots(
        [
          { ...base, spotId: 1, name: "Test Park" },
          {
            ...base,
            spotId: 2,
            reference: "US-9999",
            comments: "QRT now",
          },
          { ...base, spotId: 3, invalid: true },
          { ...base, spotId: 4, spotTime: "2026-08-31T09:00:00" },
        ],
        NOW,
      ),
    ).toEqual([
      expect.objectContaining({
        id: "pota-1",
        program: "POTA",
        callsign: "K5ABC",
        referenceName: "Test Park",
        frequencyKHz: 14074,
        spottedAt: "2026-08-31T13:50:00.000Z",
        latitude: 30.2,
        longitude: -97.7,
        grid: "EM10AA",
      }),
    ]);
  });

  it("keeps valid low-frequency POTA spots locationless when coordinates are blank", () => {
    const [spot] = normalizePotaSpots(
      [
        {
          spotId: 5,
          activator: "K1LOW",
          reference: "US-0472",
          frequency: "472",
          mode: "CW",
          spotTime: "2026-08-31T13:55:00Z",
          latitude: null,
          longitude: "",
        },
      ],
      NOW,
    );

    expect(spot).toMatchObject({ frequencyKHz: 472 });
    expect(spot).not.toHaveProperty("latitude");
    expect(spot).not.toHaveProperty("longitude");
  });

  it("accepts ParksnPeaks aliases and converts MHz to kHz", () => {
    expect(
      normalizeSotaSpots(
        [
          {
            actID: "55",
            actCallsign: "n0call",
            actSite: "W5T/CT-001",
            actLocation: "Guadalupe Peak",
            actFreq: "1296.1",
            actMode: "cw",
            actDateTime: "2026-08-31T13:55:00Z",
            actSpoter: "W1AW",
          },
        ],
        NOW,
      ),
    ).toEqual([
      expect.objectContaining({
        id: "sota-55",
        program: "SOTA",
        callsign: "N0CALL",
        reference: "W5T/CT-001",
        frequencyKHz: 1296100,
        mode: "CW",
        spotter: "W1AW",
      }),
    ]);
  });

  it("lets a newer WWFF QRT status suppress the older live spot", () => {
    expect(
      normalizeWwffSpots(
        [
          {
            id: 8,
            activator: "VE3XYZ",
            reference: "VEFF-0001",
            reference_name: "Example Reserve",
            frequency_khz: 7185,
            mode: "SSB",
            spot_time: NOW / 1000 - 120,
            latitude: 43.7,
            longitude: -79.4,
          },
          {
            id: 9,
            activator: "VE3XYZ",
            reference: "VEFF-0001",
            frequency_khz: 7185,
            spot_time: NOW / 1000 - 60,
            remarks: "QRT",
          },
        ],
        NOW,
      ),
    ).toEqual([]);
  });
});

describe("handleActivationSpots", () => {
  it("returns healthy feeds when one provider is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json([
            {
              spotId: 1,
              activator: "K5ABC",
              reference: "US-1234",
              frequency: "14074",
              mode: "FT8",
              spotTime: new Date(Date.now() - 60_000)
                .toISOString()
                .replace(".000Z", ""),
            },
          ]),
        )
        .mockRejectedValueOnce(new Error("syndication offline"))
        .mockResolvedValueOnce(Response.json([])),
    );

    const response = await handleActivationSpots(
      new Request("https://propulse.test/api/activation/spots", {
        headers: { "x-forwarded-for": "192.0.2.93" },
      }),
    );
    const payload = (await response.json()) as ActivationSpotsResponse;

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=30");
    expect(payload.spots).toHaveLength(1);
    expect(payload.sources).toEqual([
      expect.objectContaining({ program: "POTA", status: "ok", count: 1 }),
      expect.objectContaining({
        program: "SOTA",
        status: "unavailable",
        count: 0,
      }),
      expect.objectContaining({ program: "WWFF", status: "ok", count: 0 }),
    ]);
  });

  it("rejects unsupported methods without contacting providers", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await handleActivationSpots(
      new Request("https://propulse.test/api/activation/spots", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(405);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("marks a non-empty provider payload with no recognized rows invalid", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json([{ unexpected: true }]))
        .mockResolvedValueOnce(Response.json([]))
        .mockResolvedValueOnce(Response.json([])),
    );

    const response = await handleActivationSpots(
      new Request("https://propulse.test/api/activation/spots", {
        headers: { "x-forwarded-for": "192.0.2.94" },
      }),
    );
    const payload = (await response.json()) as ActivationSpotsResponse;

    expect(response.status).toBe(200);
    expect(payload.sources[0]).toMatchObject({
      program: "POTA",
      status: "invalid",
      count: 0,
    });
  });
});


it("records each provider completion independently and never stamps a failure as fetched", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  let release!: (response: Response) => void;
  vi.stubGlobal("fetch", vi.fn((url: string) => {
    if (url.includes("wwff")) return new Promise<Response>((resolve) => { release = resolve; });
    return Promise.resolve(url.includes("parksnpeaks")
      ? new Response("unavailable", { status: 503 })
      : new Response("[]"));
  }));
  const pending = handleActivationSpots(new Request("https://propulse.test/api/activation/spots"));
  await vi.advanceTimersByTimeAsync(0);
  vi.setSystemTime(NOW + 5000);
  release(new Response("[]"));
  const body = await (await pending).json() as ActivationSpotsResponse;
  expect(body.sources.find((source) => source.program === "POTA")).toMatchObject({
    status: "ok", checkedAt: new Date(NOW).toISOString(), fetchedAt: new Date(NOW).toISOString(), count: 0,
  });
  expect(body.sources.find((source) => source.program === "SOTA")).toMatchObject({
    status: "unavailable", checkedAt: new Date(NOW).toISOString(), fetchedAt: null,
  });
  expect(body.sources.find((source) => source.program === "WWFF")).toMatchObject({
    status: "ok", checkedAt: new Date(NOW + 5000).toISOString(), fetchedAt: new Date(NOW + 5000).toISOString(),
  });
});

it("classifies a successful HTTP response without JSON as invalid, not an empty feed", async () => {
  vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(new Response(null))));
  const body = await (await handleActivationSpots(new Request("https://propulse.test/api/activation/spots"))).json() as ActivationSpotsResponse;
  expect(body.sources).toHaveLength(3);
  for (const source of body.sources) expect(source).toMatchObject({ status: "invalid", fetchedAt: null, count: 0 });
});
