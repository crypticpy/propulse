import { describe, expect, it } from "vitest";
import { calculateLayerHeights } from "@/lib/utils/ionosphere";
import { traceRayPath } from "@/lib/utils/rayTrace";
import { pathPointDescriptorSchema, modelProvenanceSchema } from "@/lib/views/spotContracts";
import type { PathDescriptor } from "@/lib/views/spotContracts";
import { sampleAppearance } from "@/lib/spots/motion";
import { createSpotPreferences } from "@/lib/views/defaults";
import {
  APEX_DISPLAY_HEIGHT_BOOST,
  BUILTIN_RAY_TRACE_MODEL_NAME,
  builtinRayTraceProvenance,
  buildPathPointSet,
  decorativeShellPlacement,
  pathPointId,
  pathPointsRemainInspectable,
  type BuildPathPointInput,
} from "./index";

const DATE = new Date("2026-06-21T18:00:00Z");
const NOW_MS = DATE.getTime();
const NY = { lat: 40.7, lon: -74.0 };
const TOKYO = { lat: 35.7, lon: 139.7 };

const MODEL = {
  name: "ITU-R P.533 ray trace",
  version: "propulse-physics",
  modeledAtMs: NOW_MS,
  inputsAsOfMs: NOW_MS,
  explanation: "Synthetic SP-07 fixture model run.",
};

function modeledPath(
  overrides: Partial<PathDescriptor> = {},
): PathDescriptor {
  return {
    id: "path-ny-tokyo",
    reportIds: [],
    kind: "modeled",
    from: {
      callsign: "W2NYC",
      role: "transmitter",
      location: {
        kind: "reported-coordinate",
        coordinates: NY,
      },
    },
    to: {
      callsign: "JA1TYO",
      role: "receiver",
      location: {
        kind: "reported-coordinate",
        coordinates: TOKYO,
      },
    },
    direction: "from-to",
    model: MODEL,
    ...overrides,
  };
}

function approximatePath(): PathDescriptor {
  return modeledPath({
    id: "path-approx",
    kind: "approximate",
    reportIds: ["approx-1"],
    model: null,
    from: {
      callsign: "K1TEST",
      role: "transmitter",
      location: {
        kind: "approximate",
        coordinates: { lat: 39.8, lon: -98.6 },
        source: "prefix",
        region: null,
        precision: "country",
        reason: "US prefix centroid",
      },
    },
  });
}

function trace() {
  return traceRayPath({
    startLat: NY.lat,
    startLon: NY.lon,
    endLat: TOKYO.lat,
    endLon: TOKYO.lon,
    frequencyMHz: 14.074,
    date: DATE,
    sfi: 150,
    kp: 2,
    pathMode: "short",
  });
}

function input(overrides: Partial<BuildPathPointInput> = {}): BuildPathPointInput {
  return {
    pathId: "path-ny-tokyo",
    path: modeledPath(),
    result: trace(),
    nowMs: NOW_MS,
    startLat: NY.lat,
    startLon: NY.lon,
    endLat: TOKYO.lat,
    endLon: TOKYO.lon,
    pathMode: "short",
    includeShellHighlights: true,
    layerHeights: calculateLayerHeights(45, 6, 150),
    ...overrides,
  };
}

describe("buildPathPointSet", () => {
  it("emits stable ids that do not change across animation ticks", () => {
    const first = buildPathPointSet(input());
    const later = buildPathPointSet(input({ nowMs: NOW_MS + 16 }));
    expect(first.points.map((point) => point.id)).toEqual(
      later.points.map((point) => point.id),
    );
    const appearance = createSpotPreferences().paths.selected!;
    sampleAppearance(appearance, 0, true);
    sampleAppearance(appearance, 800, true);
    expect(pathPointsRemainInspectable({
      osReducedMotion: true,
      reduceMotion: true,
      travelProgress: null,
    })).toBe(true);
  });

  it("keeps ids equal to pathId + hop + role", () => {
    const set = buildPathPointSet(input({ includeShellHighlights: false }));
    const apex = set.points.find((point) => point.role === "ray-apex");
    expect(apex?.id).toBe(pathPointId("path-ny-tokyo", 0, "ray-apex"));
    expect(apex?.id).toMatch(/^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,127}$/);
  });

  it("parses every point through the frozen SP-01 schema", () => {
    const set = buildPathPointSet(input());
    expect(set.status).toBe("ready");
    expect(set.points.length).toBeGreaterThan(0);
    for (const point of set.points) {
      expect(pathPointDescriptorSchema.parse(point)).toEqual(point);
    }
  });

  it("distinguishes decorative shell height from modeled apex height", () => {
    const set = buildPathPointSet(input());
    const apex = set.points.find(
      (point) => point.role === "ray-apex" && point.hopIndex === 0,
    );
    const shell = set.points.find(
      (point) => point.role === "shell-highlight" && point.hopIndex === 0,
    );
    expect(apex).toBeDefined();
    expect(shell).toBeDefined();
    expect(apex!.layer).toBeNull();
    expect(shell!.layer).toBeNull();
    expect(apex!.modeledHeightKm).toBeGreaterThan(0);
    expect(apex!.displayHeightKm).toBeCloseTo(
      apex!.modeledHeightKm! * APEX_DISPLAY_HEIGHT_BOOST,
    );
    expect(shell!.displayHeightKm).not.toBe(apex!.displayHeightKm);
    expect(shell!.explanation).toMatch(/decorative shell-intersection/i);
    expect(shell!.explanation).toMatch(/not an actual reflection height/i);
    const expectedShell = decorativeShellPlacement(
      apex!.modeledHeightKm!,
      calculateLayerHeights(45, 6, 150),
    );
    expect(shell!.displayHeightKm).toBe(expectedShell.displayHeightKm);
  });

  it("never copies visual shell classification into descriptor.layer", () => {
    const set = buildPathPointSet(input());
    expect(set.points.every((point) => point.layer === null)).toBe(true);
  });

  it("does not invent a confidence percentage", () => {
    const set = buildPathPointSet(input());
    const blob = JSON.stringify(set);
    expect(blob.toLowerCase()).not.toMatch(/confidence/);
    expect(blob).not.toMatch(/%/);
  });

  it("returns model-unavailable without inventing points", () => {
    const set = buildPathPointSet(
      input({ path: modeledPath({ model: null, kind: "reported", reportIds: ["r1"] }), model: null, result: null }),
    );
    expect(set.status).toBe("model-unavailable");
    expect(set.points).toEqual([]);
    expect(set.unavailableReason).toMatch(/missing/i);
  });

  it("returns no-hops when the model result is empty", () => {
    const result = trace();
    const set = buildPathPointSet(
      input({ result: { ...result, hops: [] } }),
    );
    expect(set.status).toBe("no-hops");
    expect(set.points).toEqual([]);
  });

  it("marks stale model results without dropping inspectable points", () => {
    const set = buildPathPointSet(
      input({ nowMs: NOW_MS + 31 * 60 * 1000 }),
    );
    expect(set.status).toBe("model-stale");
    expect(set.points.length).toBeGreaterThan(0);
    expect(set.unavailableReason).toMatch(/stale/i);
  });

  it("labels approximate endpoints as approximate, not modeled coordinates", () => {
    const path = approximatePath();
    const set = buildPathPointSet(
      input({
        pathId: "path-approx",
        path,
        model: MODEL,
      }),
    );
    expect(set.points.length).toBeGreaterThan(0);
    expect(set.points.every((point) => point.locationPrecision === "approximate")).toBe(
      true,
    );
    expect(set.points[0]?.explanation).toMatch(/approximate/i);
  });

  it("omits shell highlights unless layer heights are supplied", () => {
    const set = buildPathPointSet(
      input({ includeShellHighlights: true, layerHeights: null }),
    );
    expect(set.points.some((point) => point.role === "shell-highlight")).toBe(false);
    expect(set.points.some((point) => point.role === "ray-apex")).toBe(true);
    expect(set.points.some((point) => point.role === "ground-point")).toBe(true);
  });

  it("parses points when pathId is already 128 contract characters", () => {
    const pathId = `p${"c".repeat(127)}`;
    const first = buildPathPointSet(
      input({ pathId, path: modeledPath({ id: pathId }), nowMs: NOW_MS }),
    );
    const later = buildPathPointSet(
      input({
        pathId,
        path: modeledPath({ id: pathId }),
        nowMs: NOW_MS + 5_000,
      }),
    );
    expect(first.status).toBe("ready");
    expect(first.points.map((point) => point.id)).toEqual(
      later.points.map((point) => point.id),
    );
    expect(first.points.length).toBeGreaterThan(0);
    for (const point of first.points) {
      expect(pathPointDescriptorSchema.parse(point)).toEqual(point);
      expect(point.id.length).toBeLessThanOrEqual(128);
      expect(point.id).toMatch(/:h\d+:(ray-apex|shell-highlight|ground-point)$/);
    }
  });

  it("does not invent input age or a full ITU-R P.533 circuit for the built-in tracer", () => {
    const provenance = builtinRayTraceProvenance(NOW_MS, "1-hop fixture");
    expect(provenance.name).toBe(BUILTIN_RAY_TRACE_MODEL_NAME);
    expect(provenance.name).not.toMatch(/ITU-R P\.533 ray trace/i);
    expect(provenance.explanation).toMatch(/Not a full ITU-R P\.533/i);
    expect(provenance.inputsAsOfMs).toBeNull();
    expect(modelProvenanceSchema.parse(provenance)).toEqual(provenance);

    const set = buildPathPointSet(
      input({
        path: null,
        pathId: "ray-short",
        model: provenance,
      }),
    );
    expect(set.status).toBe("ready");
    expect(set.points[0]?.model.inputsAsOfMs).toBeNull();
    expect(set.points[0]?.model.name).toBe(BUILTIN_RAY_TRACE_MODEL_NAME);
  });

  it("uses hop.hmF2 as modeled height, never the decorative boost", () => {
    const result = trace();
    const set = buildPathPointSet(input({ result, includeShellHighlights: false }));
    result.hops.forEach((hop, hopIndex) => {
      const apex = set.points.find(
        (point) => point.role === "ray-apex" && point.hopIndex === hopIndex,
      );
      expect(apex?.modeledHeightKm).toBe(hop.hmF2);
    });
  });
});
