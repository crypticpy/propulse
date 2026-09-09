import { describe, expect, it } from "vitest";
import { createSpotPreferences } from "@/lib/views/defaults";
import {
  createSpotFixtures,
  createSpotInput,
  createSpotLoadFixture,
  SPOT_FIXTURE_NOW_MS,
} from "@/lib/views/fixtures";
import { buildSpotPipelineStages, buildSpotSceneModel, pathDescriptorForReport, applyOperatingScope, reportMatchesFilters, projectLiveSpotsForView } from "./pipeline";
import type { LiveSpot } from "@/types/livespot";

function scene(observations: Parameters<typeof buildSpotSceneModel>[0]["observations"], overrides: Partial<Parameters<typeof buildSpotSceneModel>[0]> = {}) {
  return buildSpotSceneModel({
    observations,
    nowMs: SPOT_FIXTURE_NOW_MS,
    ...overrides,
  });
}

describe("spot presentation pipeline", () => {
  it("deduplicates copied reports while keeping distinct receivers and sourceRefs", () => {
    const { duplicates } = createSpotFixtures();
    const result = scene(duplicates);
    expect(result.counts.loaded).toBe(4);
    expect(result.counts.deduplicated).toBe(3);
    const pskSame = result.reports.find((report) =>
      report.reporter?.callsign === "TEST2RX" && report.reporter.role === "receiver",
    );
    const clusterCopy = result.reports.find((report) => report.source === "Cluster");
    const other = result.reports.find((report) => report.reporter?.callsign === "TEST3RX");
    expect(pskSame?.sourceRefs.map((ref) => ref.source)).toEqual(["PSKReporter"]);
    expect(clusterCopy?.reporter?.role).toBe("posting-service");
    expect(clusterCopy?.sourceRefs.map((ref) => ref.source)).toEqual(["Cluster"]);
    expect(other?.sourceRefs).toHaveLength(1);
    expect(result.counts.matching).toBe(3);
  });

  it("applies age bounds, source matching via sourceRefs, and empty filters as All", () => {
    const { ages, duplicates } = createSpotFixtures();
    const defaults = scene([...ages, ...duplicates]);
    expect(defaults.reports.some((report) => report.sourceReportId === "age-boundary")).toBe(true);
    expect(defaults.reports.some((report) => report.sourceReportId === "age-expired")).toBe(false);
    expect(defaults.reports.some((report) => report.sourceReportId === "future-clock")).toBe(true);

    const clusterOnly = createSpotPreferences();
    clusterOnly.filters.sources = ["Cluster"];
    const clustered = scene(duplicates, { preferences: clusterOnly });
    expect(clustered.counts.matching).toBe(1);
    expect(clustered.reports[0]?.sourceRefs.some((ref) => ref.source === "Cluster")).toBe(true);
  });

  it("selects newest mapped reports independently of input order or camera", () => {
    const load = createSpotLoadFixture(500);
    const reversed = [...load].reverse();
    const preferences = createSpotPreferences();
    preferences.filters.spotLimit = 50;
    const forward = scene(load, { preferences });
    const backward = scene(reversed, { preferences });
    expect(forward.counts.loaded).toBe(500);
    expect(forward.counts.mapped).toBe(50);
    expect(forward.counts.matching).toBe(500);
    expect(forward.counts.budgetOmitted).toBe(450);
    expect(forward.counts.matching).toBe(
      forward.counts.unlocated + forward.counts.mapped + forward.counts.budgetOmitted,
    );
    expect(forward.reports.map((report) => report.id)).toEqual(backward.reports.map((report) => report.id));
    for (let i = 1; i < forward.reports.length; i += 1) {
      const newer = forward.reports[i - 1]!;
      const older = forward.reports[i]!;
      expect(newer.observedAtMs >= older.observedAtMs).toBe(true);
    }
  });

  it("does not let unlocated rows consume the map budget", () => {
    const mapped = Array.from({ length: 12 }, (_, n) => createSpotInput(`mapped-${n}`, {
      time: new Date(SPOT_FIXTURE_NOW_MS - n * 1000),
    }));
    const missing = Array.from({ length: 8 }, (_, n) => createSpotInput(`missing-${n}`, {
      dx: "?",
      dxLat: undefined,
      dxLon: undefined,
      time: new Date(SPOT_FIXTURE_NOW_MS - n * 500),
    }));
    const preferences = createSpotPreferences();
    preferences.filters.spotLimit = 10;
    const result = scene([...missing, ...mapped], { preferences });
    expect(result.counts.unlocated).toBe(8);
    expect(result.counts.mapped).toBe(10);
    expect(result.reports.every((report) => report.dx.location.kind !== "unavailable")).toBe(true);
    expect(result.singles).toEqual(result.reports.map((report) => report.id));
    expect(result.groups).toEqual([]);
  });

  it("omits observed paths for cluster posting services and keeps modeled paths out", () => {
    const heard = createSpotInput("heard", { source: "PSKReporter" });
    const posted = createSpotInput("posted", {
      source: "Cluster",
      spotterLat: undefined,
      spotterLon: undefined,
      dx: "W1TEST",
      dxLat: undefined,
      dxLon: undefined,
    });
    const result = scene([heard, posted]);
    const heardReport = result.reports.find((report) => report.sourceReportId === "heard")!;
    const postedReport = result.reports.find((report) => report.sourceReportId === "posted");
    expect(pathDescriptorForReport(heardReport)?.kind).toBe("reported");
    expect(pathDescriptorForReport(heardReport)?.direction).toBe("from-to");
    expect(postedReport?.reporter?.role).toBe("posting-service");
    expect(result.paths.some((path) => path.reportIds.includes(postedReport?.id ?? ""))).toBe(false);
    expect(result.paths.every((path) => path.kind !== "modeled")).toBe(true);
  });

  it("keeps log scope from public feeds without truncating the input observations", () => {
    const observations = [
      createSpotInput("public", { source: "PSKReporter", dx: "K1PUB" }),
      createSpotInput("local", { source: "WSJT-X", dx: "K1LOC" }),
    ];
    const frozen = observations.map((spot) => ({ ...spot }));
    const result = scene(observations, { operating: { scope: "log" } });
    expect(result.counts.loaded).toBe(2);
    expect(result.counts.scopeEligible).toBe(1);
    expect(result.reports).toHaveLength(1);
    expect(result.reports[0]?.source).toBe("WSJT-X");
    expect(observations).toEqual(frozen);
  });

  it("is stable for Spain/Norway/US fixtures and does not split on count", () => {
    const { spain, norway, us } = createSpotFixtures();
    const stages = buildSpotPipelineStages({
      observations: [...spain, ...norway, ...us],
      nowMs: SPOT_FIXTURE_NOW_MS,
    });
    expect(stages.loaded).toHaveLength(75);
    expect(stages.deduplicated).toHaveLength(73);
    expect(stages.matching).toHaveLength(73);
    const again = buildSpotPipelineStages({
      observations: [...us, ...norway, ...spain].reverse(),
      nowMs: SPOT_FIXTURE_NOW_MS,
    });
    expect(again.matching.map((report) => report.id).sort()).toEqual(
      stages.matching.map((report) => report.id).sort(),
    );
    const usApprox = stages.matching.filter((report) =>
      report.dx.location.kind === "approximate" &&
      report.dx.location.region?.countryCode === "US",
    );
    expect(usApprox.length).toBeGreaterThanOrEqual(2);
  });

  it("intersects explicit source filters with authorized feeds and does not leak via sourceRefs", () => {
    const observations = [
      createSpotInput("psk-copy"),
      createSpotInput("rbn-copy", { source: "RBN", id: "rbn-copy" }),
      createSpotInput("cluster-only", { source: "Cluster", dx: "K1CLST" }),
    ];
    const merged = buildSpotPipelineStages({
      observations,
      nowMs: SPOT_FIXTURE_NOW_MS,
    });
    const mixed = merged.deduplicated.find((report) =>
      report.sourceRefs.some((ref) => ref.source === "PSKReporter")
      && report.sourceRefs.some((ref) => ref.source === "RBN"),
    );
    expect(mixed).toBeDefined();

    const clusterSaved = createSpotPreferences();
    clusterSaved.filters.sources = ["Cluster"];
    const clusterUnauthorized = scene(observations, {
      preferences: clusterSaved,
      authorizedSources: ["PSKReporter"],
    });
    expect(clusterUnauthorized.counts.matching).toBe(0);
    expect(clusterUnauthorized.counts.scopeEligible).toBe(1);

    const rbnSaved = createSpotPreferences();
    rbnSaved.filters.sources = ["RBN"];
    const rbnUnauthorized = scene(observations, {
      preferences: rbnSaved,
      authorizedSources: ["PSKReporter"],
    });
    expect(rbnUnauthorized.counts.matching).toBe(0);

    const logScoped = scene(observations, {
      operating: { scope: "log" },
      authorizedSources: ["PSKReporter", "RBN", "Cluster", "WSJT-X"],
    });
    expect(logScoped.counts.scopeEligible).toBe(0);
    expect(logScoped.reports).toHaveLength(0);
  });

  it("does not treat a Cluster poster as a receiver even with precise coordinates", () => {
    const heard = createSpotInput("psk-heard", { source: "PSKReporter" });
    const posted = createSpotInput("cluster-poster", {
      source: "Cluster",
      spotterLat: 51.5,
      spotterLon: -0.1,
      spotterGrid: "IO91",
    });
    const result = scene([heard, posted]);
    expect(result.counts.loaded).toBe(2);
    expect(result.counts.deduplicated).toBe(2);
    const cluster = result.reports.find((report) => report.sourceReportId === "cluster-poster")!;
    const psk = result.reports.find((report) => report.sourceReportId === "psk-heard")!;
    expect(cluster.reporter?.role).toBe("posting-service");
    expect(cluster.reporter?.callsign).toBe("TEST2RX");
    expect(psk.reporter?.role).toBe("receiver");
    expect(pathDescriptorForReport(cluster)).toBeNull();
    expect(pathDescriptorForReport(psk)?.direction).toBe("from-to");
    expect(result.paths.some((path) => path.reportIds.includes(cluster.id))).toBe(false);
  });

  it("keeps scene output identical across equal-ranked duplicate permutations", () => {
    const copies: LiveSpot[] = [
      createSpotInput("psk-precise", { dxLat: 40.4, dxLon: -3.7, snr: -5 }),
      createSpotInput("psk-coarse", { dxLat: 40.41, dxLon: -3.71, snr: -18 }),
      createSpotInput("psk-extra", { dxLat: 40.405, dxLon: -3.705, snr: -9 }),
    ];
    const forward = scene(copies);
    const reverse = scene([...copies].reverse());
    const rotated = scene([copies[1]!, copies[2]!, copies[0]!]);
    expect(forward).toEqual(reverse);
    expect(forward).toEqual(rotated);
    expect(forward.counts.loaded).toBe(3);
    expect(forward.counts.deduplicated).toBe(1);
    expect(forward.reports[0]?.sourceRefs.map((ref) => ref.sourceReportId)).toEqual([
      "psk-coarse",
      "psk-extra",
      "psk-precise",
    ]);
  });

  it("drops malformed observations without crashing and counts only normalized reports as loaded", () => {
    const valid = createSpotInput("valid");
    const observations: LiveSpot[] = [
      valid,
      createSpotInput("bad-time", { time: new Date(Number.NaN) }),
      createSpotInput("bad-frequency", { frequency: Number.NaN }),
      createSpotInput("missing-dx", { dx: "   " }),
      { ...createSpotInput("zero-frequency"), frequency: 0 },
    ];
    expect(() => scene(observations)).not.toThrow();
    const result = scene(observations);
    expect(result.counts.loaded).toBe(1);
    expect(result.counts.loaded).not.toBe(observations.length);
    expect(result.reports).toHaveLength(1);
    expect(result.reports[0]?.sourceReportId).toBe("valid");
  });

  it("requires one source ref to satisfy policy, authorization, and selection together", () => {
    const authorized = ["PSKReporter", "RBN", "Cluster", "WSJT-X"] as const;
    const observations = [
      createSpotInput("psk-mixed", { source: "PSKReporter", dxLat: 40.4, dxLon: -3.7, snr: -5 }),
      createSpotInput("wsjt-mixed", { source: "WSJT-X", dxLat: 41.2, dxLon: -3.8, snr: -20 }),
    ];
    const pskOnly = createSpotPreferences();
    pskOnly.filters.sources = ["PSKReporter"];
    const stages = buildSpotPipelineStages({
      observations,
      nowMs: SPOT_FIXTURE_NOW_MS,
      authorizedSources: authorized,
    });
    const scoped = applyOperatingScope(stages.loaded, { scope: "log" }, authorized);
    const matches = scoped.filter((report) =>
      reportMatchesFilters(report, pskOnly.filters, SPOT_FIXTURE_NOW_MS, authorized, { scope: "log" }),
    );
    expect(matches).toHaveLength(0);

    const logAll = scene(observations, { operating: { scope: "log" }, authorizedSources: authorized });
    expect(logAll.counts.matching).toBe(1);
    expect(logAll.reports[0]?.source).toBe("WSJT-X");
    expect(logAll.reports[0]?.dx.location).toMatchObject({ coordinates: { lat: 41.2, lon: -3.8 } });
    expect(logAll.reports[0]?.sourceRefs.every((ref) => ref.source === "WSJT-X")).toBe(true);

    const logPsk = scene(observations, {
      operating: { scope: "log" },
      authorizedSources: authorized,
      preferences: pskOnly,
    });
    expect(logPsk.counts.matching).toBe(0);
    expect(logPsk.reports).toHaveLength(0);
  });

  it("keeps a capped contributing feed visible to source filters", () => {
    const pskCopies = Array.from({ length: 32 }, (_, n) =>
      createSpotInput(`psk-cap-${String(n).padStart(2, "0")}`, { snr: undefined }),
    );
    const rbn = createSpotInput("rbn-cap", { source: "RBN", snr: -5 });
    const observations = [...pskCopies, rbn];
    const rbnOnly = createSpotPreferences();
    rbnOnly.filters.sources = ["RBN"];
    const forward = scene(observations, { preferences: rbnOnly });
    const reverse = scene([...observations].reverse(), { preferences: rbnOnly });
    expect(forward.counts.matching).toBe(1);
    expect(reverse.counts.matching).toBe(1);
    expect(forward.reports[0]?.sourceRefs.some((ref) => ref.source === "RBN")).toBe(true);
    expect(forward.reports.map((report) => report.id)).toEqual(reverse.reports.map((report) => report.id));
  });

  it("keeps two distinct spots separate when their raw LiveSpot ids collide", () => {
    const preferences = createSpotPreferences();
    const spots: LiveSpot[] = [
      createSpotInput("dup-raw-id", { dx: "TEST1DX", time: new Date(SPOT_FIXTURE_NOW_MS - 60_000) }),
      createSpotInput("dup-raw-id", { dx: "TEST2DX", time: new Date(SPOT_FIXTURE_NOW_MS - 61_000) }),
    ];
    const projection = projectLiveSpotsForView(spots, preferences, SPOT_FIXTURE_NOW_MS);
    expect(projection.matchingCount).toBe(2);
    expect(projection.mapBudgeted).toHaveLength(2);
    expect(new Set(projection.mapBudgeted.map((spot) => spot.dx))).toEqual(
      new Set(["TEST1DX", "TEST2DX"]),
    );
  });
});
