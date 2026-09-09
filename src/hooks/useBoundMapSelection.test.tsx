import { render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ViewProvider } from "@/components/views/ViewProvider";
import { useViewRuntime } from "@/components/views/ViewRuntimeContext";
import {
  useBoundSelectedReportId,
  useBoundVisualTarget,
} from "./useBoundMapSelection";
import { createMemoryWorkingStorage } from "@/lib/views/runtime";
import type { TargetLocation } from "@/stores/mapStore";
import type { ReactNode } from "react";

function wrapper(storage = createMemoryWorkingStorage()) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ViewProvider ownerId="owner-a" slot="normal" storage={storage}>
        {children}
      </ViewProvider>
    );
  };
}

function VisualProbe() {
  const runtime = useViewRuntime();
  const id = useBoundSelectedReportId();
  const mapTarget: TargetLocation = {
    lat: 10,
    lon: 20,
    grid: "JJ00",
    name: "manual",
  };
  const target = useBoundVisualTarget(mapTarget);
  return (
    <div>
      <span data-testid="bound-id">{id ?? "none"}</span>
      <span data-testid="bound-lat">{target?.lat}</span>
      <span data-testid="bound-grid">{target?.grid}</span>
      <button
        type="button"
        onClick={() => runtime.selectSpot("grid-1", { lat: 35, lon: 139 })}
      >
        select
      </button>
    </div>
  );
}

describe("useBoundMapSelection", () => {
  it("throws without a provider instead of reading dxStore", () => {
    expect(() => renderHook(() => useBoundSelectedReportId())).toThrow(
      /no global active view exists/,
    );
  });

  it("reads this runtime's selected report id but leaves mapTarget as the visual target (#707)", async () => {
    // useBoundVisualTarget is a pass-through to mapTarget until #707 restores
    // bound-selection precedence — see useBoundMapSelection.ts.
    const user = userEvent.setup();
    render(<VisualProbe />, { wrapper: wrapper() });
    expect(screen.getByTestId("bound-id").textContent).toBe("none");
    expect(screen.getByTestId("bound-lat").textContent).toBe("10");
    expect(screen.getByTestId("bound-grid").textContent).toBe("JJ00");
    await user.click(screen.getByRole("button", { name: "select" }));
    expect(screen.getByTestId("bound-id").textContent).toBe("grid-1");
    expect(screen.getByTestId("bound-lat").textContent).toBe("10");
    expect(screen.getByTestId("bound-grid").textContent).toBe("JJ00");
  });

  it("falls back to the manual map target when this view has no selection", () => {
    const { result } = renderHook(
      () =>
        useBoundVisualTarget({
          lat: 51.5,
          lon: -0.1,
          grid: "IO91",
          name: "London",
        }),
      { wrapper: wrapper() },
    );
    expect(result.current).toMatchObject({
      lat: 51.5,
      lon: -0.1,
      grid: "IO91",
    });
  });
});
