/**
 * QSO sub-text-xs guard (#808 batch 12)
 *
 * Census on `origin/main`: `src/components/qso/` holds 41 sub-floor
 * `text-[Npx]` sites (N<12) across 11 files — form labels, sync panels,
 * export menu headers, band-map controls, DXCC/dupe badges, and QSL status
 * icons. This batch raises user-read copy to `text-xs`.
 *
 * Sibling to `../map/subTextSizeFloor.test.ts` — does not edit that file.
 */

import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");
const QSO_ROOT = resolve(REPO_ROOT, "src/components/qso");

/** Files this batch read and fixed — append-only for follow-ups. */
const FILES = [
  "src/components/qso/QSOEntryForm.tsx",
  "src/components/qso/QslSyncPanel.tsx",
  "src/components/qso/QslStatusIcons.tsx",
  "src/components/qso/QSOSyncStatusIndicator.tsx",
  "src/components/qso/QSOLogCards.tsx",
  "src/components/qso/QSOExportMenu.tsx",
  "src/components/qso/LotwSyncButton.tsx",
  "src/components/qso/DxccStatusBadge.tsx",
  "src/components/qso/DupeWarningBadge.tsx",
  "src/components/qso/ContestQslBatch.tsx",
  "src/components/qso/BandMapControls.tsx",
];

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

function walkQsoSourceFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) {
      results.push(...walkQsoSourceFiles(abs));
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

describe("sub-text-xs sizing stays at the floor in qso (#808 batch 12)", () => {
  it("has no un-allowlisted sub-floor text-[Npx] or inline fontSize in the fixed qso files", () => {
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
      `sub-floor sizing in batch-12 files:\n${violations.join("\n")}`,
    ).toEqual([]);
  });

  it("has no un-allowlisted sub-floor text-[Npx] anywhere under src/components/qso", () => {
    const violations: string[] = [];
    for (const abs of walkQsoSourceFiles(QSO_ROOT)) {
      const rel = abs.slice(REPO_ROOT.length + 1);
      for (const site of findSubFloorSites(rel)) {
        if (!isAllowlisted(site)) {
          violations.push(`${site.file}:${site.line}: ${site.text.trim()}`);
        }
      }
    }
    expect(
      violations,
      `sub-floor sizing under qso/:\n${violations.join("\n")}`,
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
