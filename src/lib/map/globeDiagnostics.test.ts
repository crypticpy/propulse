import { afterEach, describe, expect, it } from "vitest";
import {
  getGlobeDiagnosticsSnapshot,
  recordGlobeFrame,
  recordGlobeTileInvalidation,
  registerGlobeTileDiagnostics,
  resetGlobeDiagnostics,
} from "./globeDiagnostics";

afterEach(() => resetGlobeDiagnostics());

describe("globeDiagnostics", () => {
  it("reports bounded frame percentiles and the latest WebGL state", () => {
    for (let index = 1; index <= 20; index += 1) {
      recordGlobeFrame({
        timestampMs: index,
        frameTimeMs: index,
        cameraPhase: index === 20 ? "stationary" : "moving",
        drawCalls: index * 2,
        triangles: index * 100,
        geometries: 7,
        textures: 9,
        sceneVisibleLayers: { arcs: 3, markers: 5 },
      });
    }

    expect(getGlobeDiagnosticsSnapshot(20)).toMatchObject({
      frameTimeMs: { samples: 20, p50: 10, p95: 19 },
      cameraPhase: "stationary",
      webgl: {
        drawCalls: 40,
        triangles: 2000,
        geometries: 7,
        textures: 9,
      },
      sceneVisibleLayers: { arcs: 3, markers: 5 },
    });
  });

  it("keeps one-second invalidation rates separate for imagery and labels", () => {
    recordGlobeTileInvalidation("imagery", 8_900);
    recordGlobeTileInvalidation("imagery", 9_200);
    recordGlobeTileInvalidation("imagery", 9_900);
    recordGlobeTileInvalidation("labels", 9_500);

    const snapshot = getGlobeDiagnosticsSnapshot(10_000);
    expect(snapshot.rendererInvalidationsPerSecond).toEqual({
      imagery: 2,
      labels: 1,
    });
  });

  it("reads each renderer independently and unregisters the exact owner", () => {
    const unregister = registerGlobeTileDiagnostics("imagery", () => ({
      visible: 8,
      active: 10,
      cached: 30,
      queued: 1,
      downloading: 2,
      parsing: 0,
      decoded: 20,
      failed: 0,
    }));

    expect(getGlobeDiagnosticsSnapshot(1).tiles.imagery?.visible).toBe(8);
    unregister();
    expect(getGlobeDiagnosticsSnapshot(1).tiles.imagery).toBeUndefined();
  });
});
