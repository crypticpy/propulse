/**
 * Nets sub-text-xs guard — batch 53 rest (#808)
 *
 * Census on `origin/main`: `NetFilterControls.tsx` holds 1 sub-floor
 * `text-[Npx]` site (N<12) — active filter count badge on More Filters.
 * This batch raises that user-read badge to `text-xs`.
 *
 * Skips files owned by #1214/#1216 and other deferred nets slices.
 *
 * Sibling to `subTextSizeFloor.nets.test.ts` — does not edit that file.
 */

import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");

/** Files this batch read and fixed — append-only for follow-ups. */
const FILES = ["src/components/nets/NetFilterControls.tsx"];

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

describe("sub-text-xs sizing stays at the floor in nets rest (#808 batch 53)", () => {
  it("has no sub-floor text-[Npx] or inline fontSize in the fixed nets rest files", () => {
    const violations: string[] = [];
    for (const file of FILES) {
      for (const site of findSubFloorSites(file)) {
        violations.push(`${site.file}:${site.line}: ${site.text.trim()}`);
      }
    }
    expect(
      violations,
      `sub-floor sizing in batch-53 nets rest files:\n${violations.join("\n")}`,
    ).toEqual([]);
  });
});
