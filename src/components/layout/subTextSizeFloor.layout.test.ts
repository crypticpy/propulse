/**
 * Layout sub-text-xs guard (#808 batch 16)
 *
 * Census on `origin/main`: `src/components/layout/` holds 13 sub-floor
 * `text-[Npx]` sites (N<12) across 5 files — header tagline and Pro badge,
 * alert count overlay, collapsed floating-panel title, and mobile tab/drawer
 * chrome. This batch raises desktop user-read copy to `text-xs`.
 *
 * Skips phone-only layout (`MobileHeader`, `BottomTabBar`, `ToolsDrawer`).
 *
 * Sibling to `../map/subTextSizeFloor.test.ts` — does not edit that file.
 */

import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");
const LAYOUT_ROOT = resolve(REPO_ROOT, "src/components/layout");

/** Files this batch read and fixed — append-only for follow-ups. */
const FILES = [
  "src/components/layout/Header.tsx",
  "src/components/layout/FloatingPanel.tsx",
];

/** Phone-only or owned elsewhere — must stay out of this batch's census walk. */
const EXCLUDED = new Set([
  "MobileHeader.tsx",
  "BottomTabBar.tsx",
  "ToolsDrawer.tsx",
]);

interface AllowlistEntry {
  file: string;
  match: string;
  reason: string;
}

const ALLOWLIST: AllowlistEntry[] = [
  {
    file: "src/components/layout/Header.tsx",
    match: "text-[10px] font-bold rounded-full",
    reason:
      "solar alert count overlay on bell icon — compact numeric badge in fixed 18px pill",
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

function walkLayoutSourceFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) {
      results.push(...walkLayoutSourceFiles(abs));
    } else if (
      /\.(tsx|ts)$/.test(entry) &&
      !entry.endsWith(".test.ts") &&
      !entry.endsWith(".test.tsx") &&
      !EXCLUDED.has(entry)
    ) {
      results.push(abs);
    }
  }
  return results;
}

describe("sub-text-xs sizing stays at the floor in layout (#808 batch 16)", () => {
  it("has no un-allowlisted sub-floor text-[Npx] or inline fontSize in the fixed layout files", () => {
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
      `sub-floor sizing in batch-16 files:\n${violations.join("\n")}`,
    ).toEqual([]);
  });

  it("has no un-allowlisted sub-floor text-[Npx] anywhere under src/components/layout (except deferred phone chrome)", () => {
    const violations: string[] = [];
    for (const abs of walkLayoutSourceFiles(LAYOUT_ROOT)) {
      const rel = abs.slice(REPO_ROOT.length + 1);
      for (const site of findSubFloorSites(rel)) {
        if (!isAllowlisted(site)) {
          violations.push(`${site.file}:${site.line}: ${site.text.trim()}`);
        }
      }
    }
    expect(
      violations,
      `sub-floor sizing under layout/:\n${violations.join("\n")}`,
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
