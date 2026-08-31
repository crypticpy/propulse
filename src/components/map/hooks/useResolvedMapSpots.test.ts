import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useResolvedMapSpots } from "./useResolvedMapSpots";

const mocks = vi.hoisted(() => ({
  live: vi.fn(),
  resolve: vi.fn(),
  activations: vi.fn(),
  resolveActivations: vi.fn(),
}));

vi.mock("@/hooks/useLiveSpots", () => ({ useLiveSpots: mocks.live }));
vi.mock("@/hooks/useActivationSpots", () => ({
  useActivationSpots: mocks.activations,
}));
vi.mock("@/lib/map/activationMarkers", () => ({
  resolveActivationMarkers: mocks.resolveActivations,
}));
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
    mocks.activations.mockReturnValue({ spots: [{ id: "activation-raw" }] });
    mocks.resolveActivations.mockReturnValue([{ id: "activation-resolved" }]);
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
    expect(mocks.activations).toHaveBeenCalledWith(false);
    expect(result.current.activationSpots).toEqual([]);
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

  it("resolves activations independently from the ordinary live feed", () => {
    const { result } = renderHook(() =>
      useResolvedMapSpots({
        enabled: false,
        activationsEnabled: true,
        maxSpots: 25,
      }),
    );

    expect(mocks.live).toHaveBeenCalledWith({
      grid: undefined,
      enabled: false,
      refetchInterval: 60_000,
    });
    expect(mocks.activations).toHaveBeenCalledWith(true);
    expect(mocks.resolveActivations).toHaveBeenCalledWith(
      [{ id: "activation-raw" }],
      25,
    );
    expect(result.current.activationSpots).toEqual([
      { id: "activation-resolved" },
    ]);
  });
});
