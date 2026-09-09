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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ViewProvider } from "@/components/views/ViewProvider";
import { createMemoryWorkingStorage } from "@/lib/views/runtime";
import { clusterSpots } from "@/lib/spots/grouping";
import { GridGlowRenderer } from "@/components/map/GridGlowCanvas";
import { latLonToGrid } from "@/lib/utils/grid";
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
  // A fresh element per render so `rerender` cannot bail out on reference
  // equality — the feed the mocked hook returns is what changes between them.
  const tree = () => (
    <QueryClientProvider client={client}>
      <ViewProvider
        ownerId="flat-grouping-test"
        slot="normal"
        storage={createMemoryWorkingStorage()}
      >
        <FlatMapView displayTime={new Date("2026-09-09T12:00:00Z")} />
      </ViewProvider>
    </QueryClientProvider>
  );
  const result = render(tree());
  return { ...result, rerenderTree: () => result.rerender(tree()) };
}

async function hoverGlyph(anchor: { x: number; y: number }) {
  fireEvent.pointerMove(interactiveCanvas(), {
    clientX: anchor.x,
    clientY: anchor.y,
    pointerId: 1,
  });
  return waitFor(() => screen.getByRole("tooltip"));
}

/**
 * `useFlatMapClickHandler` debounces hover by `HOVER_DEBOUNCE_MS` (100ms), so
 * an "overlay did not appear" assertion has to outlast that timer to mean
 * anything. Real timers: the component's own repaint effects run on them too.
 */
const HOVER_FLUSH_MS = 250;

async function movePointerTo(point: { x: number; y: number }) {
  fireEvent.pointerMove(interactiveCanvas(), {
    clientX: point.x,
    clientY: point.y,
    pointerId: 1,
  });
  await new Promise((resolve) => setTimeout(resolve, HOVER_FLUSH_MS));
}

function hoverPreviewFor(callsign: string) {
  return screen.queryByRole("button", {
    name: new RegExp(`Open spot details for ${callsign}`, "i"),
  });
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
    const tooltip = await hoverGlyph(
      toCanvas(cluster.center.lat, cluster.center.lon),
    );
    expect(tooltip.textContent).toBe("3 spots · Spain");
  });

  it("clears the hover tooltip when the pointer moves off the glyph", async () => {
    await mount();
    const cluster = grouped.clusters[0];
    await hoverGlyph(toCanvas(cluster.center.lat, cluster.center.lon));

    // Open mid-Atlantic: no glyph, no label, no endpoint.
    const ocean = toCanvas(0, -40);
    fireEvent.pointerMove(interactiveCanvas(), {
      clientX: ocean.x,
      clientY: ocean.y,
      pointerId: 1,
    });

    await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
  });

  it("clears the hover tooltip when the glyph disappears under a motionless pointer", async () => {
    const { rerenderTree } = await mount();
    const cluster = grouped.clusters[0];
    await hoverGlyph(toCanvas(cluster.center.lat, cluster.center.lon));

    // The feed settles with grouping off — the group is gone, but the pointer
    // never moved, so nothing fires a hover event to clear a cached label.
    currentFeed = GROUPING_OFF_FEED;
    rerenderTree();

    expect(screen.queryByRole("tooltip")).toBeNull();
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

  it("suppresses background hover overlays while the group popover is open", async () => {
    await mount();
    const canvas = interactiveCanvas();
    const ja = toCanvas(SINGLE.dxLat!, SINGLE.dxLon!);
    const ocean = toCanvas(0, -40);

    // Positive control: with nothing open, both overlays this test is about
    // do reach the screen from these two pointer positions. The grid tooltip
    // goes first because `hoveredSpotData` lingers past a pointer move (it is
    // dismissed on a delay so the preview can be moused into) and the tooltip
    // predicate already excludes it.
    await movePointerTo(ocean);
    expect(screen.getByText("No active spots")).toBeTruthy();
    await movePointerTo(ja);
    expect(hoverPreviewFor("JA1DDD")).not.toBeNull();

    const anchor = toCanvas(
      grouped.clusters[0].center.lat,
      grouped.clusters[0].center.lon,
    );
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

    // The pointer moves back across the canvas with the group dialog open.
    // `selectedGridCollection` suppresses both overlays in this situation;
    // the cluster collection has to do the same, or the spot preview
    // (z-100) paints over the dialog (z-65).
    await movePointerTo(ocean);
    expect(screen.queryByText("No active spots")).toBeNull();
    await movePointerTo(ja);
    expect(hoverPreviewFor("JA1DDD")).toBeNull();

    // ...and the dialog itself is still up, so the assertions above are not
    // passing because everything unmounted.
    expect(screen.getByText("3 active spots")).toBeTruthy();
  });
});

// A spot arriving after the initial mount, located in Spain. The production
// `clusterSpots` (region detail, minClusterSize 3) folds it into the
// existing 3-member Spain group — confirmed by calling `clusterSpots`
// directly on `[...ALL, ARRIVAL_JOINS_GROUP]` (count goes 3 -> 4, `singles`
// unchanged). With grouping on, its dot is replaced by the cluster glyph, so
// per #778 it must not glow at its own location either.
const ARRIVAL_JOINS_GROUP = liveSpot("ea-4", "EA4FFF", 40.9, -3.0);

// A spot arriving after the initial mount with no other report in its
// region — `clusterSpots` leaves it a single regardless of the grouping
// preference, so it must glow in every scenario below.
const ARRIVAL_STAYS_SINGLE = liveSpot("us-1", "W1AW", 41.7, -72.7);

/** Spy factory so `addGlowSpy`'s declared type is the real call signature,
 * not a bare `MockInstance` that would need casting at every call site. */
function spyOnAddGlow() {
  return vi.spyOn(GridGlowRenderer.prototype, "addGlow");
}

describe("FlatMapView arrival-pulse glow follows the dot layer (#778)", () => {
  let addGlowSpy: ReturnType<typeof spyOnAddGlow>;

  beforeEach(() => {
    expandGroup.mockClear();
    currentFeed = DEFAULT_FEED;
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
      StubResizeObserver;
    Element.prototype.getBoundingClientRect = () => STUB_RECT;
    // No mock implementation: the real GridGlowRenderer keeps doing its own
    // activity-cell bookkeeping, so nothing else the component drives off it
    // (setActivityCells, the RAF loop) silently no-ops.
    addGlowSpy = spyOnAddGlow();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // The effect diffs against `prevGlowSpotIdsRef`, so a fresh mount treats
  // every spot in the feed as "new" — asserting on a mount-only render would
  // pass even for an effect reading the wrong feed entirely, because mount
  // always looks like initial load. Every case below mounts on a baseline
  // feed first, discards the calls that baseline produced, then rerenders
  // with exactly one additional spot and asserts on what that second pass
  // alone sent to `addGlow`. Do not collapse this back to a single mount.

  it("does not glow a newly arrived spot that clusterSpots places inside a group", async () => {
    currentFeed = DEFAULT_FEED;
    const { rerenderTree } = await mount();
    addGlowSpy.mockClear();

    const { feed: joinedFeed } = buildFeed([...ALL, ARRIVAL_JOINS_GROUP]);
    currentFeed = joinedFeed;
    rerenderTree();

    const joinerGrid = latLonToGrid(
      ARRIVAL_JOINS_GROUP.dxLat!,
      ARRIVAL_JOINS_GROUP.dxLon!,
      4,
    ).toUpperCase();
    const joinerCalls = addGlowSpy.mock.calls.filter(
      ([spot]) => spot.gridSquare.toUpperCase() === joinerGrid,
    );
    expect(joinerCalls).toEqual([]);
  });

  it("still glows a newly arrived spot that stays a single", async () => {
    currentFeed = DEFAULT_FEED;
    const { rerenderTree } = await mount();
    addGlowSpy.mockClear();

    const { feed: singleArrivalFeed } = buildFeed([
      ...ALL,
      ARRIVAL_STAYS_SINGLE,
    ]);
    currentFeed = singleArrivalFeed;
    rerenderTree();

    const singleGrid = latLonToGrid(
      ARRIVAL_STAYS_SINGLE.dxLat!,
      ARRIVAL_STAYS_SINGLE.dxLon!,
      4,
    ).toUpperCase();
    const singleCalls = addGlowSpy.mock.calls.filter(
      ([spot]) => spot.gridSquare.toUpperCase() === singleGrid,
    );
    expect(singleCalls.length).toBeGreaterThan(0);
  });

  it("glows a newly arrived spot even when clusterSpots groups it, once grouping is disabled", async () => {
    // `ungroupedResolvedSpots` falls back to `resolvedSpots` (the full feed)
    // when the grouping preference is off, regardless of what `clusterSpots`
    // itself would still compute — this is the case an over-eager edit to
    // `resolvedSingles` (ignoring the preference) would break.
    const { feed: initialOffFeed } = buildFeed(ALL, false);
    currentFeed = initialOffFeed;
    const { rerenderTree } = await mount();
    addGlowSpy.mockClear();

    const { feed: joinedOffFeed } = buildFeed(
      [...ALL, ARRIVAL_JOINS_GROUP],
      false,
    );
    currentFeed = joinedOffFeed;
    rerenderTree();

    const joinerGrid = latLonToGrid(
      ARRIVAL_JOINS_GROUP.dxLat!,
      ARRIVAL_JOINS_GROUP.dxLon!,
      4,
    ).toUpperCase();
    const joinerCalls = addGlowSpy.mock.calls.filter(
      ([spot]) => spot.gridSquare.toUpperCase() === joinerGrid,
    );
    expect(joinerCalls.length).toBeGreaterThan(0);
  });
});
