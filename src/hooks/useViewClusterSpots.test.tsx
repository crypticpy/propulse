import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { useLayoutEffect, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ViewProvider } from "@/components/views/ViewProvider";
import { useViewRuntime } from "@/components/views/ViewRuntimeContext";
import { createMemoryWorkingStorage } from "@/lib/views/runtime";
import type { DXClusterFilters } from "@/types/dxcluster";
import { ingestOperatingMonitorReportForTests, resetOperatingMonitorForTests } from "./useOperatingMonitor";
import { useViewClusterSpots } from "./useViewClusterSpots";

const captured: { filters?: DXClusterFilters } = {};

vi.mock("@/hooks/useDXCluster", () => ({
  useDXCluster: (filters?: DXClusterFilters) => {
    captured.filters = filters;
    return { spots: [], allSpots: [] };
  },
}));

function FollowProbe() {
  const runtime = useViewRuntime();
  useLayoutEffect(() => {
    runtime.updateWorkingView({
      context: { ...runtime.getSnapshot().config.context, followRadio: true },
    });
  }, [runtime]);
  useViewClusterSpots();
  return (
    <span data-testid="bands">
      {runtime.getSnapshot().config.spots.filters.bands.join(",") || "none"}
    </span>
  );
}

function wrapper(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <ViewProvider ownerId="owner-a" slot="normal" storage={createMemoryWorkingStorage()}>
        {children}
      </ViewProvider>
    </QueryClientProvider>
  );
}

describe("useViewClusterSpots", () => {
  beforeEach(() => {
    captured.filters = undefined;
    resetOperatingMonitorForTests();
    ingestOperatingMonitorReportForTests({
      sender: "test-rig",
      band: "20m",
      mode: "CW",
      frequency: 14074,
    });
  });

  it("passes derived follow filters without rewriting saved intent", async () => {
    render(wrapper(<FollowProbe />));
    await waitFor(() => {
      expect(captured.filters?.bands).toEqual(["20m"]);
    });
    expect(captured.filters?.modes).toEqual(["CW"]);
    expect(screen.getByTestId("bands").textContent).toBe("none");
  });
});
