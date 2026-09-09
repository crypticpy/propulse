/**
 * Flat-map geographic grouping (#746).
 *
 * `FlatMapView` paints onto a 2D canvas, so "is this spot drawn as a dot" is a
 * question about canvas operations. jsdom stubs `getContext`, so the real
 * component is mounted against a recording context and the recorded ops are
 * the assertion surface. The grouping fixture is produced by the production
 * `clusterSpots`, not by hand, so the cluster ids, anchors and membership are
 * the same values the running app would carry.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ViewProvider } from "@/components/views/ViewProvider";
import { createMemoryWorkingStorage } from "@/lib/views/runtime";
import { clusterSpots } from "@/lib/spots/grouping";
import type { ResolvedSpot } from "@/components/map/LiveSpotArcs";
import type { LiveSpot } from "@/types/livespot";

const expandGroup = vi.fn();

function liveSpot(
  id: string,
  dx: string,
  dxLat: number,
  dxLon: number,
): LiveSpot {
  return {
    id,
    spotter: "K1ABC",
    spotterLat: 42.36,
    spotterLon: -71.06,
    dx,
    dxLat,
    dxLon,
    frequency: 14074,
    mode: "FT8",
    comment: "",
    time: new Date("2026-09-09T12:00:00Z"),
    source: "PSKReporter",
  } as LiveSpot;
}

function resolve(spot: LiveSpot): ResolvedSpot {
  return {
    id: spot.id,
    spotterLat: spot.spotterLat!,
    spotterLon: spot.spotterLon!,
    dxLat: spot.dxLat!,
    dxLon: spot.dxLon!,
    mode: spot.mode!,
    frequency: spot.frequency,
    time: spot.time as Date,
    callsign: spot.dx,
    spotter: spot.spotter,
    source: spot.source,
    spotterLocApprox: false,
    dxLocApprox: false,
    originalSpot: spot,
  };
}

// Three reports inside Spain form one region group at the default
// `minGroupSize: 3`; the Japanese report stays a single.
const GROUPED = [
  liveSpot("ea-1", "EA1AAA", 40.4, -3.7),
  liveSpot("ea-2", "EA3BBB", 41.4, 2.2),
  liveSpot("ea-3", "EA7CCC", 37.4, -6.0),
];
const SINGLE = liveSpot("ja-1", "JA1DDD", 35.7, 139.7);
const ALL = [...GROUPED, SINGLE];

const grouped = clusterSpots(ALL, {
  enabled: true,
  minClusterSize: 3,
  detail: "regions",
});

const resolvedById = new Map(ALL.map((spot) => [spot.id, resolve(spot)]));

vi.mock("@/hooks/useViewMapSpots", () => ({
  useViewMapSpots: () => ({
    spots: ALL,
    candidateSpots: ALL,
    resolvedSpots: ALL.map((spot) => resolvedById.get(spot.id)!),
    resolvedSingles: grouped.singles.map((spot) => resolvedById.get(spot.id)!),
    allResolvedSpots: ALL.map((spot) => resolvedById.get(spot.id)!),
    activationSpots: [],
    clusters: grouped.clusters,
    singles: grouped.singles,
    groupingEnabled: true,
    expandGroup,
    isLoading: false,
    isFeedReady: true,
    feedScopeKey: "test",
    listTotal: ALL.length,
    mapBudget: 500,
    matchingCount: ALL.length,
    mappedCount: ALL.length,
    unlocatedCount: 0,
    budgetOmittedCount: 0,
  }),
}));

interface CanvasOp {
  name: string;
  args: number[];
  text?: string;
}

const ops: CanvasOp[] = [];

const STUB_RECT: DOMRect = {
  x: 0,
  y: 0,
  top: 0,
  left: 0,
  right: 1024,
  bottom: 512,
  width: 1024,
  height: 512,
  toJSON: () => ({}),
};

class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function installCanvasRecorder() {
  ops.length = 0;
  const context = new Proxy(
    {},
    {
      get: (_target, prop: string) => {
        if (prop === "canvas") return { width: 1024, height: 512 };
        return (...args: unknown[]) => {
          if (prop === "fillText") {
            ops.push({
              name: prop,
              text: String(args[0]),
              args: args.slice(1).map(Number),
            });
          } else {
            ops.push({ name: prop, args: args.map(Number) });
          }
          if (prop === "measureText") return { width: 10 };
          if (
            prop === "createLinearGradient" ||
            prop === "createRadialGradient"
          ) {
            return { addColorStop: () => {} };
          }
          if (prop === "getImageData")
            return { data: new Uint8ClampedArray(4) };
          return undefined;
        };
      },
      set: () => true,
    },
  );
  HTMLCanvasElement.prototype.getContext = vi.fn(() => context) as never;
}

/** Same equirectangular mapping `FlatMapView.latLonToCanvas` uses. */
function toCanvas(lat: number, lon: number) {
  return { x: ((lon + 180) / 360) * 1024, y: ((90 - lat) / 180) * 512 };
}

/**
 * `drawSpotArc` paints the DX endpoint at 4px (5.5px for the outer ring) at
 * scale 1; a group glyph is >=10px. Spain's group anchor lands within a pixel
 * of the Madrid member, so the two are told apart by radius, not position.
 */
const ENDPOINT_MAX_RADIUS = 9;
const GLYPH_MIN_RADIUS = 10;

function arcsNear(
  point: { x: number; y: number },
  bounds: { minRadius?: number; maxRadius?: number } = {},
  tolerance = 1.5,
) {
  const { minRadius = 0, maxRadius = Number.POSITIVE_INFINITY } = bounds;
  return ops.filter(
    (op) =>
      op.name === "arc" &&
      Math.hypot(op.args[0] - point.x, op.args[1] - point.y) <= tolerance &&
      op.args[2] >= minRadius &&
      op.args[2] <= maxRadius,
  );
}

async function mount() {
  installCanvasRecorder();
  const { FlatMapView } = await import("@/components/map/FlatMapView");
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ViewProvider
        ownerId="flat-grouping-test"
        slot="normal"
        storage={createMemoryWorkingStorage()}
      >
        <FlatMapView displayTime={new Date("2026-09-09T12:00:00Z")} />
      </ViewProvider>
    </QueryClientProvider>,
  );
}

describe("FlatMapView geographic grouping", () => {
  beforeEach(() => {
    expandGroup.mockClear();
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
      StubResizeObserver;
    Element.prototype.getBoundingClientRect = () => STUB_RECT;
  });

  it("fixture: the production clusterSpots forms one region group of three", () => {
    expect(grouped.clusters).toHaveLength(1);
    expect(grouped.clusters[0].count).toBe(3);
    expect(grouped.singles.map((spot) => spot.id)).toEqual(["ja-1"]);
    expect(grouped.clusters[0].id.startsWith("g:")).toBe(true);
  });

  it("draws the group glyph and drops its members' own endpoint dots", async () => {
    await mount();
    const cluster = grouped.clusters[0];
    const anchor = toCanvas(cluster.center.lat, cluster.center.lon);

    // The glyph itself: a disc at the group anchor carrying the member count.
    expect(
      arcsNear(anchor, { minRadius: GLYPH_MIN_RADIUS }).length,
    ).toBeGreaterThan(0);
    const counts = ops.filter(
      (op) =>
        op.name === "fillText" &&
        op.text === "3" &&
        Math.hypot(op.args[0] - anchor.x, op.args[1] - anchor.y) <= 1.5,
    );
    // The live surface repaints on several state settles; one count per paint.
    expect(counts.length).toBeGreaterThan(0);

    // No member is drawn as its own DX endpoint.
    for (const member of GROUPED) {
      expect(
        arcsNear(toCanvas(member.dxLat!, member.dxLon!), {
          maxRadius: ENDPOINT_MAX_RADIUS,
        }),
      ).toEqual([]);
    }

    // The ungrouped report still is — without this the assertion above would
    // also pass on a map that simply drew no spots at all.
    expect(
      arcsNear(toCanvas(SINGLE.dxLat!, SINGLE.dxLon!), {
        maxRadius: ENDPOINT_MAX_RADIUS,
      }).length,
    ).toBeGreaterThan(0);
  });

  it("opens the group's collection popover and expands the group from it", async () => {
    await mount();
    const cluster = grouped.clusters[0];
    const anchor = toCanvas(cluster.center.lat, cluster.center.lon);
    const canvas = screen.getByRole("img", {
      name: /Interactive propagation map/i,
    });

    fireEvent.pointerDown(canvas, {
      clientX: anchor.x,
      clientY: anchor.y,
      pointerId: 1,
      button: 0,
    });
    fireEvent.pointerUp(canvas, {
      clientX: anchor.x,
      clientY: anchor.y,
      pointerId: 1,
      button: 0,
    });

    expect(screen.getByText("3 active spots")).toBeTruthy();
    const mapThese = screen.getByRole("button", { name: /map these spots/i });
    fireEvent.click(mapThese);

    expect(expandGroup).toHaveBeenCalledWith(cluster.id);
    expect(screen.queryByText("3 active spots")).toBeNull();
  });
});
