import { describe, expect, it } from "vitest";
import { resolveCompactFit } from "./useDisplayFit";

describe("resolveCompactFit", () => {
  it("forces compact regardless of viewport", () => {
    expect(resolveCompactFit("compact", false)).toBe(true);
    expect(resolveCompactFit("compact", true)).toBe(true);
  });

  it("forces full regardless of viewport", () => {
    expect(resolveCompactFit("full", false)).toBe(false);
    expect(resolveCompactFit("full", true)).toBe(false);
  });

  it("follows the viewport in auto mode", () => {
    expect(resolveCompactFit("auto", true)).toBe(true);
    expect(resolveCompactFit("auto", false)).toBe(false);
  });
});
