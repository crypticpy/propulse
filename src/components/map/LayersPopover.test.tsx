import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { LayersPopover } from "./LayersPopover";
import { ViewProvider } from "@/components/views/ViewProvider";
import { createMemoryWorkingStorage } from "@/lib/views/runtime";
import { useMapStore } from "@/stores/mapStore";

vi.mock("@/hooks/useSatellites", () => ({
  useSatellites: () => ({ satellites: [] }),
}));

vi.mock("./SatellitePanel", () => ({
  SatellitePanel: () => <div>Satellite panel stub</div>,
}));

/**
 * B1/HW-23: the popover is portalled to `document.body` and positioned with
 * `position: fixed`, so nothing in the ancestor tree can clip it — the only
 * way it renders off screen is an unclamped top/left. These tests force an
 * overflow (a trigger pinned to the bottom-right corner of a small viewport,
 * as HamClock's cramped header can do at 1366×768) and assert the applied
 * inline style keeps the popover's full rect inside the window.
 */
describe("LayersPopover viewport clamp", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1366,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 768,
    });
  });

  function openPopover() {
    render(
      <ViewProvider ownerId="test-owner" slot="normal" storage={createMemoryWorkingStorage()}>
        <LayersPopover />
      </ViewProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /layers/i }));
    const trigger = screen.getByRole("button", { name: /layers/i });
    const popover = document.querySelector<HTMLElement>(
      "[data-layers-popover]",
    );
    if (!popover) throw new Error("LayersPopover did not portal a menu");
    return { trigger, popover };
  }

  it("shifts left and up so a trigger in the bottom-right corner never overflows", () => {
    const { trigger, popover } = openPopover();

    // Trigger sits hard against the bottom-right corner; the popover's own
    // box (400×500) is far larger than the remaining space below/right of
    // it, exactly the shape that used to render clipped off screen.
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({
      top: 740,
      bottom: 760,
      left: 1300,
      right: 1350,
      width: 50,
      height: 20,
      x: 1300,
      y: 740,
      toJSON: () => ({}),
    });
    vi.spyOn(popover, "getBoundingClientRect").mockReturnValue({
      top: 0,
      bottom: 500,
      left: 0,
      right: 400,
      width: 400,
      height: 500,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    // The resize listener re-runs the placement with the mocked rects
    // installed above, the same path a real window resize takes.
    fireEvent(window, new Event("resize"));

    const left = parseFloat(popover.style.left);
    const top = parseFloat(popover.style.top);
    expect(left).toBeGreaterThanOrEqual(8);
    expect(top).toBeGreaterThanOrEqual(8);
    expect(left + 400).toBeLessThanOrEqual(window.innerWidth);
    expect(top + 500).toBeLessThanOrEqual(window.innerHeight);
  });

  it("does not re-clamp when Activity submenu opens at 1440×900 (#1139)", async () => {
    vi.useFakeTimers();
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1440,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 900,
    });

    const { trigger, popover } = openPopover();
    const submenu = popover.querySelector<HTMLElement>("[data-layers-submenu]");
    // The outer panel owns the stable, viewport-capped height. The submenu
    // must not impose a minimum that defeats that cap on a short viewport.
    expect(
      parseFloat((popover.firstElementChild as HTMLElement).style.height),
    ).toBeGreaterThan(11.25);
    expect(submenu?.style.minHeight).toBe("");

    // Trigger in the map header band: naive placement leaves little room
    // below; the old ResizeObserver path would shift the popover up when
    // Activity's 15-row submenu appeared, moving Hazards/Reference under
    // the pointer.
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({
      top: 420,
      bottom: 445,
      left: 1180,
      right: 1260,
      width: 80,
      height: 25,
      x: 1180,
      y: 420,
      toJSON: () => ({}),
    });

    let popoverHeight = 302;
    vi.spyOn(popover, "getBoundingClientRect").mockImplementation(() => ({
      top: 0,
      bottom: popoverHeight,
      left: 0,
      right: 400,
      width: 400,
      height: popoverHeight,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }));

    fireEvent(window, new Event("resize"));
    const topBefore = parseFloat(popover.style.top);

    // Simulate submenu growth without a re-clamp (the bug trigger).
    popoverHeight = 520;
    fireEvent.mouseEnter(screen.getByText("Activity"));
    await vi.advanceTimersByTimeAsync(80);

    expect(parseFloat(popover.style.top)).toBe(topBefore);
    expect(submenu?.querySelector(".uppercase")?.textContent).toBe("Activity");
    expect(screen.getByText("Live Spots")).toBeTruthy();

    vi.useRealTimers();
  });

  it("is a no-op when the popover already fits under the trigger", () => {
    const { trigger, popover } = openPopover();

    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({
      top: 40,
      bottom: 60,
      left: 20,
      right: 70,
      width: 50,
      height: 20,
      x: 20,
      y: 40,
      toJSON: () => ({}),
    });
    vi.spyOn(popover, "getBoundingClientRect").mockReturnValue({
      top: 0,
      bottom: 300,
      left: 0,
      right: 400,
      width: 400,
      height: 300,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    fireEvent(window, new Event("resize"));

    expect(popover.style.top).toBe("62px");
    expect(popover.style.left).toBe("20px");
  });

  it("sizes the submenu in rem so Settings → Text Size can widen the slider track", () => {
    const { popover } = openPopover();
    const submenu = popover.querySelector("[data-layers-submenu]");
    expect(submenu).not.toBeNull();
    expect(submenu?.className).toContain("w-[14.5rem]");
    expect(submenu?.className).not.toContain("w-[232px]");
  });

  it("caps the submenu below `sm` so a phone at lg/xl text scale can't overflow", () => {
    // The fixed 168px category column plus an uncapped 14.5rem submenu is
    // 487px at xl (22px root) — wider than a 390px phone. `min()` caps the
    // submenu to what's left of the viewport; `sm:` restores the full
    // 14.5rem once there is room for it (placement only translates the box,
    // it never shrinks it, so the CSS itself has to fit on screen).
    const { popover } = openPopover();
    const submenu = popover.querySelector("[data-layers-submenu]");
    expect(submenu).not.toBeNull();
    expect(submenu?.className).toContain("w-[min(14.5rem,calc(100vw-192px))]");
    expect(submenu?.className).toContain("sm:w-[14.5rem]");
  });

  it.each([
    {
      name: "phone",
      width: 390,
      height: 844,
      boxWidth: 400,
      boxHeight: 420,
    },
    {
      // The scenario the min()-cap targets: a 390px phone with the
      // submenu at its uncapped xl width (168px category + 319px
      // submenu = 487px). The position clamp still has to keep the box
      // from going off the left/top edge even though it's wider than
      // the viewport.
      name: "phone xl",
      width: 390,
      height: 844,
      boxWidth: 487,
      boxHeight: 500,
    },
    {
      name: "tablet",
      width: 768,
      height: 1024,
      boxWidth: 400,
      boxHeight: 500,
    },
    {
      name: "workstation xl",
      width: 1366,
      height: 768,
      boxWidth: 487,
      boxHeight: 500,
    },
    {
      name: "wall",
      width: 1920,
      height: 1080,
      boxWidth: 487,
      boxHeight: 500,
    },
  ])(
    "clamps a corner-pinned trigger on $name so the scaled panel stays on canvas",
    ({ width, height, boxWidth, boxHeight }) => {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: width,
      });
      Object.defineProperty(window, "innerHeight", {
        configurable: true,
        value: height,
      });
      const { trigger, popover } = openPopover();
      vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({
        top: height - 28,
        bottom: height - 8,
        left: width - 50,
        right: width,
        width: 50,
        height: 20,
        x: width - 50,
        y: height - 28,
        toJSON: () => ({}),
      });
      vi.spyOn(popover, "getBoundingClientRect").mockReturnValue({
        top: 0,
        bottom: boxHeight,
        left: 0,
        right: boxWidth,
        width: boxWidth,
        height: boxHeight,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });
      fireEvent(window, new Event("resize"));
      const left = parseFloat(popover.style.left);
      const top = parseFloat(popover.style.top);
      expect(left).toBeGreaterThanOrEqual(8);
      expect(top).toBeGreaterThanOrEqual(8);
      // The clamp only translates. A panel wider than the canvas (phone at
      // md is 390px vs a 400px popover) pins to the 8px margin instead of
      // going off the left/top edge.
      if (boxWidth + 16 <= width) {
        expect(left + boxWidth).toBeLessThanOrEqual(width - 8);
      } else {
        expect(left).toBe(8);
      }
      if (boxHeight + 16 <= height) {
        expect(top + boxHeight).toBeLessThanOrEqual(height - 8);
      } else {
        expect(top).toBe(8);
      }
    },
  );
});

describe("LayersPopover satellite list (#1085)", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    useMapStore.setState({
      layers: { ...useMapStore.getState().layers, satellites: true },
    });
  });

  afterEach(() => {
    useMapStore.setState({
      layers: { ...useMapStore.getState().layers, satellites: false },
      satelliteCategoryFilter: "all",
    });
  });

  it("opens a Satellites dialog with no inline rows and restores Layers focus", async () => {
    render(
      <MemoryRouter>
        <ViewProvider
          ownerId="test-owner"
          slot="normal"
          storage={createMemoryWorkingStorage()}
        >
          <LayersPopover />
        </ViewProvider>
      </MemoryRouter>,
    );

    const layers = screen.getByRole("button", { name: /layers/i });
    fireEvent.click(layers);
    fireEvent.mouseEnter(screen.getByText("Activity"));
    expect(
      await screen.findByRole("button", { name: "See full list" }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Manage satellites" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "See full list" }));
    expect(screen.getByRole("dialog", { name: "Satellites" })).toBeTruthy();
    expect(screen.getByText("Satellite panel stub")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Satellites" })).toBeNull();
    });
    expect(document.activeElement).toBe(layers);
  });
});
