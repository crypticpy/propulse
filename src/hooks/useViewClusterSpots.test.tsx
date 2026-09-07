import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, renderHook, screen, waitFor } from "@testing-library/react";
import { useLayoutEffect, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ViewProvider } from "@/components/views/ViewProvider";
import { useViewRuntime } from "@/components/views/ViewRuntimeContext";
import { createViewConfiguration } from "@/lib/views/defaults";
import { createMemoryWorkingStorage } from "@/lib/views/runtime";
import { useDXStore } from "@/stores/dxStore";
import { useUserStore } from "@/stores/userStore";
import type { DXSpot } from "@/types/dxcluster";
import type { SpotSource } from "@/types/livespot";
import {
  ingestOperatingMonitorReportForTests,
  resetOperatingMonitorForTests,
} from "./useOperatingMonitor";
import { useViewClusterSpots } from "./useViewClusterSpots";

vi.mock("@/hooks/useBridge", () => ({
  useBridge: () => ({ connected: true, lastMessage: null, send: vi.fn() }),
}));

vi.mock("@/lib/api/dxcluster", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/api/dxcluster")>(),
  fetchClusterFeed: vi.fn(() => new Promise(() => undefined)),
}));

const originalDx = useDXStore.getState();
const originalUser = useUserStore.getState();

function dxRow(
  id: string,
  overrides: Partial<DXSpot> & {
    source?: SpotSource;
    modeProvenance?: "reported" | "inferred" | "unknown";
  } = {},
): DXSpot {
  return {
    id,
    dx: "K1ABC",
    spotter: "K2ABC",
    frequency: 14000,
    comment: "",
    time: new Date(),
    band: "20m",
    mode: "USB",
    ...overrides,
  };
}

function plant(spots: DXSpot[]) {
  useDXStore.setState({
    ...originalDx,
    spots,
    spotSource: "bridge",
    filters: { maxAge: 30 },
  });
}

function wrapperFor(seed = createViewConfiguration(), ownerId = "owner-a") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <ViewProvider ownerId={ownerId} slot="normal" seed={seed} storage={createMemoryWorkingStorage()}>
          {children}
        </ViewProvider>
      </QueryClientProvider>
    );
  };
}

function FollowProbe() {
  const runtime = useViewRuntime();
  const cluster = useViewClusterSpots();
  useLayoutEffect(() => {
    runtime.updateWorkingView({
      context: { ...runtime.getSnapshot().config.context, followRadio: true },
    });
  }, [runtime]);
  return (
    <>
      <span data-testid="bands">
        {runtime.getSnapshot().config.spots.filters.bands.join(",") || "none"}
      </span>
      <span data-testid="modes">{cluster.spots.map((spot) => spot.mode).join(",")}</span>
      <span data-testid="store-count">{useDXStore.getState().spots.length}</span>
    </>
  );
}

describe("useViewClusterSpots", () => {
  beforeEach(() => {
    resetOperatingMonitorForTests();
    plant([]);
    useUserStore.setState({
      preferences: { ...originalUser.preferences, bridgeEnabled: true },
    });
  });

  afterEach(() => {
    resetOperatingMonitorForTests();
    useDXStore.setState(originalDx);
    useUserStore.setState(originalUser);
  });

  it("keeps USB under a phone category and leaves shared ingest untouched", () => {
    const seed = createViewConfiguration();
    seed.spots.filters.modes = {
      all: false,
      categories: ["phone"],
      modes: [],
      includeUnknown: false,
      includeInferred: true,
    };
    const ingested = [dxRow("USB", { mode: "USB" }), dxRow("CW", { mode: "CW" })];
    plant(ingested);
    const rendered = renderHook(() => useViewClusterSpots(), { wrapper: wrapperFor(seed, "review") });
    expect(rendered.result.current.spots.map((spot) => spot.mode)).toEqual(["USB"]);
    expect(useDXStore.getState().spots.map((spot) => spot.mode)).toEqual(["USB", "CW"]);
    rendered.unmount();
  });

  it("keeps USB when the scoped filter is explicit SSB", () => {
    const seed = createViewConfiguration();
    seed.spots.filters.modes = {
      all: false,
      categories: [],
      modes: ["SSB"],
      includeUnknown: false,
      includeInferred: true,
    };
    plant([dxRow("USB", { mode: "USB" })]);
    const rendered = renderHook(() => useViewClusterSpots(), {
      wrapper: wrapperFor(seed, "review-2"),
    });
    expect(rendered.result.current.spots.map((spot) => spot.mode)).toEqual(["USB"]);
    rendered.unmount();
  });

  it("applies unknown and inferred flags after ingest", () => {
    const seed = createViewConfiguration();
    seed.spots.filters.modes = {
      all: false,
      categories: ["phone"],
      modes: [],
      includeUnknown: false,
      includeInferred: false,
    };
    plant([
      dxRow("blank", { mode: "" }),
      dxRow("inferred", { mode: "USB", modeProvenance: "inferred" }),
      dxRow("usb", { mode: "USB" }),
    ]);
    const hidden = renderHook(() => useViewClusterSpots(), { wrapper: wrapperFor(seed, "flags-off") });
    expect(hidden.result.current.spots.map((spot) => spot.id)).toEqual(["usb"]);
    hidden.unmount();

    seed.spots.filters.modes.includeUnknown = true;
    seed.spots.filters.modes.includeInferred = true;
    const shown = renderHook(() => useViewClusterSpots(), { wrapper: wrapperFor(seed, "flags-on") });
    expect(shown.result.current.spots.map((spot) => spot.id).sort()).toEqual([
      "blank",
      "inferred",
      "usb",
    ]);
    shown.unmount();
  });

  it("selects authorized sources and distinguishes list totals from the map budget", () => {
    const seed = createViewConfiguration();
    seed.spots.filters.sources = ["RBN"];
    seed.spots.filters.spotLimit = 10;
    const rows = [
      dxRow("cluster", { mode: "CW", source: "Cluster" }),
      ...Array.from({ length: 12 }, (_, index) => dxRow(`rbn-${index}`, {
        mode: "CW",
        source: "RBN",
        time: new Date(Date.now() - index * 1000),
      })),
    ];
    plant(rows);
    const rendered = renderHook(() => useViewClusterSpots(), { wrapper: wrapperFor(seed, "budget") });
    expect(rendered.result.current.spots).toHaveLength(12);
    expect(rendered.result.current.listTotal).toBe(12);
    expect(rendered.result.current.mapSpots).toHaveLength(10);
    expect(rendered.result.current.mapBudget).toBe(10);
    expect(rendered.result.current.spots.some((spot) => spot.id === "cluster")).toBe(false);
    expect(useDXStore.getState().spots).toHaveLength(13);
    rendered.unmount();
  });

  it("passes derived follow filters without rewriting saved intent or ingest rows", async () => {
    ingestOperatingMonitorReportForTests({
      sender: "test-rig",
      band: "20m",
      mode: "CW",
      frequency: 14074,
    });
    plant([
      dxRow("cw20", { mode: "CW", band: "20m" }),
      dxRow("usb20", { mode: "USB", band: "20m" }),
      dxRow("cw40", { mode: "CW", band: "40m" }),
    ]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ViewProvider ownerId="owner-a" slot="normal" storage={createMemoryWorkingStorage()}>
          <FollowProbe />
        </ViewProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("modes").textContent).toBe("CW");
    });
    expect(screen.getByTestId("bands").textContent).toBe("none");
    expect(screen.getByTestId("store-count").textContent).toBe("3");
  });

  it("drops invalid and far-future rows while keeping bridge clock-skew within tolerance", () => {
    const seed = createViewConfiguration();
    const now = Date.now();
    plant([
      dxRow("ok", { time: new Date(now) }),
      dxRow("invalid", { time: new Date("invalid") }),
      dxRow("future", { time: new Date(now + 86_400_000) }),
      dxRow("skew", { time: new Date(now + 30_000) }),
    ]);
    const rendered = renderHook(() => useViewClusterSpots(), { wrapper: wrapperFor(seed, "clock") });
    expect(rendered.result.current.spots.map((spot) => spot.id).sort()).toEqual(["ok", "skew"]);
    rendered.unmount();
  });
});
