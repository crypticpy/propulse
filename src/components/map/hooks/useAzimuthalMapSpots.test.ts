import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolved: vi.fn(() => ({ resolvedSpots: [], activationSpots: [] })),
  spotFilters: { bands: ["20m"], modes: ["CW"] },
  sources: ["RBN"],
}));

vi.mock("@/stores/mapStore", () => ({
  useMapStore: (
    selector: (state: { spotFilters: typeof mocks.spotFilters }) => unknown,
  ) => selector({ spotFilters: mocks.spotFilters }),
}));
vi.mock("@/stores/dxStore", () => ({
  useDXStore: (
    selector: (state: { filters: { sources: string[] } }) => unknown,
  ) => selector({ filters: { sources: mocks.sources } }),
}));
vi.mock("./useResolvedMapSpots", () => ({
  useResolvedMapSpots: mocks.resolved,
}));

import { useAzimuthalMapSpots } from "./useAzimuthalMapSpots";

describe("useAzimuthalMapSpots", () => {
  it("forwards the active DX sources and map profile filters", () => {
    renderHook(() =>
      useAzimuthalMapSpots({
        grid: "EM10aa",
        enabled: true,
        activationsEnabled: false,
        maxSpots: 100,
      }),
    );

    expect(mocks.resolved).toHaveBeenCalledWith({
      grid: "EM10aa",
      enabled: true,
      activationsEnabled: false,
      maxSpots: 100,
      sources: ["RBN"],
      spotFilters: { bands: ["20m"], modes: ["CW"] },
    });
  });
});
