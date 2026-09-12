/**
 * Activation sub-text-xs guard — batch 56 park search (#808)
 *
 * Census on `origin/main`: `ParkSearch.tsx` holds 1 sub-floor
 * `text-[Npx]` site (N<12) — POTA active/inactive badge. This batch
 * raises that user-read label to `text-xs`.
 *
 * Sibling to `subTextSizeFloor.activation.test.ts` — does not edit
 * that file while sibling batches are in flight.
 */

import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");

/** Files this batch read and fixed — append-only for follow-ups. */
const FILES = ["src/components/activation/ParkSearch.tsx"];

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

describe("sub-text-xs sizing stays at the floor in park search (#808 batch 56)", () => {
  it("has no sub-floor text-[Npx] or inline fontSize in the fixed park search files", () => {
    const violations: string[] = [];
    for (const file of FILES) {
      for (const site of findSubFloorSites(file)) {
        violations.push(`${site.file}:${site.line}: ${site.text.trim()}`);
      }
    }
    expect(
      violations,
      `sub-floor sizing in batch-56 park search files:\n${violations.join("\n")}`,
    ).toEqual([]);
  });
});
