import { describe, expect, it } from "vitest";
import {
  accessibleGlyphFill,
  buildFlatClusterGlyphs,
  findFlatClusterGlyphAtPoint,
  flatClusterGlyphAnchor,
  flatClusterGlyphTooltip,
} from "./flatSpotClusterGlyphs";
import { clusterSpots, type SpotCluster } from "@/lib/spots/grouping";
import { stationContrast } from "@/lib/themes/stationTokens";
import {
  AGE_COLOR_STOPS,
  BAND_COLORS,
  MODE_COLORS,
  SNR_COLOR_STOPS,
  getSpotColor,
} from "@/lib/utils/spotColors";
import type { LiveSpot } from "@/types/livespot";

const WIDTH = 1024;
const HEIGHT = 512;

/** The equirectangular mapping `FlatMapView` uses for every canvas layer. */
function project(lat: number, lon: number) {
  return { x: ((lon + 180) / 360) * WIDTH, y: ((90 - lat) / 180) * HEIGHT };
}

function liveSpot(id: string, dx: string, dxLat: number, dxLon: number) {
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

function cluster(
  id: string,
  lat: number,
  lon: number,
  count: number,
  mode = "FT8",
): SpotCluster {
  const spots = Array.from({ length: count }, (_, index) =>
    liveSpot(`${id}-${index}`, `EA${index}AAA`, lat, lon),
  ).map((spot) => ({ ...spot, mode }));
  return {
    id,
    center: { lat, lon },
    spots,
    count,
    primarySpot: spots[0],
  };
}

describe("buildFlatClusterGlyphs", () => {
  // This pins the *local* equirectangular formula the module is fed, not
  // parity with `FlatMapView`: `latLonToCanvas` is module-private, so the
  // injected projector is both input and expectation here. Parity against
  // production-drawn endpoints is asserted in `FlatMapView.grouping.test.tsx`,
  // which mounts the real component and compares glyph and dot positions
  // produced by the component's own projection.
  it("pins the local equirectangular formula it is handed", () => {
    const [glyph] = buildFlatClusterGlyphs(
      [cluster("g:1:es", 40.4, -3.7, 4)],
      project,
      { width: WIDTH, height: HEIGHT },
    );
    expect(glyph.x).toBeCloseTo(project(40.4, -3.7).x, 6);
    expect(glyph.y).toBeCloseTo(project(40.4, -3.7).y, 6);
    expect(glyph.count).toBe(4);
    expect(glyph.id).toBe("g:1:es");
  });

  it("consumes the real clusterSpots output, ids and anchor included", () => {
    const grouped = clusterSpots(
      [
        liveSpot("ea-1", "EA1AAA", 40.4, -3.7),
        liveSpot("ea-2", "EA3BBB", 41.4, 2.2),
        liveSpot("ea-3", "EA7CCC", 37.4, -6.0),
      ],
      { enabled: true, minClusterSize: 3, detail: "regions" },
    );
    expect(grouped.clusters).toHaveLength(1);
    const [glyph] = buildFlatClusterGlyphs(grouped.clusters, project, {
      width: WIDTH,
      height: HEIGHT,
    });
    const anchor = grouped.clusters[0].center;
    expect(glyph.id).toBe(grouped.clusters[0].id);
    expect(glyph.x).toBeCloseTo(project(anchor.lat, anchor.lon).x, 6);
    expect(glyph.count).toBe(3);
  });

  it("drops anchors that project outside the canvas box", () => {
    const glyphs = buildFlatClusterGlyphs(
      [
        cluster("g:1:on", 0, 0, 3),
        // Longitudes are wrapped upstream; an unwrapped anchor must not paint
        // a glyph off the edge of the map.
        cluster("g:1:off", 0, 400, 3),
      ],
      project,
      { width: WIDTH, height: HEIGHT },
    );
    expect(glyphs.map((glyph) => glyph.id)).toEqual(["g:1:on"]);
  });

  it("grows with member count and shrinks with zoom so screen size holds", () => {
    const at = (count: number, zoomScale: number) =>
      buildFlatClusterGlyphs([cluster("g:1:es", 40, -3, count)], project, {
        width: WIDTH,
        height: HEIGHT,
        zoomScale,
      })[0].radius;
    expect(at(50, 1)).toBeGreaterThan(at(3, 1));
    expect(at(3, 4)).toBeCloseTo(at(3, 1) / 4, 6);
    // Zooming out past 1 must not inflate the glyph.
    expect(at(3, 0.25)).toBeCloseTo(at(3, 1), 6);
  });

  it("caps the drawn radius so the worst realistic group stays bounded", () => {
    // Feed budget 500 at the top of the dot-size slider is the realistic
    // ceiling; uncapped this curve yields ~59px.
    const [huge] = buildFlatClusterGlyphs(
      [cluster("g:1:big", 0, 0, 500)],
      project,
      { width: WIDTH, height: HEIGHT, spotDotScale: 2 },
    );
    expect(huge.radius).toBe(34);
  });

  it("holds the count text at 11px of screen space and fits the disc to it", () => {
    const [tiny] = buildFlatClusterGlyphs(
      [cluster("g:1:es", 40, -3, 3)],
      project,
      { width: WIDTH, height: HEIGHT, spotDotScale: 0.5 },
    );
    // radius * 1.05 would be ~7px at this slider position — unreadable.
    expect(tiny.fontPx).toBeGreaterThanOrEqual(11);
    // The numeral has to fit inside the disc it is centred in: monospace
    // advance is ~0.6em, so a single digit needs 0.3em of radius.
    expect(tiny.radius).toBeGreaterThan(tiny.fontPx * 0.3);

    const [zoomed] = buildFlatClusterGlyphs(
      [cluster("g:1:es", 40, -3, 3)],
      project,
      { width: WIDTH, height: HEIGHT, spotDotScale: 0.5, zoomScale: 4 },
    );
    // The floor is screen space, so it damps like every other size.
    expect(zoomed.fontPx).toBeCloseTo(tiny.fontPx / 4, 6);
  });

  it("names the group for the hover tooltip", () => {
    const grouped = clusterSpots(
      [
        liveSpot("ea-1", "EA1AAA", 40.4, -3.7),
        liveSpot("ea-2", "EA3BBB", 41.4, 2.2),
        liveSpot("ea-3", "EA7CCC", 37.4, -6.0),
      ],
      { enabled: true, minClusterSize: 3, detail: "regions" },
    );
    const [glyph] = buildFlatClusterGlyphs(grouped.clusters, project, {
      width: WIDTH,
      height: HEIGHT,
    });
    expect(glyph.label).toBe(grouped.clusters[0].label);
    expect(glyph.label.length).toBeGreaterThan(0);
    expect(flatClusterGlyphTooltip(glyph)).toBe(`3 spots · ${glyph.label}`);
  });
});

describe("accessibleGlyphFill", () => {
  // Every colour `getSpotColor` can return, across all four ramps — the glyph
  // fill follows the user's `spotColorMode`, so a mode-only sweep would leave
  // the band, snr and age ramps unguarded.
  const ALL_RAMP_FILLS = [
    ...Object.values(MODE_COLORS),
    ...Object.values(BAND_COLORS),
    ...SNR_COLOR_STOPS.map((stop) => stop.color),
    ...AGE_COLOR_STOPS.map((stop) => stop.color),
  ];

  it("clears WCAG AA for every fill getSpotColor can return", () => {
    const failing = ALL_RAMP_FILLS.filter((source) => {
      const { fill, ink } = accessibleGlyphFill(source);
      return stationContrast(ink, fill) < 4.5;
    });
    expect(failing).toEqual([]);
  });

  it("steps a mid-luminance fill that no ink can clear", () => {
    // 30-60 min age bucket: 3.94:1 with the better of the two inks.
    const source = AGE_COLOR_STOPS[3].color;
    const { fill, ink } = accessibleGlyphFill(source);
    expect(stationContrast(ink, source)).toBeLessThan(4.5);
    expect(fill).not.toBe(source);
    expect(stationContrast(ink, fill)).toBeGreaterThanOrEqual(4.5);
  });

  it("leaves a fill that already clears AA untouched", () => {
    expect(accessibleGlyphFill(MODE_COLORS.FT8)).toEqual({
      fill: MODE_COLORS.FT8,
      ink: "#0a0a0a",
    });
  });

  it("reaches the glyph through buildFlatClusterGlyphs on the age ramp", () => {
    const aged = cluster("g:1:age", 10, 10, 5);
    const stale = { ...aged.spots[0], time: new Date(Date.now() - 45 * 60000) };
    const agedCluster: SpotCluster = {
      ...aged,
      spots: [stale, ...aged.spots.slice(1)],
      primarySpot: stale,
    };
    expect(getSpotColor(stale, "age")).toBe(AGE_COLOR_STOPS[3].color);
    const [glyph] = buildFlatClusterGlyphs([agedCluster], project, {
      width: WIDTH,
      height: HEIGHT,
      colorMode: "age",
    });
    expect(glyph.color).not.toBe(AGE_COLOR_STOPS[3].color);
    expect(stationContrast(glyph.ink, glyph.color)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("findFlatClusterGlyphAtPoint", () => {
  const glyphs = buildFlatClusterGlyphs(
    [cluster("g:1:es", 40, -3, 3), cluster("g:1:jp", 35, 139, 40)],
    project,
    { width: WIDTH, height: HEIGHT },
  );

  it("returns the glyph whose disc contains the point", () => {
    const target = glyphs[1];
    expect(
      findFlatClusterGlyphAtPoint(glyphs, { x: target.x + 2, y: target.y - 2 })
        ?.id,
    ).toBe("g:1:jp");
  });

  it("returns null for a point outside every disc", () => {
    expect(findFlatClusterGlyphAtPoint(glyphs, { x: 5, y: 5 })).toBeNull();
  });

  it("prefers the nearer centre when two discs overlap", () => {
    const overlapping = buildFlatClusterGlyphs(
      [cluster("g:1:a", 0, 0, 3), cluster("g:1:b", 0, 1, 3)],
      project,
      { width: WIDTH, height: HEIGHT },
    );
    // ~2.8px apart at this projection, well inside both discs.
    expect(
      findFlatClusterGlyphAtPoint(overlapping, {
        x: overlapping[1].x - 0.2,
        y: overlapping[1].y,
      })?.id,
    ).toBe("g:1:b");
  });

  it("widens a small group's hit target to the 18px screen floor", () => {
    const [small] = buildFlatClusterGlyphs(
      [cluster("g:1:es", 40, -3, 3)],
      project,
      { width: WIDTH, height: HEIGHT },
    );
    // The drawn disc is smaller than a comfortable pointer target.
    expect(small.radius).toBeLessThan(18);
    expect(small.radius).toBeGreaterThan(13);
    expect(
      findFlatClusterGlyphAtPoint([small], { x: small.x + 16, y: small.y })?.id,
    ).toBe("g:1:es");
    expect(
      findFlatClusterGlyphAtPoint([small], { x: small.x + 19, y: small.y }),
    ).toBeNull();
  });

  it("scales the hit floor with the dot-size slider so it cannot outgrow a single's", () => {
    const build = (spotDotScale: number) =>
      buildFlatClusterGlyphs([cluster("g:1:es", 40, -3, 3)], project, {
        width: WIDTH,
        height: HEIGHT,
        spotDotScale,
      })[0];
    // A single's hit radius at the bottom of the slider is
    // `Math.max(10, 12 * 0.5)` = 10; a fixed 18px glyph floor would be nearly
    // three times its own drawn disc and would steal the neighbours' clicks.
    const small = build(0.5);
    expect(small.hitRadius).toBeLessThan(10);
    expect(small.hitRadius).toBeGreaterThanOrEqual(small.radius);
    expect(build(1).hitRadius).toBe(18);
    expect(build(2).hitRadius).toBe(36);
  });

  it("scales the hit floor with zoom so it stays 18px of screen space", () => {
    const zoomed = buildFlatClusterGlyphs(
      [cluster("g:1:es", 40, -3, 3)],
      project,
      { width: WIDTH, height: HEIGHT, zoomScale: 8 },
    );
    expect(
      findFlatClusterGlyphAtPoint(zoomed, {
        x: zoomed[0].x + 16 / 8,
        y: zoomed[0].y,
      })?.id,
    ).toBe("g:1:es");
    expect(
      findFlatClusterGlyphAtPoint(zoomed, {
        x: zoomed[0].x + 19 / 8,
        y: zoomed[0].y,
      }),
    ).toBeNull();
  });
});

describe("flatClusterGlyphAnchor", () => {
  it("centres a square screen anchor on the glyph", () => {
    const [glyph] = buildFlatClusterGlyphs(
      [cluster("g:1:es", 40, -3, 3)],
      project,
      { width: WIDTH, height: HEIGHT },
    );
    const anchor = flatClusterGlyphAnchor(
      glyph,
      (x, y) => ({ x: x * 2 + 10, y: y * 2 + 20 }),
      16,
    );
    expect(anchor.x).toBeCloseTo(glyph.x * 2 + 10 - 16, 6);
    expect(anchor.y).toBeCloseTo(glyph.y * 2 + 20 - 16, 6);
    expect(anchor.width).toBe(32);
    expect(anchor.height).toBe(32);
  });
});
