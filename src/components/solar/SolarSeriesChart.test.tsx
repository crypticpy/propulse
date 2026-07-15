import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SolarSeriesChart } from "./SolarSeriesChart";

describe("SolarSeriesChart", () => {
  it("narrates unique full timestamps and distinguishes official predictions", () => {
    render(
      <SolarSeriesChart
        label="Planetary Kp"
        unit="Kp"
        points={[
          { timestamp: "2026-07-15T12:00:00.000Z", value: 2, kind: "observed" },
          { timestamp: "2026-07-15T15:00:00.000Z", value: 3, kind: "estimated" },
          { timestamp: "2026-07-15T18:00:00.000Z", value: 4, kind: "predicted" },
        ]}
      />,
    );
    expect(screen.getByRole("img").getAttribute("aria-label")).toMatch(
      /2026-07-15T12:00:00.000Z to 2026-07-15T18:00:00.000Z/,
    );
    expect(screen.getByText("Official NOAA prediction")).not.toBeNull();
    expect(screen.getByText(/2026-07-15T18:00:00.000Z: 4 Kp, predicted/)).not.toBeNull();
  });
});
