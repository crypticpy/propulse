/**
 * Profile sub-text-xs guard — batch 43 tail (#808)
 *
 * Census on `origin/main`: remaining user-read profile components with
 * sub-floor `text-[Npx]` (N<12) outside PR #1209 (batch 29) and PR #1171
 * (CallsignLookupSuggestions / StationIdentityForm).
 *
 * This batch raises 12 user-read sites across 9 profile components.
 * Skips phone breakpoints, ProfilePage.tsx, and profile-workspace.css
 * mobile overrides. Sibling to `subTextSizeFloor.profile.test.ts` — does
 * not edit it.
 */

import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");

/** Files this batch read and fixed — append-only for follow-ups. */
const FILES = [
  "src/components/profile/AchievementGrid.tsx",
  "src/components/profile/ActiveDaysChart.tsx",
  "src/components/profile/AwardProgressRing.tsx",
  "src/components/profile/HeroStatsBlock.tsx",
  "src/components/profile/LicenseHistory.tsx",
  "src/components/profile/OnAirBadge.tsx",
  "src/components/profile/PersonalRecords.tsx",
  "src/components/profile/QSOByModeChart.tsx",
  "src/components/profile/StatCard.tsx",
];

const SIZE_RE = /text-\[(?:length:)?(\d*\.?\d+)px\]/g;
const INLINE_SIZE_RE =
  /fontSize:\s*["']?(\d*\.?\d+)(?:px)?["']?(?![\w%.])/g;

interface AllowlistEntry {
  file: string;
  match: string;
  reason: string;
}

const ALLOWLIST: AllowlistEntry[] = [];

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

describe("sub-text-xs sizing stays at the floor in profile (#808 batch 43 tail)", () => {
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
      `sub-floor sizing in batch-43 tail files:\n${violations.join("\n")}`,
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
