import { describe, expect, it } from "vitest";
import { safeDockGroupY } from "./proDockLayout";

describe("safeDockGroupY", () => {
  it("translates every member by the anchor offset", () => {
    expect(safeDockGroupY(0, 0, 64)).toBe(64);
    expect(safeDockGroupY(0, 120, 64)).toBe(184);
  });

  it("leaves groups already below the toolbar unchanged", () => {
    expect(safeDockGroupY(80, 140, 64)).toBe(140);
  });
});
