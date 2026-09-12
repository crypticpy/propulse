/**
 * HamClock sub-text-xs guard (#808 batch 2)
 *
 * Census on `origin/main` at `6b36ce97`: `src/components/map/hamclock/`
 * holds 19 sub-floor `text-[Npx]` sites (N<12) across 3 legacy panel files.
 * The `wall/` subtree (tiles, reports, controls, settings — 150+ source
 * files) is already clean: it uses `hc-*` token classes from
 * `styles/hamclock-wall*.css` instead of arbitrary px sizes.
 *
 * This batch raises all 19 sites in:
 * - `HamClockBestBandHero.tsx` (4)
 * - `HamClockDxpeditionsPanel.tsx` (8)
 * - `HamClockContestsPanel.tsx` (7)
 *
 * User-read labels (loading states, entity names, countdowns, attribution
 * links, scope labels, obs/rx counts) → `text-xs`. Zero allowlist entries.
 *
 * Sibling to `../subTextSizeFloor.test.ts` — does not edit that file so
 * batch 1 (#1172) can land independently. Reuses the same matcher grammar.
 */

import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../../..");
const HAMCLOCK_ROOT = resolve(REPO_ROOT, "src/components/map/hamclock");

/** Files this batch read and fixed — append-only for follow-ups. */
const FILES = [
  "src/components/map/hamclock/HamClockBestBandHero.tsx",
  "src/components/map/hamclock/HamClockDxpeditionsPanel.tsx",
  "src/components/map/hamclock/HamClockContestsPanel.tsx",
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
      for (const match of line.matchAll(re)) {
        if (Number(match[1]) < 12) {
          sites.push({ file, line: index + 1, text: line });
        }
      }
    }
  });
  return sites;
}

function walkHamclockSourceFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) {
      results.push(...walkHamclockSourceFiles(abs));
    } else if (
      /\.(tsx|ts)$/.test(entry) &&
      !entry.endsWith(".test.ts") &&
      !entry.endsWith(".test.tsx")
    ) {
      results.push(abs);
    }
  }
  return results;
}

describe("sub-text-xs sizing stays at the floor in HamClock (#808 batch 2)", () => {
  it("has no sub-floor text-[Npx] or inline fontSize in the fixed panel files", () => {
    const violations: string[] = [];
    for (const file of FILES) {
      for (const site of findSubFloorSites(file)) {
        violations.push(`${site.file}:${site.line}: ${site.text.trim()}`);
      }
    }
    expect(
      violations,
      `sub-floor sizing in batch-2 files:\n${violations.join("\n")}`,
    ).toEqual([]);
  });

  it("has no sub-floor text-[Npx] anywhere under src/components/map/hamclock", () => {
    const violations: string[] = [];
    for (const abs of walkHamclockSourceFiles(HAMCLOCK_ROOT)) {
      const rel = abs.slice(REPO_ROOT.length + 1);
      for (const site of findSubFloorSites(rel)) {
        violations.push(`${site.file}:${site.line}: ${site.text.trim()}`);
      }
    }
    expect(
      violations,
      `sub-floor sizing under hamclock/:\n${violations.join("\n")}`,
    ).toEqual([]);
  });
});
