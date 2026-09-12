/**
 * Nets sub-text-xs guard — batch 56 history (#808)
 *
 * Census on `origin/main`: `NetSessionHistory.tsx` holds 3 sub-floor
 * `text-[Npx]` sites (N<12) — check-in count, cancelled badge, and summary
 * toggle. This batch raises those user-read labels to `text-xs`.
 *
 * Sibling to `subTextSizeFloor.nets.test.ts` (#1214) — does not edit
 * that file while the parent PR is open.
 */

import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");

/** Files this batch read and fixed — append-only for follow-ups. */
const FILES = ["src/components/nets/NetSessionHistory.tsx"];

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

describe("sub-text-xs sizing stays at the floor in nets history (#808 batch 56)", () => {
  it("has no sub-floor text-[Npx] or inline fontSize in the fixed nets history files", () => {
    const violations: string[] = [];
    for (const file of FILES) {
      for (const site of findSubFloorSites(file)) {
        violations.push(`${site.file}:${site.line}: ${site.text.trim()}`);
      }
    }
    expect(
      violations,
      `sub-floor sizing in batch-56 nets history files:\n${violations.join("\n")}`,
    ).toEqual([]);
  });
});
