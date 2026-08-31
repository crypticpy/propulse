import { describe, expect, it } from "vitest";
import type { LiveSpot } from "@/types/livespot";
import {
  buildActivityResults,
  parseActivityFrequency,
} from "./activityExplorer";

const NOW = new Date("2026-08-31T14:00:00.000Z");
const BASE: LiveSpot = {
  id: "one",
  spotter: "W1AW",
  dx: "K5ABC",
  frequency: 7200,
  mode: "SSB",
  comment: "",
  time: new Date("2026-08-31T13:55:00.000Z"),
  band: "40m",
  dxLat: 31,
  dxLon: -98,
  source: "Cluster",
};

describe("parseActivityFrequency", () => {
  it.each([
    ["7.200", 7200],
    ["7.2 MHz", 7200],
    ["7200", 7200],
    ["7200 kHz", 7200],
  ])("normalizes %s to %s kHz", (input, expected) => {
    expect(parseActivityFrequency(input)).toBe(expected);
  });

  it("rejects empty, negative, and non-frequency input", () => {
    expect(parseActivityFrequency("")).toBeNull();
    expect(parseActivityFrequency("-7.2")).toBeNull();
    expect(parseActivityFrequency("forty meters")).toBeNull();
  });
});

describe("buildActivityResults", () => {
  it("filters by band, age, and distance from the active location", () => {
    const results = buildActivityResults(
      [
        BASE,
        { ...BASE, id: "old", time: new Date("2026-08-31T12:00:00Z") },
        { ...BASE, id: "wrong-band", band: "20m", frequency: 14200 },
        { ...BASE, id: "far", dx: "JA1ZZZ", dxLat: 35, dxLon: 139 },
      ],
      { lat: 30.5, lon: -97 },
      {
        query: { kind: "band", band: "40m" },
        maxAgeMinutes: 30,
        maxDistanceKm: 1000,
        now: NOW,
      },
    );

    expect(results.map((result) => result.callsign)).toEqual(["K5ABC"]);
    expect(results[0].distanceKm).toBeLessThan(120);
  });

  it("uses exact-frequency tolerance and aggregates receivers and sources", () => {
    const results = buildActivityResults(
      [
        BASE,
        {
          ...BASE,
          id: "two",
          spotter: "N0CALL",
          frequency: 7200.8,
          source: "RBN",
        },
        { ...BASE, id: "outside", frequency: 7203 },
      ],
      { lat: 30.5, lon: -97 },
      {
        query: {
          kind: "frequency",
          frequencyKHz: 7200,
          toleranceKHz: 1,
        },
        maxAgeMinutes: 30,
        maxDistanceKm: null,
        now: NOW,
      },
    );

    expect(results).toHaveLength(1);
    expect(results[0].frequencyKHz).not.toBe(7203);
    expect(results[0].reportCount).toBe(2);
    expect(results[0].heardBy).toEqual(
      expect.arrayContaining(["W1AW", "N0CALL"]),
    );
    expect(results[0].sources).toEqual(
      expect.arrayContaining(["Cluster", "RBN"]),
    );
  });

  it("includes unlocated activity only when the range is global", () => {
    const unknown = {
      ...BASE,
      dx: "?",
      dxLat: undefined,
      dxLon: undefined,
    };
    const common = {
      query: { kind: "band", band: "40m" } as const,
      maxAgeMinutes: 30,
      now: NOW,
    };

    expect(
      buildActivityResults([unknown], { lat: 30.5, lon: -97 }, {
        ...common,
        maxDistanceKm: 5000,
      }),
    ).toEqual([]);
    expect(
      buildActivityResults([unknown], { lat: 30.5, lon: -97 }, {
        ...common,
        maxDistanceKm: null,
      }),
    ).toHaveLength(1);
  });

  it("resolves grid and callsign-prefix locations before range filtering", () => {
    const gridLocated = {
      ...BASE,
      id: "grid-located",
      dxLat: undefined,
      dxLon: undefined,
      dxGrid: "EM10",
    };
    const prefixLocated = {
      ...BASE,
      id: "prefix-located",
      dx: "JA1ZZZ",
      dxLat: undefined,
      dxLon: undefined,
      dxGrid: undefined,
    };
    const filters = {
      query: { kind: "band", band: "40m" } as const,
      maxAgeMinutes: 30,
      maxDistanceKm: 1000,
      now: NOW,
    };

    expect(
      buildActivityResults([gridLocated], { lat: 30.5, lon: -97 }, filters),
    ).toHaveLength(1);
    const [prefixResult] = buildActivityResults(
      [prefixLocated],
      { lat: 35.7, lon: 139.7 },
      filters,
    );
    expect(prefixResult.callsign).toBe("JA1ZZZ");
    expect(prefixResult.locationApproximate).toBe(true);
  });

  it("sorts valid string-backed timestamps without throwing", () => {
    const olderStringTime = {
      ...BASE,
      id: "string-time",
      dx: "K5OLD",
      time: "2026-08-31T13:50:00.000Z" as unknown as Date,
    };

    const results = buildActivityResults(
      [olderStringTime, BASE],
      { lat: 30.5, lon: -97 },
      {
        query: { kind: "band", band: "40m" },
        maxAgeMinutes: 30,
        maxDistanceKm: null,
        now: NOW,
      },
    );

    expect(results.map((result) => result.callsign)).toEqual([
      "K5ABC",
      "K5OLD",
    ]);
  });
});
