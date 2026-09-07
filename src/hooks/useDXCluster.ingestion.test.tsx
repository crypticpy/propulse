import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BridgeConnectionOptions, BridgeMessage } from "@/types/bridge";
import type { DXSpot } from "@/types/dxcluster";
import { useDXStore } from "@/stores/dxStore";
import { useUserStore } from "@/stores/userStore";
import { useDXCluster } from "./useDXCluster";

const transport = vi.hoisted(() => ({
  listeners: new Set<(message: BridgeMessage) => void>(),
  fetchFeed: vi.fn<() => Promise<{ spots: DXSpot[] }>>(() => new Promise(() => undefined)),
}));

vi.mock("@/hooks/useBridge", async () => {
  const { useEffect, useRef, useState } = await import("react");
  return {
    useBridge(options: Partial<BridgeConnectionOptions>) {
      const [lastMessage, setLastMessage] = useState<BridgeMessage | null>(null);
      const current = useRef(options);
      current.current = options;
      useEffect(() => {
        const receive = (message: BridgeMessage) => {
          if (current.current.enabled === false) return;
          current.current.onMessage?.(message);
          setLastMessage(message);
        };
        transport.listeners.add(receive);
        return () => { transport.listeners.delete(receive); };
      }, []);
      return { connected: true, lastMessage, send: () => true };
    },
  };
});

vi.mock("@/lib/api/dxcluster", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/api/dxcluster")>(),
  fetchClusterFeed: transport.fetchFeed,
}));

const original = { dx: useDXStore.getState(), user: useUserStore.getState() };
const NOW = Date.parse("2026-09-07T19:00:00Z");
let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) =>
  <QueryClientProvider client={client}>{children}</QueryClientProvider>;
const packet = (id: string, offsetMs = 0): BridgeMessage => ({
  type: "cluster.spot",
  payload: {
    id, dx: id, spotter: "N0TEST", frequency: 14_074, mode: "FT8", band: "20m",
    comment: "fixture", time: new Date(NOW + offsetMs).toISOString(),
  },
});
const restSpot = (id: string): DXSpot => ({
  id, dx: id, spotter: "N0TEST", frequency: 14_074, mode: "FT8", band: "20m",
  comment: "fixture", time: new Date(NOW),
});
const broadcast = (message: BridgeMessage) =>
  transport.listeners.forEach((receive) => receive(message));

describe("DX cluster bridge ingestion", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    transport.fetchFeed.mockReset().mockImplementation(() => new Promise(() => undefined));
    useDXStore.setState({ ...original.dx, spots: [], spotSource: "rest", filters: { maxAge: 30 } });
    useUserStore.setState({ preferences: { ...original.user.preferences, bridgeEnabled: true } });
  });

  afterEach(() => {
    client.clear();
    transport.listeners.clear();
    useDXStore.setState(original.dx);
    useUserStore.setState(original.user);
    vi.useRealTimers();
  });

  it("retains every valid spot delivered in one React batch", () => {
    const owner = renderHook(() => useDXCluster(), { wrapper });
    act(() => {
      broadcast(packet("K1TEST"));
      broadcast(packet("K2TEST", 1));
      broadcast({ type: "cluster.spot", payload: { ...packet("BAD").payload as object, time: "bad" } });
    });
    expect(useDXStore.getState().spots.map((spot) => spot.dx)).toEqual(["K2TEST", "K1TEST"]);
    expect(useDXStore.getState().spotSource).toBe("bridge");
    owner.unmount();
  });

  it("replaces preloaded REST rows instead of relabeling them as bridge reports", () => {
    useDXStore.setState({
      spots: [restSpot("REST")],
      spotSource: "rest",
    });
    const owner = renderHook(() => useDXCluster(), { wrapper });
    act(() => broadcast(packet("BRIDGE")));
    expect(useDXStore.getState().spots.map((spot) => spot.dx)).toEqual(["BRIDGE"]);
    owner.unmount();
  });

  it("ignores an expired first bridge packet without dropping the working REST source", () => {
    useDXStore.setState({ spots: [restSpot("REST")], spotSource: "rest" });
    const owner = renderHook(() => useDXCluster(), { wrapper });
    act(() => broadcast(packet("EXPIRED", -30 * 60_000 - 1)));
    expect(useDXStore.getState().spots.map((spot) => spot.dx)).toEqual(["REST"]);
    expect(useDXStore.getState().spotSource).toBe("rest");
    owner.unmount();
  });

  it("does not let a late REST response overwrite a newer bridge snapshot", async () => {
    let resolveRest!: (spots: DXSpot[]) => void;
    transport.fetchFeed.mockImplementationOnce(() => new Promise((resolve) => {
      resolveRest = (spots) => resolve({ spots });
    }));
    const owner = renderHook(() => useDXCluster(), { wrapper });
    act(() => broadcast(packet("BRIDGE")));
    await act(async () => resolveRest([restSpot("REST")]));
    expect(useDXStore.getState().spots.map((spot) => spot.dx)).toEqual(["BRIDGE"]);
    expect(useDXStore.getState().spotSource).toBe("bridge");
    owner.unmount();
  });

  it("re-publishes cached REST rows when the final bridge owner falls back", async () => {
    vi.useRealTimers();
    transport.fetchFeed.mockResolvedValueOnce({ spots: [restSpot("REST")] });
    const owner = renderHook(() => useDXCluster(), { wrapper });
    await waitFor(() => expect(useDXStore.getState().spots.map((spot) => spot.dx)).toEqual(["REST"]));
    act(() => broadcast(packet("BRIDGE", Date.now() - NOW)));
    expect(useDXStore.getState().spots.map((spot) => spot.dx)).toEqual(["BRIDGE"]);
    act(() => useDXStore.setState({ spotSource: "rest" }));
    await waitFor(() => expect(useDXStore.getState().spots.map((spot) => spot.dx)).toEqual(["REST"]));
    owner.unmount();
  });

  it("publishes a successful empty REST response over an older REST snapshot", async () => {
    vi.useRealTimers();
    useDXStore.setState({ spots: [restSpot("OLD")], spotSource: "rest" });
    transport.fetchFeed.mockResolvedValueOnce({ spots: [] });
    const owner = renderHook(() => useDXCluster(), { wrapper });
    await waitFor(() => expect(useDXStore.getState().spots).toEqual([]));
    owner.unmount();
  });

  it("preserves the last good REST snapshot and exposes a failed refresh", async () => {
    vi.useRealTimers();
    const failure = new Error("REST unavailable");
    useDXStore.setState({ spots: [restSpot("LAST-GOOD")], spotSource: "rest" });
    transport.fetchFeed.mockRejectedValue(failure);
    const hook = renderHook(() => useDXCluster(), { wrapper });
    await waitFor(() => expect(hook.result.current.isError).toBe(true), { timeout: 5_000 });
    expect(hook.result.current.error).toBe(failure);
    expect(useDXStore.getState().spots.map((spot) => spot.dx)).toEqual(["LAST-GOOD"]);
    hook.unmount();
  });

  it("shares one atomic deduplicated snapshot across newly mounted observers", () => {
    const owner = renderHook(() => useDXCluster(), { wrapper });
    act(() => broadcast(packet("K1TEST")));
    const observer = renderHook(() => useDXCluster(), { wrapper });
    act(() => broadcast(packet("K2TEST", 1)));
    expect(useDXStore.getState().spots.map((spot) => spot.dx)).toEqual(["K2TEST", "K1TEST"]);
    observer.unmount();
    owner.unmount();
  });

  it("allows bridge clock skew through one minute while REST filtering stays strict", () => {
    const hook = renderHook(() => useDXCluster(), { wrapper });
    act(() => broadcast(packet("K1TEST", 60_000)));
    expect(hook.result.current.spots.map((spot) => spot.dx)).toEqual(["K1TEST"]);
    act(() => useDXStore.setState({ spotSource: "rest" }));
    expect(hook.result.current.spots).toEqual([]);
    hook.unmount();
  });

  it("expires the shared bridge snapshot while the feed is quiet", async () => {
    useDXStore.setState({ filters: { maxAge: 0.001 } });
    const hook = renderHook(() => useDXCluster(), { wrapper });
    act(() => broadcast(packet("K1TEST")));
    expect(hook.result.current.spots).toHaveLength(1);
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(useDXStore.getState().spots).toEqual([]);
    hook.unmount();
  });
});
