import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useMapStore } from "@/stores/mapStore";
import { HamClockWallControls } from "./HamClockWallControls";

describe("HamClockWallControls", () => {
  it("has no CONTROLS trigger or anchored menu — Layers moved into SETTINGS (B6/HW-21)", () => {
    render(<HamClockWallControls onOpenSettings={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "CONTROLS" })).toBeNull();
    expect(
      screen.queryByRole("group", { name: "HamClock controls" }),
    ).toBeNull();
    expect(document.querySelector("[data-layers-popover]")).toBeNull();
  });

  it("keeps mode, density, projection, SETTINGS and exit always visible in the fixed instrument slot", () => {
    render(<HamClockWallControls onOpenSettings={vi.fn()} />);

    expect(screen.getByRole("group", { name: "HamClock mode" })).not.toBeNull();
    expect(screen.getByRole("group", { name: "Map projection" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "WALL" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "DESK" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "SETTINGS" })).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Exit HamClock view" }),
    ).not.toBeNull();
  });

  it("calls the parent's onOpenSettings instead of owning its own dialog state", () => {
    const onOpenSettings = vi.fn();
    render(<HamClockWallControls onOpenSettings={onOpenSettings} />);

    fireEvent.click(screen.getByRole("button", { name: "SETTINGS" }));

    // The dialog itself is owned and mounted by the parent (`HamClockView`)
    // now, above the density branch — this component only asks for it to
    // open, so a density flip while it is open can never strand a stale
    // local `true` behind (see `HamClockView.test.tsx`).
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("exits HamClock layout mode via the exit button", () => {
    useMapStore.setState({ layoutMode: "hamclock" });
    render(<HamClockWallControls onOpenSettings={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Exit HamClock view" }));

    expect(useMapStore.getState().layoutMode).toBe("normal");
  });
});
