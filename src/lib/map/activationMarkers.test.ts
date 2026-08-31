import { describe, expect, it } from "vitest";
import type { ActivationSpot } from "@/types/activationSpots";
import { resolveActivationMarkers } from "./activationMarkers";

const BASE: ActivationSpot = {
  id: "pota-1",
  program: "POTA",
  callsign: "K5ABC",
  reference: "US-1234",
  referenceName: "Test Park",
  frequencyKHz: 14074,
  mode: "FT8",
  comments: "",
  spotter: "W1AW",
  spottedAt: "2026-08-31T13:59:00.000Z",
};

describe("resolveActivationMarkers", () => {
  it("keeps valid zero coordinates and removes missing or out-of-range points", () => {
    const spots: ActivationSpot[] = [
      { ...BASE, latitude: 0, longitude: 0 },
      { ...BASE, id: "missing", callsign: "N0ONE" },
      { ...BASE, id: "bad-lat", callsign: "N0BAD", latitude: 91, longitude: 2 },
    ];

    expect(resolveActivationMarkers(spots)).toEqual([
      expect.objectContaining({ callsign: "K5ABC", latitude: 0, longitude: 0 }),
    ]);
  });

  it("deduplicates program/callsign/reference and applies the display cap", () => {
    const spots: ActivationSpot[] = [
      { ...BASE, latitude: 30, longitude: -97 },
      { ...BASE, id: "newer-duplicate", latitude: 31, longitude: -98 },
      {
        ...BASE,
        id: "sota-1",
        program: "SOTA",
        reference: "W5T/NT-001",
        latitude: 32,
        longitude: -99,
      },
    ];

    expect(resolveActivationMarkers(spots, 2).map((spot) => spot.id)).toEqual([
      "pota-1",
      "sota-1",
    ]);
  });
});
