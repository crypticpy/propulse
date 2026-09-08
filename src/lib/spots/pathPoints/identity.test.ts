import { describe, expect, it } from "vitest";
import { pathPointDescriptorSchema } from "@/lib/views/spotContracts";
import {
  PATH_POINT_ID_MAX_LENGTH,
  pathPointId,
} from "./identity";

function maxPathId(tail: string): string {
  const id = `p${"x".repeat(127 - tail.length)}${tail}`;
  expect(id).toHaveLength(PATH_POINT_ID_MAX_LENGTH);
  expect(pathPointDescriptorSchema.shape.id.parse(id)).toBe(id);
  return id;
}

describe("pathPointId", () => {
  it("uses pathId + hop + role when that still fits the contract", () => {
    expect(pathPointId("path-ny-tokyo", 0, "ray-apex")).toBe(
      "path-ny-tokyo:h0:ray-apex",
    );
  });

  it("keeps hop and role in the suffix for a max-length pathId", () => {
    const pathId = maxPathId("aaaaaaa");
    for (const role of ["ray-apex", "shell-highlight", "ground-point"] as const) {
      const id = pathPointId(pathId, 100, role);
      expect(id.length).toBeLessThanOrEqual(PATH_POINT_ID_MAX_LENGTH);
      expect(pathPointDescriptorSchema.shape.id.parse(id)).toBe(id);
      expect(id.endsWith(`:h100:${role}`)).toBe(true);
      expect(id.startsWith("p")).toBe(true);
    }
  });

  it("distinguishes shared prefixes, hops, and roles", () => {
    const left = maxPathId("aaaaaaa");
    const right = maxPathId("bbbbbbb");
    expect(left.slice(0, 120)).toBe(right.slice(0, 120));
    const leftApex = pathPointId(left, 0, "ray-apex");
    const rightApex = pathPointId(right, 0, "ray-apex");
    const leftShell = pathPointId(left, 0, "shell-highlight");
    const leftHop1 = pathPointId(left, 1, "ray-apex");
    expect(leftApex).not.toBe(rightApex);
    expect(new Set([leftApex, leftShell, leftHop1, rightApex]).size).toBe(4);
  });
});
