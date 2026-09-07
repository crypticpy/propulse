import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveSpot } from "@/types/livespot";
import type { ResolvedSpot } from "./LiveSpotArcs";

const mocks = vi.hoisted(() => ({
  frameCallbacks: [] as Array<(state: unknown) => void>,
  simpleArcCalls: 0,
  hopCalls: 0,
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
    feedScopeKey: "test-scope",
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
  getArcHeightForBand: () => 1.2,
  getArcPointsWithHeight: () => {
    mocks.simpleArcCalls += 1;
    return [
      [1, 0, 0],
      [0, 1, 0],
    ];
  },
  getMultiHopArcPoints: () => {
    mocks.hopCalls += 1;
    return [
      [1, 0, 0],
      [0, 1, 0],
    ];
  },
}));

import { AnimatedSpotTraces } from "./AnimatedSpotTraces";
import { normalizeLiveSpot, pathDescriptorForReport } from "@/lib/spots/presentation";
import { createSpotPreferences } from "@/lib/views/defaults";
import { pathDescriptorSchema } from "@/lib/views/spotContracts";

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
    spotterLat: 42,
    spotterLon: -71,
    dxLat: -22.5,
    dxLon: -43,
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
    originalSpot: spot,
  };
}

describe("AnimatedSpotTraces feed scope", () => {
  beforeEach(() => {
    mocks.frameCallbacks.length = 0;
    mocks.simpleArcCalls = 0;
    mocks.hopCalls = 0;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    });
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
        clock: { getElapsedTime: () => 0.2 },
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

  it("re-baselines an expanded snapshot when the fetch-limit scope changes", () => {
    const existing = liveSpot("existing");
    const expandedHistory = liveSpot("expanded-history");
    const { container, rerender } = render(
      <AnimatedSpotTraces
        feedSpots={[existing]}
        candidateSpots={[existing]}
        resolvedSpots={[resolvedSpot(existing)]}
        isFeedReady
        hydrationKey='{"spotLimit":50}'
      />,
    );

    rerender(
      <AnimatedSpotTraces
        feedSpots={[existing, expandedHistory]}
        candidateSpots={[existing, expandedHistory]}
        resolvedSpots={[
          resolvedSpot(existing),
          resolvedSpot(expandedHistory),
        ]}
        isFeedReady
        hydrationKey='{"spotLimit":200}'
      />,
    );
    act(() => {
      mocks.frameCallbacks[0]({
        clock: { getElapsedTime: () => 0.2 },
      });
    });

    expect(
      container.querySelectorAll('group[name="animated-spot-traces"] > group'),
    ).toHaveLength(0);
  });

  it("reports only trace lifecycles that became active after hydration", () => {
    const existing = liveSpot("existing");
    const arriving = liveSpot("arriving");
    const onActiveTracesChange = vi.fn();
    const { rerender } = render(
      <AnimatedSpotTraces
        feedSpots={[existing]}
        candidateSpots={[existing]}
        resolvedSpots={[resolvedSpot(existing)]}
        isFeedReady
        hydrationKey="scope-a"
        onActiveTracesChange={onActiveTracesChange}
      />,
    );

    expect(onActiveTracesChange).toHaveBeenLastCalledWith([]);
    rerender(
      <AnimatedSpotTraces
        feedSpots={[existing, arriving]}
        candidateSpots={[existing, arriving]}
        resolvedSpots={[resolvedSpot(existing), resolvedSpot(arriving)]}
        isFeedReady
        hydrationKey="scope-a"
        onActiveTracesChange={onActiveTracesChange}
      />,
    );
    act(() => {
      mocks.frameCallbacks[0]({
        clock: { getElapsedTime: () => 0.2 },
      });
    });

    expect(onActiveTracesChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: "arriving" }),
    ]);
  });

  it("keeps unknown-direction and off-style arrivals static", () => {
    const existing = liveSpot("existing");
    const arriving = liveSpot("arriving");
    const report = normalizeLiveSpot(arriving, new Map());
    const directed = report ? pathDescriptorForReport(report) : null;
    expect(directed).not.toBeNull();
    const unknown = pathDescriptorSchema.parse({
      ...directed!,
      direction: "unknown",
      to: { ...directed!.to, role: "posting-service" },
    });
    const { container, rerender } = render(
      <AnimatedSpotTraces
        feedSpots={[existing]}
        candidateSpots={[existing]}
        resolvedSpots={[resolvedSpot(existing)]}
        isFeedReady
        hydrationKey="scope-a"
        scenePaths={[unknown]}
      />,
    );
    rerender(
      <AnimatedSpotTraces
        feedSpots={[existing, arriving]}
        candidateSpots={[existing, arriving]}
        resolvedSpots={[resolvedSpot(existing), resolvedSpot(arriving)]}
        isFeedReady
        hydrationKey="scope-a"
        scenePaths={[unknown]}
      />,
    );
    act(() => {
      mocks.frameCallbacks[0]({
        clock: { getElapsedTime: () => 0.2 },
      });
    });
    expect(
      container.querySelectorAll('group[name="animated-spot-traces"] > group'),
    ).toHaveLength(0);

    const offPrefs = createSpotPreferences().paths;
    rerender(
      <AnimatedSpotTraces
        feedSpots={[existing, arriving]}
        candidateSpots={[existing, arriving]}
        resolvedSpots={[resolvedSpot(existing), resolvedSpot(arriving)]}
        isFeedReady
        hydrationKey="scope-a"
        pathPreferences={{
          ...offPrefs,
          background: { ...offPrefs.background, style: "off" },
          selected: null,
        }}
      />,
    );
    act(() => {
      mocks.frameCallbacks[0]({
        clock: { getElapsedTime: () => 0.3 },
      });
    });
    expect(
      container.querySelectorAll('group[name="animated-spot-traces"] > group'),
    ).toHaveLength(0);
  });

  it("builds simple-arc geometry for background and hops for an overridden selected path", () => {
    const existing = liveSpot("existing");
    const arriving = liveSpot("arriving");
    const report = normalizeLiveSpot(arriving, new Map());
    const directed = report ? pathDescriptorForReport(report) : null;
    expect(directed).not.toBeNull();
    const prefs = createSpotPreferences().paths;
    const { rerender } = render(
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
        feedSpots={[existing, arriving]}
        candidateSpots={[existing, arriving]}
        resolvedSpots={[resolvedSpot(existing), resolvedSpot(arriving)]}
        isFeedReady
        hydrationKey="scope-a"
        selectedPathId={directed!.id}
        pathPreferences={{
          ...prefs,
          animate: "selected-only",
          background: { ...prefs.background, shape: "simple-arc", style: "quick-sweep" },
          selected: { ...prefs.selected!, shape: "ionospheric-hops", style: "traveling-pulse" },
        }}
      />,
    );
    act(() => {
      mocks.frameCallbacks[0]({
        clock: { getElapsedTime: () => 0.2 },
      });
    });
    expect(mocks.hopCalls).toBeGreaterThan(0);
    expect(mocks.simpleArcCalls).toBe(0);
  });
});
