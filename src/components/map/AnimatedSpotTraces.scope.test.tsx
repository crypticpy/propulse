import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveSpot } from "@/types/livespot";
import type { ResolvedSpot } from "./LiveSpotArcs";

const mocks = vi.hoisted(() => ({
  frameCallbacks: [] as Array<(state: unknown) => void>,
  simpleArcCalls: 0,
  hopCalls: 0,
  colorMode: "mode" as "mode" | "band",
  lineColors: [] as string[],
}));

vi.mock("@react-three/fiber", () => ({
  useFrame: (callback: (state: unknown) => void) => {
    mocks.frameCallbacks.push(callback);
  },
}));
vi.mock("@react-three/drei", () => ({
  Line: (props: { color?: string }) => {
    mocks.lineColors.push(String(props.color ?? ""));
    return null;
  },
}));
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
  useUIInteractionPrefs: () => ({ spotColorMode: mocks.colorMode }),
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

function traceCount(container: HTMLElement): number {
  return container.querySelectorAll('group[name="animated-spot-traces"] > group').length;
}

function staticTraceCount(container: HTMLElement): number {
  return container.querySelectorAll('group[name="spot-trace-static"]').length;
}

function motionTraceCount(container: HTMLElement): number {
  return container.querySelectorAll('group[name="spot-trace-motion"]').length;
}

function tick(seconds: number) {
  act(() => {
    for (const callback of mocks.frameCallbacks) {
      callback({
        clock: { getElapsedTime: () => seconds },
      });
    }
  });
}

describe("AnimatedSpotTraces feed scope", () => {
  let visibilityHidden = false;

  beforeEach(() => {
    mocks.frameCallbacks.length = 0;
    mocks.simpleArcCalls = 0;
    mocks.hopCalls = 0;
    mocks.colorMode = "mode";
    mocks.lineColors.length = 0;
    visibilityHidden = false;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => (visibilityHidden ? "hidden" : "visible"),
    });
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

  it("keeps static hydration traces when the hydration scope changes", () => {
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
    expect(traceCount(container)).toBe(1);

    rerender(
      <AnimatedSpotTraces
        feedSpots={[existing, firstNew]}
        candidateSpots={[existing, firstNew]}
        resolvedSpots={[resolvedSpot(existing), resolvedSpot(firstNew)]}
        isFeedReady
        hydrationKey="scope-a"
      />,
    );
    tick(0.2);
    expect(traceCount(container)).toBe(2);

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

    expect(traceCount(container)).toBe(3);
    tick(6);
    expect(traceCount(container)).toBe(3);
  });

  it("re-baselines an expanded snapshot as static when the fetch-limit scope changes", () => {
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
    tick(0.2);

    expect(traceCount(container)).toBe(2);
  });

  it("mounts hydrated traces statically and still reports later arrivals", () => {
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

    expect(onActiveTracesChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: "existing" }),
    ]);
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
    tick(0.2);

    expect(onActiveTracesChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: "existing" }),
      expect.objectContaining({ id: "arriving" }),
    ]);
  });

  it("keeps unknown-direction and off-style paths visible as static traces", () => {
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
    tick(0.2);
    expect(traceCount(container)).toBe(1);

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
    tick(0.3);
    expect(traceCount(container)).toBe(2);
  });

  it("builds simple-arc geometry for background and hops for an overridden selected path", () => {
    const existing = liveSpot("existing");
    const arriving = liveSpot("arriving");
    const report = normalizeLiveSpot(arriving, new Map());
    const directed = report ? pathDescriptorForReport(report) : null;
    expect(directed).not.toBeNull();
    const prefs = createSpotPreferences().paths;
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
          selected: { ...prefs.selected!, shape: "ionospheric-hops", style: "traveling-pulse", repeatSeconds: 3 },
        }}
      />,
    );
    tick(0.2);
    expect(traceCount(container)).toBe(2);
    expect(mocks.hopCalls).toBeGreaterThan(0);
    expect(mocks.simpleArcCalls).toBeGreaterThan(0);

    const hopsAfterFirst = mocks.hopCalls;
    const arcsAfterFirst = mocks.simpleArcCalls;
    tick(0.216);
    tick(0.232);
    expect(mocks.hopCalls).toBe(hopsAfterFirst);
    expect(mocks.simpleArcCalls).toBe(arcsAfterFirst);

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
          selected: {
            ...prefs.selected!,
            shape: "ionospheric-hops",
            style: "traveling-pulse",
            travelSeconds: 1.5,
            repeatSeconds: 8,
          },
        }}
      />,
    );
    tick(0.25);
    expect(traceCount(container)).toBe(2);
  });

  it("keeps static paths when reduced motion is enabled during an active arrival", () => {
    const existing = liveSpot("existing");
    const arriving = liveSpot("arriving");
    const prefs = createSpotPreferences().paths;
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
        feedSpots={[existing, arriving]}
        candidateSpots={[existing, arriving]}
        resolvedSpots={[resolvedSpot(existing), resolvedSpot(arriving)]}
        isFeedReady
        hydrationKey="scope-a"
      />,
    );
    tick(0.2);
    expect(traceCount(container)).toBe(2);
    rerender(
      <AnimatedSpotTraces
        feedSpots={[existing, arriving]}
        candidateSpots={[existing, arriving]}
        resolvedSpots={[resolvedSpot(existing), resolvedSpot(arriving)]}
        isFeedReady
        hydrationKey="scope-a"
        osReducedMotion
        pathPreferences={{ ...prefs, reduceMotion: false }}
      />,
    );
    tick(0.3);
    expect(traceCount(container)).toBe(2);
  });

  it("uses the renderer clock for hide/resume and does not replay a new-spots backlog", () => {
    const existing = liveSpot("existing");
    const arriving = liveSpot("arriving");
    const prefs = createSpotPreferences().paths;
    const { container, rerender } = render(
      <AnimatedSpotTraces
        feedSpots={[existing]}
        candidateSpots={[existing]}
        resolvedSpots={[resolvedSpot(existing)]}
        isFeedReady
        hydrationKey="scope-a"
        pathPreferences={{
          ...prefs,
          animate: "selected-only",
          background: { ...prefs.background, style: "flowing-dashes", travelSeconds: 2.5 },
        }}
      />,
    );
    const report = normalizeLiveSpot(arriving, new Map());
    const directed = report ? pathDescriptorForReport(report) : null;
    rerender(
      <AnimatedSpotTraces
        feedSpots={[existing, arriving]}
        candidateSpots={[existing, arriving]}
        resolvedSpots={[resolvedSpot(existing), resolvedSpot(arriving)]}
        isFeedReady
        hydrationKey="scope-a"
        selectedPathId={directed?.id ?? null}
        pathPreferences={{
          ...prefs,
          animate: "selected-only",
          background: { ...prefs.background, style: "flowing-dashes", travelSeconds: 2.5 },
        }}
      />,
    );
    tick(0.2);
    expect(traceCount(container)).toBe(2);

    visibilityHidden = true;
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(traceCount(container)).toBe(2);

    visibilityHidden = false;
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    tick(0.3);
    expect(traceCount(container)).toBe(2);

    const late = liveSpot("late-hidden");
    rerender(
      <AnimatedSpotTraces
        feedSpots={[existing, arriving, late]}
        candidateSpots={[existing, arriving, late]}
        resolvedSpots={[
          resolvedSpot(existing),
          resolvedSpot(arriving),
          resolvedSpot(late),
        ]}
        isFeedReady
        hydrationKey="scope-a"
        selectedPathId={directed?.id ?? null}
        pathPreferences={{
          ...prefs,
          animate: "new-spots",
        }}
      />,
    );
    visibilityHidden = true;
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    visibilityHidden = false;
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    tick(0.4);
    expect(traceCount(container)).toBe(3);
  });

  it("keeps the first hydration static for new-spots, selected-only, and all-displayed", () => {
    const spots = [liveSpot("a"), liveSpot("b"), liveSpot("c")];
    const resolved = spots.map(resolvedSpot);
    const prefs = createSpotPreferences().paths;
    const policies: Array<typeof prefs> = [
      { ...prefs, animate: "new-spots" },
      { ...prefs, animate: "selected-only" },
      {
        ...prefs,
        animate: "all-displayed",
        background: { ...prefs.background, style: "traveling-pulse", travelSeconds: 1.5, repeatSeconds: 3 },
      },
    ];
    for (const pathPreferences of policies) {
      mocks.frameCallbacks.length = 0;
      const { container, unmount } = render(
        <AnimatedSpotTraces
          feedSpots={spots}
          candidateSpots={spots}
          resolvedSpots={resolved}
          isFeedReady
          hydrationKey={`hydrate-${pathPreferences.animate}`}
          pathPreferences={pathPreferences}
        />,
      );
      expect(traceCount(container)).toBe(3);
      expect(staticTraceCount(container)).toBe(3);
      expect(motionTraceCount(container)).toBe(0);
      unmount();
    }

    const { container, rerender } = render(
      <AnimatedSpotTraces
        feedSpots={spots}
        candidateSpots={spots}
        resolvedSpots={resolved}
        isFeedReady
        hydrationKey="all-displayed-later"
        pathPreferences={policies[2]}
      />,
    );
    expect(staticTraceCount(container)).toBe(3);
    tick(0.2);
    expect(traceCount(container)).toBe(3);

    rerender(
      <AnimatedSpotTraces
        feedSpots={spots}
        candidateSpots={spots}
        resolvedSpots={resolved}
        isFeedReady
        hydrationKey="all-displayed-later"
        osReducedMotion
        pathPreferences={{ ...policies[2], reduceMotion: false }}
      />,
    );
    tick(0.3);
    expect(traceCount(container)).toBe(3);
    expect(staticTraceCount(container)).toBe(3);
  });

  it("does not promote queued traces after switching to selected-only with none selected", () => {
    const spots = [liveSpot("0"), liveSpot("1"), liveSpot("2")];
    const prefs = createSpotPreferences().paths;
    const { container, rerender } = render(
      <AnimatedSpotTraces
        feedSpots={[]}
        candidateSpots={[]}
        resolvedSpots={[]}
        isFeedReady
        hydrationKey="policy-queue"
        pathPreferences={{ ...prefs, animate: "new-spots", maxActive: 1 }}
      />,
    );
    rerender(
      <AnimatedSpotTraces
        feedSpots={spots}
        candidateSpots={spots}
        resolvedSpots={spots.map(resolvedSpot)}
        isFeedReady
        hydrationKey="policy-queue"
        pathPreferences={{ ...prefs, animate: "new-spots", maxActive: 1 }}
      />,
    );
    tick(0.2);
    expect(traceCount(container)).toBe(3);
    rerender(
      <AnimatedSpotTraces
        feedSpots={spots}
        candidateSpots={spots}
        resolvedSpots={spots.map(resolvedSpot)}
        isFeedReady
        hydrationKey="policy-queue"
        pathPreferences={{ ...prefs, animate: "selected-only", maxActive: 1 }}
      />,
    );
    tick(0.3);
    expect(traceCount(container)).toBe(3);
    expect(staticTraceCount(container)).toBe(3);
    expect(motionTraceCount(container)).toBe(0);
  });

  it("refreshes color and source data without a per-frame geometry rebuild", () => {
    const existing = liveSpot("existing");
    const report = normalizeLiveSpot(existing, new Map());
    const directed = report ? pathDescriptorForReport(report) : null;
    expect(directed).not.toBeNull();
    const { rerender } = render(
      <AnimatedSpotTraces
        feedSpots={[existing]}
        candidateSpots={[existing]}
        resolvedSpots={[resolvedSpot(existing)]}
        isFeedReady
        hydrationKey="drawing"
        scenePaths={[directed!]}
      />,
    );
    tick(0.05);
    expect(mocks.lineColors).toContain("#44DDFF");
    const hopsAfterFirst = mocks.hopCalls;
    const arcsAfterFirst = mocks.simpleArcCalls;
    tick(0.066);
    tick(0.082);
    expect(mocks.hopCalls).toBe(hopsAfterFirst);
    expect(mocks.simpleArcCalls).toBe(arcsAfterFirst);

    mocks.lineColors.length = 0;
    mocks.colorMode = "band";
    rerender(
      <AnimatedSpotTraces
        feedSpots={[existing]}
        candidateSpots={[existing]}
        resolvedSpots={[resolvedSpot(existing)]}
        isFeedReady
        hydrationKey="drawing"
        scenePaths={[directed!]}
      />,
    );
    tick(0.1);
    expect(mocks.lineColors).toContain("#66ff99");
    expect(mocks.hopCalls).toBe(hopsAfterFirst);
    expect(mocks.simpleArcCalls).toBe(arcsAfterFirst);

    rerender(
      <AnimatedSpotTraces
        feedSpots={[{ ...existing, comment: "enriched-source" }]}
        candidateSpots={[{ ...existing, comment: "enriched-source" }]}
        resolvedSpots={[{ ...resolvedSpot(existing), callsign: "ENRICHED", dxLocApprox: true }]}
        isFeedReady
        hydrationKey="drawing"
        scenePaths={[directed!]}
      />,
    );
    tick(0.12);
    expect(mocks.hopCalls).toBe(hopsAfterFirst);
    expect(mocks.simpleArcCalls).toBe(arcsAfterFirst);

    const movedPath = pathDescriptorSchema.parse({
      ...directed!,
      from: {
        ...directed!.from,
        location: { kind: "reported-coordinate", coordinates: { lat: -30, lon: -50 } },
      },
    });
    rerender(
      <AnimatedSpotTraces
        feedSpots={[{ ...existing, dxLat: -30, dxLon: -50 }]}
        candidateSpots={[{ ...existing, dxLat: -30, dxLon: -50 }]}
        resolvedSpots={[{ ...resolvedSpot(existing), dxLat: -30, dxLon: -50, callsign: "ENRICHED" }]}
        isFeedReady
        hydrationKey="drawing"
        scenePaths={[movedPath]}
      />,
    );
    tick(0.14);
    expect(mocks.simpleArcCalls + mocks.hopCalls).toBeGreaterThan(hopsAfterFirst + arcsAfterFirst);
  });
});
