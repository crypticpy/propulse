/**
 * HamClock header hover chrome: base and hover ink (#783)
 *
 * `HamClockLayerChips.tsx`, `HamClockModeSwitch.tsx` and
 * `HamClockProjectionSwitch.tsx` shipped `text-gray-500` as the inactive-state
 * base and `hover:text-white` as the hover state. #783 asked two separate
 * questions:
 *
 * 1. `hover:text-white` is a pure-white utility, which the legibility
 *    standard forbids (`docs/designs/design-system/README.md` rule 7) even
 *    though this directory (`src/components/map/hamclock/`) sits outside the
 *    `check:design-tokens` guard's scope. Routed to `hover:text-su-text`.
 * 2. The `text-gray-500` base (`#6b7280`) was flagged as "worth measuring"
 *    rather than assumed broken. Measured: it fails the 4.5:1 floor against
 *    every candidate host in every station theme (3.43-4.37:1 -- see the
 *    PR body for the full pre-fix table). Routed to `text-su-muted`.
 *
 * Host surface: none of these three components have a live render site in
 * `src/` today (verified by grep -- they are defined, exported, and covered
 * by a `.design-sync/previews/*.tsx` stub, but nothing under `src/App.tsx`'s
 * route tree or any other component imports them). The design-sync preview
 * wraps each in `background: var(--hc-bg)`, a HamClock-theme variable
 * (Pulse/Classic/Brass) that does not vary with the station theme
 * (dark/light/high-contrast/midnight). Since the fix itself routes through
 * `--su-text`/`--su-muted` -- station tokens, calibrated against station
 * surfaces -- this table measures the two station surfaces these controls
 * would actually sit on if wired into the rest of the map chrome the way
 * sibling toolbars do (`ProToolbarRibbon.tsx` uses `bg-su-panel/90` for its
 * header row; `HamClockView.tsx`'s root is `bg-void-black`, which resolves
 * to `--su-input`): `su-panel` and `su-input`. Both clear the floor in all
 * four station themes at healthy margins (7.0-15.5:1).
 *
 * A residual gap the fix does NOT close: if a future mount instead keeps the
 * literal `--hc-bg` backdrop from the preview stub while the station theme is
 * "light", `su-muted`'s light-theme ink (`#425168`, calibrated for light
 * station surfaces) reads at only 2.30-2.43:1 against HamClock's
 * permanently-dark `--hc-bg` (`#0a0e1a`/`#0d0c0b`/`#0a1420`) -- because
 * `--hc-bg` never lightens for the "light" station theme the way `su-panel`
 * does. That combination (`--hc-bg` backdrop + light station theme) is not
 * reachable today (no mount exists), so it is not asserted here; whoever
 * wires these controls into a live page should mount them on an `su-*`
 * surface, not bare `--hc-bg`, or this table's premise no longer holds.
 */

import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { stationContrast, stationPalettes } from "@/lib/themes/stationTokens";
import type { ThemeId } from "@/lib/themes";

/** The design system's floor for status/label text (`docs/designs/design-system`). */
const AA = 4.5;

const THEMES = Object.keys(stationPalettes) as ThemeId[];

// Anchor on this file's own location, not process.cwd() -- see
// auroraPurpleTintContrast.test.ts and repo memory no-test-job-in-ci: a
// subdir vitest invocation inherits the parent config and shifts cwd, which
// would make every readFileSync below throw. This file lives at
// src/components/map/hamclock/, four levels under the repo root.
const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../../..");

interface Site {
  file: string;
  what: string;
  /** The inactive-state class string this table measures, verbatim. */
  snippet: string;
}

const SITES: Site[] = [
  {
    file: "src/components/map/hamclock/HamClockLayerChips.tsx",
    what: "a quick-layer chip (MUF/Aurora/DRAP/Wx) at rest and on hover",
    snippet: "bg-white/5 text-su-muted hover:bg-white/10 hover:text-su-text",
  },
  {
    file: "src/components/map/hamclock/HamClockModeSwitch.tsx",
    what: "a product-mode button (Activity/Sats/Wx) at rest and on hover",
    snippet: "text-su-muted hover:bg-white/10 hover:text-su-text",
  },
  {
    file: "src/components/map/hamclock/HamClockProjectionSwitch.tsx",
    what: "a projection button (Flat/AZ/3D) at rest and on hover",
    snippet: "text-su-muted hover:bg-white/10 hover:text-su-text",
  },
];

/** The two station surfaces these header controls realistically sit on --
 * `ProToolbarRibbon`'s header-row surface and `HamClockView`'s root surface. */
const SURFACES: Array<{ name: string; role: "panel" | "input" }> = [
  { name: "su-panel (toolbar header row)", role: "panel" },
  { name: "su-input (bg-void-black, HamClockView root)", role: "input" },
];

describe("HamClock header hover chrome still ships the fixed classes (#783)", () => {
  it.each(SITES.map((site) => [site.what, site] as const))(
    "%s still contains the measured snippet",
    (_what, site) => {
      const source = readFileSync(resolve(REPO_ROOT, site.file), "utf8");
      expect(
        source.includes(site.snippet),
        `${site.file} no longer contains the measured snippet:\n${site.snippet}`,
      ).toBe(true);
      // Guard against a regression back to the raw utilities this issue
      // removed -- a partial revert (fixing one class but not the other)
      // should fail here too.
      expect(
        source.includes("text-gray-500"),
        `${site.file} still ships text-gray-500 -- the unmeasured, floor-failing base this table replaced`,
      ).toBe(false);
      expect(
        source.includes("hover:text-white"),
        `${site.file} still ships hover:text-white -- a pure-white utility the legibility standard forbids`,
      ).toBe(false);
    },
  );
});

describe("HamClock header hover chrome clears the label floor (#783)", () => {
  const cases = SITES.flatMap((site) =>
    THEMES.flatMap((theme) =>
      SURFACES.map((surface) => [site.what, theme, surface.name, site, surface] as const),
    ),
  );

  it.each(cases)(
    "%s clears 4.5:1 on %s in the %s theme",
    (_what, theme, _surfaceName, _site, surface) => {
      const palette = stationPalettes[theme];
      const backdrop = palette[surface.role];
      expect(stationContrast(palette.muted, backdrop)).toBeGreaterThanOrEqual(
        AA,
      );
      expect(stationContrast(palette.text, backdrop)).toBeGreaterThanOrEqual(
        AA,
      );
    },
  );
});
