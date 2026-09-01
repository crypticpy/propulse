import { describe, expect, it } from "vitest";
import {
  getEndpointInstanceCount,
  MAX_ENDPOINT_INSTANCES,
} from "@/lib/map/spotEndpointCapacity";

describe("live spot endpoint capacity", () => {
  it("retains both endpoint instances for the 200-spot production cap", () => {
    expect(MAX_ENDPOINT_INSTANCES).toBe(400);
    expect(getEndpointInstanceCount(200 * 2)).toBe(400);
  });

  it("still bounds malformed or oversized instance requests", () => {
    expect(getEndpointInstanceCount(-1)).toBe(0);
    expect(getEndpointInstanceCount(401)).toBe(400);
  });
});
