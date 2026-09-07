import { render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useSyncExternalStore } from "react";
import { describe, expect, it } from "vitest";
import { ViewProvider } from "./ViewProvider";
import { useViewRuntime } from "./ViewRuntimeContext";
import { createMemoryWorkingStorage } from "@/lib/views/runtime";
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
});
