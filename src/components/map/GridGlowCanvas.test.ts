import { describe, expect, it } from "vitest";
import { GridGlowRenderer } from "./GridGlowCanvas";

describe("GridGlowRenderer active cells", () => {
  it("exposes exactly the persisted cells that remain clickable", () => {
    const renderer = new GridGlowRenderer();
    renderer.persistEdges = true;
    renderer.addGlow({
      gridSquare: "em12",
      color: "#00ffff",
      timestamp: 1_000,
    });

    expect(renderer.getActiveGridSquares(61_000)).toEqual(["EM12"]);
    expect(renderer.getActiveGridSquares(91_000)).toEqual([]);
  });

  it("sleeps through a steady persisted edge and wakes for its fade", () => {
    const renderer = new GridGlowRenderer();
    renderer.persistEdges = true;
    renderer.addGlow({
      gridSquare: "EM12",
      color: "#00ffff",
      timestamp: 1_000,
    });

    expect(renderer.getNextAnimationDelay(1_100)).toBe(0);
    expect(renderer.getNextAnimationDelay(3_000)).toBe(58_000);
    expect(renderer.getNextAnimationDelay(61_000)).toBe(0);
    expect(renderer.getNextAnimationDelay(91_000)).toBeNull();
  });

  it("stops the clock after a transient pulse settles", () => {
    const renderer = new GridGlowRenderer();
    renderer.addGlow({
      gridSquare: "EM12",
      color: "#00ffff",
      timestamp: 1_000,
    });

    expect(renderer.getNextAnimationDelay(1_500)).toBe(0);
    expect(renderer.getNextAnimationDelay(2_000)).toBeNull();
  });
});
