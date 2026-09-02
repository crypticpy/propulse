import { beforeEach, describe, expect, it } from "vitest";
import {
  getFlatMapDiagnosticsSnapshot,
  recordFlatMapLayerPaint,
  recordFlatMapTileRange,
  resetFlatMapDiagnostics,
  setFlatMapTileBoundsDebug,
} from "./flatMapDiagnostics";

describe("flat-map retained rendering diagnostics", () => {
  beforeEach(() => {
    resetFlatMapDiagnostics();
    setFlatMapTileBoundsDebug(false);
  });

  it("tracks each retained surface independently", () => {
    recordFlatMapLayerPaint("base");
    recordFlatMapLayerPaint("live");
    recordFlatMapLayerPaint("live");

    expect(getFlatMapDiagnosticsSnapshot().paints).toEqual({
      base: 1,
      science: 0,
      live: 2,
      effects: 0,
    });
  });

  it("copies tile ranges and exposes the development bounds switch", () => {
    recordFlatMapTileRange({
      zoom: 7,
      visible: { xStart: 10, xEnd: 11, yStart: 20, yEnd: 21 },
      requested: { xStart: 9, xEnd: 12, yStart: 19, yEnd: 22 },
      navigationActive: false,
    });
    setFlatMapTileBoundsDebug(true);

    const snapshot = getFlatMapDiagnosticsSnapshot();
    expect(snapshot.tiles?.visible).toEqual({
      xStart: 10,
      xEnd: 11,
      yStart: 20,
      yEnd: 21,
    });
    expect(snapshot.debugTileBounds).toBe(true);
  });
});
