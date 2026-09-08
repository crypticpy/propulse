import { render, screen } from "@testing-library/react";
import { useLayoutEffect } from "react";
import { describe, expect, it } from "vitest";
import type { DXSpot } from "@/types/dxcluster";
import { ViewProvider } from "@/components/views/ViewProvider";
import { useViewRuntime } from "@/components/views/ViewRuntimeContext";
import { createMemoryWorkingStorage } from "@/lib/views/runtime";
import { commitViewSpotSelection } from "./useMapSpotSelection";
import { hasValidSpotCoordinates, useViewSpotFocus } from "./useSpotFocus";

function dxSpot(overrides: Partial<DXSpot> = {}): DXSpot {
  return {
    id: "spot-1",
    spotter: "K1ABC",
    dx: "JA1XYZ",
    frequency: 14074,
    comment: "",
    time: new Date("2026-08-31T12:00:00Z"),
    ...overrides,
  };
}

function FocusProbe({ spots }: { spots: readonly DXSpot[] }) {
  const { focusedSpot } = useViewSpotFocus(spots);
  return (
    <span data-testid="focus">
      {focusedSpot
        ? `${focusedSpot.dxLat},${focusedSpot.dxLon},${String(focusedSpot.dxLocApprox === true)}`
        : "none"}
    </span>
  );
}

function FocusHost({
  spots,
  select,
}: {
  spots: readonly DXSpot[];
  select: DXSpot | "unresolved";
}) {
  const runtime = useViewRuntime();
  useLayoutEffect(() => {
    if (select === "unresolved") runtime.selectSpot("unresolved", null);
    else commitViewSpotSelection(runtime, select);
  }, [runtime, select]);
  return <FocusProbe spots={spots} />;
}

describe("hasValidSpotCoordinates", () => {
  it("accepts the geographic boundaries and zero coordinates", () => {
    expect(hasValidSpotCoordinates({ dxLat: 0, dxLon: 0 })).toBe(true);
    expect(hasValidSpotCoordinates({ dxLat: 90, dxLon: -180 })).toBe(true);
    expect(hasValidSpotCoordinates({ dxLat: -90, dxLon: 180 })).toBe(true);
  });

  it("rejects missing, non-finite, and out-of-range coordinates", () => {
    expect(hasValidSpotCoordinates({ dxLat: undefined, dxLon: 0 })).toBe(false);
    expect(hasValidSpotCoordinates({ dxLat: 40, dxLon: Number.NaN })).toBe(false);
    expect(hasValidSpotCoordinates({ dxLat: 120, dxLon: 0 })).toBe(false);
    expect(hasValidSpotCoordinates({ dxLat: 40, dxLon: 240 })).toBe(false);
  });
});

describe("useViewSpotFocus", () => {
  it("focuses grid-only reports from the resolved runtime target", () => {
    const grid = dxSpot({ id: "grid-1", dxGrid: "GG87" });
    render(
      <ViewProvider ownerId="owner-a" slot="normal" storage={createMemoryWorkingStorage()}>
        <FocusHost spots={[grid]} select={grid} />
      </ViewProvider>,
    );
    expect(screen.getByTestId("focus").textContent).toBe("-22.5,-43,false");
  });

  it("focuses prefix-only reports as approximate", () => {
    const prefix = dxSpot({ id: "prefix-1", dx: "PY2ABC" });
    render(
      <ViewProvider ownerId="owner-a" slot="pro" storage={createMemoryWorkingStorage()}>
        <FocusHost spots={[prefix]} select={prefix} />
      </ViewProvider>,
    );
    const text = screen.getByTestId("focus").textContent ?? "";
    expect(text.endsWith(",true")).toBe(true);
    expect(text.startsWith("none")).toBe(false);
  });

  it("clears stale focus when switching to an unresolved selection", () => {
    const grid = dxSpot({ id: "grid-1", dxGrid: "GG87" });
    const { rerender } = render(
      <ViewProvider ownerId="owner-a" slot="lite" storage={createMemoryWorkingStorage()}>
        <FocusHost spots={[grid]} select={grid} />
      </ViewProvider>,
    );
    expect(screen.getByTestId("focus").textContent).not.toBe("none");
    rerender(
      <ViewProvider ownerId="owner-a" slot="lite" storage={createMemoryWorkingStorage()}>
        <FocusHost spots={[grid]} select="unresolved" />
      </ViewProvider>,
    );
    expect(screen.getByTestId("focus").textContent).toBe("none");
  });
});
