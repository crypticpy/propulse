import { describe, expect, it, vi } from "vitest";
import type { DXSpot } from "@/types/dxcluster";
import { createViewRuntime } from "@/lib/views/runtime";
import {
  commitMapSpotSelection,
  commitViewSpotSelection,
  resolveMapSpotSelection,
} from "./useMapSpotSelection";

function dxSpot(overrides: Partial<DXSpot> = {}): DXSpot {
  return {
    id: "spot-1",
    spotter: "K1ABC",
    dx: "JA1XYZ",
    frequency: 14074,
    comment: "",
    time: new Date("2026-08-31T12:00:00Z"),
    ...overrides,
  };
}

describe("resolveMapSpotSelection", () => {
  it("preserves valid zero coordinates and gives them priority over a grid", () => {
    const result = resolveMapSpotSelection(
      dxSpot({ dxLat: 0, dxLon: 0, dxGrid: "PM95" }),
    );

    expect(result).toMatchObject({
      locationSource: "coordinates",
      target: { lat: 0, lon: 0, grid: "PM95", name: "JA1XYZ" },
      spot: { dxLat: 0, dxLon: 0 },
    });
  });

  it("uses the DX grid center when explicit coordinates are unavailable", () => {
    const result = resolveMapSpotSelection(dxSpot({ dxGrid: "GG87" }));

    expect(result).toMatchObject({
      locationSource: "grid",
      target: { lat: -22.5, lon: -43, grid: "GG87" },
      spot: { dxLat: -22.5, dxLon: -43, dxLocApprox: false },
    });
  });

  it("uses the six-character parent of an extended DX grid", () => {
    const result = resolveMapSpotSelection(dxSpot({ dxGrid: "GG87aa00" }));

    expect(result).toMatchObject({
      locationSource: "grid",
      target: { grid: "GG87aa00" },
      spot: { dxLocApprox: false },
    });
    expect(Number.isFinite(result?.target.lat)).toBe(true);
    expect(Number.isFinite(result?.target.lon)).toBe(true);
  });

  it("falls back to the existing callsign-prefix centroid", () => {
    const result = resolveMapSpotSelection(dxSpot({ dx: "PY2ABC" }));

    expect(result).toMatchObject({
      locationSource: "callsign-prefix",
      spot: { dxLocApprox: true },
      target: { name: "PY2ABC", approximate: true },
    });
    expect(Number.isFinite(result?.target.lat)).toBe(true);
    expect(Number.isFinite(result?.target.lon)).toBe(true);
  });

  it("falls back to the feed continent when the prefix is unknown", () => {
    const result = resolveMapSpotSelection(
      dxSpot({ dx: "QQ1ABC", continent: "EU" }),
    );

    expect(result).toMatchObject({
      locationSource: "continent",
      spot: { dxLocApprox: true },
      target: { lat: 50, lon: 10, approximate: true, name: "QQ1ABC" },
    });
  });

  it("returns null when neither prefix nor continent can locate the spot", () => {
    expect(resolveMapSpotSelection(dxSpot({ dx: "QQ1ABC" }))).toBeNull();
  });

  it("marks feed coordinates as approximate when the spot already said so", () => {
    const result = resolveMapSpotSelection(
      dxSpot({ dxLat: 39.8, dxLon: -98.6, dxLocApprox: true }),
    );

    expect(result).toMatchObject({
      locationSource: "coordinates",
      target: { approximate: true },
    });
  });

  it("retains an activation reference in the selected target label", () => {
    const result = resolveMapSpotSelection(
      dxSpot({
        dx: "K5ABC",
        dxGrid: "EM10",
        comment: "POTA US-1234 · Test Park",
      }),
    );

    expect(result?.target.name).toBe("K5ABC · POTA US-1234");
  });

  it("rejects invalid explicit coordinates before using a valid grid", () => {
    const result = resolveMapSpotSelection(
      dxSpot({ dxLat: 91, dxLon: 181, dxGrid: "PM95" }),
    );

    expect(result?.locationSource).toBe("grid");
    expect(result?.spot.dxLat).toBe(35.5);
    expect(result?.spot.dxLon).toBe(139);
  });
});

describe("commitMapSpotSelection", () => {
  it("commits a normalized selected spot and matching target", () => {
    const setSelectedSpot = vi.fn();
    const setTarget = vi.fn();
    const setSelectedReport = vi.fn();

    const result = commitMapSpotSelection(dxSpot({ dxGrid: "GG87" }), {
      setSelectedSpot,
      setTarget,
      setSelectedReport,
    });

    expect(setSelectedSpot).toHaveBeenCalledWith(result?.spot);
    expect(setTarget).toHaveBeenCalledWith(result?.target);
    expect(setSelectedReport).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "spot-1",
        callsign: "JA1XYZ",
        source: "Cluster",
        provenance: "public",
      }),
    );
  });

  it("clears a stale target when the selected spot cannot be located", () => {
    const setSelectedSpot = vi.fn();
    const setTarget = vi.fn();
    const unresolved = dxSpot({ dx: "", dxGrid: undefined });

    expect(
      commitMapSpotSelection(unresolved, { setSelectedSpot, setTarget }),
    ).toBeNull();
    expect(setSelectedSpot).toHaveBeenCalledWith(unresolved);
    expect(setTarget).toHaveBeenCalledWith(null);
  });
});

describe("commitViewSpotSelection", () => {
  it("writes only the bound runtime and does not call map/DX setters", () => {
    const runtime = createViewRuntime({
      binding: {
        ownerId: "owner-a", slotId: "normal", kind: "interactive",
        sourceView: null, displayId: null,
      },
      persistWorking: false,
    });
    const result = commitViewSpotSelection(runtime, dxSpot({ dxLat: 35, dxLon: 139 }));
    expect(result?.target.lat).toBe(35);
    expect(runtime.getSnapshot().interaction.selectedReportId).toBe("spot-1");
    expect(runtime.getSnapshot().interaction.target).toMatchObject({
      lat: 35, lon: 139, origin: "spot",
    });
    runtime.dispose();
  });
});
