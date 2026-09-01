import { describe, expect, it, vi } from "vitest";

import { getStandardMapCanvas } from "./standardMap";

describe("getStandardMapCanvas cache", () => {
  it("does not invalidate a canvas still held by an active consumer", () => {
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue(null);
    const retained = getStandardMapCanvas(37, 19, "light");
    getStandardMapCanvas(38, 19, "dark");
    getStandardMapCanvas(39, 19, "midnight");

    expect(retained.width).toBe(37);
    expect(retained.height).toBe(19);
    getContext.mockRestore();
  });
});
