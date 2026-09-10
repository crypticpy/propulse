/**
 * The map surface as a focus home (#797).
 *
 * The defect this covers lives in the seam between three components, not in
 * any one of them: a host's `handleMapSpotSelect` clears the overlay that
 * opened it (`SpotCollectionPopover`, `ClusterDetailPopover`) in the same
 * synchronous handler that sets the selection, so React detaches the opener
 * in the same commit that mounts `SelectedSpotCard`. By the time the card's
 * focus effect reads `document.activeElement` the opener is gone and the
 * answer is `<body>`, so the card's hand-back on close had nothing to hand
 * back to. A unit test of any single component cannot see that — each one is
 * behaving correctly on its own — so every case here mounts the real host and
 * drives it from a real popover row.
 *
 * Under jsdom an r3f `<Canvas>` renders ZERO children: its rect comes from
 * `react-use-measure`, which has no layout engine to read, so the scene never
 * mounts. Probed directly for this file with a `console.log` at the top of
 * `GlobeScene` — with WebGL stubbed the `<canvas>` element appears in the DOM
 * and the log never fires. That is why `GlobeView`'s case substitutes the
 * Canvas with a DOM control that calls the very `onClusterClick` prop the
 * real scene calls, and why the substitution throws loudly if that prop ever
 * stops being passed. Everything the test asserts on — the host root, the
 * popover, the card — renders outside the Canvas and is the real component.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { isValidElement, StrictMode, useRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ViewProvider } from "@/components/views/ViewProvider";
import { createMemoryWorkingStorage } from "@/lib/views/runtime";
import { clusterSpots } from "@/lib/spots/grouping";
import { useUserStore } from "@/stores/userStore";
import { usePinStore } from "@/stores/pinStore";
import { calculateLayerHeights } from "@/lib/utils/ionosphere";
import { traceRayPath } from "@/lib/utils/rayTrace";
import { buildPathPointSet, type PathPointSet } from "@/lib/spots/pathPoints";
import { MapSurface } from "./MapSurface";
import {
  PathPointInspector,
  type PathPointInspectorOpen,
} from "./PathPointInspector";
import type { SpotCluster } from "@/hooks/useSpotClustering";
import type { ResolvedSpot } from "@/components/map/LiveSpotArcs";
import type { LiveSpot } from "@/types/livespot";
import type { PathDescriptor } from "@/lib/views/spotContracts";
import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// Feed fixture: the production grouping, not a hand-written cluster.
// ---------------------------------------------------------------------------

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

/** Three reports inside Spain form one region group at the default size. */
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

const resolvedBySpot = new Map(ALL.map((spot) => [spot, resolve(spot)]));

const FEED = {
  spots: ALL,
  candidateSpots: ALL,
  resolvedSpots: ALL.map((spot) => resolvedBySpot.get(spot)!),
  resolvedSingles: grouped.singles.map((spot) => resolvedBySpot.get(spot)!),
  allResolvedSpots: ALL.map((spot) => resolvedBySpot.get(spot)!),
  activationSpots: [],
  clusters: grouped.clusters,
  singles: grouped.singles,
  groupingEnabled: true,
  expandGroup: vi.fn(),
  isLoading: false,
  isFeedReady: true,
  feedScopeKey: "focus-home-test",
  listTotal: ALL.length,
  mapBudget: 500,
  matchingCount: ALL.length,
  mappedCount: ALL.length,
  unlocatedCount: 0,
  budgetOmittedCount: 0,
};

vi.mock("@/hooks/useViewMapSpots", () => ({
  useViewMapSpots: () => FEED,
}));

// ---------------------------------------------------------------------------
// GlobeView's pointer source. See the file comment: r3f renders no children
// under jsdom, so the scene is replaced by a DOM control that calls the same
// callback the scene calls with the same argument shape.
// ---------------------------------------------------------------------------

interface ScenePointerProps {
  onClusterClick: (
    cluster: SpotCluster,
    screenPos: { x: number; y: number },
  ) => void;
}

const GLOBE_CLUSTER: SpotCluster = {
  id: grouped.clusters[0].id,
  center: grouped.clusters[0].center,
  spots: GROUPED,
  count: GROUPED.length,
  primarySpot: GROUPED[0],
};

/**
 * Walks the tree `GlobeView` hands to `<Canvas>` for the scene element. Keyed
 * on the prop the assertion depends on, so a rename fails here with a named
 * error instead of quietly turning the case into a no-op.
 */
function findScenePointerProps(node: ReactNode): ScenePointerProps {
  const search = (current: ReactNode): ScenePointerProps | null => {
    if (Array.isArray(current)) {
      for (const child of current) {
        const found = search(child as ReactNode);
        if (found) return found;
      }
      return null;
    }
    if (!isValidElement(current)) return null;
    const props = current.props as Record<string, unknown> & {
      children?: ReactNode;
    };
    if (typeof props.onClusterClick === "function") {
      return props as unknown as ScenePointerProps;
    }
    return search(props.children ?? null);
  };
  const found = search(node);
  if (!found) {
    throw new Error(
      "No element under <Canvas> carries onClusterClick — GlobeView's scene " +
        "wiring changed and this fixture no longer drives the real handler",
    );
  }
  return found;
}

vi.mock("@react-three/fiber", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@react-three/fiber")>();
  return {
    ...actual,
    Canvas: ({ children }: { children: ReactNode }) => {
      const scene = findScenePointerProps(children);
      // A plain div, not a button: the real pointer target is the WebGL
      // canvas, which is not focusable, so opening the popover must not move
      // focus. See `openPopoverWithoutFocus` below.
      return (
        <div
          data-testid="scene-cluster-click"
          onClick={() =>
            scene.onClusterClick(GLOBE_CLUSTER, { x: 200, y: 200 })
          }
        />
      );
    },
  };
});

// ---------------------------------------------------------------------------
// jsdom scaffolding
// ---------------------------------------------------------------------------

class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

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

function installCanvas2dStub() {
  const context = new Proxy(
    {},
    {
      get: (_target, prop: string) => {
        if (prop === "canvas") return { width: 1024, height: 512 };
        return () => {
          if (prop === "measureText") return { width: 10 };
          if (prop === "createLinearGradient" || prop === "createRadialGradient")
            return { addColorStop: () => {} };
          if (prop === "getImageData") return { data: new Uint8ClampedArray(4) };
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

function Wrap({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return (
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <ViewProvider
          ownerId="focus-home-test"
          slot="normal"
          storage={createMemoryWorkingStorage()}
        >
          {children}
        </ViewProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

/**
 * Names what holds focus. `expected '<body>' to be 'the map surface'` says
 * the defect is back; a bare `expected null` would not.
 *
 * For the surface it also reports the role and accessible name. Focus is
 * moved there without the user choosing to go there, so what a screen reader
 * announces on arrival is part of the fix rather than decoration: an
 * anonymous generic `div` leaves a screen-reader user worse off than the bug
 * #797 fixes (#823 Codex [P2]).
 */
function focusHolder(): string {
  const active = document.activeElement as HTMLElement | null;
  if (!active || active === document.body) return "<body>";
  if (active.hasAttribute("data-map-surface")) {
    const role = active.getAttribute("role");
    return `the map surface, ${role} "${active.getAttribute("aria-label")}"`;
  }
  const label = active.getAttribute("aria-label");
  return `${active.tagName.toLowerCase()}${label ? `[aria-label="${label}"]` : ""}`;
}

/**
 * Opens the collection popover the way the map does: `fireEvent` never moves
 * focus, which is what a hit-test on a canvas (or a touch tap, which does not
 * focus a button on iOS) leaves behind. That is the case #797 is about — when
 * the opener is a focused control the card's existing `previousFocus` branch
 * already returns focus to it correctly, and the fallback is not reached.
 */
function openPopoverWithoutFocus(opener: Element) {
  expect(document.activeElement).toBe(document.body);
  fireEvent.click(opener);
}

/** Click a member row, then close the card the row opened. */
async function openThenCloseSpotCard(callsign: string) {
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", {
      name: new RegExp(`Select ${callsign} and view details`, "i"),
    }),
  );
  const cardName = new RegExp(`Spot details for ${callsign}`, "i");
  const card = await screen.findByRole("dialog", { name: cardName });
  // The card takes focus and attaches its Escape listener on `setTimeout(0)`
  // timers scheduled in the same commit. Pressing Escape before those run is
  // a no-op, which under a loaded parallel run reads as a flake rather than a
  // failure, so wait for the first of them to land.
  await waitFor(() => expect(document.activeElement).toBe(card));
  await user.keyboard("{Escape}");
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: cardName })).toBeNull(),
  );
}

const displayTime = new Date("2026-09-09T12:00:00Z");

// ---------------------------------------------------------------------------
// PathPointInspector fixtures. No shared `PathPointSet` builder exists under
// `src/test/fixtures` (checked before duplicating this), so this mirrors the
// fixture in `PathPointInspector.test.tsx` verbatim.
// ---------------------------------------------------------------------------

const PATH_NOW_MS = new Date("2026-06-21T18:00:00Z").getTime();
const PATH_NY = { lat: 40.7, lon: -74.0 };
const PATH_TOKYO = { lat: 35.7, lon: 139.7 };

const PATH_MODEL = {
  name: "ITU-R P.533 ray trace",
  version: "propulse-physics",
  modeledAtMs: PATH_NOW_MS,
  inputsAsOfMs: PATH_NOW_MS,
  explanation: "Synthetic focus-home fixture model run.",
};

const PATH_DESCRIPTOR: PathDescriptor = {
  id: "path-ny-tokyo",
  reportIds: [],
  kind: "modeled",
  from: {
    callsign: "W2NYC",
    role: "transmitter",
    location: { kind: "reported-coordinate", coordinates: PATH_NY },
  },
  to: {
    callsign: "JA1TYO",
    role: "receiver",
    location: { kind: "reported-coordinate", coordinates: PATH_TOKYO },
  },
  direction: "from-to",
  model: PATH_MODEL,
};

function buildTestPathPointSet(): PathPointSet {
  return buildPathPointSet({
    pathId: PATH_DESCRIPTOR.id,
    path: PATH_DESCRIPTOR,
    result: traceRayPath({
      startLat: PATH_NY.lat,
      startLon: PATH_NY.lon,
      endLat: PATH_TOKYO.lat,
      endLon: PATH_TOKYO.lon,
      frequencyMHz: 14.074,
      date: new Date(PATH_NOW_MS),
      sfi: 150,
      kp: 2,
      pathMode: "short",
    }),
    nowMs: PATH_NOW_MS,
    startLat: PATH_NY.lat,
    startLon: PATH_NY.lon,
    endLat: PATH_TOKYO.lat,
    endLon: PATH_TOKYO.lon,
    includeShellHighlights: true,
    layerHeights: calculateLayerHeights(45, 6, 150),
  });
}

/**
 * Stands in for `RayPathArc` + `<Canvas>`: a real r3f `<Canvas>` renders zero
 * children under jsdom (see the file comment), so `PathPointInspector`'s only
 * production caller can't be mounted directly. This combines the real
 * `MapSurface` and the real `PathPointInspector` with a plain button standing
 * in for the 3D hit-area, mirroring the `GlobeView` case's own Canvas
 * substitution above.
 */
function PathPointInspectorHost({
  pointSet,
  initialOpen = "closed",
}: {
  pointSet: PathPointSet;
  /**
   * Lets a StrictMode mount race test start the panel already open, instead
   * of driving it open through the hit-area click. See the StrictMode test
   * below for why the two are not interchangeable.
   */
  initialOpen?: PathPointInspectorOpen;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<PathPointInspectorOpen>(initialOpen);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const point = pointSet.points[0];
  return (
    <MapSurface surfaceRef={surfaceRef} label="Globe map" className="test-surface">
      {/* A plain div, not a button: the real hit-area is a 3D raycast against
          the globe canvas, which is not focusable, matching the `GlobeView`
          case's own `scene-cluster-click` substitute above. */}
      <div
        data-testid="path-point-hit-area"
        onClick={() => {
          setSelectedId(point.id);
          setOpen("card");
        }}
      />
      <PathPointInspector
        pointSet={pointSet}
        selectedId={selectedId}
        hoveredId={null}
        open={open}
        anchor={{ x: 200, y: 200 }}
        inline
        onSelect={(id) => {
          setSelectedId(id);
          setOpen("card");
        }}
        onClose={() => {
          setOpen("closed");
          setSelectedId(null);
        }}
      />
    </MapSurface>
  );
}

describe("map surface focus home", () => {
  beforeEach(() => {
    installCanvas2dStub();
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
      StubResizeObserver;
    Element.prototype.getBoundingClientRect = () => STUB_RECT;
    // AzimuthalView projects from the station, so without one it renders no
    // spot layer at all and its case would assert on an empty map.
    useUserStore.getState().setStation({
      callsign: "K1ABC",
      homeLocationId: "home",
      activeLocationId: "home",
      savedLocations: [],
      grid: "FN42",
      lat: 42.36,
      lon: -71.06,
    });
  });

  afterEach(() => {
    useUserStore.getState().setStation(null);
    usePinStore.getState().clearPins();
  });

  it("keeps the surface out of the tab order", async () => {
    const { FlatMapView } = await import("@/components/map/FlatMapView");
    const { container } = render(
      <Wrap>
        <FlatMapView displayTime={displayTime} />
      </Wrap>,
    );
    const surface = container.querySelector<HTMLElement>("[data-map-surface]");
    // #797 deliberately does not put the map in the tab order: it is a
    // programmatic focus target only, so no existing keyboard route changes.
    expect(surface?.tabIndex).toBe(-1);
  });

  it("FlatMapView: focus goes home after a cluster row's card closes", async () => {
    const { FlatMapView } = await import("@/components/map/FlatMapView");
    const { container } = render(
      <Wrap>
        <FlatMapView displayTime={displayTime} />
      </Wrap>,
    );

    // Quick-click the group glyph on the real canvas at its real anchor.
    const anchor = toCanvas(
      grouped.clusters[0].center.lat,
      grouped.clusters[0].center.lon,
    );
    const canvas = screen.getByRole("img", {
      name: /Interactive propagation map/i,
    });
    fireEvent.pointerDown(canvas, {
      clientX: anchor.x,
      clientY: anchor.y,
      pointerId: 1,
      button: 0,
    });
    fireEvent.pointerUp(document, {
      clientX: anchor.x,
      clientY: anchor.y,
      pointerId: 1,
      button: 0,
    });
    // The canvas is not focusable, so the popover has no opener to hand back
    // to — the condition the whole issue turns on.
    expect(document.activeElement).toBe(document.body);

    await openThenCloseSpotCard("EA1AAA");

    expect(focusHolder()).toBe('the map surface, region "Flat map"');
    expect(document.activeElement).toBe(
      container.querySelector("[data-map-surface]"),
    );
    // Reachable through the accessibility tree under that name, not only by
    // the test-only data attribute.
    expect(screen.getByRole("region", { name: "Flat map" })).toBe(
      document.activeElement,
    );
  });

  it("does not take focus from a control the user moved to before closing", async () => {
    const { FlatMapView } = await import("@/components/map/FlatMapView");
    const { container } = render(
      <Wrap>
        <FlatMapView displayTime={displayTime} />
        <button type="button" aria-label="page chrome">
          elsewhere
        </button>
      </Wrap>,
    );

    const anchor = toCanvas(
      grouped.clusters[0].center.lat,
      grouped.clusters[0].center.lon,
    );
    const canvas = screen.getByRole("img", {
      name: /Interactive propagation map/i,
    });
    fireEvent.pointerDown(canvas, {
      clientX: anchor.x,
      clientY: anchor.y,
      pointerId: 1,
      button: 0,
    });
    fireEvent.pointerUp(document, {
      clientX: anchor.x,
      clientY: anchor.y,
      pointerId: 1,
      button: 0,
    });

    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", {
        name: /Select EA1AAA and view details/i,
      }),
    );
    const cardName = /Spot details for EA1AAA/i;
    const card = await screen.findByRole("dialog", { name: cardName });
    await waitFor(() => expect(document.activeElement).toBe(card));

    // The user moves to something else on the page and closes the card from
    // there. The fallback must stay out of the way: it exists for the case
    // where the card's removal drops focus on `<body>`, not to claim focus
    // that another element already holds. Stealing it here would be a worse
    // bug than the one #797 fixes, and it is the common path — every close
    // that starts with a click outside the card lands in this shape.
    const elsewhere = screen.getByRole("button", { name: "page chrome" });
    elsewhere.focus();
    expect(focusHolder()).toBe('button[aria-label="page chrome"]');

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: cardName })).toBeNull(),
    );

    expect(focusHolder()).toBe('button[aria-label="page chrome"]');
    expect(document.activeElement).not.toBe(
      container.querySelector("[data-map-surface]"),
    );
  });

  it("AzimuthalView: focus goes home after a cluster row's card closes", async () => {
    const { AzimuthalView } = await import("@/components/map/AzimuthalView");
    const { container } = render(
      <Wrap>
        <AzimuthalView displayTime={displayTime} />
      </Wrap>,
    );

    openPopoverWithoutFocus(
      await screen.findByRole("button", {
        name: /live spots at this destination cluster/i,
      }),
    );

    await openThenCloseSpotCard("EA1AAA");

    expect(focusHolder()).toBe('the map surface, region "Azimuthal map"');
    expect(document.activeElement).toBe(
      container.querySelector("[data-map-surface]"),
    );
    // Reachable through the accessibility tree under that name, not only by
    // the test-only data attribute.
    expect(screen.getByRole("region", { name: "Azimuthal map" })).toBe(
      document.activeElement,
    );
  });

  it("GlobeView: focus goes home after a cluster row's card closes", async () => {
    const { GlobeView } = await import("@/components/map/GlobeView");
    const { container } = render(
      <Wrap>
        <GlobeView displayTime={displayTime} />
      </Wrap>,
    );

    openPopoverWithoutFocus(await screen.findByTestId("scene-cluster-click"));

    await openThenCloseSpotCard("EA1AAA");

    expect(focusHolder()).toBe('the map surface, region "Globe map"');
    expect(document.activeElement).toBe(
      container.querySelector("[data-map-surface]"),
    );
    // Reachable through the accessibility tree under that name, not only by
    // the test-only data attribute.
    expect(screen.getByRole("region", { name: "Globe map" })).toBe(
      document.activeElement,
    );
  });

  // -------------------------------------------------------------------------
  // SpotCollectionPopover (#824): the two chain tests above already close it
  // by picking a spot, which routes into `SelectedSpotCard`. These close it
  // directly — Escape with no spot picked — to cover the popover's own
  // restore/fallback in isolation.
  // -------------------------------------------------------------------------

  it("FlatMapView: focus goes home after the spot collection popover closes without picking a spot", async () => {
    const { FlatMapView } = await import("@/components/map/FlatMapView");
    const { container } = render(
      <Wrap>
        <FlatMapView displayTime={displayTime} />
      </Wrap>,
    );

    const anchor = toCanvas(
      grouped.clusters[0].center.lat,
      grouped.clusters[0].center.lon,
    );
    const canvas = screen.getByRole("img", {
      name: /Interactive propagation map/i,
    });
    fireEvent.pointerDown(canvas, {
      clientX: anchor.x,
      clientY: anchor.y,
      pointerId: 1,
      button: 0,
    });
    fireEvent.pointerUp(document, {
      clientX: anchor.x,
      clientY: anchor.y,
      pointerId: 1,
      button: 0,
    });

    const popoverName = /3 active spots/i;
    await screen.findByRole("dialog", { name: popoverName });
    // The popover auto-focuses its first row on a `setTimeout(0)`.
    const firstRow = await screen.findByRole("button", {
      name: /Select EA1AAA and view details/i,
    });
    await waitFor(() => expect(document.activeElement).toBe(firstRow));

    // Close via the visible "×" control rather than Escape: the popover's
    // own Escape/click-outside listeners re-register on a `setTimeout(0)`
    // every time its `onClose` prop changes identity (it is an inline
    // closure in `FlatMapView`, unrelated to #824), which is a pre-existing
    // race unrelated to focus homing. The "×" button's `onClick` calls the
    // same `onClose` directly and exercises the same cleanup this test cares
    // about without depending on that timing.
    fireEvent.click(
      screen.getByRole("button", { name: "Close spot collection" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: popoverName })).toBeNull(),
    );

    // The fallback is deferred by one macrotask tick (#824); `waitFor` polls
    // past it, which is fine for this positive assertion.
    await waitFor(() =>
      expect(focusHolder()).toBe('the map surface, region "Flat map"'),
    );
    expect(document.activeElement).toBe(
      container.querySelector("[data-map-surface]"),
    );
  });

  it("does not take focus from a control the user moved to before the spot collection popover closes", async () => {
    const { FlatMapView } = await import("@/components/map/FlatMapView");
    const { container } = render(
      <Wrap>
        <FlatMapView displayTime={displayTime} />
        <button type="button" aria-label="page chrome">
          elsewhere
        </button>
      </Wrap>,
    );

    const anchor = toCanvas(
      grouped.clusters[0].center.lat,
      grouped.clusters[0].center.lon,
    );
    const canvas = screen.getByRole("img", {
      name: /Interactive propagation map/i,
    });
    fireEvent.pointerDown(canvas, {
      clientX: anchor.x,
      clientY: anchor.y,
      pointerId: 1,
      button: 0,
    });
    fireEvent.pointerUp(document, {
      clientX: anchor.x,
      clientY: anchor.y,
      pointerId: 1,
      button: 0,
    });

    const popoverName = /3 active spots/i;
    await screen.findByRole("dialog", { name: popoverName });
    const firstRow = await screen.findByRole("button", {
      name: /Select EA1AAA and view details/i,
    });
    await waitFor(() => expect(document.activeElement).toBe(firstRow));

    const elsewhere = screen.getByRole("button", { name: "page chrome" });
    elsewhere.focus();
    expect(focusHolder()).toBe('button[aria-label="page chrome"]');

    // See the positive case above for why this closes via the "×" control
    // instead of Escape.
    fireEvent.click(
      screen.getByRole("button", { name: "Close spot collection" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: popoverName })).toBeNull(),
    );

    // Negative assertion: force the deferred fallback tick to actually run
    // before checking that it did not fire, instead of trusting `waitFor` to
    // succeed trivially without ever exercising the deferred branch.
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(focusHolder()).toBe('button[aria-label="page chrome"]');
    expect(document.activeElement).not.toBe(
      container.querySelector("[data-map-surface]"),
    );
  });

  it("does not steal focus to the map surface when StrictMode replays the spot collection popover's mount", async () => {
    const { FlatMapView } = await import("@/components/map/FlatMapView");
    const { container } = render(
      <StrictMode>
        <Wrap>
          <FlatMapView displayTime={displayTime} />
        </Wrap>
      </StrictMode>,
    );

    const surface = container.querySelector<HTMLElement>(
      "[data-map-surface]",
    )!;
    // This effect's own auto-focus of the first row is scheduled inside the
    // same cleanup/setup cycle as the stale fallback timer and always wins
    // the real-timer race (it is registered after the fallback, so it fires
    // after it and overwrites wherever the fallback left focus). A snapshot
    // of `document.activeElement` after the fact cannot tell a stale
    // fallback call from a correct one apart — spy on the surface's own
    // `.focus` to see whether the fallback ever reached it, independent of
    // what focused the surface afterward.
    const surfaceFocusSpy = vi.spyOn(surface, "focus");

    const anchor = toCanvas(
      grouped.clusters[0].center.lat,
      grouped.clusters[0].center.lon,
    );
    const canvas = screen.getByRole("img", {
      name: /Interactive propagation map/i,
    });
    // `SpotCollectionPopover` is only present in the tree once
    // `openSpotCollection` is set (`{openSpotCollection && (<SpotCollectionPopover
    // visible ... />)}`), so this click is the popover's own first mount —
    // the mount React StrictMode replays with setup -> cleanup -> setup, the
    // sequence the stale-timer fix (#842, Codex) guards against.
    fireEvent.pointerDown(canvas, {
      clientX: anchor.x,
      clientY: anchor.y,
      pointerId: 1,
      button: 0,
    });
    fireEvent.pointerUp(document, {
      clientX: anchor.x,
      clientY: anchor.y,
      pointerId: 1,
      button: 0,
    });

    await screen.findByRole("dialog", { name: /3 active spots/i });

    // Wait past the deferred fallback tick (#824) so this exercises the
    // branch instead of trivially succeeding before it ever runs.
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(surfaceFocusSpy).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // PinFlyout (#824): opens on hover, never focuses itself, but a keyboard
  // user can still tab into its own buttons while the mouse keeps it open.
  // -------------------------------------------------------------------------

  it("FlatMapView: focus goes home after a pin flyout closes", async () => {
    usePinStore.getState().addPin({
      lat: 10,
      lon: 10,
      grid: "JJ00aa",
      name: "Test Pin",
    });
    const { FlatMapView } = await import("@/components/map/FlatMapView");
    const { container } = render(
      <Wrap>
        <FlatMapView displayTime={displayTime} />
      </Wrap>,
    );

    const canvas = screen.getByRole("img", {
      name: /Interactive propagation map/i,
    });
    const pinPos = toCanvas(10, 10);
    fireEvent.pointerMove(canvas, {
      clientX: pinPos.x,
      clientY: pinPos.y,
      pointerId: 1,
    });

    const editButton = await screen.findByRole("button", { name: "Edit Pin" });
    // A keyboard user tabs into the flyout's own content while the mouse
    // keeps it open on hover.
    editButton.focus();
    expect(document.activeElement).toBe(editButton);

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: /Pin info: Test Pin/i }),
      ).toBeNull(),
    );

    await waitFor(() =>
      expect(focusHolder()).toBe('the map surface, region "Flat map"'),
    );
    expect(document.activeElement).toBe(
      container.querySelector("[data-map-surface]"),
    );
  });

  it("does not take focus from a control the user moved to before a pin flyout closes", async () => {
    usePinStore.getState().addPin({
      lat: 10,
      lon: 10,
      grid: "JJ00aa",
      name: "Test Pin",
    });
    const { FlatMapView } = await import("@/components/map/FlatMapView");
    const { container } = render(
      <Wrap>
        <FlatMapView displayTime={displayTime} />
        <button type="button" aria-label="page chrome">
          elsewhere
        </button>
      </Wrap>,
    );

    const canvas = screen.getByRole("img", {
      name: /Interactive propagation map/i,
    });
    const pinPos = toCanvas(10, 10);
    fireEvent.pointerMove(canvas, {
      clientX: pinPos.x,
      clientY: pinPos.y,
      pointerId: 1,
    });

    const editButton = await screen.findByRole("button", { name: "Edit Pin" });
    editButton.focus();
    expect(document.activeElement).toBe(editButton);

    // The user tabs back out to something unrelated while the flyout is
    // still open (the mouse is still hovering the pin, so it hasn't closed).
    const elsewhere = screen.getByRole("button", { name: "page chrome" });
    elsewhere.focus();
    expect(focusHolder()).toBe('button[aria-label="page chrome"]');

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: /Pin info: Test Pin/i }),
      ).toBeNull(),
    );

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(focusHolder()).toBe('button[aria-label="page chrome"]');
    expect(document.activeElement).not.toBe(
      container.querySelector("[data-map-surface]"),
    );
  });

  it("does not steal focus to the map surface when StrictMode replays a pin flyout's mount", async () => {
    usePinStore.getState().addPin({
      lat: 10,
      lon: 10,
      grid: "JJ00aa",
      name: "Test Pin",
    });
    const { FlatMapView } = await import("@/components/map/FlatMapView");
    const { container } = render(
      <StrictMode>
        <Wrap>
          <FlatMapView displayTime={displayTime} />
        </Wrap>
      </StrictMode>,
    );

    const canvas = screen.getByRole("img", {
      name: /Interactive propagation map/i,
    });
    const pinPos = toCanvas(10, 10);
    // `PinFlyout` is only present in the tree once `hoveredPinData` is
    // truthy (`{hoveredPinData && <PinFlyout visible ... />}`), so this
    // hover is the flyout's own first mount — the mount React StrictMode
    // replays with setup -> cleanup -> setup, the sequence the stale-timer
    // fix (#842, Codex) guards against.
    fireEvent.pointerMove(canvas, {
      clientX: pinPos.x,
      clientY: pinPos.y,
      pointerId: 1,
    });

    await screen.findByRole("button", { name: "Edit Pin" });

    // Wait past the deferred fallback tick (#824) so this exercises the
    // branch instead of trivially succeeding before it ever runs.
    await new Promise((resolve) => setTimeout(resolve, 20));

    // The flyout never focuses itself, so nothing should hold focus while it
    // is open — and the flyout must still be open, since the bug this
    // guards against moves focus to the map surface while the flyout is
    // still visible.
    expect(focusHolder()).toBe("<body>");
    expect(document.activeElement).not.toBe(
      container.querySelector("[data-map-surface]"),
    );
    screen.getByRole("button", { name: "Edit Pin" });
  });

  // -------------------------------------------------------------------------
  // PathPointInspector (#824): only reachable in production through
  // `RayPathArc` inside a `<Canvas>`, which renders nothing under jsdom (see
  // the file comment). `PathPointInspectorHost` above substitutes a plain
  // button for the 3D hit-area around the real `MapSurface` and the real
  // `PathPointInspector`, the same shape as the `GlobeView` case's own Canvas
  // substitution.
  // -------------------------------------------------------------------------

  it("PathPointInspector: focus goes home after the panel closes", async () => {
    const pointSet = buildTestPathPointSet();
    const { container } = render(
      <PathPointInspectorHost pointSet={pointSet} />,
    );

    fireEvent.click(screen.getByTestId("path-point-hit-area"));
    await screen.findByRole("dialog", { name: "Path point details" });
    // `PathPointList` focuses the selected option itself once the panel
    // opens (pre-existing, unrelated to #824) — this is not the "opened via
    // a hit-test that never touches focus" case the other three overlays
    // are. A keyboard user tabbing on to the panel's own close button from
    // there is still a real path this effect has to cover correctly.
    const closeButton = await screen.findByRole("button", {
      name: "Close path point card",
    });
    closeButton.focus();
    expect(document.activeElement).toBe(closeButton);

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Path point details" }),
      ).toBeNull(),
    );

    await waitFor(() =>
      expect(focusHolder()).toBe('the map surface, region "Globe map"'),
    );
    expect(document.activeElement).toBe(
      container.querySelector("[data-map-surface]"),
    );
  });

  it("does not take focus from a control the user moved to before the path point panel closes", async () => {
    const pointSet = buildTestPathPointSet();
    const { container } = render(
      <>
        <PathPointInspectorHost pointSet={pointSet} />
        <button type="button" aria-label="page chrome">
          elsewhere
        </button>
      </>,
    );

    fireEvent.click(screen.getByTestId("path-point-hit-area"));
    await screen.findByRole("dialog", { name: "Path point details" });

    const elsewhere = screen.getByRole("button", { name: "page chrome" });
    elsewhere.focus();
    expect(focusHolder()).toBe('button[aria-label="page chrome"]');

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Path point details" }),
      ).toBeNull(),
    );

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(focusHolder()).toBe('button[aria-label="page chrome"]');
    expect(document.activeElement).not.toBe(
      container.querySelector("[data-map-surface]"),
    );
  });

  it("does not steal focus to the map surface when StrictMode replays the path point panel's mount already open", async () => {
    const pointSet = buildTestPathPointSet();
    // `initialOpen="card"` starts the panel open on the very first render,
    // rather than opening it via the hit-area click as the other
    // `PathPointInspectorHost` cases do. Unlike `PinFlyout` and
    // `SpotCollectionPopover` — each only added to the tree once its host's
    // gate turns true, so their own click/hover already produces a fresh
    // mount — `PathPointInspector` is always mounted here, with only its
    // `open` prop toggling; opening it after render is a dependency-driven
    // effect re-run on an already-mounted component, which StrictMode does
    // not replay. Starting it open is what makes this mount undergo the
    // setup -> cleanup -> setup sequence the stale-timer fix (#842, Codex)
    // guards against. No `selectedId` is set, so `PathPointList`'s own
    // synchronous focus effect (`PathPointList.tsx`, unrelated to #824)
    // early-returns instead of moving focus itself — otherwise that
    // sibling effect's own mount would already leave `previousFocusRef`
    // holding a connected element before this effect's stale-timer bug
    // could be observed.
    const { container } = render(
      <StrictMode>
        <PathPointInspectorHost pointSet={pointSet} initialOpen="card" />
      </StrictMode>,
    );

    await screen.findByRole("dialog", { name: "Path point details" });

    // Wait past the deferred fallback tick (#824) so this exercises the
    // branch instead of trivially succeeding before it ever runs.
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(focusHolder()).toBe("<body>");
    expect(document.activeElement).not.toBe(
      container.querySelector("[data-map-surface]"),
    );
  });
});
