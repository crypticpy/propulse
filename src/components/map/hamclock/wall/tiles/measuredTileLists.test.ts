import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `useVisibleRows` decides how many whole rows a tile renders from the
 * `clientHeight` of the box its ref is attached to. That only reports the
 * rail's real capacity when the box grows into the tile's remaining space
 * first: a list with no `flex-grow` stays as tall as its placeholder or its
 * probe row, so the hook converges on one row in a full-height rail (#886).
 *
 * The check is a census rather than a per-tile assertion, so a new measured
 * list cannot be added on a class that was never given the grow.
 */

const TILES_DIR = __dirname;
const STYLES_DIR = resolve(__dirname, "../../../../../styles");

const WALL_STYLESHEETS = [
  "hamclock-wall.css",
  "hamclock-wall-report.css",
  "hamclock-wall-controls.css",
];

function readWallCss(): string {
  return WALL_STYLESHEETS.map((file) =>
    readFileSync(resolve(STYLES_DIR, file), "utf8"),
  ).join("\n");
}

/** The declarations of the first `selector { … }` block, or null. */
function cssBlock(css: string, selector: string): string | null {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) return null;
  const open = css.indexOf("{", start);
  const end = css.indexOf("}", open);
  return css.slice(open + 1, end);
}

/** Classes of every element that `useVisibleRows` measures, by tile file. */
function measuredListClasses(): { file: string; className: string }[] {
  const found: { file: string; className: string }[] = [];
  for (const file of readdirSync(TILES_DIR)) {
    if (!file.endsWith(".tsx") || file.includes(".test.")) continue;
    const source = readFileSync(resolve(TILES_DIR, file), "utf8");
    if (!source.includes("useVisibleRows")) continue;
    const matches = source.matchAll(/className="([^"]+)"\s+ref=\{[A-Za-z]+\}/g);
    for (const match of matches) {
      found.push({ file, className: match[1].split(/\s+/)[0] });
    }
  }
  return found;
}

describe("measured HamClock tile lists (#886)", () => {
  it("finds a measured list in every tile that calls useVisibleRows", () => {
    const measured = measuredListClasses();
    const tiles = new Set(measured.map((entry) => entry.file));
    // Guards the regex above: a rename that stops matching would otherwise
    // empty the census and make the next assertion vacuously pass.
    expect(tiles.size).toBeGreaterThanOrEqual(5);
  });

  it("gives every measured list the grow that makes clientHeight the rail slot", () => {
    const css = readWallCss();
    for (const { file, className } of measuredListClasses()) {
      const block = cssBlock(css, `.${className}`);
      expect(block, `${file}: no CSS block for .${className}`).toBeTruthy();
      expect(
        /flex:\s*1/.test(block as string),
        `${file}: .${className} is measured by useVisibleRows but never grows into its tile slot`,
      ).toBe(true);
    }
  });

  it("keeps a rail with measured rows from sizing grow tiles off their content", () => {
    const css = readWallCss();
    // Using the rendered row count as the flex basis feeds measurement back
    // into the slot the measurement came from.
    expect(css).toContain(".hc-rail:has(.hc-rows) > .hc-tile--grow");
  });
});
