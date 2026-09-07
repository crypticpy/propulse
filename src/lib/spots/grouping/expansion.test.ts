import { describe, expect, it } from "vitest";
import { createExpansionState, reduceExpansion } from "./expansion";

describe("reduceExpansion", () => {
  it("expands, regroups, and resets without mutating prior state", () => {
    const start = createExpansionState();
    const expanded = reduceExpansion(start, { type: "expand", groupId: "g:one" });
    const again = reduceExpansion(expanded, { type: "expand", groupId: "g:one" });
    const two = reduceExpansion(again, { type: "expand", groupId: "g:two" });
    const regrouped = reduceExpansion(two, { type: "regroup", groupId: "g:one" });
    const cleared = reduceExpansion(regrouped, { type: "regroupAll" });
    expect(start.expandedIds).toEqual([]);
    expect(expanded.expandedIds).toEqual(["g:one"]);
    expect(again).toBe(expanded);
    expect(two.expandedIds).toEqual(["g:one", "g:two"]);
    expect(regrouped.expandedIds).toEqual(["g:two"]);
    expect(cleared.expandedIds).toEqual([]);
  });

  it("drops stale expanded IDs when live membership is empty", () => {
    const state = reduceExpansion(createExpansionState(), { type: "expand", groupId: "g:gone" });
    const synced = reduceExpansion(state, { type: "sync", liveGroupIds: ["g:live"] });
    expect(synced.expandedIds).toEqual([]);
    const kept = reduceExpansion(state, { type: "sync", liveGroupIds: ["g:gone", "g:other"] });
    expect(kept.expandedIds).toEqual(["g:gone"]);
  });
});
