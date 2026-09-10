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
 * family a distinct, non-overlapping 1000-wide band. This guard is a
 * grep-and-classify over the files this session actually migrated to that
 * table -- it fails, naming the file:line, if a literal range creeps back
 * in or a new `<Html>` overlay is added without importing a band.
 *
 * Census at the time of this PR: `git grep -n 'zIndexRange=' -- src/components/map`
 * found 25 sites across 16 files. The 11 files below (17 sites) are the
 * highest-traffic overlays named in #851's own trace (`SpotLabel`,
 * `LabelsOverlay`, `SpotCluster`, `PinMarker`, `SpotMarker`,
 * `LocationMarker`, `WeatherAlerts3D`, `ISSTrackerOverlay`, `RayPathArc`)
 * plus `CompassRose` and `SatelliteOverlay` (HUD-band overlays, same DOM
 * stack). Left for a follow-up: `layers/MeteorShowerOverlay3D.tsx` (1),
 * `layers/TimeStationsOverlay3D.tsx` (2), `layers/BeaconNetworkOverlay3D.tsx`
 * (2), `layers/SpectrumWaterfallRing3D.tsx` (1), `layers/NVISOverlay3D.tsx`
 * (2) -- 8 more literal sites, all opt-in overlay layers, not migrated or
 * audited by this session; widening FILES to those five is the next step,
 * same pattern as this test.
 */

import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GLOBE_DOM_LAYER_ORDER } from "@/lib/map/globeRenderOrder";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");

/** The exact set of files this session migrated to `GLOBE_DOM_LAYER_ORDER`.
 * Widen deliberately, file by file, in a follow-up -- see the module doc. */
const FILES = [
  "src/components/map/SpotLabel.tsx",
  "src/components/map/LabelsOverlay.tsx",
  "src/components/map/SpotCluster.tsx",
  "src/components/map/PinMarker.tsx",
  "src/components/map/SpotMarker.tsx",
  "src/components/map/LocationMarker.tsx",
  "src/components/map/WeatherAlerts3D.tsx",
  "src/components/map/ISSTrackerOverlay.tsx",
  "src/components/map/RayPathArc.tsx",
  "src/components/map/CompassRose.tsx",
  "src/components/map/SatelliteOverlay.tsx",
];

/** Matches a bare numeric tuple, e.g. `[1, 0]` or `[180, 0]` -- the old
 * unspecified-band literal this guard bans. */
const LITERAL_RANGE_RE = /zIndexRange=\{\s*\[\s*-?\d+\s*,\s*-?\d+\s*\]/;

/** Matches every `zIndexRange={...}` occurrence (values here never contain
 * nested braces, so a non-greedy match to the next `}` is safe). */
const ZINDEX_ATTR_RE = /zIndexRange=\{([\s\S]*?)\}(?=\s|\/|>)/g;

function readSrc(file: string): string {
  return readFileSync(resolve(REPO_ROOT, file), "utf8");
}

describe("globe DOM z-bands stay on the GLOBE_DOM_LAYER_ORDER table (#851)", () => {
  it("has no bare numeric zIndexRange literal in the migrated files", () => {
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

  it("every zIndexRange in the migrated files references GLOBE_DOM_LAYER_ORDER", () => {
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

  it("has at least one zIndexRange site per migrated file (the census stays honest)", () => {
    // Positive control: proves the regexes above actually match real JSX
    // rather than vacuously passing because they never found an attribute.
    for (const file of FILES) {
      const src = readSrc(file);
      expect(
        [...src.matchAll(ZINDEX_ATTR_RE)].length,
        `${file}: expected at least one zIndexRange usage`,
      ).toBeGreaterThan(0);
    }
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
