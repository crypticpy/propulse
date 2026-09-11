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
import {
  computeSpotCollectionPopoverLayout,
  ROOT_FONT_PX_DEFAULT,
  SPOT_COLLECTION_POPOVER_CHROME_REM,
  SPOT_COLLECTION_WALL_DETAIL_ROW_REM,
  SPOT_COLLECTION_WALL_MORE_ROW_REM,
} from "./spotCollectionPopoverLayout";

/* Pixel values of the rem budgets at the default root font size. The
 * text-scale case below re-derives them at the xl root instead. */
const SPOT_COLLECTION_POPOVER_CHROME_HEIGHT =
  SPOT_COLLECTION_POPOVER_CHROME_REM * ROOT_FONT_PX_DEFAULT;
const SPOT_COLLECTION_WALL_DETAIL_ROW_HEIGHT =
  SPOT_COLLECTION_WALL_DETAIL_ROW_REM * ROOT_FONT_PX_DEFAULT;
const SPOT_COLLECTION_WALL_MORE_ROW_HEIGHT =
  SPOT_COLLECTION_WALL_MORE_ROW_REM * ROOT_FONT_PX_DEFAULT;

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
      // 5, not 6: every spot in `makeSpots` carries a `dxGrid`, so each row
      // renders the three-line variant (72px, not 54px). Budgeting them all
      // at the two-line height fitted a sixth row the clipped body could not
      // show while the aria label and "+N more" still counted it (#879
      // review round).
      expect(rows).toHaveLength(4);
      expect(screen.getByText("+76 more")).toBeTruthy();

      const panel = screen.getByRole("dialog");
      // F7: the announced count must match what is actually on screen, not
      // the full un-capped collection.
      expect(panel.getAttribute("aria-label")).toBe(
        "Test collection: showing 4 of 80 spots",
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
      ).toHaveLength(4);
      expect(screen.getByText("+76 more")).toBeTruthy();
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
      expect(rows.length).toBeLessThan(4);
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
      const moreRow = screen.getByText("+76 more");
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
      ).toHaveLength(4);

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
        ).toBeLessThan(4);
      });
      host.remove();
    });

    it("budgets the grid/comment third line so every rendered row fits the clipped body (#879)", () => {
      // The wall body is `overflow-hidden`, so a row that does not fit is not
      // scrolled to, it is invisible -- while the aria label and the "+N more"
      // count still claim it. Every spot here carries a `dxGrid`, so each row
      // is the three-line variant; the rendered count must fit the list budget
      // at THAT height, not at the two-line height.
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
      const rows = screen.getAllByRole("button", { name: /Select K\d+ABC/ });
      const listBudget =
        Number.parseFloat(panel.style.maxHeight) -
        SPOT_COLLECTION_POPOVER_CHROME_HEIGHT;
      const needed =
        rows.length * SPOT_COLLECTION_WALL_DETAIL_ROW_HEIGHT +
        SPOT_COLLECTION_WALL_MORE_ROW_HEIGHT;

      expect(needed).toBeLessThanOrEqual(listBudget);
      host.remove();
    });

    it("re-derives the row cap when the text scale raises the root font size (#879 review round 3)", async () => {
      // `:root[data-text-scale="xl"]` sets the document font size to 22px
      // (src/styles/globals.css), so every rem-sized row grows by ~37%. A
      // fixed-pixel budget kept rendering the 16px row count and the extra
      // rows were clipped by the `overflow-hidden` wall body.
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
      const before = screen.getAllByRole("button", {
        name: /Select K\d+ABC/,
      }).length;

      document.documentElement.style.fontSize = "22px";
      document.documentElement.setAttribute("data-text-scale", "xl");

      try {
        await vi.waitFor(() => {
          expect(
            screen.getAllByRole("button", { name: /Select K\d+ABC/ }).length,
          ).toBeLessThan(before);
        });

        const rows = screen.getAllByRole("button", { name: /Select K\d+ABC/ });
        const listBudget =
          Number.parseFloat(panel.style.maxHeight) -
          SPOT_COLLECTION_POPOVER_CHROME_REM * 22;
        const needed =
          rows.length * SPOT_COLLECTION_WALL_DETAIL_ROW_REM * 22 +
          SPOT_COLLECTION_WALL_MORE_ROW_REM * 22;
        expect(needed).toBeLessThanOrEqual(listBudget);
      } finally {
        document.documentElement.removeAttribute("data-text-scale");
        document.documentElement.style.fontSize = "";
        host.remove();
      }
    });

    it("measures the rendered rows and drops the count when they are taller than the estimate (#879 review round 4)", async () => {
      // The badge line is `flex-wrap`: at a clamped width or a large text
      // scale a row is taller than any rem formula predicts, so the rendered
      // rows are measured and the real heights drive the cap. jsdom does no
      // layout, so `offsetHeight` is stubbed to stand in for the wrap.
      const host = makeHost(400, 600);
      const measured = vi
        .spyOn(HTMLElement.prototype, "offsetHeight", "get")
        .mockImplementation(function (this: HTMLElement) {
          return this.hasAttribute("data-spot-row") ? 140 : 0;
        });

      try {
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
        await vi.waitFor(() => {
          const rows = screen.getAllByRole("button", {
            name: /Select K\d+ABC/,
          });
          const listBudget =
            Number.parseFloat(panel.style.maxHeight) -
            SPOT_COLLECTION_POPOVER_CHROME_HEIGHT;
          expect(rows.length * 140 + SPOT_COLLECTION_WALL_MORE_ROW_HEIGHT).
            toBeLessThanOrEqual(listBudget);
        });

        const rows = screen.getAllByRole("button", { name: /Select K\d+ABC/ });
        // Four rows fit the pre-paint estimate; 140px rows do not.
        expect(rows.length).toBeLessThan(4);
        expect(rows.length).toBeGreaterThan(0);
      } finally {
        measured.mockRestore();
        host.remove();
      }
    });

    it("settles the cap in two passes when the boundary row wraps (#879 review round 5)", async () => {
      // The reported loop: five short rows and a sixth whose badges wrap.
      // Measuring only the rendered rows and REPLACING the measurement array
      // threw the sixth row's height away the moment the cap dropped it, so
      // it was re-estimated short, came back, measured tall, and the count
      // flipped 6/5/6/5 until React's max update depth. Measurements are
      // keyed by spot identity and retained, so the tall row stays known.
      const host = makeHost(400, 600);
      const { maxHeight } = computeSpotCollectionPopoverLayout(
        { x: 100, y: 300 },
        host,
        host,
      );
      const listBudget = maxHeight - SPOT_COLLECTION_POPOVER_CHROME_HEIGHT;
      // Six short rows fit; the sixth measured tall never does.
      const SHORT = Math.floor((listBudget - 40) / 6);
      const TALL = listBudget;
      const measured = vi
        .spyOn(HTMLElement.prototype, "offsetHeight", "get")
        .mockImplementation(function (this: HTMLElement) {
          const key = this.dataset.spotRow;
          if (!key) return 0;
          return key === "spot-5" ? TALL : SHORT;
        });
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});

      try {
        render(
          <SpotCollectionPopover
            visible
            isWallCanvas
            position={{ x: 100, y: 300 }}
            title="Test collection"
            spots={makeSpots(6)}
            portalTarget={host}
            onClose={() => {}}
            onSpotSelect={() => {}}
          />,
        );

        const rowCount = () =>
          screen.getAllByRole("button", { name: /Select K\d+ABC/ }).length;
        await vi.waitFor(() => expect(rowCount()).toBe(5));

        // Settled: further effect flushes must not move it back up, which is
        // what losing the tall row's measurement did.
        const counts = [rowCount()];
        for (let tick = 0; tick < 4; tick += 1) {
          await Promise.resolve();
          counts.push(rowCount());
        }
        expect(counts).toEqual([5, 5, 5, 5, 5]);
        expect(
          errors.mock.calls.some((call) =>
            String(call[0]).includes("Maximum update depth"),
          ),
        ).toBe(false);
      } finally {
        errors.mockRestore();
        measured.mockRestore();
        host.remove();
      }
    });

    it("keeps the body portal's fixed frame when the host becomes usable mid-session (#879 review round 4)", async () => {
      // Opened while the host was unusable: the popover portals into
      // `document.body`. A later resize that makes the host measurable must
      // not switch the placement to absolute host-local coordinates while the
      // children still hang off `body`.
      const host = makeHost(8, 8);
      render(
        <SpotCollectionPopover
          visible
          isWallCanvas
          position={{ x: 100, y: 300 }}
          title="Test collection"
          spots={makeSpots(10)}
          portalTarget={host}
          onClose={() => {}}
          onSpotSelect={() => {}}
        />,
      );

      const panel = screen.getByRole("dialog");
      expect(panel.closest("body")).toBe(document.body);
      expect(host.contains(panel)).toBe(false);
      expect(panel.style.position).toBe("fixed");
      const before = {
        left: panel.style.left,
        top: panel.style.top,
      };

      host.getBoundingClientRect = makeHost(400, 600, 120, 80)
        .getBoundingClientRect;
      window.dispatchEvent(new Event("resize"));

      await vi.waitFor(() => {
        expect(screen.getByRole("dialog").style.position).toBe("fixed");
      });
      const after = screen.getByRole("dialog");
      expect(host.contains(after)).toBe(false);
      expect(after.style.left).toBe(before.left);
      expect(after.style.top).toBe(before.top);
      host.remove();
    });

    it("keeps the portal container and keyboard focus when the host rect degenerates mid-resize (#879)", async () => {
      // React recreates a portal's children when its container changes, so
      // re-resolving the container on every resize tick would remount the open
      // popover the moment a host dipped below the usability threshold and
      // drop focus to <body>.
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

      await vi.waitFor(() => {
        expect(document.activeElement?.getAttribute("aria-label")).toBe(
          "Select K0ABC and view details",
        );
      });

      host.getBoundingClientRect = () =>
        ({
          left: 0,
          top: 0,
          right: 8,
          bottom: 8,
          width: 8,
          height: 8,
          x: 0,
          y: 0,
          toJSON() {},
        }) as DOMRect;
      window.dispatchEvent(new Event("resize"));

      await vi.waitFor(() => {
        const panel = screen.getByRole("dialog");
        expect(host.contains(panel)).toBe(true);
      });
      expect(document.activeElement?.getAttribute("aria-label")).toBe(
        "Select K0ABC and view details",
      );
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
