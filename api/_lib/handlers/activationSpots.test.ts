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
          { ...base, spotId: 2, comments: "QRT now" },
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

  it("accepts ParksnPeaks aliases and converts MHz to kHz", () => {
    expect(
      normalizeSotaSpots(
        [
          {
            actID: "55",
            actCallsign: "n0call",
            actSite: "W5T/CT-001",
            actLocation: "Guadalupe Peak",
            actFreq: "14.062",
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
        frequencyKHz: 14062,
        mode: "CW",
        spotter: "W1AW",
      }),
    ]);
  });

  it("normalizes WWFF epoch timestamps and filters QRT spots", () => {
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
    ).toEqual([
      expect.objectContaining({
        id: "wwff-8",
        program: "WWFF",
        callsign: "VE3XYZ",
        frequencyKHz: 7185,
        spottedAt: "2026-08-31T13:58:00.000Z",
      }),
    ]);
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
});
