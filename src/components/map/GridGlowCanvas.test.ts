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
});
