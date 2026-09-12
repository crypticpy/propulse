/**
 * Atmos sub-text-xs guard (#808 batch 21)
 *
 * Census on `origin/main`: `src/components/atmos/` holds sub-floor
 * `text-[Npx]` sites (N<12) across emcomm panels, weather cards, radar
 * scrubbers, and sidebar chrome. This batch raises user-read copy to
 * `text-xs` in the densest 14 files (15-file cap including this test).
 *
 * Skips #844 same-hue sites and phone-only patterns (W-D #901).
 *
 * Sibling to `../map/subTextSizeFloor.test.ts` — does not edit that file.
 */

import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");
const ATMOS_ROOT = resolve(REPO_ROOT, "src/components/atmos");

/** Files this batch read and fixed — append-only for follow-ups. */
const FILES = [
  "src/components/atmos/AtmosSidebar.tsx",
  "src/components/atmos/RIMScoreCard.tsx",
  "src/components/atmos/RadarScrubber3D.tsx",
  "src/components/atmos/RegionRIMCard.tsx",
  "src/components/atmos/SignalChainHealth.tsx",
  "src/components/atmos/WeatherLegend.tsx",
  "src/components/atmos/emcomm/EmCommSidebarPanel.tsx",
  "src/components/atmos/emcomm/FrequencyPlanEditor.tsx",
  "src/components/atmos/emcomm/FrequencyQuickTune.tsx",
  "src/components/atmos/emcomm/NVISBriefing.tsx",
  "src/components/atmos/emcomm/NetLinkForecast.tsx",
  "src/components/atmos/emcomm/RepeaterAnalysis.tsx",
  "src/components/atmos/emcomm/SitRepForm.tsx",
  "src/components/atmos/emcomm/SitRepLog.tsx",
];

/** Owned elsewhere or deferred — must stay out of this batch's census walk. */
const EXCLUDED = new Set([
  "AtmosHeader.tsx",
  "WeatherAlertToast.tsx",
  "AtlasView.tsx",
  "LocalWeatherCard.tsx",
  "MonitoredRegionManager.tsx",
  "RadarScrubber2D.tsx",
  "emcomm/ActivationBanner.tsx",
  "emcomm/ActivationModal.tsx",
  "emcomm/EmCommQuickActions.tsx",
  "emcomm/ICS213Form.tsx",
  "emcomm/SkywarnBadge.tsx",
  "emcomm/WinlinkStatus.tsx",
]);

interface AllowlistEntry {
  file: string;
  match: string;
  reason: string;
}

const ALLOWLIST: AllowlistEntry[] = [];

const SIZE_RE = /text-\[(?:length:)?(\d*\.?\d+)px\]/g;
const INLINE_SIZE_RE =
  /fontSize:\s*["']?(\d*\.?\d+)(?:px)?["']?(?![\w%.])/g;

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
      re.lastIndex = 0;
      for (const match of line.matchAll(re)) {
        if (Number(match[1]) < 12) {
          sites.push({ file, line: index + 1, text: line });
        }
      }
    }
  });
  return sites;
}

function isAllowlisted(site: SubFloorSite): boolean {
  return ALLOWLIST.some(
    (entry) => entry.file === site.file && site.text.includes(entry.match),
  );
}

function walkAtmosSourceFiles(dir: string, relPrefix = ""): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    const rel = relPrefix ? `${relPrefix}/${entry}` : entry;
    if (statSync(abs).isDirectory()) {
      results.push(...walkAtmosSourceFiles(abs, rel));
    } else if (
      /\.(tsx|ts)$/.test(entry) &&
      !entry.endsWith(".test.ts") &&
      !entry.endsWith(".test.tsx") &&
      !EXCLUDED.has(rel)
    ) {
      results.push(abs);
    }
  }
  return results;
}

describe("sub-text-xs sizing stays at the floor in atmos (#808 batch 21)", () => {
  it("has no un-allowlisted sub-floor text-[Npx] or inline fontSize in the fixed atmos files", () => {
    const violations: string[] = [];
    for (const file of FILES) {
      for (const site of findSubFloorSites(file)) {
        if (!isAllowlisted(site)) {
          violations.push(`${site.file}:${site.line}: ${site.text.trim()}`);
        }
      }
    }
    expect(
      violations,
      `sub-floor sizing in batch-21 files:\n${violations.join("\n")}`,
    ).toEqual([]);
  });

  it("has no un-allowlisted sub-floor text-[Npx] anywhere under src/components/atmos (except deferred #844/cap sites)", () => {
    const violations: string[] = [];
    for (const abs of walkAtmosSourceFiles(ATMOS_ROOT)) {
      const rel = abs.slice(REPO_ROOT.length + 1);
      for (const site of findSubFloorSites(rel)) {
        if (!isAllowlisted(site)) {
          violations.push(`${site.file}:${site.line}: ${site.text.trim()}`);
        }
      }
    }
    expect(
      violations,
      `sub-floor sizing under atmos/:\n${violations.join("\n")}`,
    ).toEqual([]);
  });

  it("every allowlist entry still matches a real sub-floor site", () => {
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
