/**
 * aurora-purple ink on aurora-purple tints (#791)
 *
 * #787 gave `aurora-purple` a per-theme `--su-purple` token, which cleared the
 * 4.5:1 floor for *bare* purple text on `panel` and `canvas` in all four
 * themes (see `stationTokens.test.ts`). It did not clear the consumer-side
 * half: several call sites draw `text-aurora-purple` on a **same-hue** tint,
 * `bg-aurora-purple/N`, and the ink is measured against the composite
 * `alpha x purple + (1 - alpha) x surface`, not against the surface. At /20
 * that composite measures 4.01:1 on the dark panel; /10 is the only tint where
 * purple ink clears the floor in every theme on both surfaces.
 *
 * This file measures the combinations actually shipped: each entry names the
 * file, the exact class snippet in it, and the (ink, alpha) pair that snippet
 * encodes. Reverting a site's alpha in the source breaks the snippet
 * assertion; getting the alpha wrong in the table breaks the measurement.
 * Contrast is production `stationContrast` over the real `stationPalettes` --
 * no fixture palette, no re-implemented WCAG formula.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { stationContrast, stationPalettes } from "@/lib/themes/stationTokens";
import type { ThemeId } from "@/lib/themes";

/** The design system's floor for status text (`docs/designs/design-system`). */
const AA = 4.5;

/** Both surfaces a tinted chip can land on. */
const SURFACES = ["panel", "canvas"] as const;

const THEMES = Object.keys(stationPalettes) as ThemeId[];

// Vitest resolves its root to the repo root, so call-site paths below are
// repo-relative and stay readable in failure output.
const REPO_ROOT = process.cwd();

/**
 * Flatten `alpha` of `hex` over an opaque `surface` -- what the browser paints
 * for `bg-<token>/N` -- and return the resulting opaque `#rrggbb`. Ink drawn
 * on a tint is measured against this composite, not against the surface.
 */
function compositeOnSurface(
  hex: string,
  alpha: number,
  surface: string,
): string {
  const channels = (value: string) =>
    [1, 3, 5].map((start) => parseInt(value.slice(start, start + 2), 16));
  const front = channels(hex);
  const back = channels(surface);
  return `#${front
    .map((channel, index) =>
      Math.round(channel * alpha + back[index] * (1 - alpha))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

interface TintedSite {
  /** Repo-relative path of the call site. */
  file: string;
  /** What the tinted element carries, for the test name. */
  what: string;
  /** Exact snippet the site ships; binds the table to the source. */
  snippet: string;
  /** Palette role the ink resolves to: the purple token or `--su-text`. */
  ink: "purple" | "text";
  /** Tint alpha the snippet encodes (`/10` -> 0.1). */
  alpha: number;
}

/**
 * The LoTW export button's fill and its hover fill are one class attribute, so
 * both rows below measure the same shipped snippet at their own alpha.
 */
const LOTW_BUTTON_SNIPPET = `bg-aurora-purple/20 border border-aurora-purple/50 rounded-lg
                       text-su-text hover:bg-aurora-purple/30`;

const SITES: TintedSite[] = [
  {
    file: "src/components/dx/SpotBadge.tsx",
    what: "the VFD (verified) spot badge",
    snippet: `bgColor: "bg-aurora-purple/10",
    textColor: "text-aurora-purple",`,
    ink: "purple",
    alpha: 0.1,
  },
  {
    file: "src/components/logbook/QSOTable.tsx",
    what: "the band chip in the QSO table",
    snippet: "bg-aurora-purple/10 text-aurora-purple rounded text-xs font-mono",
    ink: "purple",
    alpha: 0.1,
  },
  {
    file: "src/components/logbook/LogUploadModal.tsx",
    what: 'the "Export Only" service chip',
    snippet: "bg-aurora-purple/10 text-aurora-purple rounded text-xs",
    ink: "purple",
    alpha: 0.1,
  },
  {
    file: "src/components/logbook/LogUploadModal.tsx",
    what: "the LoTW export button at rest",
    snippet: LOTW_BUTTON_SNIPPET,
    ink: "text",
    alpha: 0.2,
  },
  {
    file: "src/components/logbook/LogUploadModal.tsx",
    what: "the LoTW export button on hover",
    snippet: LOTW_BUTTON_SNIPPET,
    ink: "text",
    alpha: 0.3,
  },
  {
    file: "src/components/ui/Badge.tsx",
    what: "the Badge `quiet` variant",
    snippet: `"bg-aurora-purple/20",
        "text-su-text",`,
    ink: "text",
    alpha: 0.2,
  },
  {
    file: "src/components/dashboard/MetarCard.tsx",
    what: "the LIFR flight-category chip",
    snippet: "bg-aurora-purple/10 border-aurora-purple/30 text-aurora-purple",
    ink: "purple",
    alpha: 0.1,
  },
];

describe("aurora-purple ink on an aurora-purple tint (#791)", () => {
  it.each(SITES.map((site) => [site.what, site] as const))(
    "%s still ships the class pair this table measures",
    (_what, site) => {
      const source = readFileSync(resolve(REPO_ROOT, site.file), "utf8");
      expect(
        source.includes(site.snippet),
        `${site.file} no longer contains the measured snippet:\n${site.snippet}`,
      ).toBe(true);
    },
  );

  const cases = SITES.flatMap((site) =>
    THEMES.flatMap((theme) =>
      SURFACES.map((surface) => [site.what, theme, surface, site] as const),
    ),
  );

  it.each(cases)(
    "%s clears the status-text floor in %s on the %s surface",
    (_what, theme, surface, site) => {
      const palette = stationPalettes[theme];
      const tint = compositeOnSurface(
        palette.purple,
        site.alpha,
        palette[surface],
      );
      expect(stationContrast(palette[site.ink], tint)).toBeGreaterThanOrEqual(
        AA,
      );
    },
  );

  it.each(SITES.map((site) => [site.what, site] as const))(
    "%s is measured with the ink class its snippet actually names",
    (_what, site) => {
      // The measurement is only honest if `ink` describes the shipped class:
      // a site that quietly said `ink: "text"` while drawing purple would
      // sail through the floor check above on --su-text's 8:1.
      const inkClass =
        site.ink === "purple" ? "text-aurora-purple" : "text-su-text";
      expect(site.snippet).toContain(inkClass);
    },
  );
});
