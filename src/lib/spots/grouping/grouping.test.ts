import { describe, expect, it } from "vitest";
import { createSpotFixtures, createSpotInput, SPOT_FIXTURE_GEOGRAPHY_VERSION, SPOT_FIXTURE_NOW_MS } from "@/lib/views/fixtures";
import { normalizeLiveSpot } from "@/lib/spots/presentation/pipeline";
import type { GroupingPreferences } from "./grouping";
import { groupMappedReports } from "./grouping";
import { lookupCaSubdivision, lookupCountry, lookupUsSubdivision, countryMatchFromCode } from "./lookup";
import { ATLAS_GAP_COUNTRIES } from "./atlasGaps";
import { maidenheadFromCoordinates } from "./maidenhead";
import { createExpansionState, reduceExpansion } from "./expansion";
import type { LiveSpot } from "@/types/livespot";
import { contractIdSchema, type NormalizedSpotReport } from "@/lib/views/spotContracts";

const VERSION = SPOT_FIXTURE_GEOGRAPHY_VERSION;
const regions: GroupingPreferences = { enabled: true, detail: "regions", minGroupSize: 3 };
const grid4: GroupingPreferences = { enabled: true, detail: "grid4", minGroupSize: 3 };
const grid6: GroupingPreferences = { enabled: true, detail: "grid6", minGroupSize: 2 };

function reportsOf(spots: LiveSpot[]): NormalizedSpotReport[] {
  return spots.flatMap((spot) => {
    const report = normalizeLiveSpot(spot, new Map());
    if (!report) return [];
    const parsed = contractIdSchema.safeParse(spot.id);
    return [parsed.success ? { ...report, id: parsed.data } : report];
  });
}

function membership(result: ReturnType<typeof groupMappedReports>): string[] {
  return [...result.singles, ...result.groups.flatMap((group) => group.reportIds)].sort();
}

function assertExactlyOnce(reports: NormalizedSpotReport[], result: ReturnType<typeof groupMappedReports>) {
  const represented = membership(result);
  expect(new Set(represented).size).toBe(represented.length);
  expect(represented.sort()).toEqual(reports.map((report) => report.id).sort());
  expect(result.groups.every((group) => group.endpointRole === "dx")).toBe(true);
}

describe("geographic lookup", () => {
  it("places precise US coordinates in states and never treats the US centroid as Kansas", () => {
    expect(lookupUsSubdivision(39.74, -104.99)?.region.id).toBe("subdivision:US-CO");
    expect(lookupUsSubdivision(30.27, -97.74)?.region.id).toBe("subdivision:US-TX");
    expect(lookupUsSubdivision(34.05, -118.24)?.region.id).toBe("subdivision:US-CA");
    expect(lookupCountry(40.4, -3.7)?.region.countryCode).toBe("ES");
    expect(lookupCountry(60, 8)?.region.countryCode).toBe("NO");
    expect(lookupCountry(0, 0)).toBeNull();
    expect(lookupUsSubdivision(21.31, -157.86)?.region.id).toBe("subdivision:US-HI");
    expect(lookupCaSubdivision(43.7, -79.4)?.region.id).toBe("subdivision:CA-ON");
    const usCentroid = lookupUsSubdivision(39.8, -98.6);
    expect(usCentroid?.region.id).toBe("subdivision:US-KS");
  });
});

describe("groupMappedReports", () => {
  it("groups Spain 50 and Norway 20 as country clusters with dataset anchors", () => {
    const { spain, norway } = createSpotFixtures();
    const reports = reportsOf([...spain, ...norway]);
    const result = groupMappedReports(reports, regions, { geographyVersion: VERSION });
    const reversed = groupMappedReports([...reports].reverse(), regions, { geographyVersion: VERSION });
    const spainGroup = result.groups.find((group) => group.region?.countryCode === "ES");
    const norwayGroup = result.groups.find((group) => group.region?.countryCode === "NO");
    expect(spainGroup?.reportIds).toHaveLength(50);
    // NE 110m omits two synthetic Norway coastal holes (63°N,7°E and 59°N,10°E).
    expect(norwayGroup?.reportIds).toHaveLength(18);
    expect(result.singles).toHaveLength(2);
    expect(spainGroup?.precision).toBe("reported-coordinate");
    expect(spainGroup?.grid).toBeNull();
    expect(spainGroup?.anchor).toEqual(lookupCountry(40.4, -3.7)?.anchor);
    expect(norwayGroup?.anchor).toEqual(lookupCountry(60, 8)?.anchor);
    expect(result.groups.map((group) => group.id)).toEqual(reversed.groups.map((group) => group.id));
    expect(spainGroup?.reportIds).toEqual(reversed.groups.find((group) => group.id === spainGroup?.id)?.reportIds);
    assertExactlyOnce(reports, result);
  });

  it("does not auto-split when a country group grows from 49 to 51", () => {
    const fortyNine = reportsOf(Array.from({ length: 49 }, (_, n) => createSpotInput(`es49-${n}`, {
      dx: `EA${n}DX`, dxLat: 40.4, dxLon: -3.7,
      time: new Date(SPOT_FIXTURE_NOW_MS - n * 1000),
    })));
    const fiftyOne = reportsOf(Array.from({ length: 51 }, (_, n) => createSpotInput(`es51-${n}`, {
      dx: `EA${n}DX`, dxLat: 40.4, dxLon: -3.7,
      time: new Date(SPOT_FIXTURE_NOW_MS - n * 1000),
    })));
    const small = groupMappedReports(fortyNine, regions, { geographyVersion: VERSION });
    const large = groupMappedReports(fiftyOne, regions, { geographyVersion: VERSION });
    expect(small.groups).toHaveLength(1);
    expect(large.groups).toHaveLength(1);
    expect(small.groups[0]?.id).toBe(large.groups[0]?.id);
    expect(small.groups[0]?.reportIds).toHaveLength(49);
    expect(large.groups[0]?.reportIds).toHaveLength(51);
  });

  it("keeps precise US states separate from approximate country-only US reports", () => {
    const precise = reportsOf([
      createSpotInput("co-a", { dx: "K0AAA", dxLat: 39.74, dxLon: -104.99 }),
      createSpotInput("co-b", { dx: "K0BBB", dxLat: 39.75, dxLon: -105.0 }),
      createSpotInput("co-c", { dx: "K0CCC", dxLat: 39.73, dxLon: -104.98 }),
      createSpotInput("tx-a", { dx: "K5AAA", dxLat: 30.27, dxLon: -97.74 }),
      createSpotInput("tx-b", { dx: "K5BBB", dxLat: 30.28, dxLon: -97.73 }),
      createSpotInput("tx-c", { dx: "K5CCC", dxLat: 30.26, dxLon: -97.75 }),
    ]);
    const approximate = reportsOf([
      createSpotInput("us-a", { dx: "K1TEST", dxLat: 39.8, dxLon: -98.6, dxLocApprox: true }),
      createSpotInput("us-b", { dx: "W1TEST", dxLat: undefined, dxLon: undefined }),
      createSpotInput("us-c", { dx: "N1TEST", dxLat: undefined, dxLon: undefined }),
    ]);
    const result = groupMappedReports([...precise, ...approximate], regions, { geographyVersion: VERSION });
    const colorado = result.groups.find((group) => group.region?.id === "subdivision:US-CO");
    const texas = result.groups.find((group) => group.region?.id === "subdivision:US-TX");
    const country = result.groups.find((group) => group.region?.id === "country:US");
    expect(colorado?.precision).toBe("reported-coordinate");
    expect(texas?.precision).toBe("reported-coordinate");
    expect(country?.precision).toBe("approximate");
    expect(country?.label).not.toMatch(/Kansas/i);
    expect(colorado?.anchor).not.toEqual(country?.anchor);
    expect(result.groups.some((group) => group.region?.id === "subdivision:US-KS")).toBe(false);
    assertExactlyOnce([...precise, ...approximate], result);
  });

  it("does not invent grid6 or a state from a coarse locator", () => {
    const oceanField = reportsOf([
      createSpotInput("coarse-a", { dx: "EA1AAA", dxLat: undefined, dxLon: undefined, dxGrid: "IN" }),
      createSpotInput("coarse-b", { dx: "EA1BBB", dxLat: undefined, dxLon: undefined, dxGrid: "IN" }),
      createSpotInput("coarse-c", { dx: "EA1CCC", dxLat: undefined, dxLon: undefined, dxGrid: "IN" }),
    ]);
    const usField = reportsOf([
      createSpotInput("em-a", { dx: "K5AAA", dxLat: undefined, dxLon: undefined, dxGrid: "EM" }),
      createSpotInput("em-b", { dx: "K5BBB", dxLat: undefined, dxLon: undefined, dxGrid: "EM" }),
      createSpotInput("em-c", { dx: "K5CCC", dxLat: undefined, dxLon: undefined, dxGrid: "EM" }),
    ]);
    const ocean = groupMappedReports(oceanField, grid6, { geographyVersion: VERSION });
    const inland = groupMappedReports(usField, grid6, { geographyVersion: VERSION });
    expect(ocean.groups).toHaveLength(0);
    expect(inland.groups).toHaveLength(1);
    expect(inland.groups[0]?.detail).toBe("regions");
    expect(inland.groups[0]?.precision).toBe("reported-grid");
    expect(inland.groups[0]?.region?.id).toBe("country:US");
    expect(inland.groups[0]?.grid).toBeNull();
    expect(inland.groups[0]?.region?.kind).toBe("country");
  });

  it("keeps dateline, pole, and ocean points from inventing a shared proximity group", () => {
    const { edges } = createSpotFixtures();
    const reports = reportsOf(edges);
    const result = groupMappedReports(reports, regions, { geographyVersion: VERSION });
    const again = groupMappedReports(reports, regions, { geographyVersion: VERSION });
    expect(result.groups.map((group) => group.id)).toEqual(again.groups.map((group) => group.id));
    const dateline = reports.filter((report) => report.sourceReportId === "date-east" || report.sourceReportId === "date-west");
    const together = result.groups.filter((group) =>
      dateline.every((report) => group.reportIds.includes(report.id)),
    );
    expect(together).toHaveLength(0);
    const unlocated = reports.find((report) => report.sourceReportId === "unlocated");
    expect(unlocated && result.singles.includes(unlocated.id)).toBe(true);
    assertExactlyOnce(reports, result);
  });

  it("uses Maidenhead cell centers at grid4 and leaves approximate reports in the country parent", () => {
    const spain = reportsOf(createSpotFixtures().spain);
    const approximate = reportsOf([
      createSpotInput("us-a", { dx: "K1TEST", dxLat: 39.8, dxLon: -98.6, dxLocApprox: true }),
      createSpotInput("us-b", { dx: "W1TEST", dxLat: undefined, dxLon: undefined }),
      createSpotInput("us-c", { dx: "N1TEST", dxLat: undefined, dxLon: undefined }),
    ]);
    const result = groupMappedReports([...spain, ...approximate], grid4, { geographyVersion: VERSION });
    expect(result.groups.some((group) => group.detail === "grid4" && group.precision !== "approximate")).toBe(true);
    expect(result.groups.every((group) => group.detail === "grid4" ? group.grid?.length === 4 : true)).toBe(true);
    const parent = result.groups.find((group) => group.region?.id === "country:US");
    expect(parent?.detail).toBe("regions");
    expect(parent?.precision).toBe("approximate");
    const sample = spain[0]!;
    if (sample.dx.location.kind === "reported-coordinate") {
      const grid = maidenheadFromCoordinates(sample.dx.location.coordinates.lat, sample.dx.location.coordinates.lon, 4);
      const cell = result.groups.find((group) => group.grid === grid);
      expect(cell?.anchor).toEqual(expect.objectContaining({ lat: expect.any(Number), lon: expect.any(Number) }));
    }
    assertExactlyOnce([...spain, ...approximate], result);
  });

  it("expands a selected region into finer groups, persists across regroup of others, and syncs empty membership", () => {
    const reports = reportsOf(createSpotFixtures().spain);
    const grouped = groupMappedReports(reports, regions, { geographyVersion: VERSION });
    const spainId = grouped.groups[0]!.id;
    let expansion = reduceExpansion(createExpansionState(), { type: "expand", groupId: spainId });
    const expanded = groupMappedReports(reports, regions, {
      geographyVersion: VERSION,
      expandedIds: expansion.expandedIds,
    });
    expect(expanded.groups.some((group) => group.id === spainId)).toBe(false);
    expect(expanded.groups.some((group) => group.detail === "grid4")).toBe(true);
    expect(expanded.liveGroupIds).toContain(spainId);
    assertExactlyOnce(reports, expanded);

    const finer = expanded.groups.find((group) => group.detail === "grid4")!;
    expansion = reduceExpansion(expansion, { type: "expand", groupId: finer.id });
    const nested = groupMappedReports(reports, regions, {
      geographyVersion: VERSION,
      expandedIds: expansion.expandedIds,
    });
    expect(nested.groups.some((group) => group.id === finer.id)).toBe(false);
    assertExactlyOnce(reports, nested);

    expansion = reduceExpansion(expansion, { type: "regroup", groupId: finer.id });
    const afterRegroup = groupMappedReports(reports, regions, {
      geographyVersion: VERSION,
      expandedIds: expansion.expandedIds,
    });
    expect(afterRegroup.groups.some((group) => group.id === finer.id)).toBe(true);

    expansion = reduceExpansion(expansion, { type: "sync", liveGroupIds: [] });
    expect(expansion.expandedIds).toEqual([]);
    const filteredOut = groupMappedReports([], regions, {
      geographyVersion: VERSION,
      expandedIds: [spainId],
    });
    expansion = reduceExpansion(
      { expandedIds: [spainId] },
      { type: "sync", liveGroupIds: filteredOut.liveGroupIds },
    );
    expect(expansion.expandedIds).toEqual([]);
  });

  it("turns expanded grid6 members into singles and below-threshold buckets into individuals", () => {
    const reports = reportsOf([
      createSpotInput("g6-a", { dx: "EA1AAA", dxLat: 40.4, dxLon: -3.7 }),
      createSpotInput("g6-b", { dx: "EA1BBB", dxLat: 40.4001, dxLon: -3.7001 }),
    ]);
    const grouped = groupMappedReports(reports, grid6, { geographyVersion: VERSION });
    expect(grouped.groups).toHaveLength(1);
    const expanded = groupMappedReports(reports, grid6, {
      geographyVersion: VERSION,
      expandedIds: [grouped.groups[0]!.id],
    });
    expect(expanded.groups).toHaveLength(0);
    expect(expanded.singles).toHaveLength(2);
    const below = groupMappedReports(reports, { ...regions, minGroupSize: 3 }, { geographyVersion: VERSION });
    expect(below.groups).toHaveLength(0);
    expect(below.singles).toHaveLength(2);
  });

  it("emits only singles when grouping is disabled", () => {
    const reports = reportsOf(createSpotFixtures().spain);
    const result = groupMappedReports(
      reports,
      { enabled: false, detail: "regions", minGroupSize: 3 },
      { geographyVersion: VERSION },
    );
    expect(result.groups).toHaveLength(0);
    expect(result.singles).toHaveLength(50);
    expect(result.liveGroupIds.length).toBeGreaterThan(0);
  });

  it("groups atlas-omitted SG/GU/VI prefixes as approximate countries with stable anchors", () => {
    const spots = [
      ...["sg-a", "sg-b", "sg-c"].map((id, n) => createSpotInput(id, {
        dx: `9V1A${n}`, dxLat: undefined, dxLon: undefined,
        time: new Date(SPOT_FIXTURE_NOW_MS - n * 1000),
      })),
      ...["gu-a", "gu-b", "gu-c"].map((id, n) => createSpotInput(id, {
        dx: `KH2A${n}`, dxLat: undefined, dxLon: undefined,
        time: new Date(SPOT_FIXTURE_NOW_MS - n * 1000),
      })),
      ...["vi-a", "vi-b", "vi-c"].map((id, n) => createSpotInput(id, {
        dx: `KP2A${n}`, dxLat: undefined, dxLon: undefined,
        time: new Date(SPOT_FIXTURE_NOW_MS - n * 1000),
      })),
    ];
    const reports = reportsOf(spots);
    expect(reports.every((report) => report.dx.location.kind === "approximate")).toBe(true);
    const result = groupMappedReports(reports, regions, { geographyVersion: VERSION });
    const reversed = groupMappedReports([...reports].reverse(), regions, { geographyVersion: VERSION });
    const byCode = Object.fromEntries(result.groups.map((group) => [group.region?.countryCode, group]));
    expect(byCode.SG?.precision).toBe("approximate");
    expect(byCode.GU?.precision).toBe("approximate");
    expect(byCode.VI?.precision).toBe("approximate");
    expect(byCode.SG?.detail).toBe("regions");
    expect(byCode.SG?.grid).toBeNull();
    expect(byCode.SG?.region?.kind).toBe("country");
    expect(byCode.SG?.anchor).toEqual(ATLAS_GAP_COUNTRIES.SG.anchor);
    expect(byCode.GU?.anchor).toEqual(ATLAS_GAP_COUNTRIES.GU.anchor);
    expect(byCode.VI?.anchor).toEqual(ATLAS_GAP_COUNTRIES.VI.anchor);
    expect(countryMatchFromCode("SG")?.provenance).toBe("atlas-gap-prefix");
    expect(result.groups.map((group) => group.id)).toEqual(reversed.groups.map((group) => group.id));
    expect(result.groups.some((group) => group.region?.kind === "subdivision")).toBe(false);
    expect(result.groups.some((group) => group.detail !== "regions")).toBe(false);
    const asGrid = groupMappedReports(reports, grid6, { geographyVersion: VERSION });
    expect(asGrid.groups.every((group) => group.detail === "regions" && group.precision === "approximate")).toBe(true);
    assertExactlyOnce(reports, result);
  });
});
