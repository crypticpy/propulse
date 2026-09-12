/**
 * SDR sub-text-xs guard — batch 41 skins (#808)
 *
 * Census on `origin/main` after PRs #1177, #1180, #1183, and #1186: every
 * sub-floor site under `src/components/sdr/skins/` outside those open PRs
 * is either decorative axis/chrome (FlexFreqAxis, FlexTimeAxis, FlexDbScale,
 * FateWaterfallStrip) or the two user-read badges deferred from batch 4
 * (`FlexBottomBar` TX, `FateBandActivity` NEW). This slice raises those
 * badges to `text-xs`; one decorative fox-emoji glyph stays sub-floor and
 * is allowlisted by content.
 *
 * Sibling to the other SDR floor tests — does not edit them while those PRs
 * are open.
 */

import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");

/** Files this batch read and fixed — append-only for follow-ups. */
const FILES = [
  "src/components/sdr/skins/flexible/FlexBottomBar.tsx",
  "src/components/sdr/skins/fate/FateBandActivity.tsx",
];

interface AllowlistEntry {
  file: string;
  match: string;
  reason: string;
}

const ALLOWLIST: AllowlistEntry[] = [
  {
    file: "src/components/sdr/skins/fate/FateBandActivity.tsx",
    match: 'aria-label="Fox"',
    reason:
      "decorative fox emoji glyph in the spot-row message column — an icon with aria-label, not text the user reads as body copy.",
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
      for (const match of line.matchAll(re)) {
        if (Number(match[1]) < 12) {
          sites.push({ file, line: index + 1, text: line });
        }
      }
    }
  });
  return sites;
}

describe("sub-text-xs sizing stays at the floor in SDR (#808 batch 41 skins)", () => {
  it("has no un-allowlisted sub-floor text-[Npx] or inline fontSize in the fixed files", () => {
    const violations: string[] = [];
    for (const file of FILES) {
      for (const site of findSubFloorSites(file)) {
        const allowed = ALLOWLIST.some(
          (entry) => entry.file === file && site.text.includes(entry.match),
        );
        if (!allowed) {
          violations.push(`${site.file}:${site.line}: ${site.text.trim()}`);
        }
      }
    }
    expect(
      violations,
      `sub-floor sizing in batch-41 skins files:\n${violations.join("\n")}`,
    ).toEqual([]);
  });

  it("every allowlist entry still matches a real sub-floor site in the fixed files", () => {
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
