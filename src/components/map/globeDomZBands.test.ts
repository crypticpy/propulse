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
import { resolve, join, relative, dirname } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GLOBE_DOM_LAYER_ORDER,
  MAP_PAGE_CHROME_Z,
} from "@/lib/map/globeRenderOrder";

type MapChromeTier = keyof typeof MAP_PAGE_CHROME_Z;

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

/**
 * The JSX subtree opened at `openedBy`, ending at the first closing tag
 * indented to the same column (both files are JSX-formatted, so the
 * element's own closing tag is the first `</` at its indentation).
 */
function scope(src: string, openedBy?: string): string {
  if (!openedBy) return src;
  const marker = src.indexOf(openedBy);
  expect(marker, `no ${openedBy} in this file`).toBeGreaterThan(-1);
  const tagStart = src.lastIndexOf("<", marker);
  const lineStart = src.lastIndexOf("\n", tagStart) + 1;
  const indent = " ".repeat(tagStart - lineStart);
  const closeAt = src.indexOf(`\n${indent}</`, marker);
  expect(
    closeAt,
    `no closing tag at the opener's indentation for ${openedBy}`,
  ).toBeGreaterThan(-1);
  return src.slice(tagStart, closeAt);
}

function resolveImport(spec: string, from: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join("src", spec.slice(2));
  else if (spec.startsWith(".")) base = join(dirname(from), spec);
  else return null;
  for (const candidate of [
    `${base}.tsx`,
    `${base}.ts`,
    join(base, "index.tsx"),
    join(base, "index.ts"),
  ]) {
    try {
      if (statSync(resolve(REPO_ROOT, candidate)).isFile()) return candidate;
    } catch {
      /* not this extension */
    }
  }
  return null;
}

/**
 * Reads a whole opening tag from `start`, tracking quotes and braces so an
 * arrow function in a handler (`onClick={() => ...}`) does not end it early.
 */
/**
 * Follows a barrel: `src/components/map/index.ts` re-exports `LayerLegend`
 * from `./LayerLegend`, and reading the barrel would show no button at all --
 * which is exactly how #930 kept certifying a control as a legend.
 */
function throughBarrel(name: string, target: string): string {
  if (!/\/index\.tsx?$/.test(target)) return target;
  const barrel = readFileSync(resolve(REPO_ROOT, target), "utf8");
  const named = new RegExp(
    `export\\s+(?:type\\s+)?\\{[^}]*\\b${name}\\b[^}]*\\}\\s+from\\s+"([^"]+)"`,
  ).exec(barrel);
  if (named) return resolveImport(named[1], target) ?? target;
  for (const star of barrel.matchAll(/export\s+\*\s+from\s+"([^"]+)"/g)) {
    const next = resolveImport(star[1], target);
    if (!next) continue;
    const body = readFileSync(resolve(REPO_ROOT, next), "utf8");
    if (new RegExp(`(function|const|class)\\s+${name}\\b`).test(body))
      return next;
  }
  return target;
}

function openingTag(src: string, start: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < src.length; i += 1) {
    const char = src[i];
    // JSX allows comments between attributes, and an apostrophe in one
    // ("the map's portal") would otherwise open a string that swallows the
    // rest of the element -- which is how a stack root once looked like a
    // z-10 wrapper.
    if (!quote && char === "/" && (src[i + 1] === "/" || src[i + 1] === "*")) {
      const end =
        src[i + 1] === "/" ? src.indexOf("\n", i) : src.indexOf("*/", i) + 1;
      if (end < 1) return src.slice(start);
      i = end;
      continue;
    }
    if (quote) {
      if (char === quote && src[i - 1] !== "\\") quote = null;
    } else if (char === '"' || char === "'" || char === "`") {
      quote = char;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
    } else if (char === ">" && depth === 0) {
      return src.slice(start, i + 1);
    }
  }
  return src.slice(start);
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
      `MapSurface must not isolate or the overlay portal's z-index is trapped below PropSphere's z-${MAP_PAGE_CHROME_Z.legend} legend`,
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
    // The legends moved into the map view's corner column as `cornerSlot`
    // rows (#930, round 7), so the group starts at the slot, not at a
    // page-level column of its own.
    const marker = page.indexOf("const mapCornerSlot");
    expect(
      marker,
      "expected the `mapCornerSlot` rows in PropSphere.tsx",
    ).toBeGreaterThan(-1);
    const divStart = page.indexOf("<div", marker);
    expect(divStart).toBeGreaterThan(marker);
    // The group wrapper takes no z-index at all, so its children resolve on
    // the MAP_PAGE_CHROME_Z scale directly; the legends themselves must be on
    // the legend tier, below the portal the inspector renders into.
    const column = openTagAt(divStart);
    const columnClasses = (
      column.match(/className="([^"]*)"/)?.[1] ?? ""
    ).split(/\s+/);
    expect(
      columnClasses.filter((c) => /^z-/.test(c)),
      "the legend rows must not carry their own z-* class: a z-* class would make a stacking context and trap the group below the overlay portal",
    ).toEqual([]);
    const legendGroup = page.indexOf("MAP_PAGE_CHROME_Z.legend", divStart);
    expect(
      legendGroup,
      "the legend group must declare MAP_PAGE_CHROME_Z.legend so the path inspector paints above it",
    ).toBeGreaterThan(divStart);
    expect(MAP_PAGE_CHROME_Z.legend).toBeLessThan(
      MAP_PAGE_CHROME_Z.mapOverlayPortal,
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
      "the drawer must take its stack level from MAP_PAGE_CHROME_Z.activityDrawer -- a bare Tailwind z-* class would land under the overlay portal and let the path inspector show through the drawer",
    ).toContain("MAP_PAGE_CHROME_Z.activityDrawer");
    const classNameMatch = tag.match(/className="([^"]*)"/);
    expect(classNameMatch, `drawer has no className:\n${tag}`).not.toBeNull();
    expect(
      classNameMatch![1].split(/\s+/).filter((c) => /^z-/.test(c)),
      "the drawer must not also carry a Tailwind z-* class: the class would win over the inline style only by accident of specificity, and the two would drift",
    ).toEqual([]);
  });
});

/**
 * Every `GlobeView` host has to bound the overlay portal (#930, round 2).
 *
 * `MapSurface` no longer isolates, so `mapOverlayPortal`'s 11000 resolves in
 * the nearest ancestor stacking context. Each host therefore owes one of two
 * things:
 *
 *   - a `data-map-stack-root` wrapper carrying `isolate`, which contains the
 *     `<GlobeView>` mount and any chrome that must stay BELOW the portal (a
 *     legend), so everything outside it — the host's own toolbars, panels,
 *     tab bars and dialogs — outranks the portal automatically; or
 *   - explicit values on `MAP_PAGE_CHROME_Z` for the chrome on each side of
 *     the portal. `PropSphere` is the one host that must take this route: its
 *     legend stack is positioned against the map `Card`, not the map
 *     container, so it cannot live inside an isolated wrapper. The `Card`'s
 *     `backdrop-blur-md` bounds the escape there, and the suite below covers
 *     the ordering.
 */
describe("every GlobeView host bounds the overlay portal (#930, round 2)", () => {
  /** Hosts that bound the portal with an isolated `data-map-stack-root`. */
  const STACK_ROOT_HOSTS = [
    "src/components/map/FullscreenPropSphere.tsx",
    "src/components/map/HamClockView.tsx",
    "src/components/mobile/MobileMap.tsx",
    "src/components/atmos/AtmosGlobeView.tsx",
  ];

  /** The host that bounds it with the `MAP_PAGE_CHROME_Z` scale instead. */
  const TOKEN_SCALE_HOSTS = ["src/pages/PropSphere.tsx"];

  /** Every non-test `.tsx` under `src/**`, recursively. */
  function listTsxFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        out.push(...listTsxFiles(full));
        continue;
      }
      if (!entry.endsWith(".tsx")) continue;
      if (entry.endsWith(".test.tsx")) continue;
      out.push(full);
    }
    return out;
  }

  const MOUNTS = listTsxFiles(resolve(REPO_ROOT, "src"))
    .filter((f) => /<GlobeView[\s/>]/.test(readFileSync(f, "utf8")))
    .map((f) => relative(REPO_ROOT, f))
    .sort();

  it("census: the known hosts are every GlobeView mount site in src", () => {
    // A new host that skips both routes would let the portal escape into its
    // page. Adding one means picking a route above and listing it here.
    expect(MOUNTS).toEqual([...STACK_ROOT_HOSTS, ...TOKEN_SCALE_HOSTS].sort());
  });

  it.each(STACK_ROOT_HOSTS)(
    "%s isolates its map stack root above the GlobeView mount",
    (host) => {
      const src = readSrc(host);
      const marker = src.indexOf("data-map-stack-root");
      expect(
        marker,
        `${host} mounts <GlobeView> with no data-map-stack-root wrapper: the overlay portal (${MAP_PAGE_CHROME_Z.mapOverlayPortal}) would outrank this host's own chrome and dialogs`,
      ).toBeGreaterThan(-1);

      const tagStart = src.lastIndexOf("<", marker);
      expect(tagStart).toBeGreaterThan(-1);
      const tag = src
        .slice(tagStart, tagStart + 1200)
        .replace(/\/\/[^\n]*/g, "");
      const tagEnd = tag.indexOf(">");
      expect(
        tagEnd,
        `no closing > for the stack root in ${host}`,
      ).toBeGreaterThan(-1);
      const openTag = tag.slice(0, tagEnd + 1);
      const classNameMatch = openTag.match(/className="([^"]*)"/);
      expect(
        classNameMatch,
        `the data-map-stack-root element in ${host} has no className:\n${openTag}`,
      ).not.toBeNull();
      expect(
        classNameMatch![1].split(/\s+/),
        `${host}'s data-map-stack-root must carry "isolate" or the overlay portal escapes into the host's chrome`,
      ).toContain("isolate");

      const mount = src.search(/<GlobeView[\s/>]/);
      expect(
        mount,
        `${host}'s <GlobeView> must be mounted inside the data-map-stack-root wrapper, not before it`,
      ).toBeGreaterThan(tagStart);
    },
  );

  it.each(TOKEN_SCALE_HOSTS)(
    "%s puts its chrome on MAP_PAGE_CHROME_Z instead of isolating",
    (host) => {
      const src = readSrc(host);
      expect(src).toContain("MAP_PAGE_CHROME_Z");
      // Positive control for the exemption: if this host ever gains a stack
      // root, the suite above should own it instead of the token scale.
      expect(
        src.includes("data-map-stack-root"),
        `${host} now has a data-map-stack-root: move it to STACK_ROOT_HOSTS`,
      ).toBe(false);
    },
  );
});

/**
 * Files scanned, and the slice of each that overlays the map. For a host
 * with a `data-map-stack-root` that is the stack root's subtree; for
 * `PropSphere` it is the map `Card`; the rest position themselves inside
 * one of those, so the whole file counts.
 */
const CHROME_FILES: readonly { file: string; openedBy?: string }[] = [
  { file: "src/pages/PropSphere.tsx", openedBy: '<Card className="flex-1' },
  {
    file: "src/components/map/FullscreenPropSphere.tsx",
    openedBy: "data-map-stack-root",
  },
  {
    file: "src/components/map/HamClockView.tsx",
    openedBy: "data-map-stack-root",
  },
  {
    file: "src/components/mobile/MobileMap.tsx",
    openedBy: "data-map-stack-root",
  },
  {
    file: "src/components/atmos/AtmosGlobeView.tsx",
    openedBy: "data-map-stack-root",
  },
  { file: "src/components/map/GlobeView.tsx" },
  { file: "src/components/atmos/RadarScrubber3D.tsx" },
  { file: "src/components/map/ReachMapControl.tsx" },
  { file: "src/components/map/ObservatoryTiltSlider.tsx" },
  { file: "src/components/map/MapSizeSliders.tsx" },
  { file: "src/components/map/ISSSkyTracker.tsx" },
];

/**
 * Nothing a person can operate may sit at or below the overlay portal
 * (#930, round 3).
 *
 * The portal is `pointer-events-none` but its children are not: an inspector
 * or cluster popover that paints over a slider, toggle or scrubber swallows
 * the input meant for it. `MAP_PAGE_CHROME_Z.interactiveChrome` is the tier
 * every control belongs at or above; passive overlays (legends, attribution,
 * chips) may stay under the portal, and are recognised here by
 * `pointer-events-none`.
 *
 * Scope: the five hosts plus `GlobeView.tsx`, whose chrome renders inside
 * every one of them, plus the map-chrome components that position
 * themselves.
 */
describe("map-host controls sit at or above interactiveChrome (#930, round 3)", () => {
  /** `z-30`, `z-[220]` -> 30, 220. Non-numeric utilities (`z-auto`) -> null. */
  function tailwindZ(cls: string): number | null {
    const bare = cls.match(/^z-(\d+)$/);
    if (bare) return Number(bare[1]);
    const arbitrary = cls.match(/^z-\[(\d+)\]$/);
    if (arbitrary) return Number(arbitrary[1]);
    return null;
  }

  /** Every JSX open tag in a slice, comments stripped. */
  function openTags(src: string): string[] {
    const noComments = src.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "");
    return noComments.match(/<[A-Za-z][^>]*?>/g) ?? [];
  }

  const INTERACTIVE_RE =
    /pointer-events-auto|onClick=|onPointerDown=|onMouseDown=|onChange=|role="(button|slider|switch)"/;

  /** A tag is a control if it, or the subtree it opens, takes input. */
  function isInteractive(slice: string, tag: string): boolean {
    if (INTERACTIVE_RE.test(tag)) return true;
    const at = slice.indexOf(tag);
    if (at < 0) return false;
    const subtree = slice.slice(at, at + 1200);
    return /<button|<input|<select|role="(button|slider|switch)"|pointer-events-auto/.test(
      subtree,
    );
  }

  function violationsFor(entry: { file: string; openedBy?: string }): string[] {
    const out: string[] = [];
    const slice = scope(readSrc(entry.file), entry.openedBy);
    for (const tag of openTags(slice)) {
      const className = tag.match(/className=[`"]([^`"]*)[`"]/)?.[1] ?? "";
      for (const cls of className.split(/\s+/)) {
        const level = tailwindZ(cls);
        if (level === null) continue;
        if (
          !/pointer-events-none/.test(tag) &&
          isInteractive(slice, tag) &&
          level < MAP_PAGE_CHROME_Z.interactiveChrome
        ) {
          out.push(
            `${entry.file}: "${cls}" (${level}) is an operable control below interactiveChrome (${MAP_PAGE_CHROME_Z.interactiveChrome}): ${tag.slice(0, 110)}`,
          );
        } else if (
          level > MAP_PAGE_CHROME_Z.legend &&
          level < MAP_PAGE_CHROME_Z.interactiveChrome
        ) {
          // The band around the portal belongs to the portal. Anything else
          // landing in it is ordered against detail popups by accident.
          out.push(
            `${entry.file}: "${cls}" (${level}) sits in the overlay portal's band (${MAP_PAGE_CHROME_Z.legend}-${MAP_PAGE_CHROME_Z.interactiveChrome}): pick MAP_PAGE_CHROME_Z.legend if a popup may cover it, interactiveChrome if not: ${tag.slice(0, 110)}`,
          );
        }
      }
    }
    return out;
  }

  it("has no control or stray overlay in the portal's band on any map host", () => {
    const violations = CHROME_FILES.flatMap(violationsFor);
    expect(
      violations,
      `overlays a map popup would paint over and steal input from -- put them on MAP_PAGE_CHROME_Z.interactiveChrome:\n${violations.join("\n")}`,
    ).toEqual([]);
  });

  it("finds the chrome it claims to scan (positive control)", () => {
    // Guards against a scan that silently matches nothing: the slices do
    // contain z-bearing tags, and the hosts do name the interactive tier.
    const withZ = CHROME_FILES.filter((entry) =>
      openTags(scope(readSrc(entry.file), entry.openedBy)).some((t) =>
        /className=[`"][^`"]*\bz-/.test(t),
      ),
    );
    expect(withZ.length).toBeGreaterThan(2);
    const withTier = CHROME_FILES.filter((entry) =>
      readSrc(entry.file).includes("MAP_PAGE_CHROME_Z.interactiveChrome"),
    );
    expect(withTier.length).toBeGreaterThan(3);
  });
});

/**
 * The set of map chrome components is derived, not hand-listed
 * (#930, round 4).
 *
 * Rounds 1-3 each fixed the sites a review named, and round 3's guard still
 * read from a hand-written file list -- so `MapSizeSliders`' own default
 * (`absolute bottom-3 left-3 z-10`, mounted by every host that does not pass
 * `hideSizeSliders`) and `OptimalBandsPanel`'s draggable root (`absolute
 * z-10`) went another round under the portal. This suite removes the hand
 * list from the equation: it walks the import graph of the five hosts plus
 * `GlobeView`, keeps every module under the map/mobile/atmos/hamclock trees,
 * and checks each component's *own* root element -- the one that lands in
 * whatever container mounts it, i.e. the map.
 *
 * A component that positions itself `absolute` with a z-index therefore has
 * to declare a tier whether or not anybody remembered to list it.
 */
describe("map chrome components declare a tier (#930, round 4)", () => {
  const HOSTS = [
    "src/pages/PropSphere.tsx",
    "src/components/map/FullscreenPropSphere.tsx",
    "src/components/map/HamClockView.tsx",
    "src/components/mobile/MobileMap.tsx",
    "src/components/atmos/AtmosGlobeView.tsx",
    "src/components/map/GlobeView.tsx",
  ];

  /** Only modules that can paint on a map surface are in scope. */
  const IN_SCOPE = [
    "src/components/map/",
    "src/components/mobile/",
    "src/components/atmos/",
    "src/components/hamclock/",
    "src/pages/PropSphere.tsx",
  ];

  /** Every in-scope module reachable from the hosts. */
  function reachableModules(): string[] {
    const seen = new Set<string>();
    const queue = [...HOSTS];
    while (queue.length > 0) {
      const file = queue.pop() as string;
      if (seen.has(file)) continue;
      seen.add(file);
      const src = readFileSync(resolve(REPO_ROOT, file), "utf8");
      for (const match of src.matchAll(/from\s+"([^"]+)"/g)) {
        const next = resolveImport(match[1], file);
        if (!next) continue;
        if (next.endsWith(".test.ts") || next.endsWith(".test.tsx")) continue;
        if (!IN_SCOPE.some((prefix) => next.startsWith(prefix))) continue;
        if (!seen.has(next)) queue.push(next);
      }
    }
    return [...seen].filter((file) => file.endsWith(".tsx")).sort();
  }

  /** The root, or the subtree it opens, takes pointer input. */
  function takesInput(tag: string, subtree: string): boolean {
    if (/pointer-events-none/.test(tag)) return false;
    return /pointer-events-auto|onClick=|onPointerDown=|onMouseDown=|onChange=|<button|<input|<select|role="(button|slider|switch)"/.test(
      subtree,
    );
  }

  type RootTag = {
    file: string;
    line: number;
    tag: string;
    level: number;
    interactive: boolean;
  };

  const TIER_RE = /MAP_PAGE_CHROME_Z\.(\w+)/;
  const RETURN_ROOT_RE = /(?:return\s*\(\s*|return\s+)(<[A-Za-z])/g;

  /** Root elements the component positions on its host's map surface. */
  function rootTags(file: string): RootTag[] {
    const src = readFileSync(resolve(REPO_ROOT, file), "utf8");
    const found: RootTag[] = [];
    for (const match of src.matchAll(RETURN_ROOT_RE)) {
      const start = match.index + match[0].length - match[1].length;
      const tag = openingTag(src, start).replace(/\s+/g, " ");
      // `fixed` chrome is page chrome, bounded by the host's own root.
      if (!tag.includes("absolute") || /\bfixed\b/.test(tag)) continue;
      const tier = TIER_RE.exec(tag);
      const cls = /(?<![\w-])z-(\d+|\[\d+\])/.exec(tag);
      const style = /zIndex:\s*(\d+)/.exec(tag);
      let level: number | undefined;
      if (tier) level = MAP_PAGE_CHROME_Z[tier[1] as MapChromeTier];
      else if (cls) level = Number(cls[1].replace(/[[\]]/g, ""));
      else if (style) level = Number(style[1]);
      if (level === undefined || Number.isNaN(level)) continue;
      found.push({
        file,
        line: src.slice(0, start).split("\n").length,
        tag: tag.slice(0, 110),
        level,
        // The whole rest of the file, not a truncated window: round 5's
        // miss was evidence that lived past any fixed slice.
        interactive: takesInput(tag, src.slice(start)),
      });
    }
    return found;
  }

  const modules = reachableModules();
  const roots = modules.flatMap(rootTags);

  it("reaches the map component tree", () => {
    // Non-vacuity: the walk must actually find the components this round fixed.
    expect(modules.length).toBeGreaterThan(100);
    const files = new Set(roots.map((root) => root.file));
    // `MapSizeSliders` was this suite's other anchor until round 7 took its
    // self-anchor away (the map view's corner column positions it now), so
    // the walk is pinned to the two components that still position
    // themselves on the map surface.
    expect(files).toContain("src/components/map/MiniMapNavigator.tsx");
    expect(files).toContain("src/components/map/OptimalBandsPanel.tsx");
  });

  it("only hand-lists components the hosts actually reach", () => {
    // Keeps round 3's list honest: a file that no host imports cannot be
    // certified by naming it.
    const reachable = new Set(modules);
    for (const { file } of CHROME_FILES) {
      expect(
        reachable,
        `${file} is hand-listed but no host imports it`,
      ).toContain(file);
    }
  });

  it("puts every self-positioning control at or above interactiveChrome", () => {
    const violations = roots
      .filter((root) => root.interactive)
      .filter((root) => root.level < MAP_PAGE_CHROME_Z.interactiveChrome)
      .map(
        (root) =>
          `${root.file}:${root.line} z=${root.level} < interactiveChrome (${MAP_PAGE_CHROME_Z.interactiveChrome}): ${root.tag}`,
      );
    expect(violations).toEqual([]);
  });

  it("keeps passive overlays out of the portal's band", () => {
    // A passive overlay may sit under the portal (`legend`) or above the
    // controls, but not inside the band the portal itself occupies.
    const violations = roots
      .filter((root) => !root.interactive)
      .filter(
        (root) =>
          root.level > MAP_PAGE_CHROME_Z.legend &&
          root.level < MAP_PAGE_CHROME_Z.interactiveChrome,
      )
      .map(
        (root) =>
          `${root.file}:${root.line} z=${root.level} sits in the overlay portal's band: ${root.tag}`,
      );
    expect(violations).toEqual([]);
  });
});

/**
 * A wrapper is classified by the component it wraps (#930, round 5).
 *
 * Round 3 read only the wrapper's own tag: `pointer-events-none` on the
 * wrapper, no handler on it, so `legend`. But `LayerLegend` collapses via a
 * real `<button>` (`LayerLegend.tsx:52-56`), and a legend you can click is a
 * control -- it went under the overlay portal for two rounds because the
 * evidence lives in another file.
 *
 * This suite follows the reference: for every z-bearing wrapper inside a
 * host's map slice it resolves each component element in the wrapper's
 * subtree through that host's own imports and reads the *whole* referenced
 * file. One tier per component: a wrapper holding anything operable takes
 * `interactiveChrome` entire, never a control header above the portal and a
 * body below it.
 */
describe("wrappers take the tier of the component they wrap (#930, round 5)", () => {
  /** Markers that make a component file operable, anywhere in the file. */
  const OPERABLE_FILE_RE =
    /<button\b|<a\s[^>]*href|<input\b|<select\b|<textarea\b|onClick=|onPointerDown=|onMouseDown=|onChange=|draggable\b|role="(button|slider|switch|link|menuitem)"|tabIndex=\{?0/;

  /** `import { A, B } from "x"` / `import X from "x"` -> local name -> file. */
  function importMap(file: string): Map<string, string> {
    const src = readFileSync(resolve(REPO_ROOT, file), "utf8");
    const map = new Map<string, string>();
    for (const match of src.matchAll(
      /import\s+(type\s+)?([^;]+?)\s+from\s+"([^"]+)"/g,
    )) {
      if (match[1]) continue;
      const target = resolveImport(match[3], file);
      if (!target) continue;
      for (const name of match[2].matchAll(/[A-Z][A-Za-z0-9_]*/g)) {
        if (!map.has(name[0])) map.set(name[0], target);
      }
    }
    return map;
  }

  /** The subtree of the element opened at `open`, by its own indentation. */
  function subtreeAt(src: string, open: number): string {
    const lineStart = src.lastIndexOf("\n", open) + 1;
    const indent = " ".repeat(open - lineStart);
    const close = src.indexOf(`\n${indent}</`, open);
    const selfClosing = src.indexOf("/>", open);
    const tagEnd = src.indexOf(">", open);
    if (selfClosing > -1 && selfClosing === tagEnd - 1)
      return src.slice(open, tagEnd + 1);
    return close > -1 ? src.slice(open, close) : src.slice(open, open + 4000);
  }

  type Wrapper = {
    host: string;
    line: number;
    level: number;
    operable: string[];
    tag: string;
  };

  function wrappersIn(entry: { file: string; openedBy?: string }): Wrapper[] {
    const src = readSrc(entry.file);
    const slice = scope(src, entry.openedBy);
    const offset = src.indexOf(slice);
    const imports = importMap(entry.file);
    const out: Wrapper[] = [];
    for (const match of slice.matchAll(/<[A-Za-z]/g)) {
      const open = match.index;
      const tag = openingTag(slice, open).replace(/\s+/g, " ");
      const tier = /MAP_PAGE_CHROME_Z\.(\w+)/.exec(tag);
      const cls = /(?<![\w-])z-(\d+|\[\d+\])/.exec(tag);
      let level: number | undefined;
      if (tier) level = MAP_PAGE_CHROME_Z[tier[1] as MapChromeTier];
      else if (cls) level = Number(cls[1].replace(/[[\]]/g, ""));
      if (level === undefined || Number.isNaN(level)) continue;
      const subtree = subtreeAt(slice, open);
      const operable: string[] = [];
      for (const ref of subtree.matchAll(/<([A-Z][A-Za-z0-9_]*)/g)) {
        const imported = imports.get(ref[1]);
        if (!imported) continue;
        const target = throughBarrel(ref[1], imported);
        const body = readFileSync(resolve(REPO_ROOT, target), "utf8");
        if (OPERABLE_FILE_RE.test(body)) operable.push(ref[1]);
      }
      out.push({
        host: entry.file,
        line:
          slice.slice(0, open).split("\n").length +
          src.slice(0, offset).split("\n").length -
          1,
        level,
        operable: [...new Set(operable)],
        tag: tag.slice(0, 90),
      });
    }
    return out;
  }

  const wrappers = CHROME_FILES.flatMap(wrappersIn);

  it("resolves the components each wrapper holds (non-vacuity)", () => {
    expect(wrappers.length).toBeGreaterThan(5);
    const resolved = wrappers.filter((w) => w.operable.length > 0);
    expect(resolved.length).toBeGreaterThan(0);
  });

  it("puts a wrapper holding an operable component on interactiveChrome", () => {
    const violations = wrappers
      .filter((w) => w.operable.length > 0)
      .filter((w) => w.level < MAP_PAGE_CHROME_Z.interactiveChrome)
      .map(
        (w) =>
          `${w.host}:${w.line} z=${w.level} wraps ${w.operable.join(", ")}, which ${w.operable.length === 1 ? "takes" : "take"} input -- the whole wrapper belongs on interactiveChrome (${MAP_PAGE_CHROME_Z.interactiveChrome}): ${w.tag}`,
      );
    expect(violations, violations.join("\n")).toEqual([]);
  });
});

/**
 * Raising a control must not bury the chrome beside it (#930, round 6).
 *
 * `MapSizeSliders` defaults to `absolute bottom-3 left-3`, and three map
 * views plus two hosts put passive chrome in that exact corner: the
 * flat map's bearing/distance readout, the azimuthal legend, HamClock's
 * contacts key and AtmosPulse's `WeatherLegend`. While everything there was
 * `z-10` the later sibling won; once the control moved to
 * `interactiveChrome` it started covering all four.
 *
 * The fix is structural, not another tier: each of those corners is now one
 * flex column holding the readout above `<MapSizeSliders />`, so the
 * two can never overlap whatever their z-index. This guard fails if a file
 * puts something back on the shared control's anchor without either owning
 * the column or hiding the control.
 */
describe("nothing shares the size control's corner (#930, round 6)", () => {
  const CORNER_FILES = [
    "src/components/map/GlobeView.tsx",
    "src/components/map/FlatMapView.tsx",
    "src/components/map/AzimuthalView.tsx",
    "src/pages/PropSphere.tsx",
    "src/components/map/FullscreenPropSphere.tsx",
    "src/components/map/HamClockView.tsx",
    "src/components/mobile/MobileMap.tsx",
    "src/components/atmos/AtmosGlobeView.tsx",
  ];

  /** The corner the size control is placed in, by the column that owns it. */
  const SLIDER_ANCHOR = "absolute bottom-3 left-3";

  it("keeps the control out of the positioning business entirely", () => {
    // Round 7: the control no longer anchors itself at all, so it cannot
    // reappear in a corner some other file already owns.
    const src = readSrc("src/components/map/MapSizeSliders.tsx");
    expect(src).not.toContain(SLIDER_ANCHOR);
    expect(src).not.toMatch(/className=[^\n]*\babsolute\b/);
  });

  it("leaves that anchor to the control or to a column that holds it", () => {
    const violations: string[] = [];
    for (const file of CORNER_FILES) {
      const src = readSrc(file);
      for (const match of src.matchAll(/absolute bottom-3 left-3/g)) {
        const line = src.slice(0, match.index).split("\n").length;
        const tag = src.slice(
          src.lastIndexOf("<", match.index),
          match.index + 400,
        );
        const isColumn = /flex flex-col/.test(tag);
        if (!isColumn) {
          violations.push(
            `${file}:${line} sits on the size control's corner (${SLIDER_ANCHOR}) without stacking it in a column`,
          );
        }
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("stacks the flat map's bearing readout above the control", () => {
    const src = readSrc("src/components/map/FlatMapView.tsx");
    // The readout no longer anchors itself to the corner ...
    expect(src).not.toContain('className="absolute bottom-3 left-3 z-10');
    // ... it is a legend-tier row in the corner column, and the control is
    // the row below it.
    const column = src.indexOf(
      'className="pointer-events-none absolute bottom-3 left-3 right-3 flex flex-col',
    );
    expect(column).toBeGreaterThan(-1);
    const body = src.slice(column, column + 1600);
    expect(body).toContain("MAP_PAGE_CHROME_Z.legend");
    expect(body).toContain("hoverBearingDistance");
    expect(body).toContain("<MapSizeSliders />");
    expect(body.indexOf("hoverBearingDistance")).toBeLessThan(
      body.indexOf("<MapSizeSliders />"),
    );
  });
});

/**
 * One owner per corner, across the component boundary (#930, round 7).
 *
 * Round 6 fixed the corners a single file could see. It could not see the
 * cross-component case: a host mounted its own `<MapSizeSliders />`
 * column in the bottom-left corner and passed `hideSizeSliders` to the view
 * below it, but the view kept rendering its own passive row in that same
 * corner. The host's control sits on `interactiveChrome` and the view's row
 * on `legend`, so the control painted over a row it does not even know
 * exists -- no per-file scan can catch that, because neither file is wrong
 * on its own.
 *
 * The rule is ownership, not tiers: the map view owns its bottom-left
 * corner and renders the one column there; a host that wants a row in that
 * corner passes it down as `cornerSlot`. So the guard is:
 *
 *   - a host that mounts a map view may not anchor anything in that corner,
 *     and may not mount the size control itself;
 *   - each view has exactly one bottom-left column, and it renders
 *     `cornerSlot` above its own row above the control;
 *   - `hideSizeSliders` is gone -- an opt-out flag is what let two owners
 *     coexist.
 */
describe("one owner per bottom-left corner (#930, round 7)", () => {
  const VIEW_FILES = [
    "src/components/map/GlobeView.tsx",
    "src/components/map/FlatMapView.tsx",
    "src/components/map/AzimuthalView.tsx",
  ];
  const HOST_FILES = [
    "src/pages/PropSphere.tsx",
    "src/components/map/FullscreenPropSphere.tsx",
    "src/components/map/HamClockView.tsx",
    "src/components/mobile/MobileMap.tsx",
    "src/components/atmos/AtmosGlobeView.tsx",
  ];
  /** Tailwind spacing close enough to the corner to overlap the column. */
  const CORNER =
    /absolute[^"`]*\bbottom-[0-4]\b[^"`]*\bleft-[0-4](?![\d/])[^"`]*/g;
  /** A full-bleed bottom strip is a bar, not a row in the corner column. */
  const FULL_BLEED = /\bleft-0\b[^"`]*\bright-0\b/;

  const viewNames = VIEW_FILES.map((f) =>
    f
      .split("/")
      .pop()!
      .replace(/\.tsx$/, ""),
  );

  /** Hosts that actually mount one of the three views, derived not listed. */
  const mountingHosts = HOST_FILES.filter((file) => {
    const src = readSrc(file);
    return viewNames.some((name) => src.includes(`<${name}`));
  });

  it("finds the hosts that mount a map view", () => {
    // Non-vacuity: if the mounts move, the census below stops meaning
    // anything, so fail loudly rather than pass on an empty list.
    expect(mountingHosts).toEqual(HOST_FILES);
  });

  it("leaves the corner to the view that owns it", () => {
    const violations: string[] = [];
    for (const file of mountingHosts) {
      const src = readSrc(file);
      for (const match of src.matchAll(CORNER)) {
        if (FULL_BLEED.test(match[0])) continue;
        const line = src.slice(0, match.index).split("\n").length;
        violations.push(
          `${file}:${line} anchors "${match[0]}" in the map view's corner -- the view owns that column; pass the row down as cornerSlot`,
        );
      }
      if (/<MapSizeSliders\b/.test(src)) {
        violations.push(
          `${file} mounts MapSizeSliders itself -- the view already renders one in its corner column`,
        );
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("gives each view one column holding the slot, its row and the control", () => {
    const violations: string[] = [];
    for (const file of VIEW_FILES) {
      const src = readSrc(file);
      const anchors = [...src.matchAll(CORNER)].filter(
        (m) => !FULL_BLEED.test(m[0]),
      );
      if (anchors.length !== 1) {
        violations.push(
          `${file} has ${anchors.length} bottom-left anchors; the corner takes exactly one column`,
        );
        continue;
      }
      const start = anchors[0].index!;
      const body = src.slice(start, start + 2000);
      if (!/flex flex-col/.test(body.slice(0, 200))) {
        violations.push(`${file} anchors the corner without a flex column`);
      }
      const slot = body.indexOf("{cornerSlot}");
      const control = body.indexOf("<MapSizeSliders />");
      if (slot < 0) violations.push(`${file} column never renders cornerSlot`);
      if (control < 0) {
        violations.push(`${file} column never renders the size control`);
      }
      if (slot > -1 && control > -1 && slot > control) {
        violations.push(
          `${file} renders cornerSlot below the control; host rows read above it`,
        );
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("keeps no opt-out flag that would let a host own the corner too", () => {
    const offenders = [...VIEW_FILES, ...HOST_FILES].filter((file) =>
      readSrc(file).includes("hideSizeSliders"),
    );
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});
