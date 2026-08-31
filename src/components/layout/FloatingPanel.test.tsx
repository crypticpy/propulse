import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FloatingPanel } from "./FloatingPanel";

describe("FloatingPanel", () => {
  it("applies externally reset persisted geometry while remaining mounted", () => {
    const onLayoutChange = vi.fn();
    const { rerender } = render(
      <FloatingPanel
        id="forecast"
        title="Forecast"
        defaultPosition={{ x: 10, y: 10 }}
        defaultSize={{ width: 500, height: 300 }}
        minSize={{ width: 300, height: 150 }}
        maxSize={{ width: 2000, height: 1000 }}
        persistedLayout={{ x: 100, y: 120, width: 500, height: 300 }}
        onLayoutChange={onLayoutChange}
      >
        <div>Forecast content</div>
      </FloatingPanel>,
    );

    const panel = document.getElementById("floating-panel-forecast");
    expect(panel).not.toBeNull();
    expect(panel?.style.left).toBe("100px");
    expect(panel?.style.top).toBe("120px");
    expect(panel?.style.width).toBe("500px");
    expect(panel?.style.height).toBe("300px");

    rerender(
      <FloatingPanel
        id="forecast"
        title="Forecast"
        defaultPosition={{ x: 10, y: 10 }}
        defaultSize={{ width: 500, height: 300 }}
        minSize={{ width: 300, height: 150 }}
        maxSize={{ width: 2000, height: 1000 }}
        persistedLayout={{ x: 30, y: 40, width: 640, height: 260 }}
        onLayoutChange={onLayoutChange}
      >
        <div>Forecast content</div>
      </FloatingPanel>,
    );

    expect(document.getElementById("floating-panel-forecast")).toBe(panel);
    expect(panel?.style.left).toBe("30px");
    expect(panel?.style.top).toBe("40px");
    expect(panel?.style.width).toBe("640px");
    expect(panel?.style.height).toBe("260px");
    expect(onLayoutChange).not.toHaveBeenCalled();
  });

  it("exposes a keyboard-operable named resize separator", () => {
    const onLayoutChange = vi.fn();
    render(
      <FloatingPanel
        id="forecast"
        title="Forecast"
        defaultPosition={{ x: 10, y: 10 }}
        defaultSize={{ width: 500, height: 300 }}
        onLayoutChange={onLayoutChange}
      >
        <div>Forecast content</div>
      </FloatingPanel>,
    );

    const separator = screen.getByRole("separator", {
      name: "Resize Forecast panel",
    });
    expect(separator.getAttribute("aria-orientation")).toBe("vertical");
    expect(separator.getAttribute("tabindex")).toBe("0");
    expect(separator.getAttribute("aria-valuenow")).toBe("500");

    fireEvent.keyDown(separator, { key: "ArrowRight" });

    expect(document.getElementById("floating-panel-forecast")?.style.width).toBe(
      "510px",
    );
    expect(onLayoutChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ width: 510, height: 300 }),
    );
  });

  it("clamps pointer resizing against panel position and viewport", () => {
    const previousWidth = window.innerWidth;
    const previousHeight = window.innerHeight;
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 800,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 600,
    });
    const onLayoutChange = vi.fn();

    try {
      render(
        <FloatingPanel
          id="forecast"
          title="Forecast"
          defaultPosition={{ x: 10, y: 10 }}
          defaultSize={{ width: 300, height: 200 }}
          minSize={{ width: 200, height: 100 }}
          maxSize={{ width: 2000, height: 1000 }}
          persistedLayout={{ x: 200, y: 100, width: 300, height: 200 }}
          onLayoutChange={onLayoutChange}
        >
          <div>Forecast content</div>
        </FloatingPanel>,
      );

      const separator = screen.getByRole("separator", {
        name: "Resize Forecast panel",
      });
      Object.assign(separator, {
        setPointerCapture: vi.fn(),
        releasePointerCapture: vi.fn(),
      });

      fireEvent.pointerDown(separator, {
        button: 0,
        pointerId: 1,
        clientX: 300,
        clientY: 200,
      });
      fireEvent.pointerMove(separator, {
        pointerId: 1,
        clientX: 2_000,
        clientY: 2_000,
      });

      const panel = document.getElementById("floating-panel-forecast");
      expect(panel?.style.width).toBe("596px");
      expect(panel?.style.height).toBe("496px");

      fireEvent.pointerUp(separator, { pointerId: 1 });
      expect(onLayoutChange).toHaveBeenLastCalledWith({
        x: 200,
        y: 100,
        width: 596,
        height: 496,
      });
    } finally {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: previousWidth,
      });
      Object.defineProperty(window, "innerHeight", {
        configurable: true,
        value: previousHeight,
      });
    }
  });
});
