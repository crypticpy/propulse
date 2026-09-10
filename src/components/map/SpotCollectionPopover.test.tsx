/**
 * Host-bounded max height for the map spot-collection popover (#846).
 *
 * `resolveOverlayFrame`/`placeAnchoredOverlayInFrame` (the same helpers
 * `PathPointInspector` uses) read `portalTarget.getBoundingClientRect()`.
 * jsdom does no layout, so these tests stub that rect on a detached host
 * element to stand in for a map container shorter than the viewport (a
 * bottom toolbar row, the HamClock wall, an embedded panel). What this
 * can't prove: real pixel layout, scrollbar rendering, or anchor placement
 * against an actual painted map — only the computed `max-height` style
 * value and the class/row contract that produces scrolling vs. capping.
 */
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PresentableSpot } from "@/lib/map/spotPresentation";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { SpotCollectionPopover } from "./SpotCollectionPopover";

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
function makeHost(width: number, height: number) {
  const host = document.createElement("div");
  host.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      right: width,
      bottom: height,
      width,
      height,
      x: 0,
      y: 0,
      toJSON() {},
    }) as DOMRect;
  document.body.appendChild(host);
  return host;
}

afterEach(() => {
  useWorkspaceStore.getState().setCanvasTypeOverride(null);
});

describe("SpotCollectionPopover host-bounded height (#846)", () => {
  it("caps the popover to a 600px-tall map host, not the 100vh window default", () => {
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
    // The bug: without a host-bounded max-height this renders unbounded
    // (or bounded only by `100vh`, which is far larger than the 600px host
    // used here), so the popover can spill past the host's own bottom edge.
    expect(panel.style.maxHeight).toBe("580px"); // 600 - EDGE_PADDING(10) * 2
    expect(panel.style.maxHeight).not.toContain("100vh");
    expect(panel.style.position).toBe("absolute");

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
    expect(panel.style.maxHeight).toBe(`${window.innerHeight - 20}px`);
  });

  describe("on the HamClock wall", () => {
    beforeEach(() => {
      useWorkspaceStore.getState().setCanvasTypeOverride("wall");
    });

    it("caps rows and shows a +N more affordance instead of scrolling", () => {
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
      const rows = screen.getAllByRole("button", { name: /Select K\d+ABC/ });
      expect(rows).toHaveLength(6);
      expect(screen.getByText("+74 more")).toBeTruthy();

      const panel = screen.getByRole("dialog");
      const list = panel.querySelector(":scope > div:nth-child(2)");
      expect(list?.className).toContain("overflow-hidden");
      expect(list?.className).not.toContain("overflow-y-auto");
      host.remove();
    });

    it("shows no affordance when every spot already fits", () => {
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
      expect(screen.queryByText(/more$/)).toBeNull();
    });
  });
});
