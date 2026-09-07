import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { BridgeMessage, BridgeConnectionOptions } from "@/types/bridge";
import { useDXStore } from "@/stores/dxStore";
import { useUserStore } from "@/stores/userStore";
import { useDXCluster } from "./useDXCluster";

const transport = vi.hoisted(() => ({ listeners: new Set<(message: BridgeMessage) => void>() }));
vi.mock("@/hooks/useBridge", async () => {
  const { useEffect, useRef, useState } = await import("react");
  return { useBridge: function useTestBridge(options: Partial<BridgeConnectionOptions>) {
    const [lastMessage, setLastMessage] = useState<BridgeMessage | null>(null);
    const current = useRef(options); current.current = options;
    useEffect(() => {
      const receive = (message: BridgeMessage) => {
        if (current.current.enabled === false) return;
        // Match useBridge's transport callback followed by React's display state.
        current.current.onMessage?.(message);
        setLastMessage(message);
      };
      transport.listeners.add(receive);
      return () => { transport.listeners.delete(receive); };
    }, []);
    return { connected: true, lastMessage, send: () => true };
  } };
});
vi.mock("@/lib/api/dxcluster", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/api/dxcluster")>(),
  fetchClusterFeed: () => new Promise(() => {}),
}));
const original = { dx: useDXStore.getState(), user: useUserStore.getState() };
let client: QueryClient;
const wrapper = ({children}:{children:ReactNode}) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
const packet = (id: string): BridgeMessage => ({ type:"cluster.spot", payload:{
  id, dx:id, spotter:"N0TEST", frequency:14074, mode:"FT8", band:"20m", comment:"fixture", time:new Date().toISOString(),
} });
const broadcast = (message: BridgeMessage) => transport.listeners.forEach(receive => receive(message));
beforeEach(() => {
  client = new QueryClient();
  useDXStore.setState({ ...original.dx, spots:[], spotSource:"rest", filters:{maxAge:30} });
  useUserStore.setState({ preferences:{...original.user.preferences,bridgeEnabled:true} });
});
afterEach(() => { client.clear(); useDXStore.setState(original.dx); useUserStore.setState(original.user); });

it("retains every spot delivered in a single React batch", async () => {
  const owner=renderHook(()=>useDXCluster(),{wrapper});
  act(()=>{ broadcast(packet("K1TEST")); broadcast(packet("K2TEST")); });
  expect(useDXStore.getState().spots.map(s=>s.dx)).toEqual(["K2TEST","K1TEST"]);
  owner.unmount();await act(async()=>Promise.resolve());
});

it("keeps existing bridge history when a newly mounted observer receives its first spot", async () => {
  const owner=renderHook(()=>useDXCluster(),{wrapper});
  act(()=>broadcast(packet("K1TEST")));
  const observer=renderHook(()=>useDXCluster(),{wrapper});
  act(()=>broadcast(packet("K2TEST")));
  expect(useDXStore.getState().spots.map(s=>s.dx)).toEqual(["K2TEST","K1TEST"]);
  observer.unmount();owner.unmount();await act(async()=>Promise.resolve());
});
