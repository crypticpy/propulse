/**
 * Sub-text-xs type sizing guard (#783)
 *
 * #783 ("Contrast audit tail B") asked for a repo-wide grep-and-classify of
 * every `text-[Npx]` arbitrary value below the `text-xs` floor (12px /
 * 0.75rem -- Tailwind's own `xs` step, unmodified in `tailwind.config.js`,
 * so raising a site to the floor is exactly `text-xs`, not a new token).
 *
 * `git grep -n 'text-\[[0-9]*px\]' -- src/` at the time of this PR returns
 * 1819 hits across 371 files; filtered to N<12 (the actual floor this guard
 * enforces) that is **1793 hits across 369 files**. That is the shape of
 * years of pre-existing UI density choices across the whole app (dense chip
 * rows, mono-digit displays, tabular badges), not a defect introduced
 * recently -- and it is far larger than one issue's 15-file PR budget can
 * fix or even responsibly classify one-by-one (a bulk "pre-existing debt"
 * allowlist of ~1750 lines this session did not individually review would
 * not be an honest classification).
 *
 * This PR fixes the specific sites #783's P3 list named (`PropagationForecastMini.tsx`,
 * `SelectedSpotCard.tsx`, `SpotCollectionPopover.tsx`, `SpotDetailsFlyout.tsx`,
 * `SpotDetailsModal.tsx`), enumerated by grepping each file rather than
 * trusting the issue's line numbers (see the PR body's census table), plus
 * the three `text-[9px]` sites in the HamClock hover-chrome trio this PR's
 * review round caught (`HamClockLayerChips.tsx`, `HamClockModeSwitch.tsx`,
 * `HamClockProjectionSwitch.tsx` -- same PR, same colour-class edit, no
 * reason to leave the size unaudited). The guard below is scoped to exactly
 * those eight files -- the set this session actually read and classified --
 * so it stays honest about what was audited and still proves the fix:
 * reverting any one of the sizing fixes in these eight files makes this test
 * fail and name the file:line. A follow-up issue (#808) widens the walked
 * set (and its allowlist) one directory at a time; expanding FILES below to
 * `src/**\/*.tsx` today would either fail on ~1744 un-triaged pre-existing
 * sites or require an allowlist this session cannot back with real per-site
 * judgement.
 *
 * #808 dx round: `src/components/dx/` census found 148 sub-floor sites
 * across 24 files (`PredictionsCard.tsx`'s 2 sites excluded here -- a
 * concurrent PR #818 owns that file; reported separately, not fixed or
 * audited by this round). Of the remaining 22, `WorkStationPanel.tsx` and
 * `DXSpotOverlay.tsx` are dead code (zero importers/render sites outside
 * this barrel and its own re-export) and were left un-raised on purpose --
 * raising unreachable markup proves nothing here. This PR fixes 14
 * most-mounted files below (114 sites): the `DXSpotList` row family
 * (`DXSpotList.tsx`, `SpotRow.tsx`, `FilterControls.tsx`, `SpotBadge.tsx`),
 * `SpotDetailPanel.tsx`, the `DXConsole` direct-render family
 * (`DXConsole.tsx`, `BandActivityBar.tsx`, `BandMap.tsx`, `SkedScheduler.tsx`,
 * `InsightsBar.tsx`), and the insights-bar card family (`LogStatsCard.tsx`,
 * `HistoryCard.tsx`, `ClusterPulseCard.tsx`, `SpotStatsDashboard.tsx`).
 * Left for a follow-up (#826): both `modals/` files --
 * `modals/LogStatsDetailModal.tsx` (3 sites) and
 * `modals/HistoryDetailModal.tsx` (1) -- plus `BandVerdictPanel.tsx` (7),
 * `BandVerdictDetailsDialog.tsx` (7), `BandScope.tsx` (1),
 * `DxWizardContestNote.tsx` (5), and `WSJTXStatusPanel.tsx` (5) -- all
 * confirmed mounted, just narrower-reach than the 14 above.
 *
 * `modals/LogStatsDetailModal.tsx` was audited and fixed in this round and
 * then pulled back out: 14 source files plus this guard is 15, and
 * `AGENTS.md:7` caps a PR at 15. Its 3 sites are already classified, which
 * is why #826 carries them with a line count rather than a re-audit.
 *
 * #826 dx tail: re-grepped (not trusted from #825's table, since #818 had
 * landed on `PredictionsCard.tsx` in the meantime) the 8 remaining files.
 * The counts matched #825's table exactly -- 31 sites, all `text-[10px]`
 * or `text-[11px]` except one `text-[9px]` in `BandScope.tsx` -- and all
 * raised to `text-xs`. `PredictionsCard.tsx`'s two sites (`:216`, `:300`;
 * `:292` shifted after #818) are fixed and added here even though the file
 * is barrel-export only with no render site (per #798). This round's mount
 * audit also found `BandVerdictPanel.tsx` to be barrel-export only with no
 * render site anywhere outside its own file and `index.ts` -- #825's
 * "confirmed mounted" note above and #826's issue text are both wrong
 * about that file; it was fixed and added anyway, consistent with the
 * `PredictionsCard.tsx` precedent, since #826 named it explicitly rather
 * than leaving it out like the dead-code bucket (`WorkStationPanel.tsx`,
 * `DXSpotOverlay.tsx`) from the #825 round. Zero allowlist entries added.
 *
 * #854 (carved out of PR #839, part of the #832 map-slice work in flight on
 * a separate branch): fixes the nine sub-floor `text-[Npx]` sites in
 * `modals/PropagationForecastModal.tsx`. That file also drew an SNR-label
 * visibility gate (`CELL_WIDTH > 20 && CELL_HEIGHT > 20`) built from two
 * module constants, so the comparison was a compile-time `true` -- it never
 * actually gated anything. Once the label moved to `text-xs` it started
 * following Settings -> Text Size, and the old gate would let three-digit
 * or negative SNR values overflow the cell at `lg`/`xl`. Landed together
 * with a text-scale-aware `snrLabelFits()` fit check (unit-tested
 * separately in `modals/PropagationForecastModal.test.ts`) so the site
 * conversion doesn't ship a visible regression. This branch's base (`main`
 * at the time of writing) predates the #832 census paragraph and running
 * total recorded on `fix/sub-text-xs-map-slice1-832`; this entry documents
 * only this file's 9 sites and does not attempt to reconcile that total.
 * Refs #832, #839.
 */

import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");

/** The exact set of files #783's census covered. Widen deliberately, file by
 * file, in a follow-up (#808) -- see the module doc above. */
const FILES = [
  "src/components/map/PropagationForecastMini.tsx",
  "src/components/map/SelectedSpotCard.tsx",
  "src/components/map/SpotCollectionPopover.tsx",
  "src/components/map/SpotDetailsFlyout.tsx",
  "src/components/map/SpotDetailsModal.tsx",
  "src/components/map/hamclock/HamClockLayerChips.tsx",
  "src/components/map/hamclock/HamClockModeSwitch.tsx",
  "src/components/map/hamclock/HamClockProjectionSwitch.tsx",
  // #808 dx round -- see module doc above for the full census and split.
  "src/components/dx/DXSpotList/DXSpotList.tsx",
  "src/components/dx/DXSpotList/SpotRow.tsx",
  "src/components/dx/DXSpotList/FilterControls.tsx",
  "src/components/dx/SpotBadge.tsx",
  "src/components/dx/SpotDetailPanel.tsx",
  "src/components/dx/DXConsole.tsx",
  "src/components/dx/BandActivityBar.tsx",
  "src/components/dx/BandMap.tsx",
  "src/components/dx/SkedScheduler.tsx",
  "src/components/dx/InsightsBar.tsx",
  "src/components/dx/LogStatsCard.tsx",
  "src/components/dx/HistoryCard.tsx",
  "src/components/dx/ClusterPulseCard.tsx",
  "src/components/dx/SpotStatsDashboard.tsx",
  // #826 dx tail -- see module doc above.
  "src/components/dx/BandVerdictPanel.tsx",
  "src/components/dx/BandVerdictDetailsDialog.tsx",
  "src/components/dx/DxWizardContestNote.tsx",
  "src/components/dx/WSJTXStatusPanel.tsx",
  "src/components/dx/modals/LogStatsDetailModal.tsx",
  "src/components/dx/PredictionsCard.tsx",
  "src/components/dx/modals/HistoryDetailModal.tsx",
  "src/components/dx/BandScope.tsx",
  // #854 -- see module doc above.
  "src/components/map/modals/PropagationForecastModal.tsx",
];

interface AllowlistEntry {
  file: string;
  /** A substring of the offending line that identifies the site by its
   * content, not its line number -- keyed this way so an unrelated edit
   * that shifts line numbers elsewhere in the file (or in this file) can't
   * silently desync the allowlist from the site it documents. */
  match: string;
  reason: string;
}

/**
 * Sites this session classified as legitimately below the floor, with the
 * reason. Empty is not the expected steady state here (this repo has real
 * sub-floor decorative markup); every entry must be one this session
 * actually read in context.
 */
const ALLOWLIST: AllowlistEntry[] = [
  {
    file: "src/components/map/PropagationForecastMini.tsx",
    match: "&#9733;",
    reason:
      "decorative unicode star glyph (the greyline sunrise marker, U+2605) inside a title-tooltipped chip -- not text the user reads, an icon standing in for one. The rest of the chip's information (times, GL countdown) already ships at text-xs or larger.",
  },
];

const SIZE_RE = /text-\[(\d+)px\]/g;

interface SubFloorSite {
  file: string;
  line: number;
  text: string;
}

/** Every `text-[Npx]` site with N < 12 in `file`, read fresh every call. */
function findSubFloorSites(file: string): SubFloorSite[] {
  const absPath = resolve(REPO_ROOT, file);
  const lines = readFileSync(absPath, "utf8").split("\n");
  const sites: SubFloorSite[] = [];
  lines.forEach((line, index) => {
    for (const match of line.matchAll(SIZE_RE)) {
      if (Number(match[1]) < 12) {
        sites.push({ file, line: index + 1, text: line });
      }
    }
  });
  return sites;
}

describe("sub-text-xs sizing stays at the floor in the #783/#808 audited set", () => {
  it("has no un-allowlisted text-[Npx] with N < 12 in the audited files", () => {
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
      `un-allowlisted sub-floor text-[Npx] sites:\n${violations.join("\n")}`,
    ).toEqual([]);
  });

  it("every allowlist entry still matches a real sub-floor site in the audited files", () => {
    // Proves the allowlist isn't stale: if a listed site got fixed (or
    // deleted) without removing its entry, that's a silent gap in this
    // guard's coverage, not a pass. Content-keyed, so this survives
    // unrelated line-number shifts elsewhere in the file.
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
