/**
 * Contest sub-text-xs guard (#808 batch 3)
 *
 * Census on `origin/main` at `6b36ce97`: `src/components/contest/` holds
 * ~140 sub-floor `text-[Npx]` sites (N<12) across 25 legacy panel files.
 *
 * This batch raises user-read labels to `text-xs` in 14 files (the densest
 * desktop panels). Tabular/decorative sites that must stay below the floor are
 * allowlisted by content. Phone (`MobileContestEntry`) and remaining panels
 * are deferred (W-D #901 / ≤15-file cap).
 *
 * Sibling to `../map/subTextSizeFloor.test.ts` — does not edit that file.
 * Reuses the same matcher grammar as the HamClock batch-2 guard.
 */

import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");
const CONTEST_ROOT = resolve(REPO_ROOT, "src/components/contest");

/** Files this batch read and fixed — append-only for follow-ups. */
const FILES = [
  "src/components/contest/AuditQueuePanel.tsx",
  "src/components/contest/BandReadinessStrip.tsx",
  "src/components/contest/BridgeStatusIndicator.tsx",
  "src/components/contest/ContestBandMap.tsx",
  "src/components/contest/ContestCalendar.tsx",
  "src/components/contest/ContestLiteHudPill.tsx",
  "src/components/contest/ContestRateSheet.tsx",
  "src/components/contest/ContestScoreShare.tsx",
  "src/components/contest/ContestScoreboard.tsx",
  "src/components/contest/ContestSpotsPanel.tsx",
  "src/components/contest/ContestTimer.tsx",
  "src/components/contest/ContestVoiceControls.tsx",
  "src/components/contest/MultiplierMatrix.tsx",
  "src/components/contest/NeededMultsPanel.tsx",
];

interface AllowlistEntry {
  file: string;
  /** Substring of the offending line — survives unrelated line shifts. */
  match: string;
  reason: string;
}

/**
 * Tabular/decorative sites below the floor, plus deferred files held for
 * batch 4 under the ≤15-file cap. Every entry was read in context.
 */
const ALLOWLIST: AllowlistEntry[] = [
  {
    file: "src/components/contest/MobileContestEntry.tsx",
    match: "text-[10px] text-su-muted uppercase",
    reason: "deferred — phone contest HUD (W-D #901); not in this desktop batch",
  },
  {
    file: "src/components/contest/MobileContestEntry.tsx",
    match: "px-3 py-1.5 text-[10px] text-su-muted uppercase tracking-wider font-semibold",
    reason: "deferred — phone section header (W-D #901)",
  },
  {
    file: "src/components/contest/BandReadinessStrip.tsx",
    match: "text-[7px] px-1 py-0.5 rounded bg-su-line/20",
    reason:
      "two-letter compass direction abbreviations (EU, NA, …) inside compact band tiles — decorative mono chips that overflow at text-xs in the fixed pill width",
  },
  {
    file: "src/components/contest/RigStatusBar.tsx",
    match: "text-[9px] text-su-muted mt-0.5 uppercase tracking-wider",
    reason: "deferred #808 batch 4 (≤15-file cap) — CAT/MAN mode chip under rig LED",
  },
  {
    file: "src/components/contest/RigStatusBar.tsx",
    match: "text-[10px] text-su-muted font-mono",
    reason:
      "deferred #808 batch 4 — split TX frequency mono readout under SPLIT banner",
  },
  {
    file: "src/components/contest/QuietBandNav.tsx",
    match: "text-[10px] font-medium text-su-muted uppercase tracking-wide",
    reason: "deferred #808 batch 4 — section label above band strip",
  },
  {
    file: "src/components/contest/QuietBandNav.tsx",
    match: "text-[10px] text-su-muted leading-relaxed",
    reason: "deferred #808 batch 4 — helper copy under band nav",
  },
  {
    file: "src/components/contest/MultiplierTracker.tsx",
    match: "text-su-muted ml-1 text-[10px]",
    reason: "deferred #808 batch 4 — per-band worked/needed fraction suffix",
  },
  {
    file: "src/components/contest/ContestScorePanel.tsx",
    match: "text-[10px] uppercase tracking-wider text-su-muted mb-0.5",
    reason: "deferred #808 batch 4 — stat tile label in compact score panel",
  },
  {
    file: "src/components/contest/ContestRunControls.tsx",
    match: "px-2 py-1 rounded text-[10px] font-bold transition-colors",
    reason: "deferred #808 batch 4 — RUN/S&P mode toggle chips",
  },
  {
    file: "src/components/contest/ContestQSOTable.tsx",
    match: "text-[10px] text-alert-red",
    reason: "deferred #808 batch 4 — inline dupe/error hint on QSO row",
  },
  {
    file: "src/components/contest/ContestQSOTable.tsx",
    match: "text-[10px] text-yellow-500",
    reason: "deferred #808 batch 4 — pending-draft warning on QSO row",
  },
  {
    file: "src/components/contest/ContestLiteHudSheet.tsx",
    match: "text-[10px] text-cosmic-cyan hover:text-cosmic-cyan/80",
    reason: "deferred #808 batch 4 — expand/collapse link in lite HUD sheet",
  },
  {
    file: "src/components/contest/ContestLiteHudSheet.tsx",
    match: "text-[11px] text-su-muted",
    reason: "deferred #808 batch 4 — session summary line in lite HUD sheet",
  },
  {
    file: "src/components/contest/ContestExplorerCard.tsx",
    match: "px-1.5 py-0.5 text-[10px] font-medium rounded border",
    reason: "deferred #808 batch 4 — contest mode badge on explorer card",
  },
  {
    file: "src/components/contest/ContestExplorerCard.tsx",
    match:
      "px-1.5 py-0.5 text-[10px] font-mono text-su-muted bg-su-line/10 rounded border",
    reason: "deferred #808 batch 4 — contest ID mono chip on explorer card",
  },
  {
    file: "src/components/contest/ContestExplorerCard.tsx",
    match: "px-1.5 py-0.5 text-[10px] text-su-muted",
    reason: "deferred #808 batch 4 — date range chip on explorer card",
  },
  {
    file: "src/components/contest/ContestDock.tsx",
    match: "text-[10px] text-cosmic-cyan hover:text-cosmic-cyan/80",
    reason: "deferred #808 batch 4 — dock header action link",
  },
  {
    file: "src/components/contest/ContestDock.tsx",
    match: "flex items-center gap-3 text-[11px] text-su-muted",
    reason: "deferred #808 batch 4 — dock session meta row",
  },
  {
    file: "src/components/contest/ContestDock.tsx",
    match: "flex flex-wrap items-center gap-2 text-[10px] text-su-muted",
    reason: "deferred #808 batch 4 — dock footer hint row",
  },
  {
    file: "src/components/contest/BandAdvisor.tsx",
    match:
      "px-2 py-0.5 rounded text-[10px] font-bold bg-plasma-orange/15 text-su-text",
    reason: "deferred #808 batch 4 — band switch CTA chip",
  },
  {
    file: "src/components/contest/BandAdvisor.tsx",
    match:
      "px-1.5 py-0.5 rounded text-[9px] text-su-muted hover:text-su-text hover:bg-su-line/10",
    reason: "deferred #808 batch 4 — dismiss/secondary chip in band advisor",
  },
  {
    file: "src/components/contest/BandAdvisor.tsx",
    match: "text-[11px] text-su-muted truncate flex-1 min-w-0",
    reason: "deferred #808 batch 4 — band recommendation reason line",
  },
  {
    file: "src/components/contest/BandAdvisor.tsx",
    match: "text-[9px] px-1.5 py-0.5 rounded-full font-mono",
    reason:
      "deferred #808 batch 4 — spot-count badge on band advisor row (compact pill)",
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

function isAllowlisted(site: SubFloorSite): boolean {
  return ALLOWLIST.some(
    (entry) => entry.file === site.file && site.text.includes(entry.match),
  );
}

function walkContestSourceFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) {
      results.push(...walkContestSourceFiles(abs));
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

describe("sub-text-xs sizing stays at the floor in contest (#808 batch 3)", () => {
  it("has no un-allowlisted sub-floor text-[Npx] or inline fontSize in the fixed panel files", () => {
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
      `sub-floor sizing in batch-3 files:\n${violations.join("\n")}`,
    ).toEqual([]);
  });

  it("has no un-allowlisted sub-floor text-[Npx] anywhere under src/components/contest", () => {
    const violations: string[] = [];
    for (const abs of walkContestSourceFiles(CONTEST_ROOT)) {
      const rel = abs.slice(REPO_ROOT.length + 1);
      for (const site of findSubFloorSites(rel)) {
        if (!isAllowlisted(site)) {
          violations.push(`${site.file}:${site.line}: ${site.text.trim()}`);
        }
      }
    }
    expect(
      violations,
      `sub-floor sizing under contest/:\n${violations.join("\n")}`,
    ).toEqual([]);
  });

  it("every allowlist entry still matches a real sub-floor site", () => {
    for (const entry of ALLOWLIST) {
      const stillPresent = findSubFloorSites(entry.file).some((site) =>
        site.text.includes(entry.match),
      );
      expect(
        stillPresent,
        `${entry.file}: allowlisted content "${entry.match}" is no longer at a sub-floor text-[Npx] site -- remove the stale entry`,
      ).toBe(true);
    }
  });
});
