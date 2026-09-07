import { describe, expect, it } from "vitest";
import { pathPointDescriptorSchema } from "@/lib/views/spotContracts";
import {
  PATH_POINT_ID_MAX_LENGTH,
  pathPointId,
} from "./identity";

describe("pathPointId", () => {
  it("uses pathId + hop + role when that still fits the contract", () => {
    expect(pathPointId("path-ny-tokyo", 0, "ray-apex")).toBe(
      "path-ny-tokyo:h0:ray-apex",
    );
  });

  it("stays within 128 characters for a max-length contract pathId", () => {
    const pathId = `p${"a".repeat(127)}`;
    expect(pathId).toHaveLength(PATH_POINT_ID_MAX_LENGTH);
    expect(pathPointDescriptorSchema.shape.id.parse(pathId)).toBe(pathId);

    for (const role of ["ray-apex", "shell-highlight", "ground-point"] as const) {
      const id = pathPointId(pathId, 100, role);
      expect(id.length).toBeLessThanOrEqual(PATH_POINT_ID_MAX_LENGTH);
      expect(pathPointDescriptorSchema.shape.id.parse(id)).toBe(id);
      expect(id).not.toBe(`${pathId}:h100:${role}`);
    }
  });

  it("keeps hop and role distinct after bounding", () => {
    const pathId = `p${"b".repeat(127)}`;
    const apex = pathPointId(pathId, 0, "ray-apex");
    const shell = pathPointId(pathId, 0, "shell-highlight");
    const hop1 = pathPointId(pathId, 1, "ray-apex");
    expect(new Set([apex, shell, hop1]).size).toBe(3);
  });
});
