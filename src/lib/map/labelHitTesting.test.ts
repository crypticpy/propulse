import { describe, expect, it } from "vitest";
import { findTopmostLabelIndex } from "./labelHitTesting";

describe("findTopmostLabelIndex", () => {
  it("gives the last-painted label first refusal in an overlap", () => {
    const labels = [
      { bbox: { x: 10, y: 10, w: 40, h: 20 } },
      { bbox: { x: 20, y: 12, w: 40, h: 20 } },
    ];

    expect(findTopmostLabelIndex(labels, { x: 25, y: 18 })).toBe(1);
    expect(findTopmostLabelIndex(labels, { x: 12, y: 18 })).toBe(0);
    expect(findTopmostLabelIndex(labels, { x: 100, y: 100 })).toBe(-1);
  });
});
