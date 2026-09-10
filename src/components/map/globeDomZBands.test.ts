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
import { GLOBE_DOM_LAYER_ORDER } from "@/lib/map/globeRenderOrder";

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
