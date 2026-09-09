/**
 * Flat-map geographic grouping (#746).
 *
 * `FlatMapView` paints onto a 2D canvas, so "is this spot drawn as a dot" is a
 * question about canvas operations. jsdom stubs `getContext`, so the real
 * component is mounted against a recording context and the recorded ops are
 * the assertion surface. The grouping fixture is produced by the production
 * `clusterSpots`, not by hand, so the cluster ids, anchors and membership are
 * the same values the running app would carry.
 *
 * This file is also where the module's projection is pinned against production
 * output: `flatSpotClusterGlyphs.test.ts` can only check its own injected
 * formula, because `latLonToCanvas` is private to `FlatMapView`. Here the glyph
 * and the endpoint dots are both drawn by the real component, so comparing
 * their canvas positions against `toCanvas` below is a genuine parity check.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

/**
 * The shape `useViewMapSpots` returns, built the way production builds it.
 *
 * The resolution map is keyed by **object identity**, not by `spot.id`: the
 * hook's own comment (`useViewMapSpots.ts`) records that some upstream RBN
 * rows share a raw id, and it zips `candidateSpots` with `resolvedSpots`
 * pairwise for exactly that reason. Keying this fixture by id would make it
 * convenience-shaped on the one axis these tests are about.
 */
function buildFeed(spots: LiveSpot[], groupingEnabled = true) {
  const grouped = clusterSpots(spots, {
    enabled: true,
    minClusterSize: 3,
    detail: "regions",
  });
  const resolvedBySpot = new Map(
    spots.map((spot) => [spot, resolve(spot)] as const),
  );
  const resolvedSpots = spots.map((spot) => resolvedBySpot.get(spot)!);
  return {
    grouped,
    feed: {
      spots,
      candidateSpots: spots,
      resolvedSpots,
      resolvedSingles: grouped.singles.map((spot) => resolvedBySpot.get(spot)!),
      allResolvedSpots: resolvedSpots,
      activationSpots: [],
      clusters: grouped.clusters,
      singles: grouped.singles,
      groupingEnabled,
      expandGroup,
      isLoading: false,
      isFeedReady: true,
      feedScopeKey: "test",
      listTotal: spots.length,
      mapBudget: 500,
      matchingCount: spots.length,
      mappedCount: spots.length,
      unlocatedCount: 0,
      budgetOmittedCount: 0,
    },
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
const { grouped, feed: DEFAULT_FEED } = buildFeed(ALL);

// Same four reports, except the first Spanish member and the Japanese single
// share one raw upstream id — the collision `stableReportId` exists to absorb
// and the reason membership cannot be tested with an id set.
const DUP_ID = "dup-report-id";
const DUP_GROUPED = [
  liveSpot(DUP_ID, "EA1AAA", 40.4, -3.7),
  liveSpot("ea-2", "EA3BBB", 41.4, 2.2),
  liveSpot("ea-3", "EA7CCC", 37.4, -6.0),
];
const DUP_SINGLE = liveSpot(DUP_ID, "JA1DDD", 35.7, 139.7);
const { grouped: dupGrouped, feed: DUP_FEED } = buildFeed([
  ...DUP_GROUPED,
  DUP_SINGLE,
]);

const { feed: GROUPING_OFF_FEED } = buildFeed(ALL, false);

let currentFeed: ReturnType<typeof buildFeed>["feed"] = DEFAULT_FEED;

vi.mock("@/hooks/useViewMapSpots", () => ({
  useViewMapSpots: () => currentFeed,
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

function interactiveCanvas() {
  return screen.getByRole("img", { name: /Interactive propagation map/i });
}

describe("FlatMapView geographic grouping", () => {
  beforeEach(() => {
    expandGroup.mockClear();
    currentFeed = DEFAULT_FEED;
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

  it("keeps an ungrouped single's endpoint dot when it shares a raw id with a grouped member", async () => {
    // Membership must be decided on `originalSpot` identity: an id set would
    // suppress this single's endpoint because a clustered member happens to
    // carry the same upstream id, and with labels off it would be invisible.
    expect(dupGrouped.clusters).toHaveLength(1);
    expect(dupGrouped.clusters[0].spots.map((spot) => spot.id)).toContain(
      DUP_ID,
    );
    expect(dupGrouped.singles.map((spot) => spot.id)).toEqual([DUP_ID]);

    currentFeed = DUP_FEED;
    await mount();

    expect(
      arcsNear(toCanvas(DUP_SINGLE.dxLat!, DUP_SINGLE.dxLon!), {
        maxRadius: ENDPOINT_MAX_RADIUS,
      }).length,
    ).toBeGreaterThan(0);
  });

  it("draws no glyph and every dot when grouping is off", async () => {
    // `clusterSpots` output is still supplied — the preference, not the
    // absence of clusters, is what has to gate the layer.
    currentFeed = GROUPING_OFF_FEED;
    await mount();
    const cluster = grouped.clusters[0];
    const anchor = toCanvas(cluster.center.lat, cluster.center.lon);

    expect(arcsNear(anchor, { minRadius: GLYPH_MIN_RADIUS })).toEqual([]);
    expect(
      ops.filter((op) => op.name === "fillText" && op.text === "3"),
    ).toEqual([]);
    for (const spot of ALL) {
      expect(
        arcsNear(toCanvas(spot.dxLat!, spot.dxLon!), {
          maxRadius: ENDPOINT_MAX_RADIUS,
        }).length,
      ).toBeGreaterThan(0);
    }
  });

  it("names the group on hover instead of falling through to the grid tooltip", async () => {
    await mount();
    const cluster = grouped.clusters[0];
    const anchor = toCanvas(cluster.center.lat, cluster.center.lon);

    fireEvent.pointerMove(interactiveCanvas(), {
      clientX: anchor.x,
      clientY: anchor.y,
      pointerId: 1,
    });

    const tooltip = await waitFor(() => screen.getByRole("tooltip"));
    expect(tooltip.textContent).toBe(`3 spots · ${cluster.label}`);
  });

  it("opens the group's collection popover and expands the group from it", async () => {
    await mount();
    const cluster = grouped.clusters[0];
    const anchor = toCanvas(cluster.center.lat, cluster.center.lon);
    const canvas = interactiveCanvas();

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
