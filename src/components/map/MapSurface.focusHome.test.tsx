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
import { isValidElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ViewProvider } from "@/components/views/ViewProvider";
import { createMemoryWorkingStorage } from "@/lib/views/runtime";
import { clusterSpots } from "@/lib/spots/grouping";
import { useUserStore } from "@/stores/userStore";
import type { SpotCluster } from "@/hooks/useSpotClustering";
import type { ResolvedSpot } from "@/components/map/LiveSpotArcs";
import type { LiveSpot } from "@/types/livespot";
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
});
