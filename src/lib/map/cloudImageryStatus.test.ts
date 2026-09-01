import { describe, expect, it } from "vitest";

import { resolveCloudImageryStatus } from "./cloudImageryStatus";

describe("resolveCloudImageryStatus", () => {
  it("reports unavailable, partial, and available from actual tile loads", () => {
    expect(resolveCloudImageryStatus([false, false])).toBe("unavailable");
    expect(resolveCloudImageryStatus([true, false])).toBe("partial");
    expect(resolveCloudImageryStatus([true, true])).toBe("available");
  });
});
