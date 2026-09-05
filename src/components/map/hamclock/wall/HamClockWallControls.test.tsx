import { describe, expect, it, vi } from "vitest";
import { createPortal } from "react-dom";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { HamClockWallControls } from "./HamClockWallControls";

// LayersPopover portals its menu to document.body via
// `data-layers-popover=""` on the portalled root, outside this component's
// container subtree. Stub it with the same shape so the Escape handler can
// be exercised without pulling in the real popover's map-layer dependencies.
vi.mock("@/components/map/LayersPopover", () => ({
  LayersPopover: () =>
    createPortal(
      <div data-layers-popover="">
        <button type="button">Popover item</button>
      </div>,
      document.body,
    ),
}));

describe("HamClockWallControls", () => {
  it("renders the Display settings trigger in the fixed instrument slot, not inside the CONTROLS popout", () => {
    render(<HamClockWallControls />);

    // Visible before CONTROLS is ever opened — same fixed slot and order as
    // the desk header (mode · WALL | DESK · projection · Display).
    expect(screen.getByRole("button", { name: "Display" })).not.toBeNull();
    expect(
      screen.queryByRole("group", { name: "HamClock controls" }),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "CONTROLS" }));

    // Still exactly one Display trigger once the popout (layers only now)
    // opens — it was never duplicated into the popout.
    expect(screen.getAllByRole("button", { name: "Display" })).toHaveLength(
      1,
    );
  });

  it("closes on Escape pressed inside the portalled LayersPopover without exiting HamClock", async () => {
    const windowKeyDown = vi.fn();
    window.addEventListener("keydown", windowKeyDown);

    render(<HamClockWallControls />);

    fireEvent.click(screen.getByRole("button", { name: "CONTROLS" }));
    expect(
      screen.getByRole("group", { name: "HamClock controls" }),
    ).not.toBeNull();

    const popoverItem = screen.getByRole("button", { name: "Popover item" });
    act(() => {
      popoverItem.focus();
    });
    expect(document.activeElement).toBe(popoverItem);

    fireEvent.keyDown(popoverItem, { key: "Escape" });

    // The menu closed and focus returned to the trigger...
    expect(
      screen.queryByRole("group", { name: "HamClock controls" }),
    ).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "CONTROLS" }),
    );
    // ...and the event never reached the window-level exit handler.
    expect(windowKeyDown).not.toHaveBeenCalled();

    window.removeEventListener("keydown", windowKeyDown);
  });
});
