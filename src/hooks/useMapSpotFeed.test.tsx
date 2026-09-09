import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { useMapSpotFeed } from "./useMapSpotFeed";
import { usePskStationView } from "./usePskStation";
import { useMapStore } from "@/stores/mapStore";
import { useProfileStore } from "@/stores/profileStore";
import { buildMapDataPolicy, type MapDataPolicy } from "@/lib/map/operationalScope";
import { MAX_SPOT_FETCH_LIMIT } from "@/lib/map/spotDensity";
import { PSK_WINDOWS, type PskStationSnapshot } from "@/lib/hamclock/pskStation";
const mocks = vi.hoisted(() => ({ live: vi.fn(), policy: null as unknown as MapDataPolicy }));
vi.mock("./useLiveSpots", () => ({ useLiveSpots: mocks.live }));
vi.mock("./useMapOperationalContext", () => ({ useMapOperationalContext: () => ({ policy: mocks.policy }) }));
const initial = { map: useMapStore.getState(), profile: useProfileStore.getState() };
let client: QueryClient;
const now = Date.UTC(2026, 8, 7, 3);
function wrapper({ children }: { children: ReactNode }) { return <QueryClientProvider client={client}>{children}</QueryClientProvider>; }
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(now);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mocks.policy = buildMapDataPolicy("observe", false);
  mocks.live.mockReturnValue({ spots: [], evidenceSpots: [], sourceStates: {}, spotsBySource: {}, refetch: vi.fn() });
  useMapStore.setState({ spotFeedScope: "psk-station" });
  useProfileStore.setState({ station: { ...initial.profile.station, callsign: "N0TEST" } as NonNullable<typeof initial.profile.station> });
  usePskStationView.setState({ direction: "of", minutes: 15, band: "all" });
  const snapshot: PskStationSnapshot = {
    callsign: "N0TEST", status: "ok", fetchedAt: now, checkedAt: now, retryAt: now + 300_000,
    windowMinutes: 1440, limit: 1000, limited: false, discarded: 0,
    reports: [10, 20, 45, 180, 1000].flatMap((age, i) => [
      { senderCallsign: "N0TEST", receiverCallsign: `W${i}AW`, senderLocator: "EM38", receiverLocator: "FN31", frequencyHz: 14074123, mode: "FT8", snr: -10, observedAt: now - age * 60_000 },
      { senderCallsign: `K${i}ABC`, receiverCallsign: "N0TEST", senderLocator: "FN31", receiverLocator: "EM38", frequencyHz: 7074123, mode: "FT8", snr: null, observedAt: now - age * 60_000 },
    ]),
  };
  client.setQueryData(["pskStation", "N0TEST"], snapshot);
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected source request"); }));
});
afterEach(() => {
  client.clear(); useMapStore.setState(initial.map); useProfileStore.setState(initial.profile);
  usePskStationView.setState({ direction: "of", minutes: 15, band: "all" });
  vi.useRealTimers(); vi.unstubAllGlobals();
});
it("follows every personal direction/window and band without global filter interference or refetch", () => {
  const { result, unmount } = renderHook(() => useMapSpotFeed({ enabled: true, sources: ["RBN"], spotFilters: { bands: ["80m"], modes: ["CW"] } }), { wrapper });
  for (const direction of ["of", "by"] as const) {
    act(() => usePskStationView.getState().setDirection(direction));
    for (const [i, minutes] of PSK_WINDOWS.entries()) {
      act(() => usePskStationView.getState().setMinutes(minutes));
      expect(result.current.spots).toHaveLength(i + 1);
      expect(result.current.spots.every(s => direction === "of" ? s.dx === "N0TEST" : s.spotter === "N0TEST")).toBe(true);
    }
  }
  act(() => usePskStationView.getState().setBand("20m"));
  expect(result.current.spots).toHaveLength(0);
  expect(result.current.effectiveSpotFilters).toBeUndefined();
  expect(mocks.live).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false }));
  expect(fetch).not.toHaveBeenCalled();
  unmount();
});
it("removes expired personal paths on the clock and separates trace identity when filters change", () => {
  const { result, unmount } = renderHook(() => useMapSpotFeed({ enabled: true }), { wrapper });
  const scope = result.current.feedScopeKey;
  expect(result.current.spots).toHaveLength(1);
  act(() => vi.advanceTimersByTime(5 * 60_000 + 10_000));
  expect(result.current.spots).toHaveLength(0);
  act(() => usePskStationView.getState().setMinutes(60));
  expect(result.current.feedScopeKey).not.toBe(scope);
  unmount();
});
it("hides cached personal public reports under restricted policy and restores the global request", () => {
  mocks.policy = buildMapDataPolicy("contest", false);
  const { result, rerender, unmount } = renderHook(() => useMapSpotFeed({ enabled: true }), { wrapper });
  expect(result.current.spots).toHaveLength(0);
  expect(result.current.sourceStates.PSKReporter).toBe("RESTRICTED");
  expect(result.current.isFeedReady).toBe(false);
  result.current.refetch();
  expect(fetch).not.toHaveBeenCalled();
  mocks.policy = buildMapDataPolicy("observe", false); rerender();
  expect(result.current.spots).toHaveLength(1);
  act(() => useMapStore.getState().setSpotFeedScope("global"));
  expect(mocks.live).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: true }));
  unmount();
});

it("requests the map density ceiling rather than the frozen displayDensity default (SP-09 round 3 B4)", () => {
  useMapStore.setState({ spotFeedScope: "global" });
  const { unmount } = renderHook(() => useMapSpotFeed({ enabled: true }), { wrapper });
  expect(mocks.live).toHaveBeenLastCalledWith(
    expect.objectContaining({ fetchLimit: MAX_SPOT_FETCH_LIMIT }),
  );
  unmount();
});

it("does not mark an unavailable personal snapshot ready for trace initialization", () => {
  client.setQueryData<PskStationSnapshot>(["pskStation", "N0TEST"], old => ({ ...old!, status: "unavailable", fetchedAt: null, reports: [] }));
  const { result, unmount } = renderHook(() => useMapSpotFeed({ enabled: true }), { wrapper });
  expect(result.current.isFeedReady).toBe(false);
  expect(result.current.isError).toBe(true);
  expect(result.current.sourceStates.PSKReporter).toBe("UNAVAILABLE");
  expect(result.current.spots).toEqual([]);
  unmount();
});
