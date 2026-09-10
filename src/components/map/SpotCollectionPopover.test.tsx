/**
 * Host-bounded max height for the map spot-collection popover (#846), plus
 * the #871 rework round: pointer-events re-enablement inside a
 * pointer-events-none map portal (F1), maxHeight derived from the same
 * clamp that placed the popover rather than an independent frame-only
 * formula (F2), a bounds-only host that keeps `position: fixed` but adds
 * its own rect back into the on-screen coordinates (F3), inline width
 * matching the frame-clamped overlay size (F6), and a wall aria-label that
 * announces the capped count (F7).
 *
 * `resolveOverlayFrame`/`placeAnchoredOverlayInFrame` (the same helpers
 * `PathPointInspector` uses) read `portalTarget.getBoundingClientRect()`.
 * jsdom does no layout, so these tests stub that rect on a detached host
 * element to stand in for a map container shorter than the viewport (a
 * bottom toolbar row, the HamClock wall, an embedded panel). What this
 * can't prove: real pixel layout, scrollbar rendering, or anchor placement
 * against an actual painted map — only the computed style values and the
 * class/row contract that produces scrolling vs. capping.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PresentableSpot } from "@/lib/map/spotPresentation";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { SpotCollectionPopover } from "./SpotCollectionPopover";

// Round 3 (#871 review again): the wall row cap used to be driven by
// `useEffectiveCanvasType()`, which reads `workspaceStore`. `HamClockView`
// -- the only production mount that is actually the wall -- is deliberately
// outside `WorkspacePage` and never sets that store's `canvasTypeOverride`
// (see `useHamClockWallOperatingState.ts`'s doc comment), so that predicate
// was unreachable from the real wall mount; it only ever fired in tests
// that set the override directly. `isWallCanvas` is now an explicit prop
// threaded from `HamClockView` through the map views, and the "on the
// HamClock wall" tests below pass it directly instead of touching
// `workspaceStore` at all.

function makeSpots(count: number): PresentableSpot[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `spot-${i}`,
    spotter: "W1AW",
    dx: `K${i}ABC`,
    dxGrid: "DM79",
    frequency: 14074 + i,
    mode: "FT8",
    time: new Date(Date.now() - i * 1000),
    band: "20m",
    dxLat: 39.7,
    dxLon: -104.9,
    source: "PSKReporter",
  })) as PresentableSpot[];
}

/** A detached host whose rect stands in for a map container shorter than
 * the viewport — jsdom never lays this out, so the rect is stubbed. */
function makeHost(width: number, height: number, left = 0, top = 0) {
  const host = document.createElement("div");
  host.getBoundingClientRect = () =>
    ({
      left,
      top,
      right: left + width,
      bottom: top + height,
      width,
      height,
      x: left,
      y: top,
      toJSON() {},
    }) as DOMRect;
  document.body.appendChild(host);
  return host;
}

describe("SpotCollectionPopover host-bounded height (#846)", () => {
  it("caps the popover to a 600px-tall map host, not the 100vh window default, and re-enables pointer events", () => {
    const host = makeHost(400, 600);
    render(
      <SpotCollectionPopover
        visible
        position={{ x: 100, y: 300 }}
        title="Test collection"
        spots={makeSpots(80)}
        portalTarget={host}
        onClose={() => {}}
        onSpotSelect={() => {}}
      />,
    );
    const panel = screen.getByRole("dialog");
    // Anchor {x:100,y:300} against a 400x600 frame clamps to the left
    // placement (right overflows) at {x:10, y:85} (EDGE_PADDING=10,
    // POPOVER_WIDTH=330, POPOVER_HEIGHT=430 all clamped to the frame).
    expect(panel.style.left).toBe("10px");
    expect(panel.style.top).toBe("85px");
    expect(panel.style.width).toBe("330px"); // F6: inline, not viewport-bound
    // F2: maxHeight is derived from the same placement that set `top`, so
    // top + maxHeight lands exactly on the host's bottom edge (minus
    // padding) rather than an independently-computed, possibly-looser bound.
    expect(panel.style.maxHeight).toBe("505px");
    const top = Number.parseInt(panel.style.top, 10);
    const maxHeight = Number.parseInt(panel.style.maxHeight, 10);
    expect(top + maxHeight).toBeLessThanOrEqual(600 - 10);
    expect(panel.style.maxHeight).not.toContain("100vh");
    expect(panel.style.position).toBe("absolute");

    // F1: the map overlay portal host GlobeView renders this into is
    // `pointer-events-none`; without re-enabling it here the popover is
    // inert to clicks despite being visibly on top.
    expect(panel.className).toContain("pointer-events-auto");

    const list = panel.querySelector(":scope > div:nth-child(2)");
    expect(list?.className).toContain("overflow-y-auto");
    host.remove();
  });

  it("falls back to the viewport frame when no portalTarget is given", () => {
    render(
      <SpotCollectionPopover
        visible
        position={{ x: 100, y: 300 }}
        title="Test collection"
        spots={makeSpots(3)}
        onClose={() => {}}
        onSpotSelect={() => {}}
      />,
    );
    const panel = screen.getByRole("dialog");
    expect(panel.style.position).toBe("fixed");
    // jsdom's default viewport is 1024x768; the anchor fits to the right at
    // {x:112, y:85}, so maxHeight is bounded by the window height, not an
    // arbitrary constant.
    expect(panel.style.left).toBe("112px");
    expect(panel.style.top).toBe("85px");
    expect(panel.style.maxHeight).toBe(`${window.innerHeight - 85 - 10}px`);
  });

  it("bounds by a boundsHost without portaling into it, compensating the host's own offset (#871 F3)", () => {
    const host = makeHost(400, 600, 50, 40);
    render(
      <SpotCollectionPopover
        visible
        position={{ x: 100, y: 300 }}
        title="Test collection"
        spots={makeSpots(3)}
        boundsHost={host}
        onClose={() => {}}
        onSpotSelect={() => {}}
      />,
    );
    const panel = screen.getByRole("dialog");
    // Still position: fixed (the popover portals to document.body, not into
    // `host`) but the on-screen left/top add the host's own viewport offset
    // (50, 40) back on top of the frame-local placement (10, 45) —
    // otherwise a bounds-only host at a non-zero offset would place the
    // popover in the wrong spot despite computing the right size.
    expect(panel.style.position).toBe("fixed");
    expect(panel.style.left).toBe("60px");
    expect(panel.style.top).toBe("85px");
    expect(panel.style.maxHeight).toBe("545px");
    expect(host.contains(panel)).toBe(false);
    host.remove();
  });

  describe("on the HamClock wall (isWallCanvas prop)", () => {
    it("caps rows and shows a +N more affordance instead of scrolling, announcing the capped count", () => {
      const host = makeHost(400, 600);
      render(
        <SpotCollectionPopover
          visible
          isWallCanvas
          position={{ x: 100, y: 300 }}
          title="Test collection"
          spots={makeSpots(80)}
          portalTarget={host}
          onClose={() => {}}
          onSpotSelect={() => {}}
        />,
      );
      const rows = screen.getAllByRole("button", { name: /Select K\d+ABC/ });
      expect(rows).toHaveLength(6);
      expect(screen.getByText("+74 more")).toBeTruthy();

      const panel = screen.getByRole("dialog");
      // F7: the wall only renders 6 rows, so the announced count must match
      // what's actually on screen, not the full un-capped collection.
      expect(panel.getAttribute("aria-label")).toBe(
        "Test collection: showing 6 of 80 spots",
      );
      const list = panel.querySelector(":scope > div:nth-child(2)");
      expect(list?.className).toContain("overflow-hidden");
      expect(list?.className).not.toContain("overflow-y-auto");
      host.remove();
    });

    it("shows no affordance when every spot already fits", () => {
      render(
        <SpotCollectionPopover
          visible
          isWallCanvas
          position={{ x: 100, y: 300 }}
          title="Test collection"
          spots={makeSpots(3)}
          onClose={() => {}}
          onSpotSelect={() => {}}
        />,
      );
      expect(screen.queryByText(/more$/)).toBeNull();
    });

    it("caps rows via the isWallCanvas prop with no workspace override set, matching HamClockView's mount (#846/#871 round 3)", () => {
      // The regression this proves: HamClockView never touches
      // `workspaceStore` (it is outside `WorkspacePage`), so a fix that
      // still depended on `canvasTypeOverride` would never actually cap
      // rows on the production wall even though this same test file's
      // earlier version passed by setting that override directly.
      expect(useWorkspaceStore.getState().canvasTypeOverride).toBeNull();
      const host = makeHost(400, 600);
      render(
        <SpotCollectionPopover
          visible
          isWallCanvas
          position={{ x: 100, y: 300 }}
          title="Test collection"
          spots={makeSpots(80)}
          portalTarget={host}
          onClose={() => {}}
          onSpotSelect={() => {}}
        />,
      );
      expect(useWorkspaceStore.getState().canvasTypeOverride).toBeNull();
      expect(
        screen.getAllByRole("button", { name: /Select K\d+ABC/ }),
      ).toHaveLength(6);
      expect(screen.getByText("+74 more")).toBeTruthy();
      host.remove();
    });

    it("derives the wall row cap from maxHeight instead of a fixed count (#879)", () => {
      const host = makeHost(400, 260);
      render(
        <SpotCollectionPopover
          visible
          isWallCanvas
          position={{ x: 100, y: 120 }}
          title="Test collection"
          spots={makeSpots(80)}
          portalTarget={host}
          onClose={() => {}}
          onSpotSelect={() => {}}
        />,
      );

      const rows = screen.getAllByRole("button", { name: /Select K\d+ABC/ });
      expect(rows.length).toBeLessThan(6);
      expect(rows.length).toBeGreaterThan(0);
      expect(screen.getByText(/\+\d+ more/)).toBeTruthy();
      host.remove();
    });

    it("keeps the +N more row outside the clipped list body (#879)", () => {
      const host = makeHost(400, 600);
      render(
        <SpotCollectionPopover
          visible
          isWallCanvas
          position={{ x: 100, y: 300 }}
          title="Test collection"
          spots={makeSpots(80)}
          portalTarget={host}
          onClose={() => {}}
          onSpotSelect={() => {}}
        />,
      );

      const panel = screen.getByRole("dialog");
      const moreRow = screen.getByText("+74 more");
      const listBody = panel.querySelector(":scope > div:nth-child(2)");
      const clippedRows = listBody?.querySelector(":scope > div:first-child");

      expect(listBody?.className).toContain("flex-col");
      expect(clippedRows?.className).toContain("overflow-hidden");
      expect(clippedRows?.contains(moreRow)).toBe(false);
      expect(moreRow.className).toContain("shrink-0");
      host.remove();
    });

    it("recomputes layout when the host rect changes (#879)", async () => {
      const host = makeHost(400, 600);
      render(
        <SpotCollectionPopover
          visible
          isWallCanvas
          position={{ x: 100, y: 300 }}
          title="Test collection"
          spots={makeSpots(80)}
          portalTarget={host}
          onClose={() => {}}
          onSpotSelect={() => {}}
        />,
      );

      expect(
        screen.getAllByRole("button", { name: /Select K\d+ABC/ }),
      ).toHaveLength(6);

      host.getBoundingClientRect = () =>
        ({
          left: 0,
          top: 0,
          right: 400,
          bottom: 260,
          width: 400,
          height: 260,
          x: 0,
          y: 0,
          toJSON() {},
        }) as DOMRect;

      window.dispatchEvent(new Event("resize"));

      await vi.waitFor(() => {
        expect(
          screen.getAllByRole("button", { name: /Select K\d+ABC/ }).length,
        ).toBeLessThan(6);
      });
      host.remove();
    });

    it("does not cap rows when isWallCanvas is left at its default (off the wall)", () => {
      // Negative control for the prop itself: mirrors how the four
      // non-HamClock mounts (PropSphere page, AtmosGlobeView, MobileMap,
      // FullscreenPropSphere) call these views today, none of which pass
      // `isWallCanvas`.
      const host = makeHost(400, 600);
      render(
        <SpotCollectionPopover
          visible
          position={{ x: 100, y: 300 }}
          title="Test collection"
          spots={makeSpots(80)}
          portalTarget={host}
          onClose={() => {}}
          onSpotSelect={() => {}}
        />,
      );
      expect(
        screen.getAllByRole("button", { name: /Select K\d+ABC/ }),
      ).toHaveLength(80);
      expect(screen.queryByText(/more$/)).toBeNull();
      host.remove();
    });
  });
});
