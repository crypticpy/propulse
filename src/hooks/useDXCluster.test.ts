import { describe, expect, it } from "vitest";
import { shouldDemoteClusterSource } from "./useDXCluster";

describe("DX cluster shared-source ownership", () => {
  it("does not let a policy-disabled observer demote an active bridge source", () => {
    expect(shouldDemoteClusterSource(false, false, "bridge")).toBe(false);
  });

  it("still demotes a disconnected enabled bridge observer to REST", () => {
    expect(shouldDemoteClusterSource(true, false, "bridge")).toBe(true);
    expect(shouldDemoteClusterSource(true, true, "bridge")).toBe(false);
    expect(shouldDemoteClusterSource(true, false, "rest")).toBe(false);
  });
});
