/**
 * Map sub-text-xs guard — batch 24 HUD (#808)
 *
 * Census on `origin/main`: `src/components/map/` holds sub-floor `text-[Npx]`
 * sites (N<12) in HUD/label chrome outside concurrent PR #1196 files,
 * hamclock/, ProToolbarRibbon.tsx, WatchPopover.tsx, layers/SatMatchPanel.tsx,
 * and 3D canvas overlay chrome. This batch raises 44 user-read sites in the
 * 14 HUD/label files below.
 *
 * Skips hamclock/* (#1174), ProToolbarRibbon.tsx, WatchPopover.tsx,
 * layers/SatMatchPanel.tsx (#844), 3D overlay chrome, and phone / W-D #901.
 *
 * Sibling to `subTextSizeFloor.test.ts` (#1172) — does not edit it.
 */

import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");

/** Files this batch read and fixed — append-only for follow-ups. */
const FILES = [
  "src/components/map/MapSizeSliders.tsx",
  "src/components/map/RecommendationsBadge.tsx",
  "src/components/map/GlobeView.tsx",
  "src/components/map/LabelsOverlay.tsx",
  "src/components/map/PathPointInspector.tsx",
  "src/components/map/SpotLabel.tsx",
  "src/components/map/MiniMapNavigator.tsx",
  "src/components/map/ColorsPopover.tsx",
  "src/components/map/ImageryAttribution.tsx",
  "src/components/map/TickerCrawlSettingsDialog.tsx",
  "src/components/map/ObservatoryOverlay.tsx",
  "src/components/map/LayerLegend.tsx",
  "src/components/map/layers/CustomTLEDialog.tsx",
  "src/components/map/PathPointList.tsx",
];

const SIZE_RE = /text-\[(?:length:)?(\d*\.?\d+)px\]/g;
const INLINE_SIZE_RE =
  /fontSize:\s*["']?(\d*\.?\d+)(?:px)?["']?(?![\w%.])/g;

interface AllowlistEntry {
  file: string;
  match: string;
  reason: string;
}

const ALLOWLIST: AllowlistEntry[] = [];

interface SubFloorSite {
  file: string;
  line: number;
  text: string;
}

function findSubFloorSites(file: string): SubFloorSite[] {
  const absPath = resolve(REPO_ROOT, file);
  const lines = readFileSync(absPath, "utf8").split("\n");
  const sites: SubFloorSite[] = [];
  lines.forEach((line, index) => {
    for (const re of [SIZE_RE, INLINE_SIZE_RE]) {
      for (const match of line.matchAll(re)) {
        if (Number(match[1]) < 12) {
          sites.push({ file, line: index + 1, text: line });
        }
      }
    }
  });
  return sites;
}

describe("sub-text-xs sizing stays at the floor in map (#808 batch 24 HUD)", () => {
  it("has no un-allowlisted sub-floor text-[Npx] or inline fontSize in the fixed files", () => {
    const violations: string[] = [];
    for (const file of FILES) {
      for (const site of findSubFloorSites(file)) {
        const allowed = ALLOWLIST.some(
          (entry) => entry.file === file && site.text.includes(entry.match),
        );
        if (!allowed) {
          violations.push(`${site.file}:${site.line}: ${site.text.trim()}`);
        }
      }
    }
    expect(
      violations,
      `sub-floor sizing in batch-24 HUD files:\n${violations.join("\n")}`,
    ).toEqual([]);
  });

  it("every allowlist entry still matches a real sub-floor site in the fixed files", () => {
    for (const entry of ALLOWLIST) {
      const stillPresent = findSubFloorSites(entry.file).some((site) =>
        site.text.includes(entry.match),
      );
      expect(
        stillPresent,
        `${entry.file}: allowlisted content "${entry.match}" is no longer at a sub-floor text-[Npx] site — remove the stale entry`,
      ).toBe(true);
    }
  });
});
