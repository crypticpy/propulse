/**
 * Pages sub-text-xs guard (#808 batch 20 — tail)
 *
 * Census: 28 sub-floor `text-[Npx]` sites (N<12) across 2 page files —
 * PropSphere HUD chrome (S-meter, K/SFI mini strip, time offset, lite HUD)
 * and KioskPage scene-editor labels. User-read copy raised to `text-xs`.
 *
 * Skips Home, SolarPulse, *Mobile*, phone-only `text-[10px] sm:text-xs` on
 * FeaturesPage, ProfilePage (#1171), PR #1193 pages, and pages owned by other
 * #808 batches (dx, contest, sdr, nets/activation, etc.).
 *
 * Sibling to `../components/map/subTextSizeFloor.test.ts` — does not edit
 * that file.
 */

import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../..");
const PAGES_ROOT = resolve(REPO_ROOT, "src/pages");

/** Files this batch read and fixed — append-only for follow-ups. */
const FILES = [
  "src/pages/PropSphere.tsx",
  "src/pages/KioskPage.tsx",
];

/** Owned elsewhere or deferred — must stay out of this batch's census walk. */
const EXCLUDED = new Set([
  "Home.tsx",
  "SolarPulse.tsx",
  "ProfilePage.tsx",
  "DXWizard.tsx",
  "SdrConsole.tsx",
  "ShackPage.tsx",
  "SettingsPage.tsx",
  "HelpPage.tsx",
  "HelpArticlePage.tsx",
  "AwardsPage.tsx",
  "Contest.tsx",
  "ContestExplorerPage.tsx",
  "ActivationPage.tsx",
  "NetsPage.tsx",
  "NetDetailPage.tsx",
  "NetCreatePage.tsx",
  // PR #1193 — in flight; do not fail the tail walk on these
  "BandPlanner.tsx",
  "DisplaysPage.tsx",
  "FeaturesPage.tsx",
  "MapExplorerPage.tsx",
  "NetAnalyticsPage.tsx",
  "NetControllerDetailPage.tsx",
  "NetControllerPage.tsx",
  "Photorealistic3DPage.tsx",
  "SatellitesPage.tsx",
  "SetupGuidePage.tsx",
  "SystemHealthPage.tsx",
]);

interface AllowlistEntry {
  file: string;
  match: string;
  reason: string;
}

const ALLOWLIST: AllowlistEntry[] = [
  {
    file: "src/pages/FeaturesPage.tsx",
    match: "text-[10px] sm:text-xs font-semibold text-signal-green",
    reason: "phone-only Free tier badge — mobile layout deferred",
  },
];

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

function walkPageSourceFiles(): string[] {
  return readdirSync(PAGES_ROOT)
    .filter(
      (entry) =>
        /\.(tsx|ts)$/.test(entry) &&
        !entry.endsWith(".test.ts") &&
        !entry.endsWith(".test.tsx") &&
        !EXCLUDED.has(entry) &&
        !entry.includes("Mobile"),
    )
    .map((entry) => resolve(PAGES_ROOT, entry));
}

describe("sub-text-xs sizing stays at the floor in pages (#808 batch 20 tail)", () => {
  it("has no un-allowlisted sub-floor text-[Npx] or inline fontSize in the fixed page files", () => {
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
      `sub-floor sizing in batch-20 files:\n${violations.join("\n")}`,
    ).toEqual([]);
  });

  it("has no un-allowlisted sub-floor text-[Npx] anywhere under src/pages (except deferred Home/Solar/other batches)", () => {
    const violations: string[] = [];
    for (const abs of walkPageSourceFiles()) {
      const rel = abs.slice(REPO_ROOT.length + 1);
      for (const site of findSubFloorSites(rel)) {
        if (!isAllowlisted(site)) {
          violations.push(`${site.file}:${site.line}: ${site.text.trim()}`);
        }
      }
    }
    expect(
      violations,
      `sub-floor sizing under pages/:\n${violations.join("\n")}`,
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
