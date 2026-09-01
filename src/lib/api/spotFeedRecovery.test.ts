import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { reconcileTraceFeed } from "@/lib/map/spotTraceLifecycle";
import { fetchRBNSpots } from "./rbn";

afterEach(() => vi.unstubAllGlobals());

describe("spot feed query recovery", () => {
  it("keeps readiness false after an unavailable 200 and baselines recovery", async () => {
    let available = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        if (!available) {
          return new Response(
            JSON.stringify({
              spots: [],
              meta: { status: "unavailable" },
            }),
            { status: 200 },
          );
        }
        return new Response(
          JSON.stringify({
            spots: [
              {
                callsign: "K0ABC",
                de_cont: "NA",
                de_pfx: "N0XYZ",
                dx_cont: "NA",
                dx_pfx: "K0",
                freq: 14_074,
                band: 20,
                mode: "CW",
                db: 12,
                wpm: 24,
                time: 1_788_000_000,
                spotted_time: "2026-08-29T00:00:00Z",
              },
            ],
            meta: { status: "ok" },
          }),
          { status: 200 },
        );
      }),
    );

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const queryKey = ["liveSpots", "rbn", 50] as const;
    const queryFn = () => fetchRBNSpots(50);

    await expect(queryClient.fetchQuery({ queryKey, queryFn })).rejects.toThrow(
      /unavailable/i,
    );
    const failedState = queryClient.getQueryState(queryKey)!;
    expect(failedState.status).toBe("error");
    expect(failedState.dataUpdatedAt).toBe(0);
    const failedHydration = reconcileTraceFeed(
      new Set(),
      false,
      failedState.dataUpdatedAt > 0,
      [],
      new Set(),
    );
    expect(failedHydration.hydrated).toBe(false);

    available = true;
    const recoveredSpots = await queryClient.fetchQuery({ queryKey, queryFn });
    const recoveredState = queryClient.getQueryState(queryKey)!;
    expect(recoveredState.status).toBe("success");
    expect(recoveredState.dataUpdatedAt).toBeGreaterThan(0);
    const recoveredHydration = reconcileTraceFeed(
      failedHydration.seenIds,
      failedHydration.hydrated,
      recoveredState.dataUpdatedAt > 0,
      recoveredSpots.map(({ id }) => id),
      new Set(recoveredSpots.map(({ id }) => id)),
    );
    expect(recoveredHydration.hydrated).toBe(true);
    expect(recoveredHydration.newEligibleIds).toEqual([]);
    expect(recoveredHydration.seenIds).toEqual(
      new Set(recoveredSpots.map(({ id }) => id)),
    );
  });
});
