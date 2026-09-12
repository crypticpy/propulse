/**
 * Nets sub-text-xs guard (#808 batch 35 — tail)
 *
 * Remaining sub-floor `text-[Npx]` sites (N<12) under `src/components/nets/`
 * after PR #1214 (batch 32). Raises user-read copy to `text-xs` in five
 * leftover badge/indicator files (6-file batch including this test).
 *
 * Skips PR #1214 in-flight files, #1192 (NetSessionHistory), #844 contrast
 * table files (SmartNetFinder, PropagationNetSuggestions), and
 * NetFilterControls (#901 phone/W-D badge).
 *
 * Sibling to `subTextSizeFloor.nets.test.ts` on #1214 — does not edit
 * that file while the parent PR is open.
 */

import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");
const NETS_ROOT = resolve(REPO_ROOT, "src/components/nets");

/** Files this batch read and fixed — append-only for follow-ups (≤15 cap). */
const FILES = [
  "src/components/nets/RSVPButton.tsx",
  "src/components/nets/PhaseIndicator.tsx",
  "src/components/nets/NetTypeBadge.tsx",
  "src/components/nets/NetLiveIndicator.tsx",
  "src/components/nets/FormalityBadge.tsx",
];

/** Owned elsewhere or deferred — must stay out of this batch's census walk. */
const EXCLUDED = new Set([
  // PR #1214 (batch 32) — in flight; do not fail the tail walk on these
  "AddToCalendarDropdown.tsx",
  "HappeningNowBanner.tsx",
  "ManagerRoster.tsx",
  "MyNetsSection.tsx",
  "NCSKeyboardHints.tsx",
  "NCSRotationCalendar.tsx",
  "NetForm.tsx",
  "NetMilestoneCard.tsx",
  "NetRecommendations.tsx",
  "NetRegulars.tsx",
  "PreambleEditor.tsx",
  "QueuePanel.tsx",
  "SessionSummaryCard.tsx",
  "VoIPNodeList.tsx",
  "subTextSizeFloor.nets.test.ts",
  // PR #1192 — in flight
  "CloseoutPhase.tsx",
  "NetCard.tsx",
  "NetSessionHistory.tsx",
  "OfflineBanner.tsx",
  // #844 skip list — status-tint contrast table
  "SmartNetFinder.tsx",
  "PropagationNetSuggestions.tsx",
  // #901 phone/W-D badge — deferred
  "NetFilterControls.tsx",
]);

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
    if (hasAlternateFloorSize(line)) {
      sites.push({ file, line: index + 1, text: line });
      return;
    }
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

function walkNetsSourceFiles(dir: string, relPrefix = ""): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    const rel = relPrefix ? `${relPrefix}/${entry}` : entry;
    if (statSync(abs).isDirectory()) {
      results.push(...walkNetsSourceFiles(abs, rel));
    } else if (
      /\.(tsx|ts)$/.test(entry) &&
      !entry.endsWith(".test.ts") &&
      !entry.endsWith(".test.tsx") &&
      !EXCLUDED.has(rel)
    ) {
      results.push(abs);
    }
  }
  return results;
}

describe("sub-text-xs sizing stays at the floor in nets (#808 batch 35 tail)", () => {
  it("has no un-allowlisted sub-floor text-[Npx] or inline fontSize in the fixed nets tail files", () => {
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
      `sub-floor sizing in batch-35 tail files:\n${violations.join("\n")}`,
    ).toEqual([]);
  });

  it("has no un-allowlisted sub-floor text-[Npx] anywhere under src/components/nets (except batch-32 / #844 / #901 deferred sites)", () => {
    const violations: string[] = [];
    for (const abs of walkNetsSourceFiles(NETS_ROOT)) {
      const rel = abs.slice(REPO_ROOT.length + 1);
      for (const site of findSubFloorSites(rel)) {
        if (!isAllowlisted(site)) {
          violations.push(`${site.file}:${site.line}: ${site.text.trim()}`);
        }
      }
    }
    expect(
      violations,
      `sub-floor sizing under nets/:\n${violations.join("\n")}`,
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
