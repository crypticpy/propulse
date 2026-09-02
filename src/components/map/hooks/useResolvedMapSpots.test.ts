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
      evidenceSpots: [{ id: "raw-1" }],
      isLoading: false,
      isFeedReady: true,
      isError: false,
      spotsBySource: {},
      refetch: vi.fn(),
    });
    mocks.resolve.mockImplementation((spots: Array<{ id: string }>) =>
      spots.map((spot) => ({ id: spot.id })),
    );
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
      sources: undefined,
      spotFilters: undefined,
      fetchLimit: 200,
    });
    expect(mocks.resolve).toHaveBeenCalledWith([{ id: "raw-1" }]);
    expect(result.current.resolvedSpots).toEqual([{ id: "raw-1" }]);
    expect(result.current.candidateSpots).toEqual([{ id: "raw-1" }]);
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
      sources: undefined,
      spotFilters: undefined,
      fetchLimit: 200,
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

  it("shares source and profile filtering before coordinate resolution", () => {
    const rawSpots = [
      { id: "wanted", source: "RBN", band: "20m", mode: "CW" },
      { id: "wrong-mode", source: "RBN", band: "20m", mode: "FT8" },
      { id: "wrong-source", source: "PSKReporter", band: "20m", mode: "CW" },
    ];
    mocks.live.mockReturnValue({
      spots: rawSpots,
      evidenceSpots: rawSpots,
      isLoading: false,
      isFeedReady: true,
      isError: false,
      spotsBySource: {},
      refetch: vi.fn(),
    });

    const { result } = renderHook(() =>
      useResolvedMapSpots({
        enabled: true,
        sources: ["RBN"],
        spotFilters: { bands: ["20m"], modes: ["CW"] },
      }),
    );

    expect(mocks.live).toHaveBeenCalledWith(
      expect.objectContaining({
        sources: ["RBN"],
        spotFilters: { bands: ["20m"], modes: ["CW"] },
      }),
    );
    expect(mocks.resolve).toHaveBeenCalledWith([rawSpots[0]]);
    expect(result.current.candidateSpots).toEqual([rawSpots[0]]);
  });

  it("applies the draw cap after resolution and keeps both lists aligned", () => {
    const rawSpots = [
      { id: "unresolved-newest" },
      { id: "resolved-first" },
      { id: "resolved-second" },
    ];
    mocks.live.mockReturnValue({
      spots: rawSpots,
      evidenceSpots: rawSpots,
      isLoading: false,
      isFeedReady: true,
      isError: false,
      spotsBySource: {},
      refetch: vi.fn(),
    });
    mocks.resolve.mockReturnValue([
      { id: "resolved-first" },
      { id: "resolved-second" },
    ]);

    const { result } = renderHook(() =>
      useResolvedMapSpots({ enabled: true, maxSpots: 2 }),
    );

    expect(mocks.resolve).toHaveBeenCalledWith(rawSpots);
    expect(result.current.candidateSpots.map(({ id }) => id)).toEqual([
      "resolved-first",
      "resolved-second",
    ]);
    expect(result.current.resolvedSpots.map(({ id }) => id)).toEqual([
      "resolved-first",
      "resolved-second",
    ]);
    expect(result.current.allCandidateSpots).toEqual(rawSpots);
    expect(result.current.allResolvedSpots).toEqual([
      { id: "resolved-first" },
      { id: "resolved-second" },
    ]);
  });

  it("builds semantic activity from evidence before visual deduplication", () => {
    const visual = [{ id: "same-dx-first" }];
    const evidence = [
      visual[0],
      { id: "same-dx-second" },
      { id: "same-dx-third" },
    ];
    mocks.live.mockReturnValue({
      spots: visual,
      evidenceSpots: evidence,
      isLoading: false,
      isFeedReady: true,
      isError: false,
      spotsBySource: {},
      refetch: vi.fn(),
    });

    const { result } = renderHook(() =>
      useResolvedMapSpots({ enabled: true, maxSpots: 1 }),
    );

    expect(mocks.resolve).toHaveBeenCalledWith(evidence);
    expect(result.current.candidateSpots).toEqual(visual);
    expect(result.current.allCandidateSpots).toEqual(evidence);
    expect(result.current.allResolvedSpots).toHaveLength(3);
  });
});
