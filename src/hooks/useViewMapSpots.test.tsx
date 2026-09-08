import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { ViewProvider } from "@/components/views/ViewProvider";
import { createSpotPreferences } from "@/lib/views/defaults";
import { createMemoryWorkingStorage } from "@/lib/views/runtime";
import { SPOT_FIXTURE_NOW_MS } from "@/lib/views/fixtures";
import type { LiveSpot } from "@/types/livespot";
import {
  projectLiveSpotsForView,
  useViewMapSpots,
} from "./useViewMapSpots";
import { clusterSpots } from "@/lib/spots/grouping";

function liveSpot(id: string, overrides: Partial<LiveSpot> = {}): LiveSpot {
  return {
    id,
    spotter: "K1ABC",
    dx: "EA1AAA",
    frequency: 14074,
    mode: "USB",
    comment: "",
    time: new Date(SPOT_FIXTURE_NOW_MS),
    band: "20m",
    source: "PSKReporter",
    dxLat: 40.4,
    dxLon: -3.7,
    ...overrides,
  };
}

describe("projectLiveSpotsForView", () => {
  it("keeps USB under a phone category and applies the map budget after matching", () => {
    const prefs = createSpotPreferences();
    prefs.filters.modes = {
      all: false,
      categories: ["phone"],
      modes: [],
      includeUnknown: false,
      includeInferred: true,
    };
    prefs.filters.spotLimit = 10;
    const spots = [
      liveSpot("usb", { mode: "USB" }),
      liveSpot("cw", { id: "cw", dx: "EA1CW", mode: "CW" }),
      ...Array.from({ length: 12 }, (_, n) =>
        liveSpot(`phone-${n}`, {
          dx: `EA${n}PH`,
          mode: "LSB",
          time: new Date(SPOT_FIXTURE_NOW_MS - n * 1000),
        }),
      ),
    ];
    const result = projectLiveSpotsForView(spots, prefs, SPOT_FIXTURE_NOW_MS);
    expect(result.matching.every((spot) => spot.mode !== "CW")).toBe(true);
    expect(result.matchingCount).toBe(13);
    expect(result.mapBudgeted).toHaveLength(10);
    expect(result.budgetOmittedCount).toBe(3);
    expect(result.mapBudgeted.some((spot) => spot.id === "usb")).toBe(true);
    expect(result.matching.some((spot) => spot.id === "cw")).toBe(false);
  });
});

describe("clusterSpots expansion", () => {
  it("emits Map-these-spots members as singles without changing group identity", () => {
    const spots = [
      liveSpot("es-1", { dx: "EA1AAA" }),
      liveSpot("es-2", { dx: "EA1BBB" }),
      liveSpot("es-3", { dx: "EA1CCC" }),
    ];
    const grouped = clusterSpots(spots, {
      enabled: true,
      minClusterSize: 3,
      detail: "regions",
    });
    expect(grouped.clusters).toHaveLength(1);
    const expanded = clusterSpots(spots, {
      enabled: true,
      minClusterSize: 3,
      detail: "regions",
      expandedIds: [grouped.clusters[0]!.id],
    });
    expect(expanded.clusters).toHaveLength(0);
    expect(expanded.singles.map((spot) => spot.id).sort()).toEqual([
      "es-1",
      "es-2",
      "es-3",
    ]);
    expect(expanded.liveGroupIds).toEqual(grouped.liveGroupIds);
  });
});

describe("useViewMapSpots", () => {
  it("throws without a provider instead of reading mapStore filters", () => {
    expect(() =>
      renderHook(() => useViewMapSpots({ enabled: true })),
    ).toThrow(/no global active view exists/);
  });

  it("mounts inside a bound view", () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <ViewProvider
          ownerId="owner-a"
          slot="normal"
          storage={createMemoryWorkingStorage()}
        >
          {children}
        </ViewProvider>
      </QueryClientProvider>
    );
    const { result } = renderHook(
      () => useViewMapSpots({ enabled: false, grid: "EM10aa" }),
      { wrapper },
    );
    expect(result.current.mapBudget).toBe(50);
    expect(result.current.listTotal).toBe(0);
    expect(result.current.clusters).toEqual([]);
  });
});
