import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useResolvedMapSpots } from "./useResolvedMapSpots";

const mocks = vi.hoisted(() => ({
  live: vi.fn(),
  resolve: vi.fn(),
}));

vi.mock("@/hooks/useLiveSpots", () => ({ useLiveSpots: mocks.live }));
vi.mock("../LiveSpotArcs", () => ({ resolveSpotLocations: mocks.resolve }));

describe("useResolvedMapSpots", () => {
  beforeEach(() => {
    mocks.live.mockReturnValue({
      spots: [{ id: "raw-1" }],
      isLoading: false,
      isError: false,
      spotsBySource: {},
      refetch: vi.fn(),
    });
    mocks.resolve.mockReturnValue([
      { id: "resolved-1" },
      { id: "resolved-2" },
    ]);
  });

  it("shares the request boundary and applies a renderer draw cap", () => {
    const { result } = renderHook(() =>
      useResolvedMapSpots({
        grid: "EM10aa",
        enabled: true,
        maxSpots: 1,
      }),
    );

    expect(mocks.live).toHaveBeenCalledWith({
      grid: "EM10aa",
      enabled: true,
      refetchInterval: 60_000,
    });
    expect(mocks.resolve).toHaveBeenCalledWith([{ id: "raw-1" }]);
    expect(result.current.resolvedSpots).toEqual([{ id: "resolved-1" }]);
  });

  it("keeps raw data available without resolving it for raw-only layers", () => {
    const { result } = renderHook(() =>
      useResolvedMapSpots({
        enabled: true,
        resolveEnabled: false,
      }),
    );

    expect(result.current.spots).toEqual([{ id: "raw-1" }]);
    expect(result.current.resolvedSpots).toEqual([]);
    expect(mocks.resolve).not.toHaveBeenCalled();
  });
});
