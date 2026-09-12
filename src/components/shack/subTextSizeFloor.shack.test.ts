/**
 * Shack sub-text-xs guard (#808 batch 6)
 *
 * Census on `origin/main` at `6b36ce97`: `src/components/shack/` holds 77
 * sub-floor `text-[Npx]` sites (N<12) across 16 files. This batch raises
 * user-read labels to `text-xs` in the 14 densest non-builder-excluded files
 * below (~62 sites). Three decorative/deferred sites stay sub-floor and are
 * allowlisted by content; builder panels held for #1169 are deferred entire
 * files.
 *
 * Stay off (not edited): `builder/NodeConfigPanel.tsx`, `builder/BuilderCanvas.tsx`,
 * `builder/AllChainsView.tsx`, `builder/addPathEquipment.ts` (#1169).
 *
 * Sibling to `../map/subTextSizeFloor.test.ts` — does not edit that file.
 */

import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");
const SHACK_ROOT = resolve(REPO_ROOT, "src/components/shack");

/** Files this batch read and fixed — append-only for follow-ups. */
const FILES = [
  "src/components/shack/WhatIfSimulator.tsx",
  "src/components/shack/PathComparison.tsx",
  "src/components/shack/PresetBuilder.tsx",
  "src/components/shack/BandCapabilityStrip.tsx",
  "src/components/shack/EquipmentCard.tsx",
  "src/components/shack/EquipmentHeroCard.tsx",
  "src/components/shack/EquipmentDetailModal.tsx",
  "src/components/shack/EquipmentCardSm.tsx",
  "src/components/shack/EquipmentCardMd.tsx",
  "src/components/shack/builder/LossBudgetBar.tsx",
  "src/components/shack/builder/DraggableEquipmentCard.tsx",
  "src/components/shack/builder/ChainSelector.tsx",
  "src/components/shack/builder/ShackSchematicView.tsx",
  "src/components/shack/builder/ChainStripPreview.tsx",
];

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
  {
    file: "src/components/shack/builder/ChainStripPreview.tsx",
    match: "text-[9px] font-bold ${config.color}",
    reason:
      "two- to three-letter node-type abbreviations inside fixed 28px circles on the chain strip — decorative mono chips that overflow at text-xs",
  },
  {
    file: "src/components/shack/builder/ChainSelector.tsx",
    match:
      "shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-plasma-orange/20 text-su-text",
    reason:
      "held at 10px so this batch does not edit accentTintContrast.test.ts (#803 / measured Active badge site)",
  },
  {
    file: "src/components/shack/builder/NodeConfigPanel.tsx",
    match: "text-[11px] font-medium ${color}",
    reason: "deferred — stay off NodeConfigPanel (#1169); not in this batch",
  },
  {
    file: "src/components/shack/builder/NodeConfigPanel.tsx",
    match:
      "inline-block px-1.5 py-0.5 text-[10px] font-medium rounded bg-su-line/20 text-su-muted ml-2 align-middle",
    reason: "deferred — stay off NodeConfigPanel (#1169); section count badges",
  },
  {
    file: "src/components/shack/builder/NodeConfigPanel.tsx",
    match: 'className="text-[10px] text-su-muted"',
    reason: "deferred — stay off NodeConfigPanel (#1169); helper copy under fields",
  },
  {
    file: "src/components/shack/builder/BuilderCanvas.tsx",
    match: "text-[10px] text-su-muted font-medium",
    reason: "deferred — stay off BuilderCanvas (#1169); lane column headers",
  },
  {
    file: "src/components/shack/builder/BuilderCanvas.tsx",
    match: "text-[10px] text-su-muted font-mono w-10 text-center",
    reason: "deferred — stay off BuilderCanvas (#1169); zoom percentage readout",
  },
  {
    file: "src/components/shack/builder/BuilderCanvas.tsx",
    match:
      "px-1.5 h-7 flex items-center justify-center rounded text-su-muted hover:text-su-text hover:bg-su-line/20 text-[10px] font-medium",
    reason: "deferred — stay off BuilderCanvas (#1169); zoom-to-fit control",
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

function walkShackSourceFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) {
      results.push(...walkShackSourceFiles(abs));
    } else if (
      /\.(tsx|ts)$/.test(entry) &&
      !entry.endsWith(".test.ts") &&
      !entry.endsWith(".test.tsx")
    ) {
      results.push(abs);
    }
  }
  return results;
}

describe("sub-text-xs sizing stays at the floor in shack (#808 batch 6)", () => {
  it("has no un-allowlisted sub-floor text-[Npx] or inline fontSize in the fixed shack files", () => {
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
      `sub-floor sizing in batch-6 files:\n${violations.join("\n")}`,
    ).toEqual([]);
  });

  it("has no un-allowlisted sub-floor text-[Npx] anywhere under src/components/shack", () => {
    const violations: string[] = [];
    for (const abs of walkShackSourceFiles(SHACK_ROOT)) {
      const rel = abs.slice(REPO_ROOT.length + 1);
      for (const site of findSubFloorSites(rel)) {
        if (!isAllowlisted(site)) {
          violations.push(`${site.file}:${site.line}: ${site.text.trim()}`);
        }
      }
    }
    expect(
      violations,
      `sub-floor sizing under shack/:\n${violations.join("\n")}`,
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
