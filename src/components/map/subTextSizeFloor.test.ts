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
 * #832 map round (slice 1 of 6): `src/components/map/` census on `16c7bd32`
 * found 416 sub-floor sites across 83 files (the issue body's top-of-census
 * table). `PinFlyout.tsx` (10 sites) is owned by a concurrent PR (#824,
 * wiring the remaining map overlays to the focus home) and was skipped for
 * the next file down the census, per that issue's collision warning; it is
 * deferred rather than done, so it stays counted in the follow-up total
 * below. Each of the 14 files fixed here was confirmed mounted with a
 * `<ComponentName` render-site grep back to a routed page
 * (`src/pages/PropSphere.tsx`, itself lazy-routed in `App.tsx`) or a parent
 * already on that chain (`GlobeView.tsx`, `FlatMapView.tsx`,
 * `LayersPopover.tsx`, `ProToolbarRibbon.tsx`) -- none were
 * barrel-export-only, so this slice has no dead-code exclusions.
 * `layers/SatelliteDetailModal.tsx` is confirmed the component this census
 * means (not the unrelated `satellites/SatelliteDetailModal.tsx`),
 * rendered from both `PropSphere.tsx` and `SatellitesPage.tsx`. This PR
 * fixes 177 sites across 13 of the most-mounted files: `SatellitePanel.tsx`,
 * `layers/SatelliteDetailModal.tsx`, `PathAnalysis.tsx`, `LayersPopover.tsx`,
 * `ISSTrackerOverlay.tsx`, `OperatorProfile.tsx`, `WatchPopover.tsx`,
 * `TargetHoverTooltip.tsx`, `SatelliteOverlay.tsx`,
 * `layers/SatelliteFilters.tsx`, `layers/BasemapCategory.tsx`,
 * `TimeControl.tsx`, and `BandConditionsPanel.tsx`.
 * `modals/PropagationForecastModal.tsx` (9 sites) was audited and fixed in
 * this round and then pulled back out with its own follow-up in mind (a
 * `getBoundingClientRect`-measured re-placement fix on `TargetHoverTooltip.tsx`
 * and a real fit-check gate on the SVG heatmap's SNR label needed a review
 * round of their own, and 15 source files plus this guard plus that review's
 * test file was over budget) -- it stays counted in the follow-up total
 * below, not fixed here. Zero allowlist entries added. 70 files (239
 * sites) remain in `map/` for slices 2-6, one 15-file PR at a time -- that
 * total includes `PinFlyout.tsx` (deferred rather than done: it still needs
 * raising once #824 releases it) and `modals/PropagationForecastModal.tsx`.
 *
 * Extending this guard, for whoever runs the next round: `FILES` is
 * append-only -- never reorder it, never remove an entry, never convert it
 * to a glob (the no-glob argument is above; don't re-litigate it, just
 * point at it). Add exactly one census paragraph per round, appended in
 * round order, so the paragraphs read as a sequence about this file's
 * history rather than independent claims. Before editing this file, `git
 * fetch`/merge `origin/main` and re-read it from the merged state -- two
 * rounds appending to `FILES` in parallel produce a textual merge that
 * looks valid and that nobody has actually read. Re-run the census with
 * BOTH pathspecs: the direct-children one, `'src/components/map/*.tsx'`,
 * and the recursive one written with a doubled star. Git's doubled-star
 * pathspec needs an actual subdirectory segment, so the recursive pattern
 * on its own silently skips every direct child of the directory -- on this
 * round it reported 16 files / 111 sites for a directory that really holds
 * 83 / 416. (The recursive pattern is not spelled out here because the
 * sequence that ends it also ends this comment.) Each round's paragraph
 * records: the directory, the census numbers, which files were fixed,
 * which were deliberately left un-raised (and why), and the allowlist
 * count -- zero, ideally.
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
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
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
  // #832 map round -- see module doc above for the full census and split.
  "src/components/map/SatellitePanel.tsx",
  "src/components/map/layers/SatelliteDetailModal.tsx",
  "src/components/map/PathAnalysis.tsx",
  "src/components/map/LayersPopover.tsx",
  "src/components/map/ISSTrackerOverlay.tsx",
  "src/components/map/OperatorProfile.tsx",
  "src/components/map/WatchPopover.tsx",
  "src/components/map/TargetHoverTooltip.tsx",
  "src/components/map/SatelliteOverlay.tsx",
  "src/components/map/layers/SatelliteFilters.tsx",
  "src/components/map/layers/BasemapCategory.tsx",
  "src/components/map/TimeControl.tsx",
  "src/components/map/BandConditionsPanel.tsx",
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

/**
 * The same floor written as an inline style rather than a Tailwind class:
 * `fontSize: 9`, `fontSize: "9px"`, `fontSize: '9px'`. Codex found five of
 * these still sitting in `BandConditionsPanel.tsx` and `LayersPopover.tsx`
 * *after* the #832 round had added both files to `FILES` and both guard tests
 * were green -- a class-only regex reports a clean file that still renders 8px
 * text. Any new spelling of the floor has to be added here, not worked around:
 * the guard is only worth its green when it recognises every form the codebase
 * actually uses.
 *
 * Still unrecognised, and tracked by #833: rem and em arbitrary values
 * (`text-[0.7rem]`), point sizes, and a `clamp()` whose lower bound is below
 * the floor. That work lands between rounds, not inside one, because it
 * touches this shared file.
 */
const INLINE_SIZE_RE =
  /fontSize:\s*["']?(\d+(?:\.\d+)?)(?:px)?["']?(?![\w%.])/g;

interface SubFloorSite {
  file: string;
  line: number;
  text: string;
}

/**
 * Every sub-floor sizing site in `file`, read fresh every call: `text-[Npx]`
 * classes and inline `fontSize` values alike, both with N < 12.
 */
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

describe("sub-text-xs sizing stays at the floor in the #783/#808 audited set", () => {
  it("has no un-allowlisted sub-floor size (class or inline) in the audited files", () => {
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
      `un-allowlisted sub-floor sizing sites:\n${violations.join("\n")}`,
    ).toEqual([]);
  });

  it("recognises every inline spelling it claims to, and no rem value", () => {
    // Without this the inline half of the guard could be quietly inert and
    // every file would still report clean, which is the exact failure Codex
    // caught on the #832 round. The trailing lookahead is what keeps
    // `fontSize: "0.75rem"` from matching its leading digit and being read as
    // a 0px violation -- a false positive there would be worse than the miss,
    // because it would push someone to allowlist a site that is fine.
    const sizesIn = (text: string) =>
      [...text.matchAll(INLINE_SIZE_RE)].map((match) => Number(match[1]));
    expect(sizesIn("fontSize: 9,")).toEqual([9]);
    expect(sizesIn(`fontSize: "8px",`)).toEqual([8]);
    expect(sizesIn("fontSize: '10px',")).toEqual([10]);
    expect(sizesIn("fontSize: 12,")).toEqual([12]);
    expect(sizesIn(`fontSize: "0.75rem",`)).toEqual([]);
    expect(sizesIn(`fontSize: "1rem",`)).toEqual([]);
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

/** Fixed 12/13 px classes sit at or just above the floor but ignore the root
 * text-scale multiplier; #925 converts them to `text-xs`/`text-sm`. */
const FIXED_MAP_TEXT_RE = /text-\[(?:12|13)px\]/;

/** The same defect spelled as an inline style. A class scanner alone would
 * certify `src/components/map` while `style={{ fontSize: 12 }}` sites kept
 * ignoring Settings -> Text Size -- #925's own LayersPopover had two of them
 * (the grid-activity label and its select) that the class sweep walked past.
 * Numeric and string px forms both count; rem values are the fix, so they do
 * not match. */
const FIXED_MAP_INLINE_SIZE_RE =
  /fontSize:\s*(?:(?:12|13)\s*[,}]|["'](?:12|13)px["'])/;

/** Sites outside #925's file set, left for a follow-up rather than edited by
 * this PR (BandConditionsPanel is being changed by concurrent work). Listed
 * by file so the guard still covers everything else under `map/` instead of
 * being narrowed to the PR's own files. */
const INLINE_SIZE_FOLLOWUP_FILES = new Set([
  "src/components/map/BandConditionsPanel.tsx",
]);

function walkMapSourceFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) {
      results.push(...walkMapSourceFiles(abs));
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

describe("map fixed 12/13px text classes respect text scale (#925)", () => {
  it("has no text-[12px] or text-[13px] under src/components/map", () => {
    const mapRoot = resolve(REPO_ROOT, "src/components/map");
    const violations: string[] = [];
    for (const file of walkMapSourceFiles(mapRoot)) {
      const rel = file.slice(REPO_ROOT.length + 1);
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, index) => {
        if (FIXED_MAP_TEXT_RE.test(line)) {
          violations.push(`${rel}:${index + 1}: ${line.trim()}`);
        }
      });
    }
    expect(
      violations,
      `fixed 12/13px text classes under src/components/map:\n${violations.join("\n")}`,
    ).toEqual([]);
  });

  it("has no inline fontSize of 12 or 13 under src/components/map", () => {
    const mapRoot = resolve(REPO_ROOT, "src/components/map");
    const violations: string[] = [];
    for (const file of walkMapSourceFiles(mapRoot)) {
      const rel = file.slice(REPO_ROOT.length + 1);
      if (INLINE_SIZE_FOLLOWUP_FILES.has(rel)) continue;
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, index) => {
        if (FIXED_MAP_INLINE_SIZE_RE.test(line)) {
          violations.push(`${rel}:${index + 1}: ${line.trim()}`);
        }
      });
    }
    expect(
      violations,
      `inline fixed 12/13px font sizes under src/components/map:\n${violations.join("\n")}`,
    ).toEqual([]);
  });

  it("the inline-size matcher reads both spellings and clears rem", () => {
    // Guards the guard: a regex that missed the numeric form would have let
    // #925's two LayersPopover sites through, and one that matched rem would
    // reject the fix itself.
    expect(FIXED_MAP_INLINE_SIZE_RE.test("fontSize: 12,")).toBe(true);
    expect(FIXED_MAP_INLINE_SIZE_RE.test("fontSize: 13 }")).toBe(true);
    expect(FIXED_MAP_INLINE_SIZE_RE.test(`fontSize: "12px",`)).toBe(true);
    expect(FIXED_MAP_INLINE_SIZE_RE.test("fontSize: '13px',")).toBe(true);
    expect(FIXED_MAP_INLINE_SIZE_RE.test(`fontSize: "0.75rem",`)).toBe(false);
    expect(FIXED_MAP_INLINE_SIZE_RE.test("fontSize: 120,")).toBe(false);
  });

  it("every follow-up file still has the inline sites it is listed for", () => {
    // A stale entry would silently shrink this guard's reach once the
    // follow-up lands, so the list has to keep earning its exemption.
    for (const rel of INLINE_SIZE_FOLLOWUP_FILES) {
      const lines = readFileSync(resolve(REPO_ROOT, rel), "utf8").split("\n");
      const hits = lines.filter((line) =>
        FIXED_MAP_INLINE_SIZE_RE.test(line),
      ).length;
      expect(
        hits,
        `${rel}: no inline 12/13px font sizes left -- drop it from INLINE_SIZE_FOLLOWUP_FILES`,
      ).toBeGreaterThan(0);
    }
  });
});
