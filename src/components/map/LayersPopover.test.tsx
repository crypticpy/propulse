import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LayersPopover } from "./LayersPopover";

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
    render(<LayersPopover />);
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
});
