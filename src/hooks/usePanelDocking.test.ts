import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useMapStore } from "@/stores/mapStore";
import { usePanelDocking } from "./usePanelDocking";

describe("Pro panel docking boundaries", () => {
  beforeEach(() => useMapStore.setState({ dockGroups: [], proPanelLayout: {} }));

  it("snaps and persists at the masthead bottom", () => {
    const { result } = renderHook(() => usePanelDocking({}, 64));
    act(() => {
      expect(result.current.onDragMove("panel", 300, 0, 200, 150)).toEqual({ x: 300, y: 64 });
    });
    expect(result.current.activeSnapTarget).toEqual({ edge: "top", position: 64 });
    act(() => result.current.onDragEnd("panel", 300, 0, 200, 150));
    expect(useMapStore.getState().proPanelLayout.panel.y).toBe(64);
  });

  it("keeps the right edge guide inside the viewport", () => {
    const { result } = renderHook(() => usePanelDocking({}, 64));
    act(() => {
      expect(result.current.onDragMove("panel", window.innerWidth - 205, 200, 200, 150).x).toBe(window.innerWidth - 200);
    });
    expect(result.current.activeSnapTarget).toEqual({ edge: "right", position: window.innerWidth });
  });
});
