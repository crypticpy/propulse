import { StrictMode } from "react";
import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  createMemoryWorkingStorage,
  createViewRuntime,
  type ScopedViewRuntime,
} from "@/lib/views/runtime";
import { useViewScopedStore } from "./useViewScopedStore";

const state = vi.hoisted(() => ({ runtime: null as ScopedViewRuntime | null }));

vi.mock("@/components/views/ViewRuntimeContext", () => ({
  useViewRuntime: () => state.runtime,
}));

vi.mock("@/hooks/useOperatingMonitor", () => ({
  useOperatingMonitor: () => null,
}));

describe("useViewScopedStore lifecycle", () => {
  it("leaves zero runtime subscriptions after a StrictMode unmount", async () => {
    const runtime = createViewRuntime({
      binding: {
        ownerId: "review",
        slotId: "normal",
        kind: "interactive",
        sourceView: null,
        displayId: null,
      },
      storageNamespace: "acct:review",
      storage: createMemoryWorkingStorage(),
    });
    let active = 0;
    const subscribe = runtime.subscribe.bind(runtime);
    runtime.subscribe = (listener) => {
      active += 1;
      const off = subscribe(listener);
      return () => {
        active -= 1;
        off();
      };
    };
    state.runtime = runtime;
    function Probe() {
      useViewScopedStore();
      return null;
    }
    const mounted = render(
      <StrictMode>
        <Probe />
      </StrictMode>,
    );
    mounted.unmount();
    await act(async () => {
      await Promise.resolve();
    });
    expect(active).toBe(0);
    runtime.dispose();
  });
});
