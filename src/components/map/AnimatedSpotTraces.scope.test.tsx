import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveSpot } from "@/types/livespot";
import type { ResolvedSpot } from "./LiveSpotArcs";

const mocks = vi.hoisted(() => ({
  frameCallbacks: [] as Array<(state: unknown) => void>,
}));

vi.mock("@react-three/fiber", () => ({
  useFrame: (callback: (state: unknown) => void) => {
    mocks.frameCallbacks.push(callback);
  },
}));
vi.mock("@react-three/drei", () => ({ Line: () => null }));
vi.mock("@/hooks/useLiveSpots", () => ({
  useLiveSpots: () => ({
    spots: [],
    isLoading: false,
    isFeedReady: false,
    isError: false,
    spotsBySource: {},
    refetch: vi.fn(),
  }),
}));
vi.mock("@/stores/userStore", () => ({
  useUIInteractionPrefs: () => ({ spotColorMode: "mode" }),
}));
vi.mock("@/hooks/useGlobeOcclusionBatch", () => ({
  useGlobeOcclusionBatch: () => ({ getOpacity: () => 1 }),
}));
vi.mock("@/lib/utils/arcHeight", () => ({
  getMultiHopArcPoints: () => [
    [1, 0, 0],
    [0, 1, 0],
  ],
}));

import { AnimatedSpotTraces } from "./AnimatedSpotTraces";

function liveSpot(id: string): LiveSpot {
  return {
    id,
    spotter: "K1ABC",
    dx: `DX-${id}`,
    frequency: 14_074,
    mode: "FT8",
    comment: "",
    time: new Date("2026-08-31T12:00:00Z"),
    band: "20m",
    source: "PSKReporter",
  };
}

function resolvedSpot(spot: LiveSpot): ResolvedSpot {
  return {
    id: spot.id,
    spotterLat: 42,
    spotterLon: -71,
    dxLat: -22.5,
    dxLon: -43,
    mode: spot.mode ?? "",
    frequency: spot.frequency,
    time: spot.time,
    callsign: spot.dx,
    spotter: spot.spotter,
    source: spot.source,
    spotterLocApprox: false,
    dxLocApprox: false,
  };
}

describe("AnimatedSpotTraces feed scope", () => {
  beforeEach(() => {
    mocks.frameCallbacks.length = 0;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it("clears active and pending traces when the hydration scope changes", () => {
    const existing = liveSpot("existing");
    const firstNew = liveSpot("first-new");
    const pendingNew = liveSpot("pending-new");
    const { container, rerender } = render(
      <AnimatedSpotTraces
        feedSpots={[existing]}
        candidateSpots={[existing]}
        resolvedSpots={[resolvedSpot(existing)]}
        isFeedReady
        hydrationKey="scope-a"
      />,
    );

    rerender(
      <AnimatedSpotTraces
        feedSpots={[existing, firstNew]}
        candidateSpots={[existing, firstNew]}
        resolvedSpots={[resolvedSpot(existing), resolvedSpot(firstNew)]}
        isFeedReady
        hydrationKey="scope-a"
      />,
    );
    act(() => {
      mocks.frameCallbacks[0]({
        clock: { getElapsedTime: () => 3 },
      });
    });
    expect(
      container.querySelectorAll('group[name="animated-spot-traces"] > group'),
    ).toHaveLength(1);

    rerender(
      <AnimatedSpotTraces
        feedSpots={[existing, firstNew, pendingNew]}
        candidateSpots={[existing, firstNew, pendingNew]}
        resolvedSpots={[
          resolvedSpot(existing),
          resolvedSpot(firstNew),
          resolvedSpot(pendingNew),
        ]}
        isFeedReady
        hydrationKey="scope-a"
      />,
    );
    rerender(
      <AnimatedSpotTraces
        feedSpots={[existing, firstNew, pendingNew]}
        candidateSpots={[existing, firstNew, pendingNew]}
        resolvedSpots={[
          resolvedSpot(existing),
          resolvedSpot(firstNew),
          resolvedSpot(pendingNew),
        ]}
        isFeedReady
        hydrationKey="scope-b"
      />,
    );

    expect(
      container.querySelectorAll('group[name="animated-spot-traces"] > group'),
    ).toHaveLength(0);
    act(() => {
      mocks.frameCallbacks[0]({
        clock: { getElapsedTime: () => 6 },
      });
    });
    expect(
      container.querySelectorAll('group[name="animated-spot-traces"] > group'),
    ).toHaveLength(0);
  });
});
