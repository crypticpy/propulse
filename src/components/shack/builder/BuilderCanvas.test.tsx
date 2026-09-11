import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useShackStore } from "@/stores/shackStore";
import type { StationChain } from "@/types/stationChain";
import { BuilderCanvas } from "./BuilderCanvas";

vi.mock("@/hooks/useChainPerformance", () => ({
  useChainPerformance: () => ({ bands: [] }),
}));

const initial = useShackStore.getState();

const emptyChain: StationChain = {
  id: "path",
  name: "Home HF",
  nodes: [],
  feedlineRuns: [],
  operatingPowerWatts: 100,
  shackAccessoryIds: [],
  createdAt: "2026-09-06T00:00:00Z",
};

const longChain: StationChain = {
  ...emptyChain,
  nodes: [
    { type: "radio", radioId: "radio" },
    { type: "radio", radioId: "radio-2" },
    { type: "antenna", antennaId: "antenna" },
  ],
};

function stubResizeObserver(width = 400) {
  class ResizeObserverStub {
    observe(el: Element) {
      const entry = {
        target: el,
        contentRect: { width, height: 300, top: 0, left: 0, bottom: 300, right: width },
      };
      (this as unknown as { cb: ResizeObserverCallback }).cb(
        [entry as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      );
    }
    unobserve() {}
    disconnect() {}
    constructor(cb: ResizeObserverCallback) {
      (this as unknown as { cb: ResizeObserverCallback }).cb = cb;
    }
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
}

function stubSvgViewport(svg: SVGSVGElement, width = 400, height = 300) {
  vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    width,
    height,
    toJSON: () => ({}),
  });
}

function canvasProps(chain: StationChain) {
  return {
    chain,
    selectedNodeIndex: null,
    onSelectNode: vi.fn(),
    onDropEquipment: vi.fn(),
  };
}

function contentTransform() {
  return screen.getByTestId("builder-canvas-content").getAttribute("transform");
}

function contentScale() {
  const match = (contentTransform() ?? "").match(/scale\(([-0-9.]+)\)/);
  return match ? Number(match[1]) : NaN;
}

beforeEach(() => {
  stubResizeObserver(400);
  useShackStore.setState({
    ...initial,
    stationChains: [structuredClone(longChain)],
    activeChainId: longChain.id,
  });
});

afterEach(() => {
  useShackStore.setState(initial);
});

function wheelZoomIn(svg: SVGSVGElement) {
  stubSvgViewport(svg);
  act(() => {
    svg.dispatchEvent(
      new WheelEvent("wheel", {
        deltaY: -1,
        clientX: 80,
        clientY: 40,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
}

it("attaches wheel after empty→populated and detaches on delete-last (#370)", () => {
  const { rerender } = render(<BuilderCanvas {...canvasProps(emptyChain)} />);
  expect(
    screen.queryByRole("img", { name: /signal path builder: Home HF/i }),
  ).toBeNull();

  rerender(<BuilderCanvas {...canvasProps(longChain)} />);
  const svg = screen.getByRole("img", {
    name: /signal path builder: Home HF/i,
  });
  wheelZoomIn(svg);
  expect(contentScale()).toBeCloseTo(1.1);

  rerender(<BuilderCanvas {...canvasProps(emptyChain)} />);
  expect(
    screen.queryByRole("img", { name: /signal path builder: Home HF/i }),
  ).toBeNull();
  act(() => {
    svg.dispatchEvent(
      new WheelEvent("wheel", {
        deltaY: -1,
        clientX: 80,
        clientY: 40,
        bubbles: true,
        cancelable: true,
      }),
    );
  });

  rerender(<BuilderCanvas {...canvasProps(longChain)} />);
  expect(contentScale()).toBeCloseTo(1.1);
  const svgAgain = screen.getByRole("img", {
    name: /signal path builder: Home HF/i,
  });
  wheelZoomIn(svgAgain);
  expect(contentScale()).toBeCloseTo(1.2);
});

it("Fit resets to scale(1) instead of a second container/svg width ratio (#370)", () => {
  render(<BuilderCanvas {...canvasProps(longChain)} />);
  fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
  expect(contentScale()).toBeCloseTo(1.2);

  fireEvent.click(screen.getByRole("button", { name: "Zoom to fit" }));
  expect(contentScale()).toBe(1);
  // Old Fit used min(containerWidth/svgWidth, 1) ≈ 400/1020 ≈ 0.39
  expect(contentScale()).toBeGreaterThan(0.5);
});

it("pans in viewBox units so 100 CSS pixels is not written as translate(100) (#370)", () => {
  render(<BuilderCanvas {...canvasProps(longChain)} />);
  const svg = screen.getByRole("img", {
    name: /signal path builder: Home HF/i,
  });
  stubSvgViewport(svg, 400, 300);

  fireEvent.mouseDown(svg, { clientX: 40, clientY: 40 });
  fireEvent.mouseMove(svg, { clientX: 140, clientY: 40 });
  fireEvent.mouseUp(svg);

  const transform = contentTransform() ?? "";
  const match = transform.match(/translate\(([-0-9.]+),\s*([-0-9.]+)\)/);
  expect(match).not.toBeNull();
  const panX = Number(match?.[1]);
  expect(panX).toBeCloseTo(100 * (1020 / 400));
  expect(panX).not.toBe(100);
});
