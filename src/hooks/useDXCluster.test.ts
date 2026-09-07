import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDXStore } from "@/stores/dxStore";
import { createElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ClusterWindowMinutes, SpotFeed } from "@/lib/api/spotFeed";
import type { BridgeMessage, BridgeConnectionOptions } from "@/types/bridge";
import type { DXSpot } from "@/types/dxcluster";
import { useDXCluster, DX_QUERY_KEYS, useSharedBridgeSourceOwnership } from "./useDXCluster";

describe("DX cluster shared-source ownership", () => {
  beforeEach(() => {
    useDXStore.setState({ spotSource: "bridge" });
  });

  it("ignores a disabled or never-connected observer beside a live owner", async () => {
    const owner = renderHook(() =>
      useSharedBridgeSourceOwnership(true, true),
    );
    const disabled = renderHook(() =>
      useSharedBridgeSourceOwnership(false, false),
    );
    const connecting = renderHook(() =>
      useSharedBridgeSourceOwnership(true, false),
    );

    await act(async () => Promise.resolve());
    expect(useDXStore.getState().spotSource).toBe("bridge");

    disabled.unmount();
    connecting.unmount();
    owner.unmount();
    await act(async () => Promise.resolve());
  });

  it("demotes only after the final connected observer releases ownership", async () => {
    const first = renderHook(
      ({ connected }) =>
        useSharedBridgeSourceOwnership(true, connected),
      { initialProps: { connected: true } },
    );
    const second = renderHook(
      ({ connected }) =>
        useSharedBridgeSourceOwnership(true, connected),
      { initialProps: { connected: true } },
    );

    first.rerender({ connected: false });
    await act(async () => Promise.resolve());
    expect(useDXStore.getState().spotSource).toBe("bridge");

    second.rerender({ connected: false });
    await act(async () => Promise.resolve());
    expect(useDXStore.getState().spotSource).toBe("rest");

    first.unmount();
    second.unmount();
  });
});


const mocks = vi.hoisted(() => ({ receive: undefined as undefined | ((message: BridgeMessage) => void), fetch: vi.fn(), bridge: { connected: false, lastMessage: null as unknown, send: vi.fn() } }));
vi.mock("@/lib/api/dxcluster", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/api/dxcluster")>(), fetchClusterFeed: mocks.fetch }));
vi.mock("@/hooks/useBridge", () => ({ useBridge: (options: Partial<BridgeConnectionOptions>) => { mocks.receive = options.onMessage; return mocks.bridge; } }));

describe("DX cluster history snapshots", () => {
  const initial = useDXStore.getState();
  const now = Date.UTC(2026,8,7,4);
  let client: QueryClient;
  const key = (window: number) => [...DX_QUERY_KEYS.restSpots,"feed-v1",50,window];
  const row = (age: number, id = "report"): DXSpot => ({ id, dx:"K0TEST", spotter:"N0TEST", frequency:14074, band:"20m", mode:"FT8", comment:"", time:new Date(now-age*60_000) });
  const feed = (spots: DXSpot[], window: ClusterWindowMinutes = 30): SpotFeed<DXSpot> => ({ spots, metadata:{ source:"dxcluster", status:"ok", observedAt:spots[0]?.time.getTime() ?? null, fetchedAt:now-60_000, staleAfterSeconds:1800, windowMinutes:window } });
  const wrapper = ({children}:{children:ReactNode}) => createElement(QueryClientProvider,{client},children);
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    useDXStore.setState({ ...initial, spotSource:"rest", spots:[], maxSpots:50, filters:{maxAge:30} });
    client = new QueryClient(); mocks.fetch.mockReset(); mocks.fetch.mockResolvedValue(feed([]));
    mocks.bridge = {connected:false,lastMessage:null,send:vi.fn()};
  });
  afterEach(() => { client.clear(); useDXStore.setState(initial); vi.useRealTimers(); });
  it("uses the matching source window and original retrieval timestamp", async () => {
    useDXStore.setState({filters:{maxAge:120}});
    mocks.fetch.mockResolvedValue(feed([row(90)],120));
    const {result,unmount}=renderHook(()=>useDXCluster(),{wrapper});
    await act(async()=>{await vi.advanceTimersByTimeAsync(1);});
    expect(mocks.fetch).toHaveBeenCalledWith(50,120);
    expect(result.current.spots).toHaveLength(1);
    expect(result.current.feedState.state).toBe("STALE");
    expect(result.current.lastUpdated?.getTime()).toBe(now-60_000);
    unmount();
  });
  it("expires cached rows without refetch and clears a subsequent valid empty snapshot", async () => {
    useDXStore.setState({filters:{maxAge:5}});client.setQueryData(key(15),feed([row(5-3/60)],15));
    const {result,unmount}=renderHook(()=>useDXCluster(),{wrapper});
    expect(result.current.spots).toHaveLength(1);
    await act(async()=>{await vi.advanceTimersByTimeAsync(10_000);});
    expect(result.current.spots).toHaveLength(0);expect(useDXStore.getState().spots).toHaveLength(0);
    expect(mocks.fetch).not.toHaveBeenCalled();
    await act(async()=>{client.setQueryData(key(15),feed([],15));await vi.advanceTimersByTimeAsync(1);});
    expect(result.current.feedState.state).toBe("NO REPORTS");
    expect(useDXStore.getState().spots).toEqual([]);unmount();
  });
  it("retains cached reports with STALE on refetch failure rather than treating failure as empty", async () => {
    client.setQueryData(key(30),feed([row(1)]));mocks.fetch.mockRejectedValue(new Error("offline"));
    const {result,unmount}=renderHook(()=>useDXCluster(),{wrapper});
    act(()=>result.current.refetch());
    await act(async()=>{await vi.advanceTimersByTimeAsync(5000);});
    expect(result.current.feedState.state).toBe("STALE");
    expect(result.current.spots).toHaveLength(1);expect(useDXStore.getState().spots).toHaveLength(1);
    expect(result.current.lastUpdated?.getTime()).toBe(now-60_000);unmount();
  });
  it("does not reuse another window's rows while the selected query loads", async () => {
    client.setQueryData(key(30),feed([row(1)]));mocks.fetch.mockImplementation(()=>new Promise(()=>{}));
    const {result,unmount}=renderHook(()=>useDXCluster(),{wrapper});
    act(()=>useDXStore.getState().updateFilter("maxAge",120));
    expect(result.current.spots).toEqual([]);expect(useDXStore.getState().spots).toEqual([]);
    expect(result.current.feedState.state).toBe("LOADING");unmount();
  });
  it("withholds disabled data and prevents external filters from replacing the passive snapshot", () => {
    const sentinel=row(1,"shared");useDXStore.setState({spots:[sentinel]});
    client.setQueryData(key(120),feed([row(90,"external")],120));
    const external=renderHook(()=>useDXCluster({maxAge:120}),{wrapper});
    expect(external.result.current.spots[0].id).toBe("external");
    const disabled=renderHook(()=>useDXCluster(undefined,{enabled:false}),{wrapper});
    expect(disabled.result.current.spots).toEqual([]);
    expect(useDXStore.getState().spots).toEqual([sentinel]);
    disabled.unmount();external.unmount();
  });
  it("does not let a new empty bridge observer erase the existing shared rows", async () => {
    const sentinel=row(1,"bridge-existing");useDXStore.setState({spots:[sentinel],spotSource:"bridge"});
    mocks.bridge.connected=true;
    const {result,unmount}=renderHook(()=>useDXCluster(),{wrapper});
    expect(result.current.spots).toEqual([sentinel]);expect(useDXStore.getState().spots).toEqual([sentinel]);
    expect(mocks.fetch).not.toHaveBeenCalled();unmount();await act(async()=>Promise.resolve());
  });
  it("lets an external consumer read its bridge without replacing the default REST snapshot", async () => {
    const sentinel=row(1,"shared-rest");useDXStore.setState({spots:[sentinel]});
    mocks.bridge.connected=true;
    mocks.bridge.lastMessage={type:"cluster.spot",payload:{...row(2,"external-bridge"),time:new Date(now-120_000).toISOString()}};
    const {result,unmount}=renderHook(()=>useDXCluster({maxAge:120}),{wrapper});
    act(()=>mocks.receive?.(mocks.bridge.lastMessage as BridgeMessage));
    expect(result.current.source).toBe("bridge");
    expect(result.current.spots[0].id).toBe("external-bridge");
    expect(result.current.lastUpdated?.getTime()).toBe(now-120_000);
    expect(useDXStore.getState().spotSource).toBe("rest");
    expect(useDXStore.getState().spots).toEqual([sentinel]);
    unmount();await act(async()=>Promise.resolve());
  });

  it("clears still-eligible rows after a valid empty response", async () => {
    client.setQueryData(key(30),feed([row(1)]));
    const {result,unmount}=renderHook(()=>useDXCluster(),{wrapper});
    expect(useDXStore.getState().spots).toHaveLength(1);
    await act(async()=>{client.setQueryData(key(30),feed([]));await vi.advanceTimersByTimeAsync(1);});
    expect(result.current.spots).toEqual([]);expect(useDXStore.getState().spots).toEqual([]);
    expect(result.current.feedState.state).toBe("NO REPORTS");unmount();
  });
  it("reports unavailable for an initial failure without reusing a prior store snapshot", async () => {
    useDXStore.setState({spots:[row(1,"old-window")]});mocks.fetch.mockRejectedValue(new Error("offline"));
    const {result,unmount}=renderHook(()=>useDXCluster(),{wrapper});
    await act(async()=>{await vi.advanceTimersByTimeAsync(5000);});
    expect(result.current.spots).toEqual([]);expect(result.current.feedState.state).toBe("UNAVAILABLE");
    expect(result.current.lastUpdated).toBeNull();unmount();
  });

  it("preserves a live owner's source state beside a disconnected observer", async () => {
    const sentinel=row(1,"owned");useDXStore.setState({spotSource:"bridge",spots:[sentinel],clusterFeed:{state:"BRIDGE",windowMinutes:null,fetchedAt:null,observedAt:sentinel.time.getTime()}});
    const owner=renderHook(()=>useSharedBridgeSourceOwnership(true,true));
    const observer=renderHook(()=>useDXCluster(),{wrapper});
    expect(useDXStore.getState().clusterFeed.state).toBe("BRIDGE");
    expect(observer.result.current.feedState.state).toBe("BRIDGE");
    observer.unmount();owner.unmount();await act(async()=>Promise.resolve());
  });

  it("keeps next-minute bridge reports through rendering and snapshot cleanup", async () => {
    mocks.bridge.connected = true;
    const hook = renderHook(() => useDXCluster(), { wrapper });
    const future = { ...row(-0.5, "next-minute"), time: new Date(now + 30_000).toISOString() };
    act(() => mocks.receive?.({ type: "cluster.spot", payload: future } as BridgeMessage));
    expect(useDXStore.getState().spots.map(spot => spot.id)).toEqual(["next-minute"]);
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(hook.result.current.spots.map(spot => spot.id)).toEqual(["next-minute"]);
    expect(useDXStore.getState().spots.map(spot => spot.id)).toEqual(["next-minute"]);
    hook.unmount();
    await act(async () => Promise.resolve());
  });

});
