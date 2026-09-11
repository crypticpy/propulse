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
 *
 * #833 (between-round hatch, no FILES append): `SIZE_RE` with `N < 12`
 * could not tell `text-xs` from `text-[12px]` or from rem/em/pt forms.
 * Census of the 44 audited files at this round: 0 `text-[12px]`, 0
 * `text-[Nrem|em|pt]`, 0 `text-[clamp(`. Predicted failing-site count on
 * revert is therefore 0 in source; the two injections named in #833
 * (`text-[12px]`, `text-[0.6rem]` / 9.6px) are the red-on-revert proof via
 * the matcher tests below. #925 already walks `src/components/map` for
 * 12/13px classes; this round still asserts `text-[12px]` over `FILES`
 * because that list includes `src/components/dx/` files #925 does not.
 *
 * #833 round 2 (review): two more spellings of the same hatch. `em` is
 * relative to the parent's computed size, so no static px conversion is
 * honest -- the guard now flags any `em` value below 1 instead of pretending
 * a 16px base. And the numeric grammar now accepts a leading decimal point
 * (`text-[.6rem]`, `fontSize: .5`), which the previous `\d+(\.\d+)?` form
 * could not match at all. Re-census of the 44 audited files and of `src/` as
 * a whole: 0 leading-decimal text classes, 0 `em` text classes, 0 inline
 * leading-decimal `fontSize` values, so both fixes are matcher-proved rather
 * than site-proved.
 *
 * #833 round 3 (review): the px grammar was the one unit still written as
 * integers only, so `text-[12.0px]` and `text-[11.5px]` read as clean while
 * rendering at the floor and below it. All four px matchers now share the
 * `(\d*\.?\d+)` numeric part the relative units already had and compare
 * numerically instead of textually: `SIZE_RE` (< 12), the floor spelling
 * (== 12 exactly), the #925 map class scan (== 12 or == 13), and the inline
 * `fontSize` scan (== 12 or == 13, numeric or string px). Census of `src/`
 * for decimal px text classes at this round: 0, so this too is matcher-proved
 * -- and the census now runs as an assertion of its own so a first decimal px
 * class cannot land unnoticed.
 *
 * #833 round 4 (review): two rules corrected rather than widened.
 * `text-[0.75rem]` IS `text-xs` -- the same value, and it follows the text
 * scale the same way -- so rem now compares strictly below the floor while
 * the absolute units (px/pt) still flag the floor value itself, matching the
 * inline guard that already clears `fontSize: "0.75rem"`. `em` keeps its
 * `< 1` rule because it is parent-relative and no static conversion is
 * honest; the three units are documented side by side at
 * `isSubFloorRelative`. Second, only `clamp(` was rejected, so `calc(`,
 * `min(`, `max(` and nested forms slipped through: any function-valued
 * arbitrary `text-[...]` value is now the hatch, with an exact-token
 * allowlist for the ones that are not font sizes at all. Census of `src/`
 * for `text-[<fn>(`: 10 -- 7 `text-[clamp(` in
 * `src/components/kiosk/WallClockDisplay.tsx` (the wall clock numerals,
 * outside `FILES`) and 3 `text-[var(--hc-fg)]` colour tokens in the HamClock
 * switch/chip files, which are in `FILES` and are allowlisted by exact token.
 *
 * #833 round 5 (review): every arbitrary-size matcher required a digit right
 * after the bracket, so Tailwind's explicit type-hint form -- `text-[length:
 * 0.6rem]`, `text-[length:12px]` -- was exempt from all of them at once while
 * rendering exactly what the un-hinted spelling renders. The `length:` prefix
 * is now optional in the px sub-floor matcher, the floor spelling, the
 * rem/em/pt matcher and the #925 map class scan (skipped, not captured, so
 * the numeric comparisons are untouched); the function-valued rejection
 * already saw through it because the token still contains the call, and the
 * allowlist stays whole-token so a hinted spelling of an allowlisted colour
 * is not cleared. Census of `src/` for `text-[length:`: 0 -- matcher-proved,
 * and the census runs as an assertion so the first one cannot land unnoticed.
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

/**
 * `text-[Npx]` arbitrary sizes. The numeric part accepts decimals
 * (`text-[11.5px]`, and the leading-dot form `text-[.5px]`) for the same
 * reason `RELATIVE_SIZE_RE` does: they are valid CSS, they render smaller
 * than the floor, and an integer-only grammar reported the file clean
 * (#833 review round 3). The comparison below is numeric, not textual.
 *
 * Every arbitrary-size matcher here also accepts Tailwind's explicit type
 * hint, `text-[length:12px]` / `text-[length:0.6rem]`. The hint changes
 * nothing about the rendered size -- it only tells Tailwind to read the value
 * as a length rather than guess -- so a grammar that required a digit right
 * after the bracket exempted the identical dodge from every rule at once
 * (#833 review round 5). The prefix is optional, never required, and is
 * skipped rather than captured so the numeric comparisons are unchanged.
 */
const SIZE_RE = /text-\[(?:length:)?(\d*\.?\d+)px\]/g;

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
 * #833 closed the remaining class spellings: `text-[12px]` (the floor
 * written as an arbitrary, which does not follow Settings -> Text Size),
 * rem/em/pt values at or below 12px, and `text-[clamp(` in the audited set.
 */
const INLINE_SIZE_RE =
  /fontSize:\s*["']?(\d*\.?\d+)(?:px)?["']?(?![\w%.])/g;

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
    // Leading-decimal px, the same grammar hole Codex found in the class
    // matcher: `fontSize: .5` is valid JS and renders at 0.5px.
    expect(sizesIn("fontSize: .5,")).toEqual([0.5]);
    expect(sizesIn(`fontSize: ".5px",`)).toEqual([0.5]);
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

/** `text-[12px]` is the floor as an arbitrary: same rendered size as
 * `text-xs` at the default root, but it ignores the text-scale multiplier.
 * `/tight` and other modifiers still match because the class starts with
 * this token. */
const FLOOR_PX_RE = /text-\[(?:length:)?(\d*\.?\d+)px\]/g;

/** True when a line spells the floor itself as an arbitrary px value, at any
 * decimal spelling of 12 (`text-[12px]`, `text-[12.0px]`). Sub-floor values
 * are `findSubFloorSites`'s job; anything above the floor is legitimate. */
function hasFloorPxSpelling(line: string): boolean {
  return [...line.matchAll(FLOOR_PX_RE)].some(
    (match) => Number(match[1]) === FLOOR_PX,
  );
}

/** rem/em/pt arbitrary sizes. 1rem = 16px; 1pt = 4/3 px. Values at or
 * below 12px are the same dodge as `text-[11px]`, just in a unit
 * `SIZE_RE` cannot see. Larger rem (e.g. `text-[1rem]`) is above the floor
 * and is not this hatch.
 *
 * The numeric part accepts a leading decimal point (`text-[.6rem]`) as well
 * as the zero-prefixed form: both are valid CSS and render identically, so a
 * grammar that only saw `0.6` would let the same 9.6px through. */
const RELATIVE_SIZE_RE = /text-\[(?:length:)?(\d*\.?\d+)(rem|em|pt)\]/g;

/** Every arbitrary `text-[...]` value on a line, with its full class token so
 * the allowlist below can be matched exactly. */
const ARBITRARY_TEXT_RE = /text-\[([^\]]+)\]/g;

/** A function call inside an arbitrary value. `clamp(` was the only one the
 * guard rejected, so `text-[calc(0.75rem-2px)]`, `text-[min(0.7rem,2vw)]`,
 * `text-[max(...)]` and nested forms such as `text-[clamp(calc(...),...)]`
 * walked straight past it -- every one of them can resolve below the floor,
 * and none of them can be evaluated statically (#833 review round 4). The
 * rule is therefore a rejection of the whole shape, not a list of function
 * names to chase. The type-hint form is covered by the same rule: the token
 * for `text-[length:calc(0.75rem-2px)]` still contains `calc(`, and the
 * allowlist below is matched on the whole token, so a hinted spelling of an
 * allowlisted color is not silently cleared (#833 review round 5). */
const FUNCTION_VALUE_RE = /[A-Za-z-]+\(/;

/**
 * Exact class tokens that are function-valued but are NOT font sizes, so the
 * floor has nothing to say about them. `text-[var(--hc-fg)]` is the HamClock
 * foreground COLOR token on the three switch/chip files in `FILES`; Tailwind
 * reads a bare `var()` arbitrary value on `text-` as a color.
 *
 * Matched on the whole token, never as a prefix: `text-[var(--hc-fg)]` must
 * not clear a different custom property that happens to start the same way.
 */
const FUNCTION_TEXT_ALLOWLIST = new Set(["text-[var(--hc-fg)]"]);

/** The un-allowlisted function-valued arbitrary text values on `line`. */
function functionValuedTextValues(line: string): string[] {
  return [...line.matchAll(ARBITRARY_TEXT_RE)]
    .map((match) => `text-[${match[1]}]`)
    .filter(
      (token) =>
        FUNCTION_VALUE_RE.test(token) && !FUNCTION_TEXT_ALLOWLIST.has(token),
    );
}

const FLOOR_PX = 12;

function relativeToPx(value: number, unit: string): number {
  if (unit === "rem") return value * 16;
  if (unit === "pt") return (value * 4) / 3;
  return Number.POSITIVE_INFINITY;
}

/**
 * Why the three units compare differently (#833 review round 4):
 *
 * - `rem` is the scale-aware unit. `text-[0.75rem]` IS `text-xs`: 12px at the
 *   default root and 16.5px at the xl text scale, following Settings -> Text
 *   Size exactly like the utility class does. Only something SMALLER than the
 *   floor is the hatch, so the comparison is strict. The inline guard already
 *   takes the same position by clearing `fontSize: "0.75rem"`.
 * - `pt` (like `px`) is absolute. `text-[9pt]` renders 12px at every text
 *   scale, which is the floor spelled in a way that ignores the multiplier --
 *   the same defect as `text-[12px]` -- so the floor value itself is flagged.
 * - `em` is relative to the PARENT's computed size, not the root, so no
 *   static px conversion is honest: under a `text-xs` parent `text-[0.8em]`
 *   renders at 9.6px while a 16px-base conversion would call it 12.8px and
 *   pass. The rule this guard can defend is the shrink itself, so any value
 *   below `1em` is flagged regardless of what it works out to.
 */

function isSubFloorRelative(value: number, unit: string): boolean {
  if (unit === "em") return value < 1;
  if (unit === "rem") return relativeToPx(value, unit) < FLOOR_PX;
  return relativeToPx(value, unit) <= FLOOR_PX;
}

function findFloorDodgeSites(file: string): SubFloorSite[] {
  const absPath = resolve(REPO_ROOT, file);
  const lines = readFileSync(absPath, "utf8").split("\n");
  const sites: SubFloorSite[] = [];
  lines.forEach((line, index) => {
    if (hasFloorPxSpelling(line) || functionValuedTextValues(line).length > 0) {
      sites.push({ file, line: index + 1, text: line });
      return;
    }
    for (const match of line.matchAll(RELATIVE_SIZE_RE)) {
      if (isSubFloorRelative(Number(match[1]), match[2])) {
        sites.push({ file, line: index + 1, text: line });
      }
    }
  });
  return sites;
}

describe("audited files cannot spell the floor as 12px or rem/em/pt (#833)", () => {
  it("has no text-[12px], sub-floor rem/em/pt, or clamp() text class in FILES", () => {
    const violations: string[] = [];
    for (const file of FILES) {
      for (const site of findFloorDodgeSites(file)) {
        violations.push(`${site.file}:${site.line}: ${site.text.trim()}`);
      }
    }
    expect(
      violations,
      `use text-xs instead of text-[12px] / rem / em / pt / clamp() in FILES:\n${violations.join("\n")}`,
    ).toEqual([]);
  });

  it("flags the #833 injections and clears text-xs", () => {
    // Red-on-revert proof for the two forms the old SIZE_RE missed.
    expect(hasFloorPxSpelling("text-[12px]")).toBe(true);
    expect(hasFloorPxSpelling("text-[12px]/tight")).toBe(true);
    expect(hasFloorPxSpelling("text-xs")).toBe(false);
    expect(hasFloorPxSpelling("text-[11px]")).toBe(false);
    // Decimal px spellings render exactly the same and must read the same
    // (#833 review round 3): the floor written as 12.0px is still the floor,
    // and 11.5px is still below it.
    expect(hasFloorPxSpelling("text-[12.0px]")).toBe(true);
    expect(hasFloorPxSpelling("text-[11.5px]")).toBe(false);
    expect(hasFloorPxSpelling("text-[13px]")).toBe(false);

    const relativeHits = (text: string) =>
      [...text.matchAll(RELATIVE_SIZE_RE)].filter((match) =>
        isSubFloorRelative(Number(match[1]), match[2]),
      );
    expect(relativeHits("text-[0.6rem]").length).toBe(1);
    // 0.75rem IS text-xs: the scale-aware floor, not a dodge of it
    // (#833 review round 4). Strictly below it is the hatch.
    expect(relativeHits("text-[0.75rem]").length).toBe(0);
    expect(relativeHits("text-[0.749rem]").length).toBe(1);
    expect(relativeHits("text-[0.76rem]").length).toBe(0);
    expect(relativeHits("text-[0.65em]").length).toBe(1);
    expect(relativeHits("text-[8pt]").length).toBe(1);
    // pt is absolute: 9pt is 12px at EVERY text scale, the same defect as
    // text-[12px], so the floor value itself is flagged.
    expect(relativeHits("text-[9pt]").length).toBe(1);
    expect(relativeHits("text-[10pt]").length).toBe(0);
    expect(relativeHits("text-[1rem]").length).toBe(0);
    expect(relativeHits("text-xs").length).toBe(0);
    // Leading-decimal forms are valid CSS and must not read as clean.
    expect(relativeHits("text-[.6rem]").length).toBe(1);
    expect(relativeHits("text-[.5em]").length).toBe(1);
    // `.75rem` is the same value as `0.75rem`: the floor, not below it.
    expect(relativeHits("text-[.75rem]").length).toBe(0);
    expect(relativeHits("text-[.74rem]").length).toBe(1);
    expect(relativeHits("text-[.9rem]").length).toBe(0);
    // `em` is parent-relative: under a text-xs parent `0.8em` is 9.6px, so a
    // 16px-base conversion (12.8px) would wrongly clear it. Any shrink below
    // 1em is the hatch; 1em and larger are not.
    expect(relativeHits("text-[0.8em]").length).toBe(1);
    expect(relativeHits("text-[0.99em]").length).toBe(1);
    expect(relativeHits("text-[1em]").length).toBe(0);
    expect(relativeHits("text-[1.25em]").length).toBe(0);
    // em stays parent-relative, so anything below 1em is the hatch even
    // though 0.75rem at the same arithmetic is now allowed.
    expect(relativeHits("text-[0.75em]").length).toBe(1);
  });

  it("rejects every function-valued arbitrary text size, not just clamp()", () => {
    // Each of these can resolve below the floor and none can be evaluated
    // statically (#833 review round 4).
    expect(functionValuedTextValues("text-[clamp(0.5rem,2vw,1rem)]")).toEqual([
      "text-[clamp(0.5rem,2vw,1rem)]",
    ]);
    expect(
      functionValuedTextValues("text-[calc(0.75rem-2px)]").length,
    ).toBe(1);
    expect(functionValuedTextValues("text-[min(0.7rem,2vw)]").length).toBe(1);
    expect(functionValuedTextValues("text-[max(0.6rem,1vw)]").length).toBe(1);
    expect(
      functionValuedTextValues("text-[clamp(calc(0.5rem+1px),2vw,1rem)]").length,
    ).toBe(1);
    expect(functionValuedTextValues("text-xs").length).toBe(0);
    expect(functionValuedTextValues("text-[11px]").length).toBe(0);
    expect(functionValuedTextValues("text-[0.9rem]").length).toBe(0);

    // The allowlist is matched on the whole token, never as a prefix.
    expect(
      functionValuedTextValues("hover:text-[var(--hc-fg)]").length,
    ).toBe(0);
    expect(functionValuedTextValues("text-[var(--su-text)]").length).toBe(1);
    expect(functionValuedTextValues("text-[var(--hc-fg-2)]").length).toBe(1);
  });

  it("reads Tailwind's explicit length: type hint under every rule (#833 review round 5)", () => {
    // `text-[length:0.6rem]` renders exactly what `text-[0.6rem]` renders:
    // the hint only tells Tailwind to treat the value as a length instead of
    // guessing. Requiring a digit right after the bracket exempted the hinted
    // spelling from every rule at once.
    const relativeHits = (text: string) =>
      [...text.matchAll(RELATIVE_SIZE_RE)].filter((match) =>
        isSubFloorRelative(Number(match[1]), match[2]),
      );
    expect(relativeHits("text-[length:0.6rem]").length).toBe(1);
    expect(relativeHits("text-[length:.6rem]").length).toBe(1);
    // The floor itself still passes: the hint does not change the value.
    expect(relativeHits("text-[length:0.75rem]").length).toBe(0);
    expect(relativeHits("text-[length:0.65em]").length).toBe(1);
    expect(relativeHits("text-[length:8pt]").length).toBe(1);

    // px: the hinted floor is the floor, and the hinted sub-floor is a
    // sub-floor.
    expect(hasFloorPxSpelling("text-[length:12px]")).toBe(true);
    expect(hasFloorPxSpelling("text-[length:12.0px]")).toBe(true);
    expect(hasFloorPxSpelling("text-[length:11px]")).toBe(false);
    const subFloorPxHits = (text: string) =>
      [...text.matchAll(SIZE_RE)].filter(
        (match) => Number(match[1]) < FLOOR_PX,
      );
    expect(subFloorPxHits("text-[length:11px]").length).toBe(1);
    expect(subFloorPxHits("text-[length:12px]").length).toBe(0);
    expect(hasFixedMapTextSize("text-[length:13px]")).toBe(true);
    expect(hasFixedMapTextSize("text-[length:14px]")).toBe(false);

    // Function-valued hinted values stay rejected: they cannot be evaluated
    // statically whether or not the hint is there.
    expect(
      functionValuedTextValues("text-[length:calc(0.75rem-2px)]").length,
    ).toBe(1);
    expect(
      functionValuedTextValues("text-[length:clamp(0.5rem,2vw,1rem)]").length,
    ).toBe(1);

    // Census 2026-09-10: zero `text-[length:` spellings under src/. The rules
    // are in place before the first one lands, which is the point of a guard.
    const hinted: string[] = [];
    for (const file of walkMapSourceFiles(resolve(REPO_ROOT, "src"))) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, index) => {
          if (line.includes("text-[length:")) {
            hinted.push(`${file.slice(REPO_ROOT.length + 1)}:${index + 1}`);
          }
        });
    }
    expect(hinted).toEqual([]);
  });

  it("every function-value allowlist entry still exists in FILES", () => {
    // A stale entry would quietly widen the exemption; the audited files have
    // to keep earning it.
    for (const token of FUNCTION_TEXT_ALLOWLIST) {
      const present = FILES.some((file) =>
        readFileSync(resolve(REPO_ROOT, file), "utf8").includes(token),
      );
      expect(
        present,
        `${token}: no audited file spells it any more -- drop it from FUNCTION_TEXT_ALLOWLIST`,
      ).toBe(true);
    }
  });
});

/** Fixed 12/13 px classes sit at or just above the floor but ignore the root
 * text-scale multiplier; #925 converts them to `text-xs`/`text-sm`. */
const FIXED_MAP_TEXT_RE = /text-\[(?:length:)?(\d*\.?\d+)px\]/g;

/** True when a line carries a fixed 12px/13px text class at any decimal
 * spelling (`text-[12.0px]`, `text-[13.0px]`). An integer-only grammar
 * certified a file that still pinned its type (#833 review round 3). */
function hasFixedMapTextSize(line: string): boolean {
  return [...line.matchAll(FIXED_MAP_TEXT_RE)].some((match) => {
    const value = Number(match[1]);
    return value === 12 || value === 13;
  });
}

/** The same defect spelled as an inline style. A class scanner alone would
 * certify `src/components/map` while `style={{ fontSize: 12 }}` sites kept
 * ignoring Settings -> Text Size -- #925's own LayersPopover had two of them
 * (the grid-activity label and its select) that the class sweep walked past.
 * Numeric and string px forms both count; rem values are the fix, so they do
 * not match. */
const FIXED_MAP_INLINE_SIZE_RE =
  /fontSize:\s*(?:(\d*\.?\d+)\s*[,}]|["'](\d*\.?\d+)px["'])/g;

/** True when a line pins an inline font size at 12 or 13, numeric or string,
 * integer or decimal (`fontSize: 12.0`, `fontSize: "13.0px"`). */
function hasFixedMapInlineSize(line: string): boolean {
  return [...line.matchAll(FIXED_MAP_INLINE_SIZE_RE)].some((match) => {
    const value = Number(match[1] ?? match[2]);
    return value === 12 || value === 13;
  });
}

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
        if (hasFixedMapTextSize(line)) {
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
        if (hasFixedMapInlineSize(line)) {
          violations.push(`${rel}:${index + 1}: ${line.trim()}`);
        }
      });
    }
    expect(
      violations,
      `inline fixed 12/13px font sizes under src/components/map:\n${violations.join("\n")}`,
    ).toEqual([]);
  });

  it("the class matcher reads decimal px spellings", () => {
    // `text-[12.0px]` and `text-[11.5px]` render as 12px and 11.5px; an
    // integer-only grammar read both as clean (#833 review round 3).
    const subFloorHits = (text: string) =>
      [...text.matchAll(SIZE_RE)].filter((match) => Number(match[1]) < FLOOR_PX)
        .length;
    expect(subFloorHits("text-[11.5px]")).toBe(1);
    expect(subFloorHits("text-[.5px]")).toBe(1);
    expect(subFloorHits("text-[11px]")).toBe(1);
    expect(subFloorHits("text-[12.0px]")).toBe(0);
    expect(subFloorHits("text-[12px]")).toBe(0);
    expect(hasFixedMapTextSize("text-[12.0px]")).toBe(true);
    expect(hasFixedMapTextSize("text-[13.0px]")).toBe(true);
    expect(hasFixedMapTextSize("text-[14px]")).toBe(false);
    expect(hasFixedMapTextSize("text-[11.5px]")).toBe(false);
  });

  it("has no decimal px text class anywhere under src (census)", () => {
    const decimalPx = /text-\[\d*\.\d+px\]/;
    const violations: string[] = [];
    for (const file of walkMapSourceFiles(resolve(REPO_ROOT, "src"))) {
      const rel = file.slice(REPO_ROOT.length + 1);
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, index) => {
          if (decimalPx.test(line)) {
            violations.push(`${rel}:${index + 1}: ${line.trim()}`);
          }
        });
    }
    expect(
      violations,
      `decimal px text classes under src:\n${violations.join("\n")}`,
    ).toEqual([]);
  });

  it("the inline-size matcher reads both spellings and clears rem", () => {
    // Guards the guard: a regex that missed the numeric form would have let
    // #925's two LayersPopover sites through, and one that matched rem would
    // reject the fix itself.
    expect(hasFixedMapInlineSize("fontSize: 12,")).toBe(true);
    expect(hasFixedMapInlineSize("fontSize: 13 }")).toBe(true);
    expect(hasFixedMapInlineSize(`fontSize: "12px",`)).toBe(true);
    expect(hasFixedMapInlineSize("fontSize: '13px',")).toBe(true);
    expect(hasFixedMapInlineSize(`fontSize: "0.75rem",`)).toBe(false);
    expect(hasFixedMapInlineSize("fontSize: 120,")).toBe(false);
    // Decimal spellings of the same pinned size (#833 review round 3).
    expect(hasFixedMapInlineSize("fontSize: 12.0,")).toBe(true);
    expect(hasFixedMapInlineSize(`fontSize: "13.0px",`)).toBe(true);
    expect(hasFixedMapInlineSize("fontSize: 12.5,")).toBe(false);
  });

  it("every follow-up file still has the inline sites it is listed for", () => {
    // A stale entry would silently shrink this guard's reach once the
    // follow-up lands, so the list has to keep earning its exemption.
    for (const rel of INLINE_SIZE_FOLLOWUP_FILES) {
      const lines = readFileSync(resolve(REPO_ROOT, rel), "utf8").split("\n");
      const hits = lines.filter((line) => hasFixedMapInlineSize(line)).length;
      expect(
        hits,
        `${rel}: no inline 12/13px font sizes left -- drop it from INLINE_SIZE_FOLLOWUP_FILES`,
      ).toBeGreaterThan(0);
    }
  });
});
