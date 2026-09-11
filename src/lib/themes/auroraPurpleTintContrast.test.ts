/**
 * aurora-purple ink on aurora-purple tints (#791)
 *
 * #787 gave `aurora-purple` a per-theme `--su-purple` token, which cleared the
 * 4.5:1 floor for *bare* purple text on `panel` and `canvas` in all four
 * themes (see `stationTokens.test.ts`). It did not clear the consumer-side
 * half: several call sites draw `text-aurora-purple` on a **same-hue** tint,
 * `bg-aurora-purple/N`, and the ink is measured against the composite
 * `alpha x purple + (1 - alpha) x surface`, not against the surface.
 *
 * Bare `panel`/`canvas` is not the real backdrop everywhere, though. Sites
 * that render inside `Card`'s default glass (`bg-su-line/10`,
 * `src/components/ui/Card.tsx`) or inside `SpotRow`'s zebra/hover striping
 * (`bg-su-line/10`, `src/components/dx/DXSpotList/SpotRow.tsx`) sit on an
 * intermediate surface with its own colour that changes the answer: `/10`
 * purple-on-purple clears the floor on bare panel/canvas but misses it at
 * 4.24-4.49:1 once `line/10` is composited underneath first. Each site below
 * names the surfaces it actually renders on; sites confirmed to render on
 * bare panel/canvas (the logbook modal body) keep the simple model.
 *
 * This file measures the combinations actually shipped: each entry names the
 * file, the exact class snippet in it, the (ink, alpha) pair that snippet
 * encodes, and the surfaces it renders on. Reverting a site's alpha in the
 * source breaks the snippet assertion; getting the alpha or surface wrong in
 * the table breaks the measurement. Contrast is production `stationContrast`
 * over the real `stationPalettes` -- no fixture palette, no re-implemented
 * WCAG formula.
 *
 * A repo-wide guard at the bottom catches *new* same-hue sites this table
 * doesn't know about yet -- see its own comment for what it can and can't see.
 */

import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { stationContrast, stationPalettes } from "@/lib/themes/stationTokens";
import type { ThemeId } from "@/lib/themes";

/** The design system's floor for status text (`docs/designs/design-system`). */
const AA = 4.5;

const THEMES = Object.keys(stationPalettes) as ThemeId[];

type StationPalette = (typeof stationPalettes)[ThemeId];

// Anchor on this file's own location, not process.cwd() -- a vitest
// invocation from a subdirectory inherits the parent config and would shift
// cwd, making every readFileSync below throw (see repo memory
// no-test-job-in-ci: a subdir runner silently inherited the parent's config
// once already). This file lives at src/lib/themes/, three levels under the
// repo root.
const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");

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

interface SurfaceSpec {
  /** Name shown in the test title -- describes the real backdrop stack. */
  name: string;
  /** Resolve the opaque backdrop colour the tint composites over. */
  backdrop: (palette: StationPalette) => string;
}

/** A site confirmed to render directly on the station background. */
const BARE_SURFACES: SurfaceSpec[] = [
  { name: "panel", backdrop: (palette) => palette.panel },
  { name: "canvas", backdrop: (palette) => palette.canvas },
];

/**
 * A site that renders inside a `bg-su-line/10` glass layer (`Card`'s default
 * surface, or `SpotRow`'s zebra/hover striping) before the page background.
 * The tint composites onto this layer's colour, not onto panel/canvas
 * directly.
 */
const LINE_GLASS_SURFACES: SurfaceSpec[] = [
  {
    name: "line/10 over panel",
    backdrop: (palette) => compositeOnSurface(palette.line, 0.1, palette.panel),
  },
  {
    name: "line/10 over canvas",
    backdrop: (palette) =>
      compositeOnSurface(palette.line, 0.1, palette.canvas),
  },
];

interface TintedSite {
  /** Repo-relative path of the call site. */
  file: string;
  /** What the tinted element carries, for the test name. */
  what: string;
  /** Exact snippet the site ships; binds the table to the source. */
  snippet: string;
  /** Palette role the ink resolves to: the purple token or `--su-text`. */
  ink: "purple" | "text";
  /** Tint alpha the snippet encodes (`/10` -> 0.1); 0 means no fill. */
  alpha: number;
  /** The real backdrop(s) this site renders on. */
  surfaces: SurfaceSpec[];
}

const SITES: TintedSite[] = [
  {
    file: "src/components/dx/SpotBadge.tsx",
    what: "the VFD (verified) spot badge",
    snippet: `bgColor: "",
    textColor: "text-aurora-purple",`,
    ink: "purple",
    alpha: 0,
    // Mounted in the app only via .design-sync/previews/SpotBadge.tsx today,
    // but renders in SpotRow's zebra/hover striping (bg-su-line/10) the
    // moment a call site passes type="verified" -- measure the real stack.
    surfaces: LINE_GLASS_SURFACES,
  },
  {
    file: "src/components/ui/Badge.tsx",
    what: "the Badge `quiet` variant",
    snippet: `"bg-aurora-purple/20",
        "text-su-text",`,
    ink: "text",
    alpha: 0.2,
    surfaces: BARE_SURFACES,
  },
  {
    file: "src/components/dashboard/MetarCard.tsx",
    what: "the LIFR flight-category chip",
    // The quotes anchor the snippet to the whole class string: a `bg-*`
    // prefix reappearing ahead of `border-` would not match this substring.
    snippet: 'LIFR: "border-aurora-purple/30 text-aurora-purple",',
    ink: "purple",
    alpha: 0,
    // Renders inside Card's default surface="card" glass (bg-su-line/10)
    // over the Home page's bg-cosmic-gradient (canvas -> panel -> canvas).
    surfaces: LINE_GLASS_SURFACES,
  },
];

describe("aurora-purple ink on an aurora-purple tint (#791)", () => {
  it.each(SITES.map((site) => [site.what, site] as const))(
    "%s still ships the class pair this table measures",
    (_what, site) => {
      const source = readFileSync(resolve(REPO_ROOT, site.file), "utf8");
      const inkClass =
        site.ink === "purple" ? "text-aurora-purple" : "text-su-text";
      expect(
        source.includes(site.snippet),
        `${site.file} no longer contains the measured snippet:\n${site.snippet}`,
      ).toBe(true);
      // The measurement above is only honest if `ink` describes the shipped
      // class: a site that quietly said `ink: "text"` while drawing purple
      // would sail through the floor check on --su-text's 8:1. Checking this
      // against the snippet -- itself just proven to be a real substring of
      // `source` -- ties it to the file, not to another field on this same
      // object literal.
      expect(
        site.snippet.includes(inkClass),
        `${site.what}'s measured snippet does not carry ${inkClass} -- the ink field misdescribes what ${site.file} ships`,
      ).toBe(true);
    },
  );

  const cases = SITES.flatMap((site) =>
    THEMES.flatMap((theme) =>
      site.surfaces.map(
        (surface) => [site.what, theme, surface.name, site, surface] as const,
      ),
    ),
  );

  it.each(cases)(
    "%s clears the status-text floor in %s on the %s surface",
    (_what, theme, _surfaceName, site, surface) => {
      const palette = stationPalettes[theme];
      const backdrop = surface.backdrop(palette);
      const tint =
        site.alpha === 0
          ? backdrop
          : compositeOnSurface(palette.purple, site.alpha, backdrop);
      expect(stationContrast(palette[site.ink], tint)).toBeGreaterThanOrEqual(
        AA,
      );
    },
  );
});

describe("repo-wide guard for aurora-purple ink on an aurora-purple tint (#791)", () => {
  /**
   * This is a per-line regex guard, not a className parser: it only sees a
   * `bg-aurora-purple/N` tint and `text-aurora-purple` ink when both sit on
   * the SAME source line. A multi-line className that wraps its ink onto a
   * second line escapes this regex by construction. That's intentional:
   * the measured table above is what covers sites that wrap; this guard
   * exists to catch a fresh same-line site before it ships, not to replace
   * the table.
   *
   * Entries here must be file:line plus a comment saying why they're exempt
   * (e.g. the site is deliberately unreachable, or the tint alpha is 0/10
   * and known-safe). Empty is the expected steady state after #791's fix.
   */
  const ALLOWLIST = new Set<string>([
    // (none -- keep this empty; add "path/to/File.tsx:123, // reason" if a
    // future same-line site needs an exemption.)
  ]);

  const TINT_RE = /bg-aurora-purple\/(?:1[5-9]|[2-9]\d)\b/;
  const INK_RE = /text-aurora-purple\b/;

  function walk(dir: string, files: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        walk(full, files);
      } else if (
        [".ts", ".tsx"].includes(extname(entry)) &&
        !entry.includes(".test.")
      ) {
        files.push(full);
      }
    }
    return files;
  }

  it("has no un-allowlisted line pairing a >=15 aurora-purple tint with text-aurora-purple ink", () => {
    const violations: string[] = [];
    for (const file of walk(resolve(REPO_ROOT, "src"))) {
      const relPath = relative(REPO_ROOT, file);
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, index) => {
        if (TINT_RE.test(line) && INK_RE.test(line)) {
          const key = `${relPath}:${index + 1}`;
          if (!ALLOWLIST.has(key)) {
            violations.push(`${key}: ${line.trim()}`);
          }
        }
      });
    }
    expect(
      violations,
      `same-line aurora-purple tint + ink outside the allowlist:\n${violations.join("\n")}`,
    ).toEqual([]);
  });
});
