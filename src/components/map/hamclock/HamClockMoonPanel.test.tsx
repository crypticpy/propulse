import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HamClockMoonPanel } from "./HamClockMoonPanel";

describe("HamClockMoonPanel", () => {
  it("shows phase, illumination, rise/set, altitude, and azimuth", () => {
    render(
      <HamClockMoonPanel
        displayTime={new Date("2024-06-01T12:00:00Z")}
        latitude={40}
        longitude={-105}
        timeZone="America/Denver"
      />,
    );

    expect(
      screen.getByLabelText("Lunar conditions").textContent,
    ).toMatch(/illuminated/i);
    expect(screen.getByText("Rise")).toBeTruthy();
    expect(screen.getByText("Set")).toBeTruthy();
    expect(screen.getByText("Altitude")).toBeTruthy();
    expect(screen.getByText("Azimuth")).toBeTruthy();
    expect(screen.getByText(/Distance/)).toBeTruthy();
  });

  it("does not imply QTH-relative rise/set when no station is configured", () => {
    render(
      <HamClockMoonPanel displayTime={new Date("2024-06-01T12:00:00Z")} />,
    );

    expect(screen.getByText(/set QTH for rise\/set/i)).toBeTruthy();
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(4);
  });
});
