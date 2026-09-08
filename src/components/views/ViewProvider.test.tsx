import { render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, useState, useSyncExternalStore } from "react";
import { describe, expect, it } from "vitest";
import { ViewProvider } from "./ViewProvider";
import { useViewRuntime } from "./ViewRuntimeContext";
import {
  createMemoryWorkingStorage,
  registeredWriterCount,
  resetAnonymousInstallIdForTests,
  type ScopedViewRuntime,
} from "@/lib/views/runtime";
import { createViewConfiguration } from "@/lib/views/defaults";

function Probe({ id }: { id: string }) {
  const runtime = useViewRuntime();
  const projection = useSyncExternalStore(
    runtime.subscribe,
    () => runtime.getSnapshot().config.presentation.projection,
  );
  const follow = useSyncExternalStore(
    runtime.subscribe,
    () => runtime.getSnapshot().config.context.followRadio,
  );
  return (
    <div>
      <span data-testid={`${id}-instance`}>{runtime.instanceId}</span>
      <span data-testid={`${id}-slot`}>{runtime.binding.slotId}</span>
      <span data-testid={`${id}-projection`}>{projection}</span>
      <span data-testid={`${id}-follow`}>{String(follow)}</span>
      <button
        type="button"
        onClick={() => {
          const { presentation } = runtime.getSnapshot().config;
          runtime.updateWorkingView({
            presentation: { ...JSON.parse(JSON.stringify(presentation)), projection: "azimuthal" },
          });
        }}
      >
        {id}-azimuthal
      </button>
    </div>
  );
}

describe("ViewProvider", () => {
  it("hosts two independent runtimes in one tree with no shared selector", async () => {
    const user = userEvent.setup();
    const storage = createMemoryWorkingStorage();
    render(
      <>
        <ViewProvider ownerId="owner-a" slot="normal" storage={storage}>
          <Probe id="monitor" />
        </ViewProvider>
        <ViewProvider ownerId="owner-a" slot="hamclock" storage={storage}>
          <Probe id="wall" />
        </ViewProvider>
      </>,
    );
    expect(screen.getByTestId("monitor-slot").textContent).toBe("normal");
    expect(screen.getByTestId("wall-slot").textContent).toBe("hamclock");
    expect(screen.getByTestId("monitor-instance").textContent).not.toBe(
      screen.getByTestId("wall-instance").textContent,
    );
    expect(screen.getByTestId("monitor-projection").textContent).toBe("globe");
    expect(screen.getByTestId("wall-projection").textContent).toBe("flat");
    await user.click(screen.getByRole("button", { name: "monitor-azimuthal" }));
    expect(screen.getByTestId("monitor-projection").textContent).toBe("azimuthal");
    expect(screen.getByTestId("wall-projection").textContent).toBe("flat");
    expect(screen.getByTestId("wall-follow").textContent).toBe("false");
  });

  it("throws without a provider instead of using a singleton fallback", () => {
    expect(() => renderHook(() => useViewRuntime())).toThrow(/no global active view exists/);
  });

  it("does not recover preview working state after remount", () => {
    const storage = createMemoryWorkingStorage();
    const seed = createViewConfiguration("pro");
    const { unmount } = render(
      <ViewProvider ownerId="owner-a" slot="preview:desk" kind="preview" seed={seed} storage={storage}>
        <Probe id="preview" />
      </ViewProvider>,
    );
    expect(screen.getByTestId("preview-projection").textContent).toBe("globe");
    unmount();
    render(
      <ViewProvider ownerId="owner-a" slot="preview:desk" kind="preview" seed={seed} storage={storage}>
        <Probe id="preview" />
      </ViewProvider>,
    );
    expect(screen.getByTestId("preview-projection").textContent).toBe("globe");
  });

  it("survives StrictMode replay, accepts updates, remounts on owner change, and disposes", async () => {
    const user = userEvent.setup();
    const storage = createMemoryWorkingStorage();
    let runtime: ScopedViewRuntime | null = null;
    function Capture() {
      runtime = useViewRuntime();
      return <Probe id="strict" />;
    }
    const { rerender, unmount } = render(
      <StrictMode>
        <ViewProvider ownerId="owner-a" slot="normal" storage={storage}>
          <Capture />
        </ViewProvider>
      </StrictMode>,
    );
    expect(runtime).not.toBeNull();
    expect(runtime!.isDisposed()).toBe(false);
    expect(() => runtime!.getSnapshot()).not.toThrow();
    await user.click(screen.getByRole("button", { name: "strict-azimuthal" }));
    expect(screen.getByTestId("strict-projection").textContent).toBe("azimuthal");
    const firstId = screen.getByTestId("strict-instance").textContent;
    rerender(
      <StrictMode>
        <ViewProvider ownerId="owner-b" slot="normal" storage={storage}>
          <Capture />
        </ViewProvider>
      </StrictMode>,
    );
    expect(screen.getByTestId("strict-instance").textContent).not.toBe(firstId);
    expect(runtime!.isDisposed()).toBe(false);
    const current = runtime!;
    unmount();
    await Promise.resolve();
    expect(current.isDisposed()).toBe(true);
    expect(() => current.getSnapshot()).toThrow(/disposed/);
    expect(registeredWriterCount()).toBe(0);
  });

  it("keeps anonymous working state across parent rerenders with throwing storage", async () => {
    resetAnonymousInstallIdForTests();
    const user = userEvent.setup();
    const storage = createMemoryWorkingStorage();
    const denied: Storage = {
      get length() {
        return 0;
      },
      clear: () => {
        throw new Error("denied");
      },
      getItem: () => {
        throw new Error("denied");
      },
      key: () => {
        throw new Error("denied");
      },
      removeItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    const previous = globalThis.localStorage;
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: denied });
    function Parent() {
      const [, setTick] = useState(0);
      return (
        <>
          <button type="button" onClick={() => setTick((value) => value + 1)}>rerender</button>
          <ViewProvider ownerId={null} slot="normal" storage={storage}>
            <Probe id="anon" />
          </ViewProvider>
          <ViewProvider ownerId={null} slot="hamclock" storage={storage}>
            <Probe id="wall" />
          </ViewProvider>
        </>
      );
    }
    try {
      render(<Parent />);
      const firstId = screen.getByTestId("anon-instance").textContent;
      await user.click(screen.getByRole("button", { name: "anon-azimuthal" }));
      expect(screen.getByTestId("anon-projection").textContent).toBe("azimuthal");
      await user.click(screen.getByRole("button", { name: "rerender" }));
      expect(screen.getByTestId("anon-instance").textContent).toBe(firstId);
      expect(screen.getByTestId("anon-projection").textContent).toBe("azimuthal");
      expect(screen.getByTestId("wall-projection").textContent).toBe("flat");
      expect(screen.getByTestId("anon-instance").textContent).not.toBe(
        screen.getByTestId("wall-instance").textContent,
      );
    } finally {
      Object.defineProperty(globalThis, "localStorage", { configurable: true, value: previous });
      resetAnonymousInstallIdForTests();
    }
  });
});
