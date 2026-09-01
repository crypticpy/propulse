import { describe, expect, it } from "vitest";
import {
  getTraceEndpointOpacity,
  reconcileTraceFeed,
} from "@/lib/map/spotTraceLifecycle";

describe("animated spot trace lifecycle", () => {
  it("hydrates the existing feed without replaying it", () => {
    const result = reconcileTraceFeed(
      new Set(),
      false,
      true,
      ["old-1", "old-2"],
      new Set(["old-1", "old-2"]),
    );

    expect(result.hydrated).toBe(true);
    expect(result.newEligibleIds).toEqual([]);
    expect([...result.seenIds]).toEqual(["old-1", "old-2"]);
  });

  it("waits for initial loading to finish before hydrating", () => {
    const loading = reconcileTraceFeed(
      new Set(),
      false,
      false,
      [],
      new Set(),
    );
    const hydrated = reconcileTraceFeed(
      loading.seenIds,
      loading.hydrated,
      true,
      ["existing"],
      new Set(["existing"]),
    );

    expect(loading.hydrated).toBe(false);
    expect(hydrated.newEligibleIds).toEqual([]);
    expect(hydrated.seenIds.has("existing")).toBe(true);
  });

  it("animates only genuinely new eligible feed entries", () => {
    const result = reconcileTraceFeed(
      new Set(["old", "previously-filtered"]),
      true,
      true,
      ["new", "old", "previously-filtered", "new-filtered-out"],
      new Set(["new", "old", "previously-filtered"]),
    );

    expect(result.newEligibleIds).toEqual(["new"]);
    expect(result.seenIds.has("new-filtered-out")).toBe(true);
  });

  it("keeps the destination visible through travel and persistence, then fades it", () => {
    expect(getTraceEndpointOpacity("traveling")).toBe(1);
    expect(getTraceEndpointOpacity("persist")).toBe(1);
    expect(getTraceEndpointOpacity("fadeout", 0.25)).toBe(0.75);
    expect(getTraceEndpointOpacity("fadeout", 2)).toBe(0);
    expect(getTraceEndpointOpacity("done")).toBe(0);
  });
});
