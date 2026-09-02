import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResolvedSpot } from "@/components/map/LiveSpotArcs";
import { useGridActivitySnapshot } from "./useGridActivitySnapshot";

const NOW = Date.UTC(2026, 8, 2, 12, 0, 0);

function expiringSpot(): ResolvedSpot {
  const time = new Date(NOW - 30 * 60_000 + 1_000);
  const originalSpot = {
    id: "expiring",
    source: "Cluster" as const,
    spotter: "W1AAA",
    dx: "K5DX",
    frequency: 14_074,
    mode: "FT8",
    comment: "",
    time,
  };
  return {
    id: originalSpot.id,
    spotterLat: 41.5,
    spotterLon: -73,
    dxLat: 30.5,
    dxLon: -97,
    mode: "FT8",
    frequency: originalSpot.frequency,
    time,
    callsign: originalSpot.dx,
    spotter: originalSpot.spotter,
    source: originalSpot.source,
    spotterLocApprox: false,
    dxLocApprox: false,
    originalSpot,
  };
}

describe("useGridActivitySnapshot", () => {
  afterEach(() => vi.useRealTimers());

  it("wakes at the oldest expiry when the feed remains quiet", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { result } = renderHook(() =>
      useGridActivitySnapshot([expiringSpot()], 4, "dx", true),
    );
    expect(result.current.cells).toHaveLength(1);

    act(() => vi.advanceTimersByTime(1_100));
    expect(result.current.cells).toHaveLength(0);
  });
});
