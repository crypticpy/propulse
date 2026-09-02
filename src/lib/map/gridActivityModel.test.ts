import { describe, expect, it } from "vitest";
import type { ResolvedSpot } from "@/components/map/LiveSpotArcs";
import type { LiveSpot } from "@/types/livespot";
import {
  buildGridActivitySnapshot,
  gridActivityBounds,
  gridActivityReportIdentity,
  gridActivityResolutionForView,
  rankGridActivityCells,
} from "./gridActivityModel";

const NOW = Date.UTC(2026, 8, 2, 12, 0, 0);

function resolved(
  id: string,
  overrides: Partial<LiveSpot & ResolvedSpot> = {},
): ResolvedSpot {
  const originalSpot: LiveSpot = {
    id,
    source: "Cluster",
    spotter: "W1AAA",
    spotterGrid: "FN31",
    dx: "K5DX",
    dxGrid: "EM10",
    frequency: 14_074,
    mode: "FT8",
    comment: "",
    time: new Date(NOW - 10_000),
    ...overrides,
  };
  return {
    id,
    spotterLat: 41.5,
    spotterLon: -73,
    dxLat: 30.5,
    dxLon: -97,
    mode: originalSpot.mode ?? "UNKNOWN",
    frequency: originalSpot.frequency,
    time: originalSpot.time,
    callsign: originalSpot.dx,
    spotter: originalSpot.spotter,
    source: originalSpot.source,
    spotterLocApprox: false,
    dxLocApprox: false,
    originalSpot,
    ...overrides,
  };
}

describe("gridActivityReportIdentity", () => {
  it("uses stable source/report identity and a deterministic fallback", () => {
    const stable = resolved("abc").originalSpot;
    expect(gridActivityReportIdentity(stable)).toBe("CLUSTER:id:abc");

    const missingId = { ...stable, id: "" };
    expect(gridActivityReportIdentity(missingId)).toBe(
      gridActivityReportIdentity({ ...missingId }),
    );
    expect(gridActivityReportIdentity(missingId)).toContain(
      "CLUSTER:fallback:K5DX:W1AAA:14074.000:FT8",
    );
  });
});

describe("buildGridActivitySnapshot", () => {
  it("deduplicates repeated reports without inflating activity facts", () => {
    const report = resolved("same");
    const snapshot = buildGridActivitySnapshot([report, report], {
      resolution: 4,
      now: NOW,
    });
    expect(snapshot.cells).toHaveLength(1);
    expect(snapshot.cells[0]).toMatchObject({
      grid: "EM10",
      reportCount: 1,
      uniqueDxCallsignCount: 1,
      uniqueReporterCallsignCount: 1,
      uniquePathCount: 1,
    });
  });

  it("deduplicates reports that use the documented fallback identity", () => {
    const first = resolved("", { id: "" });
    const duplicate = resolved("", { id: "" });
    const snapshot = buildGridActivitySnapshot([first, duplicate], {
      resolution: 4,
      now: NOW,
    });
    expect(snapshot.cells[0].reportCount).toBe(1);
    expect(snapshot.cells[0].reportIds[0]).toContain("CLUSTER:fallback:");
  });

  it("expires old reports and exposes the next quiet-feed expiry", () => {
    const fresh = resolved("fresh");
    const expired = resolved("expired", {
      time: new Date(NOW - 30 * 60_000 - 1),
    });
    const snapshot = buildGridActivitySnapshot([fresh, expired], {
      resolution: 4,
      now: NOW,
    });
    expect(snapshot.cells[0].reportIds).toEqual(["CLUSTER:id:fresh"]);
    expect(snapshot.nextExpiryTimestamp).toBe(
      fresh.originalSpot.time.getTime() + 30 * 60_000,
    );
  });

  it("keeps inclusive pole and antimeridian coordinates in legal fields", () => {
    const edge = resolved("edge", { dxLat: 90, dxLon: 180 });
    const snapshot = buildGridActivitySnapshot([edge], {
      resolution: 2,
      now: NOW,
    });
    expect(snapshot.cells[0].grid).toBe("RR");
  });

  it("keeps DX, reporter, and combined endpoint semantics explicit", () => {
    const report = resolved("path");
    const dx = buildGridActivitySnapshot([report], {
      resolution: 4,
      endpoint: "dx",
      now: NOW,
    });
    const reporter = buildGridActivitySnapshot([report], {
      resolution: 4,
      endpoint: "reporter",
      now: NOW,
    });
    const both = buildGridActivitySnapshot([report], {
      resolution: 4,
      endpoint: "both",
      now: NOW,
    });
    expect(dx.cells.map((cell) => cell.grid)).toEqual(["EM10"]);
    expect(reporter.cells.map((cell) => cell.grid)).toEqual(["FN31"]);
    expect(both.cells.map((cell) => cell.grid)).toEqual(["EM10", "FN31"]);
  });

  it("does not count a mixed-endpoint path twice inside the same cell", () => {
    const report = resolved("local", {
      spotterLat: 30.7,
      spotterLon: -97.2,
    });
    const both = buildGridActivitySnapshot([report], {
      resolution: 2,
      endpoint: "both",
      now: NOW,
    });
    expect(both.cells).toHaveLength(1);
    expect(both.cells[0]).toMatchObject({ grid: "EM", reportCount: 1 });
  });

  it("keeps source and mode mixes tied to exact contributing reports", () => {
    const cluster = resolved("cluster");
    const rbn = resolved("rbn", {
      source: "RBN",
      mode: "CW",
      originalSpot: {
        ...resolved("rbn").originalSpot,
        id: "rbn",
        source: "RBN",
        mode: "CW",
      },
    });
    const cell = buildGridActivitySnapshot([cluster, rbn], {
      resolution: 4,
      now: NOW,
    }).cells[0];
    expect(cell.sourceMix).toMatchObject({ Cluster: 1, RBN: 1 });
    expect(cell.modeMix).toEqual({ FT8: 1, CW: 1 });
    expect(cell.reportCount).toBe(cell.reports.length);
  });

  it("changes resolution without losing report membership or density", () => {
    const reports = [resolved("a"), resolved("b", { dxLon: -96.5 })];
    const coarse = buildGridActivitySnapshot(reports, {
      resolution: 2,
      now: NOW,
    });
    const regional = buildGridActivitySnapshot(reports, {
      resolution: 4,
      now: NOW,
    });
    expect(coarse.cells.reduce((sum, cell) => sum + cell.reportCount, 0)).toBe(
      2,
    );
    expect(
      regional.cells.reduce((sum, cell) => sum + cell.reportCount, 0),
    ).toBe(2);
  });

  it("produces renderer-independent counts and colors", () => {
    const feed = [resolved("a"), resolved("b")];
    const snapshots = ["globe", "flat", "azimuthal"].map(() =>
      buildGridActivitySnapshot(feed, { resolution: 4, now: NOW }),
    );
    expect(snapshots.map((snapshot) => snapshot.cells[0].reportCount)).toEqual([
      2, 2, 2,
    ]);
    expect(snapshots.map((snapshot) => snapshot.cells[0].color)).toEqual([
      snapshots[0].cells[0].color,
      snapshots[0].cells[0].color,
      snapshots[0].cells[0].color,
    ]);
  });
});

describe("activity LOD and ranking", () => {
  it("uses only resolutions practical for each projection scale", () => {
    expect(gridActivityResolutionForView("flat", 1)).toBe(2);
    expect(gridActivityResolutionForView("flat", 3)).toBe(4);
    expect(gridActivityResolutionForView("flat", 24)).toBe(6);
    expect(gridActivityResolutionForView("globe", 1)).toBe(2);
    expect(gridActivityResolutionForView("globe", 3)).toBe(4);
    expect(gridActivityResolutionForView("azimuthal", 3)).toBe(4);
  });

  it("ranks visible, recent, dense cells deterministically before budgeting", () => {
    const feed = [
      resolved("older", { dxLon: -97, time: new Date(NOW - 20_000) }),
      resolved("recent-a", { dxLon: -73, time: new Date(NOW - 1_000) }),
      resolved("recent-b", { dxLon: -73, time: new Date(NOW - 2_000) }),
    ];
    const cells = buildGridActivitySnapshot(feed, {
      resolution: 4,
      now: NOW,
    }).cells;
    const ranked = rankGridActivityCells(cells, {
      budget: 1,
      isVisible: (cell) => cell.grid === "EM10",
    });
    expect(ranked[0].grid).toBe("EM10");
  });

  it("decodes every supported grid precision", () => {
    expect(gridActivityBounds("EM")).toMatchObject({
      minLon: -100,
      maxLon: -80,
    });
    expect(gridActivityBounds("EM10")).toMatchObject({
      minLon: -98,
      maxLon: -96,
    });
    const fine = gridActivityBounds("EM10AA");
    expect(fine.maxLon - fine.minLon).toBeCloseTo(1 / 12);
    expect(fine.maxLat - fine.minLat).toBeCloseTo(1 / 24);
  });
});
