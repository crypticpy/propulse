import { describe, expect, it } from "vitest";
import { createSpotPreferences } from "@/lib/views/defaults";
import { sharedSpotQueryKey, viewSpotMemoKey } from "./queryCache";

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
});
