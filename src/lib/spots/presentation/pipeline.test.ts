import { describe, expect, it } from "vitest";
import { createSpotPreferences } from "@/lib/views/defaults";
import {
  createSpotFixtures,
  createSpotInput,
  createSpotLoadFixture,
  SPOT_FIXTURE_NOW_MS,
} from "@/lib/views/fixtures";
import { buildSpotPipelineStages, buildSpotSceneModel, pathDescriptorForReport } from "./pipeline";

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
    const byCall = new Map(result.reports.map((report) => [report.dx.callsign + ":" + (report.reporter?.callsign ?? ""), report]));
    expect(result.counts.loaded).toBe(4);
    expect(result.counts.deduplicated).toBe(2);
    const merged = [...byCall.values()].find((report) => report.reporter?.callsign === "TEST2RX")!;
    const other = [...byCall.values()].find((report) => report.reporter?.callsign === "TEST3RX")!;
    expect(merged.sourceRefs.map((ref) => ref.source).sort()).toEqual(["Cluster", "PSKReporter"]);
    expect(other.sourceRefs).toHaveLength(1);
    expect(result.counts.matching).toBe(2);
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
});
