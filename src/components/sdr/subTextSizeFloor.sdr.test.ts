/**
 * SDR sub-text-xs guard (#808 batch 4)
 *
 * Census on `origin/main` at `6b36ce97`: `src/components/sdr/` holds 249
 * sub-floor `text-[Npx]` sites (N<12) across 43 files. This batch raises
 * 171 sites in the 14 most-mounted files below; two tabular/decorative
 * sites stay sub-floor and are allowlisted by content:
 *
 * - `FateBandActivity.tsx`: fox emoji glyph (`aria-label="Fox"`, decorative
 *   spot-row icon, not readable text). The necessary km unit scales with
 *   its value; two explicitly listed badge sites remain for a follow-up.
 *
 * User-read labels, buttons, tab chrome, decode rows, memory channels,
 * FT8 stats, console header, and fate/flex skin controls → `text-xs`.
 *
 * Sibling to `src/components/map/subTextSizeFloor.test.ts` — does not edit
 * that file so concurrent map/dx batches can land independently. 29 files
 * (~78 sub-floor sites) stay for follow-up SDR slices under #808.
 */

import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");

/** Files this batch read and fixed — append-only for follow-ups. */
const FILES = [
  "src/components/sdr/skins/fate/FateBandActivity.tsx",
  "src/components/sdr/skins/flexible/FlexSideControls.tsx",
  "src/components/sdr/skins/fate/FateDirectedMessages.tsx",
  "src/components/sdr/skins/flexible/SlicePanelTabs.tsx",
  "src/components/sdr/MemoryPanel.tsx",
  "src/components/sdr/skins/flexible/FlexVfoDisplay.tsx",
  "src/components/sdr/skins/fate/FateTopBar.tsx",
  "src/components/sdr/skins/flexible/SlicePanelAud.tsx",
  "src/components/sdr/skins/flexible/FlexBottomBar.tsx",
  "src/components/sdr/skins/flexible/FlexInfoTabs.tsx",
  "src/components/sdr/Ft8StatsDashboard.tsx",
  "src/components/sdr/SdrConsoleHeader.tsx",
  "src/components/sdr/skins/fate/FateBandAdvisor.tsx",
  "src/components/sdr/skins/fate/FateBottomBar.tsx",
];

const SIZE_RE = /text-\[(?:length:)?(\d*\.?\d+)px\]/g;
const INLINE_SIZE_RE = /fontSize:\s*["']?(\d*\.?\d+)(?:px)?["']?(?![\w%.])/g;

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
  {
    file: "src/components/sdr/skins/fate/FateBandActivity.tsx",
    match:
      "bg-plasma-orange/20 text-su-text text-[7px] px-1 rounded font-bold leading-normal",
    reason:
      "held at 7px so this batch does not edit accentTintContrast.test.ts (#844 / PR #1163)",
  },
];

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

describe("sub-text-xs sizing stays at the floor in SDR (#808 batch 4)", () => {
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
      `sub-floor sizing in batch-4 files:\n${violations.join("\n")}`,
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
