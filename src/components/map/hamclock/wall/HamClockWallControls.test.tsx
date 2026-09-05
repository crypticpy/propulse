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
  it("renders the SETTINGS trigger in the fixed instrument slot, not inside the CONTROLS popout", () => {
    render(<HamClockWallControls onOpenSettings={vi.fn()} />);

    // Visible before CONTROLS is ever opened — same fixed slot and order as
    // the desk header (mode · WALL | DESK · projection · SETTINGS).
    expect(screen.getByRole("button", { name: "SETTINGS" })).not.toBeNull();
    expect(
      screen.queryByRole("group", { name: "HamClock controls" }),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "CONTROLS" }));

    // Still exactly one SETTINGS trigger once the popout (layers only now)
    // opens — it was never duplicated into the popout.
    expect(screen.getAllByRole("button", { name: "SETTINGS" })).toHaveLength(
      1,
    );
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

  it("keeps the CONTROLS popout to Layers only — map content and home region moved to the Display tab", () => {
    render(<HamClockWallControls onOpenSettings={vi.fn()} />);

    // Before the menu opens, LayersPopover (portalled to document.body by the
    // mock above) hasn't rendered at all.
    expect(document.querySelector("[data-layers-popover]")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "CONTROLS" }));

    expect(
      screen.getByRole("group", { name: "HamClock controls" }),
    ).not.toBeNull();
    // Opening the menu mounts LayersPopover — the only thing it opens now.
    expect(document.querySelector("[data-layers-popover]")).not.toBeNull();
    expect(screen.queryByRole("group", { name: "Map content" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Home region" })).toBeNull();
  });

  it("closes on Escape pressed inside the portalled LayersPopover without exiting HamClock", async () => {
    const windowKeyDown = vi.fn();
    window.addEventListener("keydown", windowKeyDown);

    render(<HamClockWallControls onOpenSettings={vi.fn()} />);

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
