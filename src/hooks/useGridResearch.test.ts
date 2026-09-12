import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useGridResearch } from "./useGridResearch";
const mocks = vi.hoisted(() => ({ feed: vi.fn() }));
vi.mock("@/components/map/hooks/useResolvedMapSpots", () => ({ useResolvedMapSpots: mocks.feed }));
vi.mock("@/hooks/useViewClusterSpots", () => ({ useOptionalViewEffectiveSpots: () => ({ filters: { sources: [] } }) }));
vi.mock("@/hooks/useSolarData", () => ({ useSolarFlux: () => ({ data: [], isLoading: false }) }));
vi.mock("@/hooks/useActiveLocation", () => ({ useActiveLocation: () => ({ grid: "EM10" }) }));
vi.mock("@/stores/mapStore", () => ({ useMapStore: (select: (state: { gridActivityEndpoint: string }) => unknown) => select({ gridActivityEndpoint: "dx" }) }));
describe("useGridResearch feed lifecycle", () => {
  it("waits for the spot feed and disables its observer when hidden", () => {
    mocks.feed.mockReturnValue({ allResolvedSpots: [], isLoading: true });
    const { result, rerender } = renderHook(({ enabled }) => useGridResearch("EM10", undefined, enabled), { initialProps: { enabled: true } });
    expect(result.current.isLoading).toBe(true);
    expect(mocks.feed).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: true, resolveEnabled: true }));
    mocks.feed.mockReturnValue({ allResolvedSpots: [], isLoading: false });
    rerender({ enabled: false });
    expect(result.current.isLoading).toBe(false);
    expect(mocks.feed).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false, resolveEnabled: false }));
  });
});
