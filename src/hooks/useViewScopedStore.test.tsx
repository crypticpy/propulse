import { StrictMode } from "react";
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ViewProvider } from "@/components/views/ViewProvider";
import {
  createMemoryWorkingStorage,
  type ViewScopedStoreHandle,
} from "@/lib/views/runtime";
import { useViewScopedStore } from "./useViewScopedStore";

vi.mock("@/hooks/useOperatingMonitor", () => ({
  useOperatingMonitor: () => null,
}));

function Probe({
  onHandle,
}: {
  onHandle: (handle: ViewScopedStoreHandle) => void;
}) {
  const handle = useViewScopedStore();
  onHandle(handle);
  return <span data-testid="instance">{handle.store.getState().instanceId}</span>;
}

describe("useViewScopedStore", () => {
  it("keeps the memoized handle subscribed after StrictMode replay", () => {
    let handle!: ViewScopedStoreHandle;
    const mounted = render(
      <StrictMode>
        <ViewProvider ownerId="review" slot="normal" storage={createMemoryWorkingStorage()}>
          <Probe onHandle={(next) => { handle = next; }} />
        </ViewProvider>
      </StrictMode>,
    );
    const seen: Array<string | null> = [];
    const stop = handle.store.subscribe((state) => {
      seen.push(state.interaction.selectedReportId);
    });
    act(() => {
      handle.selectSpot("report-1", { lat: 10, lon: 20 });
    });
    expect(handle.store.getState().interaction.selectedReportId).toBe("report-1");
    expect(seen).toContain("report-1");
    stop();
    mounted.unmount();
  });

  it("remounts a fresh store when the owner changes", () => {
    let handle!: ViewScopedStoreHandle;
    const storage = createMemoryWorkingStorage();
    const { rerender } = render(
      <StrictMode>
        <ViewProvider ownerId="owner-a" slot="normal" storage={storage}>
          <Probe onHandle={(next) => { handle = next; }} />
        </ViewProvider>
      </StrictMode>,
    );
    const firstId = screen.getByTestId("instance").textContent;
    act(() => {
      handle.selectSpot("report-1", { lat: 10, lon: 20 });
    });
    expect(handle.store.getState().interaction.selectedReportId).toBe("report-1");
    rerender(
      <StrictMode>
        <ViewProvider ownerId="owner-b" slot="normal" storage={storage}>
          <Probe onHandle={(next) => { handle = next; }} />
        </ViewProvider>
      </StrictMode>,
    );
    expect(screen.getByTestId("instance").textContent).not.toBe(firstId);
    expect(handle.store.getState().interaction.selectedReportId).toBeNull();
    act(() => {
      handle.selectSpot("report-2", { lat: 11, lon: 21 });
    });
    expect(handle.store.getState().interaction.selectedReportId).toBe("report-2");
  });

  it("unsubscribes after a real unmount", async () => {
    let handle!: ViewScopedStoreHandle;
    const { unmount } = render(
      <StrictMode>
        <ViewProvider ownerId="review" slot="normal" storage={createMemoryWorkingStorage()}>
          <Probe onHandle={(next) => { handle = next; }} />
        </ViewProvider>
      </StrictMode>,
    );
    act(() => {
      handle.selectSpot("report-1", { lat: 10, lon: 20 });
    });
    const last = handle.store.getState().interaction.selectedReportId;
    unmount();
    await Promise.resolve();
    expect(() => handle.selectSpot("report-late", { lat: 1, lon: 2 })).toThrow(/disposed/);
    expect(handle.store.getState().interaction.selectedReportId).toBe(last);
  });
});
