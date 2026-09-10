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
import { useSettingsStore } from "@/stores/settingsStore";
import { calculateLayerHeights } from "@/lib/utils/ionosphere";
import { traceRayPath } from "@/lib/utils/rayTrace";
import { buildPathPointSet, type PathPointSet } from "@/lib/spots/pathPoints";
import { MapSurface } from "./MapSurface";
import {
  PathPointInspector,
  type PathPointInspectorOpen,
} from "./PathPointInspector";
import { SelectedSpotCard } from "./SelectedSpotCard";
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
 *
 * No `inline` (#853): the real `RayPathArc` mount now takes
 * `PathPointInspector`'s own `createPortal(overlay, portalTarget)` branch
 * instead of skipping it, so this host wires up a real `portalTarget` node —
 * rendered inside `MapSurface`, mirroring `GlobeView`'s map-owned overlay
 * portal div — rather than falling back to `document.body`. Falling back to
 * `document.body` would still pass these focus assertions (they query the
 * whole document via `screen`), but it would silently stop testing the
 * shape production actually uses and would break the one assertion that
 * reads through `container` (`data-point-id`, below).
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
  const [portalTarget, setPortalTarget] = useState<HTMLDivElement | null>(null);
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
      {/* Opens the panel without picking a point, so `PathPointList`'s own
          mount-time focus effect (`PathPointList.tsx`, unrelated to #824)
          never captures focus before this component's own focus-home effect
          runs. Needed only by the restore-branch cases below, which require
          a real persistent control to still hold focus when the panel
          opens — the hit area above always selects a point, which would
          steal focus first and mask what those cases test. */}
      <div
        data-testid="path-point-hit-area-no-select"
        onClick={() => setOpen("card")}
      />
      {/* Stands in for `GlobeView`'s `mapOverlayPortal` sibling div. */}
      <div data-testid="path-point-overlay-portal" ref={setPortalTarget} />
      <PathPointInspector
        pointSet={pointSet}
        selectedId={selectedId}
        hoveredId={null}
        open={open}
        anchor={{ x: 200, y: 200 }}
        portalTarget={portalTarget}
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

/**
 * Stands in for a map host's `selectedSpot` state and select handler
 * (`GlobeView`, `AzimuthalView`, `FlatMapView`): `SelectedSpotCard` is always
 * mounted with `spot` toggling between `null` and a value, matching the
 * `PathPointInspectorHost` shape above. The open trigger is a plain div, not
 * a button — real openers (a 3D hit-test, a popover row) are not focusable
 * DOM controls either, matching the other three overlays' own hit-area
 * substitutes. Every production caller clears its own overlay in the same
 * handler that sets the selection (see the focus effect's comment in
 * `SelectedSpotCard.tsx`), so `previousFocusRef` is always null through any
 * real host chain; this host is what makes the restore branch reachable at
 * all, exactly as that comment anticipates ("the branch stays the contract
 * for a persistent trigger").
 */
function SelectedSpotCardHost({ spot }: { spot: LiveSpot }) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<LiveSpot | null>(null);
  return (
    <MapSurface surfaceRef={surfaceRef} label="Globe map" className="test-surface">
      <div
        data-testid="selected-spot-card-open"
        onClick={() => setSelected(spot)}
      />
      <SelectedSpotCard
        spot={selected}
        position={{ x: 200, y: 200 }}
        onOperator={() => {}}
        onClose={() => setSelected(null)}
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
    const point = pointSet.points[0];
    const { container } = render(
      <PathPointInspectorHost pointSet={pointSet} />,
    );

    fireEvent.click(screen.getByTestId("path-point-hit-area"));
    await screen.findByRole("dialog", { name: "Path point details" });

    // `PathPointList`'s own mount effect focuses the selected option
    // synchronously, and React runs that CHILD effect before this parent's
    // focus-home effect in the same commit (#824, Codex round 4). Asserting
    // this here — and deliberately not calling `.focus()` on anything else
    // afterward — is what actually exercises that race: the parent's setup
    // must recognise focus already living inside the panel at the moment it
    // runs, both to mark itself as having held focus and to refuse to
    // capture the in-panel option as a "previous" element to restore to.
    // (An earlier version of this test called `closeButton.focus()` here,
    // which masked the round-4 bug — that later, manual focus call reached
    // the `focusin` listener just fine regardless of when the listener was
    // attached, so the test passed even when the listener had missed the
    // child's own auto-focus.)
    const selectedOption = container.querySelector(
      `[data-point-id="${point.id}"]`,
    );
    expect(document.activeElement).toBe(selectedOption);

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

  // -------------------------------------------------------------------------
  // Restore-branch coverage (#824 gate fix).
  //
  // Every negative test above opens its overlay from a body-origin state — a
  // canvas hit-test, a hover, or a chain where the previous overlay is
  // cleared in the same commit that mounts the next one — so
  // `previousFocusRef` is always null by the time each effect's cleanup
  // runs. That means `if (previousFocus?.isConnected) { previousFocus.focus();
  // ... }` never actually executes in any test above: every one of those
  // cases falls straight through to the fallback branch, which already
  // carried its own `document.activeElement === document.body` guard before
  // this fix. The restore branch itself — and the unconditional-steal bug
  // Codex found in it — was not covered by anything in this file.
  //
  // Each pair below first focuses a real persistent control before the
  // overlay opens, so `previousFocusRef` captures a real, still-connected
  // element and the restore branch is actually reached: a positive control
  // (close without moving away — focus must land back on that control) and
  // the regression itself (move to a second, different persistent control
  // before closing — focus must stay there, not get yanked back to the
  // first).
  // -------------------------------------------------------------------------

  it("PinFlyout: restores focus to a persistent control that held it when the flyout opened", async () => {
    usePinStore.getState().addPin({
      lat: 10,
      lon: 10,
      grid: "JJ00aa",
      name: "Test Pin",
    });
    const { FlatMapView } = await import("@/components/map/FlatMapView");
    render(
      <Wrap>
        <FlatMapView displayTime={displayTime} />
        <button type="button" aria-label="page chrome">
          elsewhere
        </button>
      </Wrap>,
    );

    const elsewhere = screen.getByRole("button", { name: "page chrome" });
    elsewhere.focus();
    expect(focusHolder()).toBe('button[aria-label="page chrome"]');

    const canvas = screen.getByRole("img", {
      name: /Interactive propagation map/i,
    });
    const pinPos = toCanvas(10, 10);
    // Hovering the pin does not move focus, so `elsewhere` is still what the
    // flyout's setup effect captures into `previousFocusRef` here.
    fireEvent.pointerMove(canvas, {
      clientX: pinPos.x,
      clientY: pinPos.y,
      pointerId: 1,
    });

    const editButton = await screen.findByRole("button", { name: "Edit Pin" });
    // Tab into the flyout's own content: focus leaves `elsewhere` (captured
    // above) without ever moving to another persistent control.
    editButton.focus();
    expect(document.activeElement).toBe(editButton);

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: /Pin info: Test Pin/i }),
      ).toBeNull(),
    );

    expect(focusHolder()).toBe('button[aria-label="page chrome"]');
  });

  it("PinFlyout: does not steal focus back to the opener when the user moved to a different control", async () => {
    usePinStore.getState().addPin({
      lat: 10,
      lon: 10,
      grid: "JJ00aa",
      name: "Test Pin",
    });
    const { FlatMapView } = await import("@/components/map/FlatMapView");
    render(
      <Wrap>
        <FlatMapView displayTime={displayTime} />
        <button type="button" aria-label="control a">
          a
        </button>
        <button type="button" aria-label="control b">
          b
        </button>
      </Wrap>,
    );

    const controlA = screen.getByRole("button", { name: "control a" });
    controlA.focus();
    expect(focusHolder()).toBe('button[aria-label="control a"]');

    const canvas = screen.getByRole("img", {
      name: /Interactive propagation map/i,
    });
    const pinPos = toCanvas(10, 10);
    fireEvent.pointerMove(canvas, {
      clientX: pinPos.x,
      clientY: pinPos.y,
      pointerId: 1,
    });
    await screen.findByRole("button", { name: "Edit Pin" });

    // The regression Codex found: the user never tabs into the flyout at
    // all, moving straight from one persistent control to a different one
    // while the flyout stays open.
    const controlB = screen.getByRole("button", { name: "control b" });
    controlB.focus();
    expect(focusHolder()).toBe('button[aria-label="control b"]');

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: /Pin info: Test Pin/i }),
      ).toBeNull(),
    );

    // The old restore branch fired synchronously in this cleanup (no
    // deferred timer), so no extra tick is needed to observe the steal.
    expect(focusHolder()).toBe('button[aria-label="control b"]');
  });

  it("SpotCollectionPopover: restores focus to a persistent control that held it when the popover opened", async () => {
    const { FlatMapView } = await import("@/components/map/FlatMapView");
    const { container } = render(
      <Wrap>
        <FlatMapView displayTime={displayTime} />
        <button type="button" aria-label="page chrome">
          elsewhere
        </button>
      </Wrap>,
    );

    const elsewhere = screen.getByRole("button", { name: "page chrome" });
    elsewhere.focus();
    expect(focusHolder()).toBe('button[aria-label="page chrome"]');

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
    // The popover's own setup effect captures `elsewhere` into
    // `previousFocusRef` before its `setTimeout(0)` auto-focus of the first
    // row later steals focus away from it.
    const firstRow = await screen.findByRole("button", {
      name: /Select EA1AAA and view details/i,
    });
    await waitFor(() => expect(document.activeElement).toBe(firstRow));

    fireEvent.click(
      screen.getByRole("button", { name: "Close spot collection" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: popoverName })).toBeNull(),
    );

    expect(focusHolder()).toBe('button[aria-label="page chrome"]');
    expect(document.activeElement).not.toBe(
      container.querySelector("[data-map-surface]"),
    );
  });

  it("SpotCollectionPopover: does not steal focus back to the opener when the user moved to a different control", async () => {
    const { FlatMapView } = await import("@/components/map/FlatMapView");
    const { container } = render(
      <Wrap>
        <FlatMapView displayTime={displayTime} />
        <button type="button" aria-label="control a">
          a
        </button>
        <button type="button" aria-label="control b">
          b
        </button>
      </Wrap>,
    );

    const controlA = screen.getByRole("button", { name: "control a" });
    controlA.focus();
    expect(focusHolder()).toBe('button[aria-label="control a"]');

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

    // The regression: focus moves to a second, different persistent control
    // (not by tabbing out of the popover — by a direct focus change, same
    // as a user clicking elsewhere on the page) before closing.
    const controlB = screen.getByRole("button", { name: "control b" });
    controlB.focus();
    expect(focusHolder()).toBe('button[aria-label="control b"]');

    fireEvent.click(
      screen.getByRole("button", { name: "Close spot collection" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: popoverName })).toBeNull(),
    );

    expect(focusHolder()).toBe('button[aria-label="control b"]');
    expect(document.activeElement).not.toBe(
      container.querySelector("[data-map-surface]"),
    );
  });

  it("PathPointInspector: restores focus to a persistent control that held it when the panel opened", async () => {
    const pointSet = buildTestPathPointSet();
    const { container } = render(
      <>
        <PathPointInspectorHost pointSet={pointSet} />
        <button type="button" aria-label="page chrome">
          elsewhere
        </button>
      </>,
    );

    const elsewhere = screen.getByRole("button", { name: "page chrome" });
    elsewhere.focus();
    expect(focusHolder()).toBe('button[aria-label="page chrome"]');

    // The no-select hit area, not the normal one: selecting a point would
    // let `PathPointList`'s own mount-time focus effect capture focus first.
    fireEvent.click(screen.getByTestId("path-point-hit-area-no-select"));
    await screen.findByRole("dialog", { name: "Path point details" });

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

    expect(focusHolder()).toBe('button[aria-label="page chrome"]');
    expect(document.activeElement).not.toBe(
      container.querySelector("[data-map-surface]"),
    );
  });

  it("PathPointInspector: does not steal focus back to the opener when the user moved to a different control", async () => {
    const pointSet = buildTestPathPointSet();
    const { container } = render(
      <>
        <PathPointInspectorHost pointSet={pointSet} />
        <button type="button" aria-label="control a">
          a
        </button>
        <button type="button" aria-label="control b">
          b
        </button>
      </>,
    );

    const controlA = screen.getByRole("button", { name: "control a" });
    controlA.focus();
    expect(focusHolder()).toBe('button[aria-label="control a"]');

    fireEvent.click(screen.getByTestId("path-point-hit-area-no-select"));
    await screen.findByRole("dialog", { name: "Path point details" });

    const controlB = screen.getByRole("button", { name: "control b" });
    controlB.focus();
    expect(focusHolder()).toBe('button[aria-label="control b"]');

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Path point details" }),
      ).toBeNull(),
    );

    expect(focusHolder()).toBe('button[aria-label="control b"]');
    expect(document.activeElement).not.toBe(
      container.querySelector("[data-map-surface]"),
    );
  });

  it("SelectedSpotCard: restores focus to a persistent control that held it when the card opened", async () => {
    const { container } = render(
      <Wrap>
        <SelectedSpotCardHost spot={GROUPED[0]} />
        <button type="button" aria-label="page chrome">
          elsewhere
        </button>
      </Wrap>,
    );

    const elsewhere = screen.getByRole("button", { name: "page chrome" });
    elsewhere.focus();
    expect(focusHolder()).toBe('button[aria-label="page chrome"]');

    fireEvent.click(screen.getByTestId("selected-spot-card-open"));
    const cardName = /Spot details for EA1AAA/i;
    const card = await screen.findByRole("dialog", { name: cardName });
    await waitFor(() => expect(document.activeElement).toBe(card));

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: cardName })).toBeNull(),
    );

    expect(focusHolder()).toBe('button[aria-label="page chrome"]');
    expect(document.activeElement).not.toBe(
      container.querySelector("[data-map-surface]"),
    );
  });

  it("SelectedSpotCard: does not steal focus back to the opener when the user moved to a different control", async () => {
    const { container } = render(
      <Wrap>
        <SelectedSpotCardHost spot={GROUPED[0]} />
        <button type="button" aria-label="control a">
          a
        </button>
        <button type="button" aria-label="control b">
          b
        </button>
      </Wrap>,
    );

    const controlA = screen.getByRole("button", { name: "control a" });
    controlA.focus();
    expect(focusHolder()).toBe('button[aria-label="control a"]');

    fireEvent.click(screen.getByTestId("selected-spot-card-open"));
    const cardName = /Spot details for EA1AAA/i;
    const card = await screen.findByRole("dialog", { name: cardName });
    await waitFor(() => expect(document.activeElement).toBe(card));

    const controlB = screen.getByRole("button", { name: "control b" });
    controlB.focus();
    expect(focusHolder()).toBe('button[aria-label="control b"]');

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: cardName })).toBeNull(),
    );

    expect(focusHolder()).toBe('button[aria-label="control b"]');
    expect(document.activeElement).not.toBe(
      container.querySelector("[data-map-surface]"),
    );
  });

  // -------------------------------------------------------------------------
  // Focus never entered the overlay (#824 round 3, Codex): "an overlay may
  // only restore or fall back if it actually held focus at some point while
  // open. You cannot restore what was never taken." Every case above reaches
  // the fallback because the overlay took focus itself (`SpotCollectionPopover`,
  // `SelectedSpotCard`, `PathPointList`'s select-on-mount) or the user tabbed
  // into it (`PinFlyout`'s own "goes home" cases). These two open an overlay
  // from a body-origin state and close it again without ever bringing focus
  // inside — a pointer-only user hovering a pin and moving away, or clicking
  // straight through to a control with no keyboard involved at all — and
  // confirm `<body>` is left alone instead of being handed to the map
  // surface.
  // -------------------------------------------------------------------------

  it("PinFlyout: a hover-only open and auto-dismiss never moves focus off <body>", async () => {
    usePinStore.getState().addPin({
      lat: 10,
      lon: 10,
      grid: "JJ00aa",
      name: "Test Pin",
    });
    const originalUiInteraction = useSettingsStore.getState().uiInteraction;
    // Drives the real auto-dismiss timer instead of faking it, matching this
    // file's timer style elsewhere — just fast, so the test doesn't spend
    // real seconds waiting on the production default (2500ms).
    useSettingsStore.getState().updateUIInteraction({ flyoutAutoDismissMs: 0 });
    try {
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

      // The flyout is open, but a pointer-only user never touches a keyboard,
      // so nothing inside it — or anywhere else — has been focused.
      await screen.findByRole("button", { name: "Edit Pin" });
      expect(document.activeElement).toBe(document.body);

      // Move far outside the flyout's proximity padding (stubbed rect is
      // 1024x512, `PROXIMITY_PADDING` is 50) to trigger the same ordinary
      // auto-dismiss a real mouse-leaves-the-flyout gesture would.
      fireEvent.mouseMove(document, { clientX: 3000, clientY: 3000 });
      await waitFor(() =>
        expect(
          screen.queryByRole("dialog", { name: /Pin info: Test Pin/i }),
        ).toBeNull(),
      );

      expect(document.activeElement).toBe(document.body);

      // And after the deferred fallback tick (#824) — the assertion that
      // fails without the `heldFocusRef` gate: the round-2 code reads
      // `activeElement === body` here (true, since it always was) and moves
      // focus to the map surface anyway, even though nothing died with the
      // flyout.
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(focusHolder()).toBe("<body>");
      expect(document.activeElement).not.toBe(
        container.querySelector("[data-map-surface]"),
      );
    } finally {
      useSettingsStore.setState({ uiInteraction: originalUiInteraction });
    }
  });

  it("PathPointInspector: a click-through open with no selection never moves focus off <body>", async () => {
    const pointSet = buildTestPathPointSet();
    const { container } = render(
      <PathPointInspectorHost pointSet={pointSet} />,
    );

    // Mirrors `RayPathArc`'s `onTraceClick` in production: clicking the path
    // trace itself opens the panel with no `selectedId`, so `PathPointList`'s
    // own mount-time focus effect early-returns and never takes focus.
    fireEvent.click(screen.getByTestId("path-point-hit-area-no-select"));
    await screen.findByRole("dialog", { name: "Path point details" });
    expect(document.activeElement).toBe(document.body);

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Path point details" }),
      ).toBeNull(),
    );

    expect(document.activeElement).toBe(document.body);

    // And after the deferred fallback tick (#824), for the same reason as
    // the `PinFlyout` case above.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(focusHolder()).toBe("<body>");
    expect(document.activeElement).not.toBe(
      container.querySelector("[data-map-surface]"),
    );
  });

  // -------------------------------------------------------------------------
  // Pointer-only blur of a live opener (#824 round 5, Codex on PR #842): a
  // click on non-focusable overlay content can blur a persistent control to
  // `<body>` without focus ever entering the overlay. The restore-branch
  // cases above never hit this — each one either moves focus into the
  // overlay (so `heldFocusRef` is true) or moves it to a second live control
  // (so gate 1, `activeElement !== body`, returns before the restore branch
  // is ever reached). This is the one shape neither of those covers: focus
  // dies to `<body>` while the overlay never held it. Only `PinFlyout` and
  // `PathPointInspector` can reach it through their normal open flow —
  // `SpotCollectionPopover` and `SelectedSpotCard` both auto-focus
  // themselves on a `setTimeout(0)` shortly after opening, so `heldFocusRef`
  // is always true by the time either of them could close in this shape.
  // -------------------------------------------------------------------------

  it("PinFlyout: does not resurrect the opener after a pointer-only interaction", async () => {
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
        <button type="button" aria-label="control a">
          a
        </button>
      </Wrap>,
    );

    const controlA = screen.getByRole("button", { name: "control a" });
    controlA.focus();
    expect(focusHolder()).toBe('button[aria-label="control a"]');

    const canvas = screen.getByRole("img", {
      name: /Interactive propagation map/i,
    });
    const pinPos = toCanvas(10, 10);
    fireEvent.pointerMove(canvas, {
      clientX: pinPos.x,
      clientY: pinPos.y,
      pointerId: 1,
    });
    await screen.findByRole("button", { name: "Edit Pin" });
    // `controlA` was still focused and untouched when the flyout's setup
    // effect ran, so `previousFocusRef` now holds it.
    expect(document.activeElement).toBe(controlA);

    // A click on non-focusable flyout content ("No notes" — Test Pin has no
    // notes, so this text is always present), not a button. Real browsers
    // can blur the currently focused element on a mousedown against
    // non-focusable content by default; jsdom does not reproduce that on a
    // bare `fireEvent`, so the explicit `.blur()` stands in for it.
    fireEvent.mouseDown(screen.getByText("No notes"));
    (document.activeElement as HTMLElement).blur();
    expect(document.activeElement).toBe(document.body);

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: /Pin info: Test Pin/i }),
      ).toBeNull(),
    );

    // Long enough for the deferred fallback tick (#824) to have fired.
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Not restored to `controlA` (this flyout never held focus, so it has
    // nothing to give back) and not handed to the map surface either (same
    // reason — the fallback is gated on `heldFocusRef` too).
    expect(focusHolder()).toBe("<body>");
    expect(document.activeElement).not.toBe(
      container.querySelector("[data-map-surface]"),
    );
  });

  it("PathPointInspector: does not resurrect the opener after a pointer-only interaction", async () => {
    const pointSet = buildTestPathPointSet();
    const { container } = render(
      <>
        <PathPointInspectorHost pointSet={pointSet} />
        <button type="button" aria-label="control a">
          a
        </button>
      </>,
    );

    const controlA = screen.getByRole("button", { name: "control a" });
    controlA.focus();
    expect(focusHolder()).toBe('button[aria-label="control a"]');

    // The no-select hit area, matching the "focus never entered" cases
    // above: it opens the panel without picking a point, so `PathPointList`
    // never auto-focuses anything and `controlA` stays focused while the
    // panel's own setup effect runs.
    fireEvent.click(screen.getByTestId("path-point-hit-area-no-select"));
    await screen.findByRole("dialog", { name: "Path point details" });
    expect(document.activeElement).toBe(controlA);

    // A click on non-focusable panel content (the "Path details" heading,
    // shown here because no point is selected), not a button. Real browsers
    // can blur the currently focused element on a mousedown against
    // non-focusable content by default; jsdom does not reproduce that on a
    // bare `fireEvent`, so the explicit `.blur()` stands in for it.
    fireEvent.mouseDown(screen.getByText("Path details"));
    (document.activeElement as HTMLElement).blur();
    expect(document.activeElement).toBe(document.body);

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Path point details" }),
      ).toBeNull(),
    );

    // Long enough for the deferred fallback tick (#824) to have fired.
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Not restored to `controlA` (this panel never held focus, so it has
    // nothing to give back) and not handed to the map surface either (same
    // reason — the fallback is gated on `heldFocusRef` too).
    expect(focusHolder()).toBe("<body>");
    expect(document.activeElement).not.toBe(
      container.querySelector("[data-map-surface]"),
    );
  });
});
