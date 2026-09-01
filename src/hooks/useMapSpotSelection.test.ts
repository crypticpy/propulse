import { describe, expect, it, vi } from "vitest";
import type { DXSpot } from "@/types/dxcluster";
import {
  commitMapSpotSelection,
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
      target: { name: "PY2ABC" },
    });
    expect(Number.isFinite(result?.target.lat)).toBe(true);
    expect(Number.isFinite(result?.target.lon)).toBe(true);
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

    const result = commitMapSpotSelection(dxSpot({ dxGrid: "GG87" }), {
      setSelectedSpot,
      setTarget,
    });

    expect(setSelectedSpot).toHaveBeenCalledWith(result?.spot);
    expect(setTarget).toHaveBeenCalledWith(result?.target);
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
