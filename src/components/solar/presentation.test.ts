import { describe, expect, it } from "vitest";
import { noaaScaleTone } from "./presentation";

describe("noaaScaleTone", () => {
  it("returns neutral for null, undefined or zero", () => {
    expect(noaaScaleTone(null)).toBe("neutral");
    expect(noaaScaleTone(undefined)).toBe("neutral");
    expect(noaaScaleTone(0)).toBe("neutral");
  });

  it("returns watch for scales 1-2", () => {
    expect(noaaScaleTone(1)).toBe("watch");
    expect(noaaScaleTone(2)).toBe("watch");
  });

  it("returns impact for scales 3 and above", () => {
    expect(noaaScaleTone(3)).toBe("impact");
    expect(noaaScaleTone(5)).toBe("impact");
  });
});
