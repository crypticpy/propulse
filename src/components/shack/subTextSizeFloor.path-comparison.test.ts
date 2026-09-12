/**
 * PathComparison sub-text-xs guard (#808 batch 55)
 *
 * Census on `origin/main`: `PathComparison.tsx` holds 2 sub-floor
 * `text-[Npx]` sites (N<12) — decorative up/down arrow glyphs beside tabular
 * diff values. User-read Path A/B labels were already at `text-xs` on main;
 * this batch adds a sibling guard only.
 *
 * Sibling to `subTextSizeFloor.shack.test.ts` — does not edit that file.
 */

import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");

/** Files this batch guards — append-only for follow-ups. */
const FILES = ["src/components/shack/PathComparison.tsx"];

interface AllowlistEntry {
  file: string;
  match: string;
  reason: string;
}

const ALLOWLIST: AllowlistEntry[] = [
  {
    file: "src/components/shack/PathComparison.tsx",
    match: 'className="text-[10px]" aria-label="improved"',
    reason:
      "decorative up-arrow glyph beside a tabular diff value — icon with aria-label, not body copy",
  },
  {
    file: "src/components/shack/PathComparison.tsx",
    match: 'className="text-[10px]" aria-label="regressed"',
    reason:
      "decorative down-arrow glyph beside a tabular diff value — icon with aria-label, not body copy",
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

describe("sub-text-xs sizing stays at the floor in PathComparison (#808 batch 55)", () => {
  it("has no un-allowlisted sub-floor text-[Npx] or inline fontSize in PathComparison.tsx", () => {
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
      `sub-floor sizing in batch-55 PathComparison:\n${violations.join("\n")}`,
    ).toEqual([]);
  });
});
