/**
 * Pages sub-text-xs guard (#808 batch 50 — pages owned by other batches)
 *
 * Census: 2 sub-floor `text-[Npx]` sites (N<12) across 2 page files —
 * SdrConsole audio-debug HUD and Contest CAT badge. User-read copy raised
 * to `text-xs`.
 *
 * Skips Home, SolarPulse, ProfilePage (#1171), DXWizard (#1213),
 * KioskPage/PropSphere (#1194), PR #1193 pages, phone-only layouts, and
 * *Mobile* pages.
 *
 * Sibling to `subTextSizeFloor.pages.test.ts` and
 * `subTextSizeFloor.pages-tail.test.ts` — does not edit those files.
 */

import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../..");
const PAGES_ROOT = resolve(REPO_ROOT, "src/pages");

/** Files this batch read and fixed — append-only for follow-ups. */
const FILES = [
  "src/pages/SdrConsole.tsx",
  "src/pages/ShackPage.tsx",
  "src/pages/SettingsPage.tsx",
  "src/pages/HelpPage.tsx",
  "src/pages/HelpArticlePage.tsx",
  "src/pages/AwardsPage.tsx",
  "src/pages/Contest.tsx",
  "src/pages/ContestExplorerPage.tsx",
  "src/pages/ActivationPage.tsx",
  "src/pages/NetsPage.tsx",
  "src/pages/NetDetailPage.tsx",
  "src/pages/NetCreatePage.tsx",
];

/** Owned elsewhere or deferred — must stay out of this batch's census walk. */
const EXCLUDED = new Set([
  "Home.tsx",
  "SolarPulse.tsx",
  "ProfilePage.tsx",
  "DXWizard.tsx",
  "KioskPage.tsx",
  "PropSphere.tsx",
  // PR #1193 — in flight; do not fail the owned walk on these
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
    if (hasAlternateFloorSize(line)) sites.push({ file, line: index + 1, text: line });
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

function walkPageSourceFiles(dir = PAGES_ROOT): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (EXCLUDED.has(entry.name) || entry.name.includes("Mobile")) return [];
    const abs = resolve(dir, entry.name);
    if (entry.isDirectory()) return walkPageSourceFiles(abs);
    return /\.(tsx|ts)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [abs] : [];
  });
}

describe("sub-text-xs sizing stays at the floor in pages (#808 batch 50 owned)", () => {
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
      `sub-floor sizing in batch-50 files:\n${violations.join("\n")}`,
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

function hasAlternateFloorSize(line: string): boolean {
  const values = [
    ...line.matchAll(
      /text-\[(?:length:)?([^\]]+)\]|fontSize:\s*["']([^"']+)["']/g,
    ),
  ];
  return values.some((match) => {
    const value = match[1] ?? match[2];
    if (/[a-z][a-z0-9-]*\s*\(/i.test(value)) return true;
    const size = /^(\d*\.?\d+)(px|rem|em|pt)$/.exec(value);
    if (!size) return false;
    const factor = { px: 1, rem: 16, em: 16, pt: 4 / 3 }[size[2]]!;
    return Number(size[1]) * factor <= 12;
  });
}
it("detects equivalent alternate and fixed-floor font sizes", () => {
  for (const token of [
    "text-[12px]",
    "text-[.6rem]",
    "text-[9pt]",
    "text-[length:0.7em]",
    "text-[calc(0.75rem-2px)]",
    'fontSize: "0.6rem"',
  ])
    expect(hasAlternateFloorSize(token), token).toBe(true);
  for (const token of [
    "text-xs",
    "text-[1rem]",
    "text-[#abcdef]",
    "text-[14px]",
  ])
    expect(hasAlternateFloorSize(token), token).toBe(false);
});

it("includes nested page sources", () => {
  expect(walkPageSourceFiles()).toContain(resolve(PAGES_ROOT, "design-system/DesignSystemPage.tsx"));
});
