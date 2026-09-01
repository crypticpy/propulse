import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MapToolbarShell } from "./MapToolbarShell";
import {
  getMapToolbarLayout,
  type MapToolbarLayout,
} from "./mapToolbarLayout";

function renderToolbar(layout: MapToolbarLayout) {
  return render(
    <MapToolbarShell
      toolbarRef={createRef<HTMLDivElement>()}
      layout={layout}
      primaryControls={
        <>
          <button type="button">Layers</button>
          <button type="button">ReachMap</button>
        </>
      }
      renderSecondaryControls={({ closeMenu, inMenu }) => (
        <button type="button" onClick={closeMenu}>
          {inMenu ? "Colors in menu" : "Colors inline"}
        </button>
      )}
      statusControls={<button type="button">Health</button>}
      viewsControl={<button type="button">Views</button>}
    />,
  );
}

describe("MapToolbarShell", () => {
  it("keeps the wide layout inline without a horizontal scroll container", () => {
    renderToolbar(getMapToolbarLayout(1440));

    const toolbar = screen.getByRole("toolbar", { name: "Map controls" });
    const primary = screen.getByTestId("map-toolbar-primary");

    expect(toolbar.dataset.toolbarLayout).toBe("wide");
    expect(primary.className).not.toContain("overflow-x-auto");
    expect(screen.getByRole("button", { name: "Colors inline" })).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "More map controls" }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Health" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Views" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Layers" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "ReachMap" })).toBeTruthy();
  });

  it("moves secondary controls into an accessible menu at constrained widths", () => {
    renderToolbar(getMapToolbarLayout(1200));

    expect(
      screen.queryByRole("button", { name: "Colors inline" }),
    ).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "More map controls" }),
    );

    expect(
      screen.getByRole("dialog", { name: "More map controls" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Colors in menu" }));
    expect(
      screen.queryByRole("dialog", { name: "More map controls" }),
    ).toBeNull();
  });

  it("uses icon-only and stacked tiers at the measured boundaries", () => {
    expect(getMapToolbarLayout(1440)).toEqual({
      iconOnly: false,
      stacked: false,
      useOverflowMenu: false,
    });
    expect(getMapToolbarLayout(1439).useOverflowMenu).toBe(true);
    expect(getMapToolbarLayout(960).iconOnly).toBe(false);
    expect(getMapToolbarLayout(959).iconOnly).toBe(true);
    expect(getMapToolbarLayout(760).stacked).toBe(false);
    expect(getMapToolbarLayout(759).stacked).toBe(true);

    renderToolbar(getMapToolbarLayout(759));
    const toolbar = screen.getByRole("toolbar", { name: "Map controls" });
    const trailing = screen.getByTestId("map-toolbar-trailing");

    expect(toolbar.dataset.toolbarLayout).toBe("stacked");
    expect(toolbar.className).not.toContain("overflow-x-auto");
    expect(trailing.className).toContain("w-full");
  });

  it("clamps the More panel inside a narrow viewport", () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 320,
    });
    renderToolbar(getMapToolbarLayout(700));

    const trigger = screen.getByRole("button", { name: "More map controls" });
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({
      bottom: 50,
      height: 28,
      left: 300,
      right: 340,
      top: 22,
      width: 40,
      x: 300,
      y: 22,
      toJSON: () => ({}),
    });
    fireEvent.click(trigger);

    const panel = screen.getByRole("dialog", { name: "More map controls" });
    expect(panel.style.left).toBe("16px");
    expect(panel.style.width).toBe("288px");

    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: originalWidth,
    });
  });
});
