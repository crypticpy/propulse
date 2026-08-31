import { render, screen } from "@testing-library/react";
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

  it("exposes a named resize separator", () => {
    render(
      <FloatingPanel
        id="forecast"
        title="Forecast"
        defaultPosition={{ x: 10, y: 10 }}
        defaultSize={{ width: 500, height: 300 }}
      >
        <div>Forecast content</div>
      </FloatingPanel>,
    );

    const separator = screen.getByRole("separator", {
      name: "Resize Forecast panel",
    });
    expect(separator.getAttribute("aria-orientation")).toBe("horizontal");
  });
});
