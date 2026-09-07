import { describe, expect, it } from "vitest";
import { createNormalizedSpot } from "@/lib/views/fixtures";
import { mergeDuplicateReports } from "./identity";

describe("duplicate report merge", () => {
  it("picks coordinates, SNR, and sourceRefs independently of merge order", () => {
    const precise = {
      ...createNormalizedSpot("psk-precise"),
      snrDb: -5,
      dx: {
        callsign: "TEST1DX",
        role: "transmitter" as const,
        location: { kind: "reported-coordinate" as const, coordinates: { lat: 40.4, lon: -3.7 } },
      },
      sourceRefs: [{ source: "PSKReporter" as const, sourceReportId: "psk-precise" }],
    };
    const coarse = {
      ...createNormalizedSpot("psk-coarse"),
      snrDb: -18,
      dx: {
        callsign: "TEST1DX",
        role: "transmitter" as const,
        location: { kind: "reported-coordinate" as const, coordinates: { lat: 40.41, lon: -3.71 } },
      },
      sourceRefs: [{ source: "PSKReporter" as const, sourceReportId: "psk-coarse" }],
    };

    const forward = mergeDuplicateReports(precise, coarse);
    const reverse = mergeDuplicateReports(coarse, precise);
    expect(forward).toEqual(reverse);
    expect(forward.sourceRefs.map((ref) => ref.sourceReportId)).toEqual(["psk-coarse", "psk-precise"]);
    expect(forward.source).toBe("PSKReporter");
    expect(["psk-coarse", "psk-precise"]).toContain(forward.sourceReportId);
    expect(forward.sourceRefs.some((ref) =>
      ref.source === forward.source && ref.sourceReportId === forward.sourceReportId,
    )).toBe(true);
  });

  it("prefers independently evidenced coordinates over a coarser grid regardless of input order", () => {
    const coordinate = {
      ...createNormalizedSpot("coord"),
      source: "RBN" as const,
      sourceReportId: "coord",
      snrDb: null,
      dx: {
        callsign: "TEST1DX",
        role: "transmitter" as const,
        location: { kind: "reported-coordinate" as const, coordinates: { lat: 40.4, lon: -3.7 } },
      },
      sourceRefs: [{ source: "RBN" as const, sourceReportId: "coord" }],
    };
    const grid = {
      ...createNormalizedSpot("grid"),
      snrDb: -12,
      dx: {
        callsign: "TEST1DX",
        role: "transmitter" as const,
        location: {
          kind: "reported-grid" as const,
          grid: "IN80",
          coordinates: { lat: 40.5, lon: -3 },
        },
      },
      sourceRefs: [{ source: "PSKReporter" as const, sourceReportId: "grid" }],
    };

    const forward = mergeDuplicateReports(grid, coordinate);
    const reverse = mergeDuplicateReports(coordinate, grid);
    expect(forward).toEqual(reverse);
    expect(forward.dx.location).toEqual(coordinate.dx.location);
    expect(forward.source).toBe("RBN");
    expect(forward.snrDb).toBe(-12);
    expect(forward.sourceRefs.map((ref) => ref.source)).toEqual(["PSKReporter", "RBN"]);
  });
});
