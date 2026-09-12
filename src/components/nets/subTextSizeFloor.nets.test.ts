/**
 * Nets sub-text-xs guard (#808 batch 32)
 *
 * Census on `origin/main`: `src/components/nets/` holds 60+ sub-floor
 * `text-[Npx]` sites (N<12) across 23 files. This batch raises user-read
 * copy to `text-xs` in the 14 files below.
 *
 * Skips NetSessionHistory (#1192 / #844), SmartNetFinder and
 * PropagationNetSuggestions (#844 status-tint contrast table), NetFilterControls
 * (#901 phone/W-D badge), and five files reserved for follow-up slices.
 *
 * Sibling to other domain `subTextSizeFloor.*.test.ts` files — does not edit them.
 */

import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");

/** Files this batch read and fixed — append-only for follow-ups. */
const FILES = [
  "src/components/nets/SessionSummaryCard.tsx",
  "src/components/nets/ManagerRoster.tsx",
  "src/components/nets/MyNetsSection.tsx",
  "src/components/nets/NetForm.tsx",
  "src/components/nets/VoIPNodeList.tsx",
  "src/components/nets/AddToCalendarDropdown.tsx",
  "src/components/nets/NetRecommendations.tsx",
  "src/components/nets/NCSRotationCalendar.tsx",
  "src/components/nets/HappeningNowBanner.tsx",
  "src/components/nets/QueuePanel.tsx",
  "src/components/nets/PreambleEditor.tsx",
  "src/components/nets/NetRegulars.tsx",
  "src/components/nets/NetMilestoneCard.tsx",
  "src/components/nets/NCSKeyboardHints.tsx",
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

describe("sub-text-xs sizing stays at the floor in nets (#808 batch 32)", () => {
  it("has no sub-floor text-[Npx] or inline fontSize in the fixed nets files", () => {
    const violations: string[] = [];
    for (const file of FILES) {
      for (const site of findSubFloorSites(file)) {
        violations.push(`${site.file}:${site.line}: ${site.text.trim()}`);
      }
    }
    expect(
      violations,
      `sub-floor sizing in batch-32 nets files:\n${violations.join("\n")}`,
    ).toEqual([]);
  });
});
