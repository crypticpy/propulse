/**
 * Globe DOM z-band guard (#851)
 *
 * The globe's Drei `<Html>` overlays (spot tags, cluster chips, pins,
 * location/weather/satellite markers, the ISS/HUD panels, the ray-path
 * inspector) share one DOM stacking context that is independent of the
 * WebGL `renderOrder` ladder in `globeRenderOrder.ts`. Before this PR every
 * one of those overlays used the bare literal `zIndexRange={[1, 0]}` (a few
 * used `[10, 5]` or `[180, 0]`), so paint order between, say, a spot tag and
 * a cluster chip was whichever mounted last -- the "tag looks like it's
 * drawn under another layer" bug in #851.
 *
 * `GLOBE_DOM_LAYER_ORDER` in `globeRenderOrder.ts` now gives each overlay
 * family a distinct, non-overlapping 1000-wide band. This guard globs every
 * non-test `.tsx` file under `src/components/map/**` (the fix round's #2
 * item) so a new `<Html>` overlay anywhere in the tree, not just the files
 * a past session happened to touch, is caught if it ships with a bare
 * literal or skips a band entirely.
 *
 * Census at the time of this PR: `git grep -n 'zIndexRange=' -- src/components/map`
 * found 25 sites across 16 files, all now migrated. `src/components/dx/DXSpotOverlay.tsx`
 * has no `zIndexRange` usage and no render-site importers of `DXSpotOverlay3D`
 * outside its own barrel re-export (dead code) -- it lives outside
 * `src/components/map` so this glob never reaches it, and it was intentionally
 * left alone.
 */

import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GLOBE_DOM_LAYER_ORDER,
  MAP_PAGE_CHROME_Z,
} from "@/lib/map/globeRenderOrder";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");
const MAP_DIR = resolve(REPO_ROOT, "src/components/map");

/** Matches a bare numeric tuple, e.g. `[1, 0]` or `[180, 0]` -- the old
 * unspecified-band literal this guard bans. */
const LITERAL_RANGE_RE = /zIndexRange=\{\s*\[\s*-?\d+\s*,\s*-?\d+\s*\]/;

/** Matches every `zIndexRange={...}` occurrence (values here never contain
 * nested braces, so a non-greedy match to the next `}` is safe). */
const ZINDEX_ATTR_RE = /zIndexRange=\{([\s\S]*?)\}(?=\s|\/|>)/g;

/** Matches every `<Html` JSX open tag (drei's overlay component). */
const HTML_TAG_RE = /<Html(?=[\s/>])/g;

/** Every non-test `.tsx` file under `src/components/map/**`, recursively. */
function listMapTsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...listMapTsxFiles(full));
      continue;
    }
    if (!entry.endsWith(".tsx")) continue;
    if (entry.endsWith(".test.tsx")) continue;
    out.push(full);
  }
  return out;
}

const FILES = listMapTsxFiles(MAP_DIR).map((f) => relative(REPO_ROOT, f));

function readSrc(file: string): string {
  return readFileSync(resolve(REPO_ROOT, file), "utf8");
}

describe("globe DOM z-bands stay on the GLOBE_DOM_LAYER_ORDER table (#851)", () => {
  // Positive control: proves the glob actually found the map tree rather
  // than vacuously passing over an empty file list.
  it("globs a non-trivial set of files", () => {
    expect(FILES.length).toBeGreaterThan(20);
  });

  it("has no bare numeric zIndexRange literal anywhere under src/components/map", () => {
    const violations: string[] = [];
    for (const file of FILES) {
      const lines = readSrc(file).split("\n");
      lines.forEach((line, index) => {
        if (LITERAL_RANGE_RE.test(line)) {
          violations.push(`${file}:${index + 1}: ${line.trim()}`);
        }
      });
    }
    expect(
      violations,
      `literal zIndexRange sites (must import a GLOBE_DOM_LAYER_ORDER band instead):\n${violations.join("\n")}`,
    ).toEqual([]);
  });

  it("every zIndexRange under src/components/map references GLOBE_DOM_LAYER_ORDER", () => {
    const violations: string[] = [];
    for (const file of FILES) {
      const src = readSrc(file);
      for (const match of src.matchAll(ZINDEX_ATTR_RE)) {
        if (!match[1].includes("GLOBE_DOM_LAYER_ORDER")) {
          violations.push(`${file}: zIndexRange={${match[1].trim()}}`);
        }
      }
    }
    expect(
      violations,
      `zIndexRange sites not sourced from GLOBE_DOM_LAYER_ORDER:\n${violations.join("\n")}`,
    ).toEqual([]);
  });

  it("every <Html> overlay carries a zIndexRange (count parity per file)", () => {
    // Catches the hole a per-line/per-attribute scan can't: an <Html> site
    // that never got a zIndexRange prop at all. A file with 3 <Html> tags
    // and only 2 zIndexRange attributes has one un-banded overlay.
    const violations: string[] = [];
    for (const file of FILES) {
      const src = readSrc(file);
      const htmlCount = [...src.matchAll(HTML_TAG_RE)].length;
      const zIndexCount = [...src.matchAll(ZINDEX_ATTR_RE)].length;
      if (htmlCount !== zIndexCount) {
        violations.push(
          `${file}: ${htmlCount} <Html> tag(s) but ${zIndexCount} zIndexRange attribute(s)`,
        );
      }
    }
    expect(
      violations,
      `mismatched <Html>/zIndexRange counts (an overlay is missing its band):\n${violations.join("\n")}`,
    ).toEqual([]);
  });
});

describe("GLOBE_DOM_LAYER_ORDER bands stay distinct (#851)", () => {
  it("keeps every band far enough apart for drei's distance ordering", () => {
    const bands = Object.values(GLOBE_DOM_LAYER_ORDER);
    for (const band of bands) {
      if (Array.isArray(band)) {
        expect(band[0] - band[1]).toBeGreaterThanOrEqual(5);
      }
    }
  });
});

describe("GlobeView's Canvas wrapper isolates the DOM bands from map chrome (#851, round 6)", () => {
  // The bands above (0-7999) only stay under GlobeView's fixed chrome
  // (status chip, attribution, radar scrubber, Ft8SpotterHUD -- all
  // z-10/z-20/z-30) if drei's <Html> elements, which by default portal into
  // r3f's own Canvas-wrapper div, are confined to a stacking context of
  // their own. Without `isolation: isolate` on that wrapper, r3f's div is a
  // plain `position: relative` box with no isolation, so its <Html>
  // children's z-index compares directly against MapSurface's other
  // z-indexed siblings -- the round-6 finding. This is a source-level check
  // (a live layout assertion would need a real WebGL canvas, which jsdom
  // can't provide) that the <Canvas> JSX tag itself carries the isolating
  // classes, and that `mapOverlayPortal` -- which must stay OUTSIDE that
  // context so portaled popovers still out-rank the chrome -- is declared
  // as a later sibling, not a descendant.
  const GLOBE_VIEW_PATH = "src/components/map/GlobeView.tsx";
  const src = readSrc(GLOBE_VIEW_PATH);

  it("gives the <Canvas> wrapper its own stacking context (isolate)", () => {
    const canvasStart = src.indexOf("<Canvas");
    expect(
      canvasStart,
      "expected to find a <Canvas ...> opening tag in GlobeView.tsx",
    ).toBeGreaterThan(-1);
    // Slice a window after the tag, strip `//` line comments (JSX attribute
    // lists allow them, and this file uses one to explain the isolation --
    // its own prose contains a literal `<Html>` whose `>` would otherwise
    // confuse a naive "match to the next >" scan for the tag's real end),
    // then find the opening tag's true close.
    const window = src.slice(canvasStart, canvasStart + 2000);
    const windowNoComments = window.replace(/\/\/[^\n]*/g, "");
    const tagEnd = windowNoComments.indexOf(">");
    expect(
      tagEnd,
      `could not find the end of the <Canvas ...> opening tag within 2000 chars:\n${window}`,
    ).toBeGreaterThan(-1);
    const canvasTag = windowNoComments.slice(0, tagEnd + 1);
    const classNameMatch = canvasTag.match(/className="([^"]*)"/);
    expect(
      classNameMatch,
      `<Canvas> tag has no className to isolate its DOM bands:\n${canvasTag}`,
    ).not.toBeNull();
    const classes = classNameMatch![1].split(/\s+/);
    expect(
      classes,
      `<Canvas className="${classNameMatch![1]}"> must include "isolate" so its drei <Html> z-index range (0-7999) can't leak into MapSurface's other z-indexed siblings`,
    ).toContain("isolate");
  });

  it("does not isolate MapSurface itself — only the Canvas wrapper (#930)", () => {
    const mapSurfaceStart = src.indexOf("<MapSurface");
    expect(mapSurfaceStart).toBeGreaterThan(-1);
    const mapSurfaceTag = src.slice(mapSurfaceStart, mapSurfaceStart + 400);
    const classNameMatch = mapSurfaceTag.match(/className="([^"]*)"/);
    expect(classNameMatch).not.toBeNull();
    const classes = classNameMatch![1].split(/\s+/);
    expect(
      classes,
      `MapSurface must not isolate or mapOverlayPortal's z-index is trapped below PropSphere's z-${MAP_PAGE_CHROME_Z.legend} legend`,
    ).not.toContain("isolate");
  });

  it("declares mapOverlayPortal as a sibling of <Canvas>, not a descendant", () => {
    const canvasOpen = src.indexOf("<Canvas");
    const canvasClose = src.indexOf("</Canvas>");
    const mapOverlayPortalDecl = src.indexOf("ref={setMapOverlayPortal}");
    expect(canvasOpen).toBeGreaterThan(-1);
    expect(canvasClose).toBeGreaterThan(canvasOpen);
    expect(
      mapOverlayPortalDecl,
      "expected a `ref={setMapOverlayPortal}` element in GlobeView.tsx",
    ).toBeGreaterThan(-1);
    expect(
      mapOverlayPortalDecl,
      "mapOverlayPortal must be declared after </Canvas> (a sibling in MapSurface, outside the Canvas wrapper's isolated stacking context) so it keeps outranking every in-scene DOM band",
    ).toBeGreaterThan(canvasClose);
  });
});

/**
 * Page chrome inside the map Card shares one stacking context with
 * `mapOverlayPortal` now that `MapSurface` no longer isolates (#930), so
 * each overlay in `PropSphere` has to sit on the `MAP_PAGE_CHROME_Z` scale
 * on the correct side of the portal. A bare Tailwind `z-*` class on a
 * near-full-map overlay silently loses to the portal's 11000.
 */
describe("PropSphere page chrome sits on MAP_PAGE_CHROME_Z (#930)", () => {
  const PROPSPHERE_PATH = "src/pages/PropSphere.tsx";
  const page = readSrc(PROPSPHERE_PATH);

  /** The opening tag starting at `from`, with `//` line comments stripped
   * (both tags below carry an explanatory comment whose prose would
   * otherwise confuse a naive scan for the tag's closing `>`). */
  function openTagAt(from: number): string {
    const window = page.slice(from, from + 1200).replace(/\/\/[^\n]*/g, "");
    const end = window.indexOf(">");
    expect(
      end,
      `no closing > within 1200 chars of:\n${window}`,
    ).toBeGreaterThan(-1);
    return window.slice(0, end + 1);
  }

  it("keeps the legend stack on MAP_PAGE_CHROME_Z.legend, below the portal", () => {
    const marker = page.indexOf("Legends (bottom of map)");
    expect(
      marker,
      "expected the `Legends (bottom of map)` comment in PropSphere.tsx",
    ).toBeGreaterThan(-1);
    const divStart = page.indexOf("<div", marker);
    expect(divStart).toBeGreaterThan(marker);
    const tag = openTagAt(divStart);
    const classNameMatch = tag.match(/className="([^"]*)"/);
    expect(
      classNameMatch,
      `legend wrapper has no className:\n${tag}`,
    ).not.toBeNull();
    expect(
      classNameMatch![1].split(/\s+/),
      `the legend stack must stay at z-${MAP_PAGE_CHROME_Z.legend} (MAP_PAGE_CHROME_Z.legend) so the path inspector, which portals into mapOverlayPortal at ${GLOBE_DOM_LAYER_ORDER.mapOverlayPortal}, paints above it`,
    ).toContain(`z-${MAP_PAGE_CHROME_Z.legend}`);
    expect(MAP_PAGE_CHROME_Z.legend).toBeLessThan(
      GLOBE_DOM_LAYER_ORDER.mapOverlayPortal,
    );
  });

  it("puts the nearby-activity drawer above the portal via the token, not a z-* class", () => {
    const drawerId = page.indexOf('id="nearby-activity-map-drawer"');
    expect(
      drawerId,
      "expected the nearby-activity drawer element in PropSphere.tsx",
    ).toBeGreaterThan(-1);
    const divStart = page.lastIndexOf("<div", drawerId);
    expect(divStart).toBeGreaterThan(-1);
    const tag = openTagAt(divStart);
    expect(
      tag,
      "the drawer must take its stack level from MAP_PAGE_CHROME_Z.activityDrawer -- a bare Tailwind z-* class would paint under mapOverlayPortal's 11000 and let the path inspector show through the drawer",
    ).toContain("MAP_PAGE_CHROME_Z.activityDrawer");
    const classNameMatch = tag.match(/className="([^"]*)"/);
    expect(classNameMatch, `drawer has no className:\n${tag}`).not.toBeNull();
    expect(
      classNameMatch![1].split(/\s+/).filter((c) => /^z-/.test(c)),
      "the drawer must not also carry a Tailwind z-* class: the class would win over the inline style only by accident of specificity, and the two would drift",
    ).toEqual([]);
  });
});
