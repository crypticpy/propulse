/**
 * Contest sub-text-xs guard — batch 5 tail (#808)
 *
 * Desktop leftover panels deferred from PR #1176 (batch 3/4) under the
 * ≤15-file cap. Raises user-read labels to `text-xs`; one compact spot-count
 * badge stays sub-floor and is allowlisted by content.
 *
 * Sibling to `subTextSizeFloor.contest.test.ts` on #1176 — does not edit
 * that file while the parent PR is open. Phone (`MobileContestEntry`) is
 * deferred to W-D #901.
 */

import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");

/** Files this batch read and fixed — append-only for follow-ups. */
const FILES = [
  "src/components/contest/RigStatusBar.tsx",
  "src/components/contest/QuietBandNav.tsx",
  "src/components/contest/MultiplierTracker.tsx",
  "src/components/contest/ContestScorePanel.tsx",
  "src/components/contest/ContestRunControls.tsx",
  "src/components/contest/ContestQSOTable.tsx",
  "src/components/contest/ContestLiteHudSheet.tsx",
  "src/components/contest/ContestExplorerCard.tsx",
  "src/components/contest/ContestDock.tsx",
  "src/components/contest/BandAdvisor.tsx",
];

interface AllowlistEntry {
  file: string;
  /** Substring of the offending line — survives unrelated line shifts. */
  match: string;
  reason: string;
}

const ALLOWLIST: AllowlistEntry[] = [
  {
    file: "src/components/contest/BandAdvisor.tsx",
    match: "text-[9px] px-1.5 py-0.5 rounded-full font-mono",
    reason:
      "compact spot-count badge on band-advisor row — decorative mono pill that overflows at text-xs beside the QSY chip",
  },
];

const SIZE_RE = /text-\[(?:length:)?(\d*\.?\d+)px\]/g;
const INLINE_SIZE_RE = /fontSize:\s*["']?(\d*\.?\d+)(?:px)?["']?(?![\w%.])/g;

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
    if (hasAlternateFloorSize(line))
      sites.push({ file, line: index + 1, text: line });
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

describe("sub-text-xs sizing stays at the floor in contest (#808 batch 5 tail)", () => {
  it("has no un-allowlisted sub-floor text-[Npx] or inline fontSize in the fixed panel files", () => {
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
      `sub-floor sizing in batch-5 tail files:\n${violations.join("\n")}`,
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
