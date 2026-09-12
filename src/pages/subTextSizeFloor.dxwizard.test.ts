/**
 * DXWizard sub-text-xs guard (#808 batch 33)
 *
 * Census: 26 sub-floor `text-[Npx]` sites (N<12) in `src/pages/DXWizard.tsx` —
 * section labels, station meta, recommendation cards, band planner copy, and
 * reality-check badges. User-read copy raised to `text-xs`.
 *
 * Skips phone-only `text-[10px] sm:text-xs` patterns (none in this file).
 * Page was deferred from #1193/#1194 pages batches.
 *
 * Sibling to `../components/map/subTextSizeFloor.test.ts` — does not edit
 * that file.
 */

import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../..");

/** Files this batch read and fixed — append-only for follow-ups. */
const FILES = ["src/pages/DXWizard.tsx"];

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

describe("sub-text-xs sizing stays at the floor in DXWizard (#808 batch 33)", () => {
  it("has no un-allowlisted sub-floor text-[Npx] or inline fontSize in DXWizard.tsx", () => {
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
      `sub-floor sizing in batch-33 files:\n${violations.join("\n")}`,
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
