import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WallSeriesChart } from "./WallSeriesChart";

const day = Date.parse("2026-09-05T00:00:00Z");
const at = (hours: number) => new Date(day + hours * 3_600_000).toISOString();

describe("WallSeriesChart (#250 S1)", () => {
  it("names the plot with a records summary and lists every value in a screen-reader table", () => {
    render(
      <WallSeriesChart
        label="SFI — 30 D"
        unit="sfu"
        points={[
          { timestamp: at(0), value: 150 },
          { timestamp: at(24), value: 152 },
          { timestamp: at(48), value: 149 },
        ]}
        markers={[{ timestamp: at(24), label: "M2.1" }]}
        now={day + 30 * 3_600_000}
      />,
    );

    const svg = screen.getByRole("img", { name: /SFI — 30 D/ });
    const name = svg.getAttribute("aria-label") ?? "";
    expect(name).toContain("3 records from 2026-09-05T00:00:00.000Z");
    expect(name).toContain("Marker: M2.1 at 2026-09-06T00:00:00.000Z.");

    const table = screen.getByRole("table", { name: "SFI — 30 D values" });
    expect(table.className).toContain("sr-only");
    expect(table.querySelectorAll("tbody tr")).toHaveLength(3);
    expect(svg.querySelector("[data-series='observed']")).not.toBeNull();
    expect(svg.textContent).toContain("NOW");
  });

  it("labels a marker in the last quarter of the plot to the left of its line, clear of the threshold ladder", () => {
    const { container } = render(
      <WallSeriesChart
        label="X-RAY — 24 H"
        unit="W/m²"
        points={[
          { timestamp: at(0), value: 1e-7 },
          { timestamp: at(24), value: 1e-7 },
        ]}
        markers={[
          { timestamp: at(2), label: "EARLY" },
          { timestamp: at(23), label: "LATE" },
        ]}
      />,
    );
    const labels = Array.from(container.querySelectorAll("svg text")).filter(
      (t) => t.textContent === "EARLY" || t.textContent === "LATE",
    );
    const early = labels.find((t) => t.textContent === "EARLY")!;
    const late = labels.find((t) => t.textContent === "LATE")!;
    expect(early.getAttribute("text-anchor")).toBe("start");
    expect(late.getAttribute("text-anchor")).toBe("end");
    // The label sits on the far side of its own marker line in each case.
    const lineX = (label: Element) =>
      Number(label.parentElement?.querySelector("line")?.getAttribute("x1"));
    expect(Number(early.getAttribute("x"))).toBeGreaterThan(lineX(early));
    expect(Number(late.getAttribute("x"))).toBeLessThan(lineX(late));
  });

  it("draws interval data as one bar per record, each tagged with its kind", () => {
    const { container } = render(
      <WallSeriesChart
        label="Kp — 24 H"
        unit="Kp"
        min={0}
        max={9}
        intervalMs={3 * 3_600_000}
        points={[
          { timestamp: at(0), value: 2 },
          { timestamp: at(3), value: 3, kind: "estimated" },
        ]}
        thresholds={[{ value: 5, label: "G1" }]}
      />,
    );

    expect(container.querySelectorAll("rect[data-kind='observed']")).toHaveLength(1);
    expect(container.querySelectorAll("rect[data-kind='estimated']")).toHaveLength(1);
    expect(container.textContent).toContain("G1");
  });

  it("shows a spelled-out empty state instead of an empty plot", () => {
    render(<WallSeriesChart label="TEMPERATURE" unit="°C" points={[]} />);

    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("TEMPERATURE: no readings yet")).toBeTruthy();
  });

  it("keeps the /solar colour contract: every stroke goes through a --hcr-chart-* token with a hex fallback", () => {
    const { container } = render(
      <WallSeriesChart
        label="MUF"
        unit="MHz"
        points={[
          { timestamp: at(0), value: 12 },
          { timestamp: at(1), value: 14 },
        ]}
      />,
    );

    const path = container.querySelector("path[data-series='observed']");
    expect(path?.getAttribute("stroke")).toBe(
      "var(--hcr-chart-observed, #44ddff)",
    );
  });
});

describe("WallSeriesChart sizing (#250 S1)", () => {
  it("draws at the measured box size and redraws when the observer fires", () => {
    const box = { width: 800, height: 300 };
    const widthGetter = vi
      .spyOn(HTMLElement.prototype, "clientWidth", "get")
      .mockImplementation(() => box.width);
    const heightGetter = vi
      .spyOn(HTMLElement.prototype, "clientHeight", "get")
      .mockImplementation(() => box.height);
    let fire: (() => void) | null = null;
    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          fire = callback;
        }
        observe = observe;
        disconnect = disconnect;
      },
    );
    try {
      const { container, unmount } = render(
        <WallSeriesChart
          label="SFI"
          unit="sfu"
          points={[
            { timestamp: at(0), value: 150 },
            { timestamp: at(24), value: 152 },
          ]}
        />,
      );
      const svg = () => container.querySelector("svg");
      expect(svg()?.getAttribute("viewBox")).toBe("0 0 800 300");
      expect(observe).toHaveBeenCalledTimes(1);

      box.width = 1200;
      box.height = 420;
      act(() => fire?.());
      expect(svg()?.getAttribute("viewBox")).toBe("0 0 1200 420");

      unmount();
      expect(disconnect).toHaveBeenCalledTimes(1);
    } finally {
      widthGetter.mockRestore();
      heightGetter.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});
