import { act, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useMapDisplayTime } from "@/hooks/useUTCClock";
import { getMoonConditions } from "@/lib/utils/moon";
import { HamClockMoonPanel } from "./HamClockMoonPanel";

function dateKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

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

  it("selects rise and set from the active QTH calendar day", () => {
    const displayTime = new Date("2024-06-01T23:30:00Z");
    const timeZone = "Pacific/Kiritimati";
    const snapshot = getMoonConditions(
      displayTime,
      1.8721,
      -157.4278,
      timeZone,
    );
    const events = [snapshot.rise, snapshot.set].filter(
      (event): event is Date => event !== null,
    );

    expect(events.length).toBeGreaterThan(0);
    for (const event of events) {
      expect(dateKey(event, timeZone)).toBe(dateKey(displayTime, timeZone));
    }
  });

  it("advances live map display time while absolute scenarios stay fixed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T15:00:00Z"));

    const { result, rerender } = renderHook(
      ({ absoluteTime }) => useMapDisplayTime(2, absoluteTime, 60_000),
      { initialProps: { absoluteTime: null as string | null } },
    );
    expect(result.current.toISOString()).toBe("2026-08-31T17:00:00.000Z");

    act(() => vi.advanceTimersByTime(60_000));
    expect(result.current.toISOString()).toBe("2026-08-31T17:01:00.000Z");

    rerender({ absoluteTime: "2026-09-01T03:00:00.000Z" });
    act(() => vi.advanceTimersByTime(60_000));
    expect(result.current.toISOString()).toBe("2026-09-01T03:00:00.000Z");
  });
});

afterEach(() => vi.useRealTimers());
