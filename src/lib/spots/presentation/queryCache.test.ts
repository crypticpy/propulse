import { describe, expect, it } from "vitest";
import { createSpotPreferences } from "@/lib/views/defaults";
import { createNormalizedSpot } from "@/lib/views/fixtures";
import { reportRevisionFromIds, reportRevisionFromReports, sharedSpotQueryKey, viewSpotMemoKey } from "./queryCache";

describe("spot query cache identity", () => {
  it("excludes map budget, camera and grouping from the shared query key", () => {
    const base = {
      sources: ["PSKReporter", "RBN"] as const,
      dataScope: "observe" as const,
      authorization: "owner-a",
      windowStartMs: 1,
      windowEndMs: 2,
      upstreamParams: { hours: 2, limit: 5000 },
    };
    expect(sharedSpotQueryKey(base)).toEqual(sharedSpotQueryKey({
      ...base,
      sources: ["RBN", "PSKReporter"],
    }));
    expect(sharedSpotQueryKey(base)).not.toEqual(sharedSpotQueryKey({
      ...base,
      windowEndMs: 3,
    }));
    const memoA = viewSpotMemoKey({
      reportRevision: "rev-1",
      nowMs: 10,
      ageBucketMinutes: 30,
      operatingScope: "observe",
      filters: { ...createSpotPreferences().filters, spotLimit: 50 },
      grouping: createSpotPreferences().grouping,
    });
    const memoB = viewSpotMemoKey({
      reportRevision: "rev-1",
      nowMs: 10,
      ageBucketMinutes: 30,
      operatingScope: "observe",
      filters: { ...createSpotPreferences().filters, spotLimit: 200 },
      grouping: createSpotPreferences().grouping,
    });
    expect(memoA).not.toEqual(memoB);
  });

  it("changes content revision and view memo when a stable ID is enriched", () => {
    const before = createNormalizedSpot("same-id");
    const after = {
      ...before,
      snrDb: -3,
      sourceRefs: [
        { source: "PSKReporter" as const, sourceReportId: "same-id" },
        { source: "RBN" as const, sourceReportId: "rbn-copy" },
      ],
      dx: {
        ...before.dx,
        location: { kind: "reported-coordinate" as const, coordinates: { lat: 41.1, lon: -4.2 } },
      },
    };
    expect(before.id).toBe(after.id);
    expect(reportRevisionFromIds([before.id])).toEqual(reportRevisionFromIds([after.id]));
    expect(reportRevisionFromReports([before])).not.toEqual(reportRevisionFromReports([after]));
    expect(reportRevisionFromReports([after, before])).toEqual(reportRevisionFromReports([before, after]));

    const memoIdentity = {
      nowMs: 10,
      ageBucketMinutes: 30,
      operatingScope: "observe" as const,
      filters: createSpotPreferences().filters,
      grouping: createSpotPreferences().grouping,
    };
    expect(viewSpotMemoKey({ ...memoIdentity, reportRevision: reportRevisionFromReports([before]) }))
      .not.toEqual(viewSpotMemoKey({ ...memoIdentity, reportRevision: reportRevisionFromReports([after]) }));
  });
});
