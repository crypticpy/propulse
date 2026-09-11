/**
 * The corner column's chrome survives a projection switch (#930, round 7).
 *
 * The column lives inside the projection view, and a host switches
 * projection by mounting a different component -- so `LayerLegend`'s
 * collapse and `MapSizeSliders`' expansion, both `useState` until now, were
 * destroyed every time the operator moved between globe, flat and azimuthal.
 * These tests drive the real switch: mount view A, operate the control,
 * switch to view B, switch back.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MapSizeSliders } from "./MapSizeSliders";
import { LabelsPanel } from "./LabelsPanel";
import { ObservatoryTiltSlider } from "./ObservatoryTiltSlider";
import { LayerLegend } from "./LayerLegend";
import { useMapChromeUiStore } from "@/stores/mapChromeUiStore";
import { useMapStore } from "@/stores/mapStore";

/** Two "views", each mounting its own corner column, as the real ones do. */
function ProjectionHost() {
  const [projection, setProjection] = useState<"globe" | "flat">("globe");
  const column = (
    <div>
      <LayerLegend />
      <MapSizeSliders />
    </div>
  );
  return (
    <div>
      <button
        onClick={() => setProjection(projection === "globe" ? "flat" : "globe")}
      >
        switch
      </button>
      {projection === "globe" ? (
        <section data-testid="globe">{column}</section>
      ) : (
        <article data-testid="flat">{column}</article>
      )}
    </div>
  );
}

describe("map corner chrome survives a projection switch (#930)", () => {
  beforeEach(() => {
    cleanup();
    useMapChromeUiStore.setState({
      legendCollapsed: false,
      sizePanelExpanded: false,
    });
    useMapStore.setState({
      layers: { ...useMapStore.getState().layers, spots: true },
    });
  });

  it("renders both controls to start with (positive control)", () => {
    render(<ProjectionHost />);
    expect(screen.getByTestId("globe")).toBeTruthy();
    expect(screen.getByLabelText("Adjust spot and pin sizes")).toBeTruthy();
    expect(screen.getByRole("button", { name: /LEGEND/i })).toBeTruthy();
  });

  it("keeps the size panel expanded across two switches", () => {
    render(<ProjectionHost />);
    fireEvent.click(screen.getByLabelText("Adjust spot and pin sizes"));
    expect(screen.getByLabelText("Collapse size sliders")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "switch" }));
    expect(screen.getByTestId("flat")).toBeTruthy();
    expect(screen.getByLabelText("Collapse size sliders")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "switch" }));
    expect(screen.getByTestId("globe")).toBeTruthy();
    expect(screen.getByLabelText("Collapse size sliders")).toBeTruthy();
  });

  it("keeps the legend collapsed across two switches", () => {
    render(<ProjectionHost />);
    const legend = () => screen.getByRole("button", { name: /LEGEND/i });
    fireEvent.click(legend());
    expect(legend().getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "switch" }));
    expect(legend().getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "switch" }));
    expect(legend().getAttribute("aria-expanded")).toBe("false");
  });
});

/**
 * The bottom-right corner column (#930, round 9). PropSphere places these
 * rows; the rows themselves must not position. A component that re-grows an
 * `absolute`/`fixed` root escapes the column and lands back on top of its
 * neighbour, which is the defect the column was built to make
 * unrepresentable -- and it does that regardless of tier, so only the
 * rendered root can show it.
 */
describe("bottom-right rows are siblings, not self-anchored (#930)", () => {
  beforeEach(() => cleanup());

  it("renders the labels panel and the tilt slider as siblings in order", () => {
    const { container } = render(
      <div
        data-testid="corner"
        className="pointer-events-none absolute bottom-2 right-2 flex flex-col items-end gap-1"
      >
        <div className="pointer-events-auto">
          <LabelsPanel />
        </div>
        <ObservatoryTiltSlider visible className="relative" />
      </div>,
    );
    const column = container.querySelector('[data-testid="corner"]')!;
    const rows = [...column.children];
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("Country Borders");
    expect(rows[1].querySelector('input[type="range"]')).toBeTruthy();
  });

  it("still catches a self-anchored root (positive control)", () => {
    // Unhosted, the slider is its own overlay chrome and does anchor: the
    // matcher below is looking for something that exists.
    const { container } = render(<ObservatoryTiltSlider visible />);
    expect(container.firstElementChild!.className).toMatch(/\bfixed\b/);
  });

  it("leaves both rows unpositioned, so neither can cover the other", () => {
    const { container } = render(
      <div data-testid="corner">
        <div>
          <LabelsPanel />
        </div>
        <ObservatoryTiltSlider visible className="relative" />
      </div>,
    );
    const column = container.querySelector('[data-testid="corner"]')!;
    for (const row of [...column.children]) {
      const roots = [row, ...row.querySelectorAll(":scope > *")];
      for (const el of roots) {
        expect(
          el.className,
          `a bottom-right row anchors itself: ${el.className}`,
        ).not.toMatch(/\b(absolute|fixed)\b/);
      }
    }
  });
});
