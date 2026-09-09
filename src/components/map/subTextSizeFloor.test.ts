/**
 * Sub-text-xs type sizing guard (#783)
 *
 * #783 ("Contrast audit tail B") asked for a repo-wide grep-and-classify of
 * every `text-[Npx]` arbitrary value below the `text-xs` floor (12px /
 * 0.75rem -- Tailwind's own `xs` step, unmodified in `tailwind.config.js`,
 * so raising a site to the floor is exactly `text-xs`, not a new token).
 *
 * `git grep -n 'text-\[[0-9]*px\]' -- src/` at the time of this PR returns
 * 1819 hits with N<12 across 371 files. That is the shape of years of
 * pre-existing UI density choices across the whole app (dense chip rows,
 * mono-digit displays, tabular badges), not a defect introduced recently --
 * and it is far larger than one issue's 15-file PR budget can fix or even
 * responsibly classify one-by-one (a bulk "pre-existing debt" allowlist of
 * ~1800 lines this session did not individually review would not be an
 * honest classification).
 *
 * This PR fixes the specific sites #783's P3 list named (`PropagationForecastMini.tsx`,
 * `SelectedSpotCard.tsx`, `SpotCollectionPopover.tsx`, `SpotDetailsFlyout.tsx`,
 * `SpotDetailsModal.tsx`), enumerated by grepping each file rather than
 * trusting the issue's line numbers (see the PR body's census table). The
 * guard below is scoped to exactly those five files -- the set this session
 * actually read and classified -- so it stays honest about what was audited
 * and still proves the fix: reverting any one of the ~49 sizing fixes in
 * these five files makes this test fail and name the file:line. A follow-up
 * issue should widen the walked set (and its allowlist) one directory at a
 * time; expanding FILES below to `src/**\/*.tsx` today would either fail on
 * ~1750 un-triaged pre-existing sites or require an allowlist this session
 * cannot back with real per-site judgement.
 */

import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");

/** The exact set of files #783's census covered. Widen deliberately, file by
 * file, in a follow-up -- see the module doc above. */
const FILES = [
  "src/components/map/PropagationForecastMini.tsx",
  "src/components/map/SelectedSpotCard.tsx",
  "src/components/map/SpotCollectionPopover.tsx",
  "src/components/map/SpotDetailsFlyout.tsx",
  "src/components/map/SpotDetailsModal.tsx",
];

/**
 * `file:line` entries this session classified as legitimately below the
 * floor, with the reason. Empty is not the expected steady state here (this
 * repo has real sub-floor decorative markup); every entry must be one this
 * session actually read in context.
 */
const ALLOWLIST: Record<string, string> = {
  "src/components/map/PropagationForecastMini.tsx:1235":
    "decorative unicode star glyph (the greyline sunrise marker, U+2605) inside a title-tooltipped chip -- not text the user reads, an icon standing in for one. The rest of the chip's information (times, GL countdown) already ships at text-xs or larger.",
};

const SIZE_RE = /text-\[(\d+)px\]/g;

describe("sub-text-xs sizing stays at the floor in the #783 census set", () => {
  it("has no un-allowlisted text-[Npx] with N < 12 in the audited files", () => {
    const violations: string[] = [];
    for (const file of FILES) {
      const absPath = resolve(REPO_ROOT, file);
      const lines = readFileSync(absPath, "utf8").split("\n");
      lines.forEach((line, index) => {
        for (const match of line.matchAll(SIZE_RE)) {
          const px = Number(match[1]);
          if (px < 12) {
            const key = `${file}:${index + 1}`;
            if (!(key in ALLOWLIST)) {
              violations.push(`${key}: ${line.trim()}`);
            }
          }
        }
      });
    }
    expect(
      violations,
      `un-allowlisted sub-floor text-[Npx] sites:\n${violations.join("\n")}`,
    ).toEqual([]);
  });

  it("every allowlist entry still matches a real sub-floor site in the audited files", () => {
    // Proves the allowlist isn't stale: if a listed site got fixed (or
    // deleted) without removing its entry, that's a silent gap in this
    // guard's coverage, not a pass.
    const stillPresent: Record<string, boolean> = {};
    for (const file of FILES) {
      const absPath = resolve(REPO_ROOT, file);
      const lines = readFileSync(absPath, "utf8").split("\n");
      lines.forEach((line, index) => {
        for (const match of line.matchAll(SIZE_RE)) {
          if (Number(match[1]) < 12) {
            stillPresent[`${file}:${index + 1}`] = true;
          }
        }
      });
    }
    for (const key of Object.keys(ALLOWLIST)) {
      expect(stillPresent[key], `${key} is allowlisted but no longer below the floor -- remove the stale entry`).toBe(
        true,
      );
    }
  });
});
