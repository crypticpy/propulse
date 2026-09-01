import { describe, expect, it } from "vitest";
import type { LiveSpot } from "@/types/livespot";
import { selectMapSpotCandidates } from "./spotCandidates";

function spot(
  id: string,
  overrides: Partial<LiveSpot> = {},
): LiveSpot {
  return {
    id,
    dx: id,
    spotter: "N0CALL",
    frequency: 14_074,
    band: "20m",
    mode: "FT8",
    comment: "",
    time: new Date("2026-01-01T00:00:00Z"),
    source: "PSKReporter",
    ...overrides,
  };
}

describe("selectMapSpotCandidates", () => {
  it("applies source, band, and mode filters before the draw cap", () => {
    const spots = [
      spot("wrong-source", { source: "RBN", mode: "CW" }),
      spot("wrong-band", { band: "40m" }),
      spot("first"),
      spot("second"),
    ];

    expect(
      selectMapSpotCandidates(spots, {
        sources: ["PSKReporter"],
        spotFilters: { bands: ["20M"], modes: ["ft8"] },
        maxSpots: 1,
      }).map(({ id }) => id),
    ).toEqual(["first"]);
  });

  it("keeps spots whose source omitted optional filter metadata", () => {
    const incomplete = spot("incomplete", {
      band: undefined,
      mode: "",
    });

    expect(
      selectMapSpotCandidates([incomplete], {
        spotFilters: { bands: ["40m"], modes: ["CW"] },
      }),
    ).toEqual([incomplete]);
  });

  it("treats empty filters as all spots and tolerates a zero cap", () => {
    const spots = [spot("one"), spot("two", { source: "RBN" })];

    expect(
      selectMapSpotCandidates(spots, {
        sources: [],
        spotFilters: { bands: [], modes: [] },
      }),
    ).toEqual(spots);
    expect(selectMapSpotCandidates(spots, { maxSpots: 0 })).toEqual([]);
  });
});
