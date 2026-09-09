import { describe, expect, expectTypeOf, it } from "vitest";
import type { MapState } from "@/stores/mapStore";
import { displayAssignmentSchema, viewConfigurationSchema, type ViewConfiguration } from "./contracts";
import { createViewConfiguration } from "./defaults";
import { createDisplayAssignmentFixture, createNormalizedSpot, createSpotFixtures, createSpotLoadFixture, SPOT_FIXTURE_NOW_MS } from "./fixtures";
import { clusterGroupSchema, normalizedModeSchema, normalizedSpotReportSchema, pathDescriptorSchema, spotSceneModelSchema } from "./spotContracts";

describe("independent view contract", () => {
  it("covers every existing layer and makes independent complete values", () => {
    expectTypeOf<ViewConfiguration["presentation"]["layers"]>().toEqualTypeOf<MapState["layers"]>();
    const pro = createViewConfiguration();
    const wall = createViewConfiguration("hamclock");
    const second = createViewConfiguration();
    pro.spots.filters.modes.includeUnknown = false;
    pro.presentation.cameraHomes.globe.center.lat = 42;
    expect(second.spots.filters.modes.includeUnknown).toBe(true);
    expect(pro.presentation.cameraHomes.flat.center.lat).toBe(0);
    expect(wall.presentation.projection).toBe("flat");
    expect(wall.spots.paths.background.style).toBe("off");
    expect(viewConfigurationSchema.parse(JSON.parse(JSON.stringify(pro)))).toEqual(pro);
  });

  it("rejects incomplete, future, credential and ephemeral saved state", () => {
    const valid = createViewConfiguration();
    for (const candidate of [
      { ...valid, schemaVersion: 2 }, { ...valid, target: { lat: 0, lon: 0 } },
      { ...valid, deviceToken: "not-a-real-token" }, { ...valid, presentation: {} },
      { ...valid, route: "/solar" },
    ]) expect(viewConfigurationSchema.safeParse(candidate).success).toBe(false);
  });

  it("validates bounded plain widget data without invoking accessors", () => {
    let getterCalls = 0;
    const accessor = Object.defineProperty({}, "value", { enumerable: true, get() { getterCalls++; return 1; } });
    const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
    for (const config of [accessor, cyclic, new Date(), { access_token: "fake" }, { authToken: "fake" }, { apiKey: "fake" }, { nested: { device_token: "fake" } }, Array(2), { x: Infinity }, { x: "x".repeat(4097) }]) {
      const candidate = createViewConfiguration("hamclock");
      const raw = { ...candidate, presentation: { ...candidate.presentation, hamclock: {
        ...candidate.presentation.hamclock, widgets: [{ tileId: "clock", schemaVersion: 1, config }],
      } } };
      expect(viewConfigurationSchema.safeParse(raw).success).toBe(false);
    }
    expect(getterCalls).toBe(0);
    const valid = createViewConfiguration("hamclock");
    valid.presentation.hamclock.widgets = [{ tileId: "clock", schemaVersion: 1, config: { zones: ["UTC"], seconds: false } }];
    expect(viewConfigurationSchema.parse(valid)).toEqual(valid);
  });

  it("rejects unknown wall pages, tile assignments and pinned tiles", () => {
    for (const change of ["page", "tile", "pin", "empty"] as const) {
      const config = createViewConfiguration("hamclock");
      const wall = config.presentation.hamclock;
      if (change === "page") wall.railLayout.left[0].pageId = "missing-page";
      if (change === "tile") wall.railLayout.left[0].tileIds.push("missing-tile");
      if (change === "pin") wall.pinnedTile = { side: "left", tileId: "missing-tile" };
      if (change === "empty") wall.railLayout.left = [];
      expect(viewConfigurationSchema.safeParse(config).success).toBe(false);
    }
  });

  it("keeps scene snapshots independent and validates assignment identity", () => {
    const assignment = createDisplayAssignmentFixture();
    assignment.scenes[0].config.spots.filters.spotLimit = 100;
    expect(assignment.scenes[1].config.spots.filters.spotLimit).toBe(150);
    expect(displayAssignmentSchema.safeParse({ ...assignment, startSceneId: "missing" }).success).toBe(false);
    expect(displayAssignmentSchema.safeParse({ ...assignment, scenes: [assignment.scenes[0], assignment.scenes[0]] }).success).toBe(false);
    assignment.scenes[0].enabled = false;
    expect(displayAssignmentSchema.safeParse(assignment).success).toBe(false);
  });

  it("rejects invalid budgets, modes and orphaned panel groups", () => {
    const config = createViewConfiguration();
    config.spots.filters.spotLimit = 201;
    expect(viewConfigurationSchema.safeParse(config).success).toBe(false);
    config.spots.filters.spotLimit = 50;
    config.spots.filters.modes.modes = ["CW"];
    expect(viewConfigurationSchema.safeParse(config).success).toBe(false);
    config.spots.filters.modes.modes = [];
    config.presentation.dockGroups = [{ id: "dock", panelIds: ["missing", "also-missing"], sharedX: 0, sharedWidth: 200 }];
    expect(viewConfigurationSchema.safeParse(config).success).toBe(false);
  });
});

describe("renderer-independent report contract", () => {
  it("retains uncertainty and rejects invented known-mode provenance", () => {
    expect(normalizedSpotReportSchema.parse(createNormalizedSpot())).toEqual(createNormalizedSpot());
    for (const mode of [
      { name: "UNKNOWN", category: "digital", provenance: "reported", originalLabel: null },
      { name: "FT8", category: "digital", provenance: "unknown", originalLabel: null },
    ]) expect(normalizedModeSchema.safeParse(mode).success).toBe(false);
    const approximate = createNormalizedSpot();
    approximate.dx.location = { kind: "approximate", coordinates: { lat: 39.8, lon: -98.6 }, source: "prefix", region: null, precision: "unknown", reason: "Prefix fallback" };
    expect(normalizedSpotReportSchema.parse(approximate).dx.location.kind).toBe("approximate");
  });

  it("does not allow a posting service to imply a reception direction", () => {
    const report = createNormalizedSpot();
    const path = { id: "path-1", reportIds: [report.id], kind: "reported", from: report.dx,
      to: { ...report.reporter, role: "posting-service" }, direction: "from-to", model: null };
    expect(pathDescriptorSchema.safeParse(path).success).toBe(false);
    expect(pathDescriptorSchema.safeParse({ ...path, direction: "unknown" }).success).toBe(true);
    expect(pathDescriptorSchema.safeParse({ ...path, kind: "modeled" }).success).toBe(false);
  });

  it("conserves visible reports and counts across cluster/single representation", () => {
    const report = createNormalizedSpot();
    const scene = { schemaVersion: 1, nowMs: SPOT_FIXTURE_NOW_MS, reports: [report], groups: [], singles: [report.id], paths: [],
      counts: { loaded: 3, deduplicated: 2, scopeEligible: 2, matching: 2, unlocated: 1, mapped: 1, budgetOmitted: 0 } };
    expect(spotSceneModelSchema.safeParse(scene).success).toBe(true);
    expect(spotSceneModelSchema.safeParse({ ...scene, singles: [] }).success).toBe(false);
    expect(spotSceneModelSchema.safeParse({ ...scene, singles: [report.id, report.id] }).success).toBe(false);
    expect(spotSceneModelSchema.safeParse({ ...scene, counts: { ...scene.counts, mapped: 2 } }).success).toBe(false);
    const unlocated = createNormalizedSpot();
    unlocated.dx.location = { kind: "unavailable", reason: "No location" };
    expect(spotSceneModelSchema.safeParse({ ...scene, reports: [unlocated] }).success).toBe(false);
    const path = { id: "path-1", reportIds: [report.id], kind: "reported", from: report.dx, to: report.reporter, direction: "from-to", model: null };
    expect(spotSceneModelSchema.safeParse({ ...scene, paths: [path] }).success).toBe(true);
    expect(spotSceneModelSchema.safeParse({ ...scene, paths: [path, path] }).success).toBe(false);
  });

  it("requires grouping detail to match actual region/grid precision", () => {
    const group = { id: "group-1", geographyVersion: "test-v1", endpointRole: "dx", label: "Spain", detail: "regions",
      region: { id: "ES", name: "Spain", kind: "country", countryCode: "ES" }, grid: null,
      precision: "reported-coordinate", anchor: { lat: 40, lon: -3 }, reportIds: ["normalized-1"] };
    expect(clusterGroupSchema.safeParse(group).success).toBe(true);
    expect(clusterGroupSchema.safeParse({ ...group, region: null }).success).toBe(false);
    for (const grid of [null, "IN", "IN80", "IN80AA00"]) {
      expect(clusterGroupSchema.safeParse({ ...group, detail: "grid6", grid }).success).toBe(false);
    }
    expect(clusterGroupSchema.safeParse({ ...group, detail: "grid6", grid: "IN80AA" }).success).toBe(true);
    expect(clusterGroupSchema.safeParse({ ...group, detail: "grid6", grid: "IN80AA", precision: "approximate" }).success).toBe(false);
  });

  it("provides deterministic boundary, geography and load fixtures", () => {
    expect(createSpotFixtures()).toEqual(createSpotFixtures());
    const fixtures = createSpotFixtures();
    expect(fixtures.spain).toHaveLength(50);
    expect(fixtures.norway).toHaveLength(20);
    expect(fixtures.ages[0].time.getTime()).toBe(SPOT_FIXTURE_NOW_MS - 1_800_000);
    for (const size of [500, 5000] as const) {
      const reports = createSpotLoadFixture(size);
      expect(reports).toHaveLength(size);
      expect(new Set(reports.map((report) => report.id)).size).toBe(size);
      expect(reports).toEqual(createSpotLoadFixture(size));
    }
  });
});
