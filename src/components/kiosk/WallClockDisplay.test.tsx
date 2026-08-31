import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WallClockDisplay } from "./WallClockDisplay";

let kioskActive = true;

vi.mock("@/stores/settingsStore", () => ({
  useSettingsStore: (selector: (state: { timeFormat: "24h" }) => unknown) =>
    selector({ timeFormat: "24h" }),
}));
vi.mock("@/stores/kioskStore", () => ({
  useKioskStore: (
    selector: (state: {
      presentation: {
        headerScale: "standard";
        slashedZero: boolean;
        autoNightDim: boolean;
      };
      active: boolean;
    }) => unknown,
  ) =>
    selector({
      presentation: {
        headerScale: "standard",
        slashedZero: true,
        autoNightDim: false,
      },
      active: kioskActive,
    }),
}));

describe("WallClockDisplay", () => {
  beforeEach(() => {
    kioskActive = true;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats long stopwatch durations without rolling hours", () => {
    render(<WallClockDisplay mode="stopwatch" />);
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    act(() => {
      vi.setSystemTime(new Date("2026-09-04T16:00:02.345Z"));
    });
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));

    expect(screen.getByText("100:00:02.34")).toBeTruthy();
  });

  it("starts, pauses, and resets the stopwatch", () => {
    render(<WallClockDisplay mode="stopwatch" />);
    expect(screen.getByText("00:00:00.00")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    act(() => vi.advanceTimersByTime(1_250));
    expect(screen.getByText("00:00:01.25")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    act(() => vi.advanceTimersByTime(2_000));
    expect(screen.getByText("00:00:01.25")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByText("00:00:00.00")).toBeTruthy();
  });

  it("ignores repeated shortcuts and defers focused-button Space to native click", () => {
    render(<WallClockDisplay mode="stopwatch" />);
    const start = screen.getByRole("button", { name: "Start" });

    fireEvent.keyDown(window, { code: "Space", key: " ", repeat: true });
    expect(screen.getByRole("button", { name: "Start" })).toBeTruthy();

    fireEvent.keyDown(start, { code: "Space", key: " " });
    expect(screen.getByRole("button", { name: "Start" })).toBeTruthy();

    fireEvent.click(start);
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
  });

  it("skips clock formatting work in stopwatch mode", () => {
    const timeSpy = vi.spyOn(Date.prototype, "toLocaleTimeString");
    const dateSpy = vi.spyOn(Date.prototype, "toLocaleDateString");

    render(<WallClockDisplay mode="stopwatch" />);

    expect(timeSpy).not.toHaveBeenCalled();
    expect(dateSpy).not.toHaveBeenCalled();
    timeSpy.mockRestore();
    dateSpy.mockRestore();
  });

  it("subtracts the application header outside active kiosk mode", () => {
    kioskActive = false;
    const { container } = render(<WallClockDisplay mode="clock" />);

    expect(container.querySelector("main")?.style.minHeight).toBe(
      "calc(100dvh - 64px)",
    );
  });

  it("applies the slashed-zero numeral option to the big clock", () => {
    const { container } = render(<WallClockDisplay mode="clock" />);

    expect(container.querySelector(".font-slashed-zero")).toBeTruthy();
    expect(screen.getByText("Local time")).toBeTruthy();
    expect(screen.getByText("UTC")).toBeTruthy();
  });
});
