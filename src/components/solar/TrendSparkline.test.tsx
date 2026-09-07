import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TrendSparkline } from "./TrendSparkline";

function xCoords(container: HTMLElement): number[] {
  const points =
    container.querySelector("polyline")?.getAttribute("points") ?? "";
  return points
    .split(" ")
    .filter(Boolean)
    .map((pair) => Number(pair.split(",")[0]));
}

describe("TrendSparkline", () => {
  it("places a point after a large timestamp gap further right than uniform index spacing would", () => {
    const t0 = Date.UTC(2026, 0, 1, 0, 0, 0);
    const { container } = render(
      <TrendSparkline
        label="Test trend"
        points={[
          { timestamp: new Date(t0).toISOString(), value: 1 },
          // 20-hour gap from the first point, then only a 1-minute gap to the third.
          {
            timestamp: new Date(t0 + 20 * 60 * 60 * 1000).toISOString(),
            value: 2,
          },
          {
            timestamp: new Date(
              t0 + 20 * 60 * 60 * 1000 + 60 * 1000,
            ).toISOString(),
            value: 3,
          },
        ]}
      />,
    );
    const [xFirst, xMiddle, xLast] = xCoords(container);
    // Uniform index spacing across 3 points would place the middle point at
    // exactly the midpoint (half of the view width).
    const uniformMidpoint = (xFirst + xLast) / 2;
    expect(xMiddle).toBeGreaterThan(uniformMidpoint);
    // It should sit close to the last point since the remaining gap is tiny
    // relative to the 20-hour span.
    expect(xLast - xMiddle).toBeLessThan(xMiddle - xFirst);
  });

  it("falls back to even index spacing when timestamps are unparsable", () => {
    const { container } = render(
      <TrendSparkline
        label="Test trend"
        points={[
          { timestamp: "not-a-date", value: 1 },
          { timestamp: "also-not-a-date", value: 2 },
          { timestamp: "still-not-a-date", value: 3 },
        ]}
      />,
    );
    const [xFirst, xMiddle, xLast] = xCoords(container);
    expect(xMiddle).toBeCloseTo((xFirst + xLast) / 2, 5);
  });

  it("falls back to even index spacing when every timestamp is identical", () => {
    const t0 = new Date(Date.UTC(2026, 0, 1)).toISOString();
    const { container } = render(
      <TrendSparkline
        label="Test trend"
        points={[
          { timestamp: t0, value: 1 },
          { timestamp: t0, value: 2 },
          { timestamp: t0, value: 3 },
        ]}
      />,
    );
    const [xFirst, xMiddle, xLast] = xCoords(container);
    expect(xMiddle).toBeCloseTo((xFirst + xLast) / 2, 5);
  });
});
