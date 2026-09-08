import { describe, expect, it } from "vitest";
import { createNormalizedSpot } from "@/lib/views/fixtures";
import type { NormalizedSpotReport } from "@/lib/views/spotContracts";
import {
  mergeDuplicateGroup,
  mergeDuplicateReports,
  SOURCE_PRECEDENCE,
  SOURCE_REF_LIMIT,
} from "./identity";

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [items.slice()];
  return items.flatMap((item, index) =>
    permutations(items.filter((_, i) => i !== index)).map((rest) => [item, ...rest]),
  );
}

function foldMerge(reports: readonly NormalizedSpotReport[]): NormalizedSpotReport {
  return reports.slice(1).reduce(
    (merged, report) => mergeDuplicateReports(merged, report),
    reports[0]!,
  );
}

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

  it("merges three copies associatively with the same SNR and sourceRefs", () => {
    const psk = {
      ...createNormalizedSpot("psk"),
      snrDb: null,
    };
    const rbn = {
      ...createNormalizedSpot("rbn"),
      source: "RBN" as const,
      sourceReportId: "rbn",
      snrDb: -5,
      sourceRefs: [{ source: "RBN" as const, sourceReportId: "rbn" }],
    };
    const wsjt = {
      ...createNormalizedSpot("wsjt"),
      source: "WSJT-X" as const,
      sourceReportId: "wsjt",
      snrDb: -20,
      sourceRefs: [{ source: "WSJT-X" as const, sourceReportId: "wsjt" }],
    };
    const copies = [psk, rbn, wsjt];
    const expected = mergeDuplicateGroup(copies);
    expect(expected.source).toBe("PSKReporter");
    expect(expected.snrDb).toBe(-5);
    expect(expected.sourceRefs.map((ref) => ref.source)).toEqual(["PSKReporter", "RBN", "WSJT-X"]);

    for (const order of permutations(copies)) {
      expect(mergeDuplicateReports(order[0]!, order[1]!, order[2]!)).toEqual(expected);
      expect(mergeDuplicateGroup(order)).toEqual(expected);
      expect(foldMerge(order)).toEqual(expected);
    }
  });

  it("reserves every contributing feed when sourceRefs exceed the cap", () => {
    const pskCopies = Array.from({ length: SOURCE_REF_LIMIT }, (_, n) => ({
      ...createNormalizedSpot(`psk-${String(n).padStart(2, "0")}`),
      snrDb: null as number | null,
    }));
    const extras: NormalizedSpotReport[] = [
      {
        ...createNormalizedSpot("rbn-cap"),
        source: "RBN",
        sourceReportId: "rbn-cap",
        snrDb: -5,
        sourceRefs: [{ source: "RBN", sourceReportId: "rbn-cap" }],
      },
      {
        ...createNormalizedSpot("wsjt-cap"),
        source: "WSJT-X",
        sourceReportId: "wsjt-cap",
        snrDb: -20,
        sourceRefs: [{ source: "WSJT-X", sourceReportId: "wsjt-cap" }],
      },
      {
        ...createNormalizedSpot("cluster-cap"),
        source: "Cluster",
        sourceReportId: "cluster-cap",
        snrDb: null,
        reporter: {
          callsign: "TEST2RX",
          role: "posting-service",
          location: { kind: "unavailable", reason: "none" },
        },
        sourceRefs: [{ source: "Cluster", sourceReportId: "cluster-cap" }],
      },
    ];
    const copies = [...pskCopies, ...extras];
    const orders = [copies, [...copies].reverse(), [...extras, ...pskCopies]];
    for (const order of orders) {
      const merged = mergeDuplicateGroup(order);
      expect(merged.sourceRefs).toHaveLength(SOURCE_REF_LIMIT);
      expect(new Set(merged.sourceRefs.map((ref) => ref.source))).toEqual(new Set(SOURCE_PRECEDENCE));
      expect(merged.sourceRefs.some((ref) =>
        ref.source === merged.source && ref.sourceReportId === merged.sourceReportId,
      )).toBe(true);
    }
  });
});
