import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SolarSeriesChart } from "./SolarSeriesChart";

describe("SolarSeriesChart", () => {
  it("interprets zone-less NOAA timestamps as UTC and prints the explicit zone", () => {
    render(<SolarSeriesChart label="Bz" unit="nT" points={[{ timestamp: "2026-09-04T12:00:00", value: 1 }]} />);
    expect(screen.getByRole("slider").getAttribute("aria-valuetext")).toBe("2026-09-04T12:00:00.000Z: 1 nT, observed");
  });
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


describe("SolarSeriesChart inspection", () => {
  const points = [
    { timestamp: "2026-09-04T12:00:00Z", value: -2 },
    { timestamp: "2026-09-04T12:01:00Z", value: 1 },
    { timestamp: "2026-09-04T12:30:00Z", value: 3 },
  ];
  it("breaks gaps and shows a zero line for signed data", () => {
    const { container } = render(<SolarSeriesChart points={points} label="Bz" unit="nT" maxGapMs={300_000} />);
    expect(container.querySelectorAll("[data-series-segment]")).toHaveLength(1);
    expect(container.querySelector("[data-zero-line]")).not.toBeNull();
    expect(screen.getByText(/1 gap in coverage/)).not.toBeNull();
  });
  it("lets keyboard users inspect every value and reveal the full table", async () => {
    const user = userEvent.setup();
    render(<SolarSeriesChart points={points} label="Bz" unit="nT" />);
    const slider = screen.getByRole("slider");
    // Native range arrow behavior is verified in Playwright; inspect its accessible value here.
    expect(slider.getAttribute("aria-valuetext")).toContain("3 nT");
    await user.click(screen.getByRole("button", { name: "Show values" }));
    expect(screen.getByRole("table")).not.toBeNull();
    expect(screen.getAllByRole("row")).toHaveLength(4);
  });
  it("labels logarithmic X-rays and excludes nonpositive flux", () => {
    const { container } = render(<SolarSeriesChart points={[{ timestamp: points[0].timestamp, value: 0 }, { timestamp: points[1].timestamp, value: 1e-5 }]} label="X-ray" unit="W/m²" scale="log" thresholds={[{ value: 1e-5, label: "M" }]} />);
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("Logarithmic scale. 1 records");
    expect(screen.getByText("M")).not.toBeNull();
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  });
});
