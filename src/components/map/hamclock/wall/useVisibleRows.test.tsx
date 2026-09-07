import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useVisibleRows } from "./useVisibleRows";

function List({ total, mounted }: { total: number; mounted: boolean }) {
  const [ref, visible] = useVisibleRows<HTMLDivElement>(total);
  return (
    <div>
      <p>visible {visible}</p>
      {mounted && (
        <div ref={ref} data-testid="list">
          {Array.from({ length: visible }, (_, i) => (
            <div key={i}>row {i + 1}</div>
          ))}
        </div>
      )}
    </div>
  );
}

describe("useVisibleRows (#250)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("renders every row when the list has no layout (jsdom)", () => {
    render(<List total={9} mounted />);
    expect(screen.getByText("visible 9")).toBeTruthy();
  });

  it("measures a list that mounts after the first render, and refits when the slot changes", () => {
    const slot = { height: 100 };
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(
      function (this: HTMLElement) {
        return this.dataset.testid === "list" ? slot.height : 0;
      },
    );
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      height: 30,
    } as DOMRect);
    let fire: (() => void) | null = null;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          fire = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    try {
      const { rerender } = render(<List total={9} mounted={false} />);
      expect(screen.getByText("visible 9")).toBeTruthy();

      rerender(<List total={9} mounted />);
      // 100px slot, 30px rows, no gap: three whole rows.
      expect(screen.getByText("visible 3")).toBeTruthy();

      slot.height = 200;
      act(() => fire?.());
      expect(screen.getByText("visible 6")).toBeTruthy();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});


it("refits when row height changes inside an unchanged slot", () => {
  let height = 30;
  let fire: (() => void) | undefined;
  const observed = vi.fn();
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(100);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({ height }) as DOMRect);
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { fire = callback; }
    observe = observed;
    disconnect() {}
  });
  try {
    render(<List total={9} mounted />);
    expect(screen.getByText("visible 3")).toBeTruthy();
    expect(observed).toHaveBeenCalledWith(screen.getByText("row 1"));
    height = 40;
    act(() => fire?.());
    expect(screen.getByText("visible 2")).toBeTruthy();
  } finally {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
