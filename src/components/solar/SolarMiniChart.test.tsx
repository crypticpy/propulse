import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SolarMiniChart } from "./SolarMiniChart";
const day = Date.parse("2026-09-04T00:00:00Z");
const point = (hours: number, value: number) => ({ timestamp: new Date(day + hours * 3_600_000).toISOString(), value });

describe("compact reading charts", () => {
  it("leaves missing observation spans disconnected", () => {
    const { container } = render(<SolarMiniChart label="Bz" unit="nT" maxGapMs={3_600_000} points={[point(0, -2), point(1, 2), point(4, 0)]} />);
    expect(container.querySelector("path")?.getAttribute("d")?.match(/M/g)).toHaveLength(2);
    expect(screen.getByRole("img").textContent).toContain("Range -2 to 2 nT");
  });
  it("clips three-hour forecasts at the UTC day boundary without inventing extra bars", () => {
    const { container } = render(<SolarMiniChart label="Predicted Kp" unit="Kp" min={0} max={9} maxGapMs={10_800_000} intervalMs={10_800_000} domain={[day, day + 86_400_000]} points={[point(-3, 8), point(-1, 3), point(23, 6), point(24, 9)]} />);
    const bars = [...container.querySelectorAll("rect")];
    expect(bars).toHaveLength(2);
    expect(Number(bars[0].getAttribute("x"))).toBe(32);
    expect(Number(bars[0].getAttribute("width"))).toBe(19);
    expect(Number(bars[1].getAttribute("width"))).toBe(8.5);
    expect(screen.getByText("Kp 5")).toBeTruthy();
  });
  it("rejects non-positive values on the logarithmic X-ray scale", () => {
    const { container } = render(<SolarMiniChart label="X-ray" unit="W/m²" maxGapMs={3_600_000} logarithmic points={[point(0, 0), point(1, 1e-7), point(2, 1e-6)]} />);
    expect(container.querySelector("path")?.getAttribute("d")).not.toMatch(/NaN|Infinity/);
    expect(screen.getByRole("img").textContent).toContain("logarithmic scale");
  });
  it("does not turn a missing forecast into zero Kp", () => {
    render(<SolarMiniChart label="Predicted Kp" unit="Kp" maxGapMs={10_800_000} intervalMs={10_800_000} domain={[day, day + 86_400_000]} points={[]} />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("No Kp forecast intervals available for this UTC day.")).toBeTruthy();
  });
});
