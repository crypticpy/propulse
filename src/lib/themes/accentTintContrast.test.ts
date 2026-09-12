/**
 * Accent ink on an accent tint (#803)
 *
 * `text-plasma-orange` is `rgb(var(--su-accent-rgb))` and `bg-plasma-orange/N`
 * is the same channels at `N/100` alpha (`tailwind.config.js`), so a site that
 * pairs them draws the ink against `N/100 x accent + (1 - N/100) x surface` --
 * the same same-hue defect #791/#795 fixed for `aurora-purple`, except the
 * accent is not a palette token: it is whatever the operator typed.
 *
 * What the app accepts as an accent is a **hex-format check and nothing else**
 * (`AppearanceSection.tsx`'s `isValidHex` -> `themeStore.setCustomColors` ->
 * `stationTokens`'s `/^#[0-9a-f]{6}$/i`; `lib/views/contracts.ts` re-checks the
 * same shape). The `>= 3` / `>= 4.5` comparisons in `stationTokens` do not gate
 * acceptance -- they only pick whether `--su-accent-edge` / `--su-accent-text`
 * fall back to `info`. The accepted range is therefore the whole sRGB gamut,
 * `#000000` to `#ffffff` inclusive, including an accent equal to the panel the
 * tint composites over. `THE ACCENT THE APP ACCEPTS` below asserts that against
 * the production emitter, which is what stops the gamut sweeps here from being
 * hypothetical.
 *
 * Measured consequences (production `stationContrast` over the real palettes,
 * glass surfaces composited two layers deep per #787/#788, over the shipped
 * `ACCEPTED_GAMUT` below -- 6,770 unique accents once the 72x6x19 HSL sweep is
 * deduped; it collapses hard at saturation 0):
 *
 *   - Raw accent ink on its own tint has **no safe alpha**: the minimum over the
 *     accepted range is 1.00:1 at every alpha, every theme, every surface
 *     (accent == surface). Capping `N` cannot fix this.
 *   - It is not a custom-accent-only defect either: in the Light theme all 11
 *     shipped accents (8 `ACCENT_PRESETS` + 4 per-theme defaults) miss 4.5 at
 *     every alpha >= 0.10, and the brand default `#ff6b35` reads 2.11:1 on
 *     `bg-plasma-orange/20` over the Light panel.
 *   - `--su-accent-text` does not rescue it. It guarantees 4.5 against the bare
 *     panel, and in the branch where the accent clears that gate the token *is*
 *     the raw accent, so the tint eats the margin: 3.45:1 at /20 on the dark
 *     panel over the gamut, 2.33:1 at /30 on Light glass.
 *   - `--su-text` (the `Badge` `quiet` treatment #795 established for purple)
 *     does hold, with a real cap: **>= 5.18:1 for every accepted accent at
 *     alpha <= 0.20**, first failing at 4.37:1 at alpha 0.25 (dark, glass over
 *     panel, accent `#ffffff`).
 *
 * So the treatment is the ink, not the alpha: keep the accent tint as the fill,
 * draw the label in `--su-text`, and keep the tint at or below `/20`. The sites
 * inside `src/components/ui` (this agent's file scope on #803) carry that
 * treatment and are measured individually below. The remaining 123 sites in 78
 * files are sequenced by the orchestrator; the census ledger at the bottom
 * budgets them so no *new* same-line site can land in the meantime.
 */

import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_ACCENT_HEX,
  stationContrast,
  stationPalettes,
  stationTokens,
} from "@/lib/themes/stationTokens";
import { ACCENT_PRESETS, THEMES, type ThemeId } from "@/lib/themes";

/** The design system's floor for status text (`docs/designs/design-system`). */
const AA = 4.5;

/** The alpha ceiling `--su-text` ink is measured to survive on an accent tint. */
const TINT_CAP = 0.2;

const THEMES_IDS = Object.keys(stationPalettes) as ThemeId[];

type StationPalette = (typeof stationPalettes)[ThemeId];

// Anchor on this file's own location, not process.cwd() -- a vitest invocation
// from a subdirectory inherits the parent config and would shift cwd, making
// every readFileSync below throw (repo memory: no-test-job-in-ci).
const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");

/**
 * Flatten `alpha` of `hex` over an opaque `surface` -- what the browser paints
 * for `bg-<token>/N` -- and return the resulting opaque `#rrggbb`.
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
  name: string;
  backdrop: (palette: StationPalette) => string;
}

/**
 * Every backdrop an accent tint composites over in this app: the two station
 * backgrounds, the opaque `--su-input` role (form controls, toggle wells --
 * `void-black` maps to it, see `tailwind.config.js`), and panel/canvas under
 * `Card`'s default `bg-su-line/10` glass (`src/components/ui/Card.tsx`).
 * Bare-surface tables certified chips that failed inside the glass in
 * #787/#788, so every layer a real site sits on is measured.
 */
const SURFACES: SurfaceSpec[] = [
  { name: "panel", backdrop: (palette) => palette.panel },
  { name: "canvas", backdrop: (palette) => palette.canvas },
  { name: "input", backdrop: (palette) => palette.input },
  {
    name: "glass over panel",
    backdrop: (palette) => compositeOnSurface(palette.line, 0.1, palette.panel),
  },
  {
    name: "glass over canvas",
    backdrop: (palette) =>
      compositeOnSurface(palette.line, 0.1, palette.canvas),
  },
];

/**
 * A sample of the accepted range: 72 hues x 6 saturations x 19 lightnesses,
 * plus both poles and every palette hex (so the "accent equal to the surface"
 * case is always in the sample). Every entry matches the acceptance regex, and
 * `THE ACCENT THE APP ACCEPTS` proves the app really does keep them verbatim.
 */
function hslToHex(hue: number, saturation: number, lightness: number): string {
  const chroma = saturation * Math.min(lightness, 1 - lightness);
  const channel = (n: number) => {
    const k = (n + hue / 30) % 12;
    const value =
      lightness - chroma * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * value)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

const ACCEPTED_GAMUT: string[] = (() => {
  const accents = new Set<string>(["#ffffff", "#000000", DEFAULT_ACCENT_HEX]);
  for (let hue = 0; hue < 360; hue += 5) {
    for (const saturation of [0, 0.2, 0.35, 0.6, 0.85, 1]) {
      for (let lightness = 0.05; lightness <= 0.96; lightness += 0.05) {
        accents.add(hslToHex(hue, saturation, lightness));
      }
    }
  }
  for (const theme of THEMES_IDS) {
    for (const value of Object.values(stationPalettes[theme]))
      accents.add(value);
  }
  return [...accents];
})();

/** The accents the app ships: the eight presets plus each theme's default. */
const SHIPPED_ACCENTS = [
  ...new Set([
    ...ACCENT_PRESETS.map((accent) => accent.primary),
    ...THEMES.map((theme) => theme.colors.accentPrimary),
  ]),
];

/** Worst `stationContrast(ink, accent tint)` over a set of accents. */
function worstOnTint(
  ink: string,
  accents: string[],
  alpha: number,
  backdrop: string,
): { ratio: number; accent: string } {
  let ratio = Infinity;
  let accent = "";
  for (const candidate of accents) {
    const measured = stationContrast(
      ink,
      compositeOnSurface(candidate, alpha, backdrop),
    );
    if (measured < ratio) {
      ratio = measured;
      accent = candidate;
    }
  }
  return { ratio, accent };
}

const SWEEP = THEMES_IDS.flatMap((theme) =>
  SURFACES.map((surface) => [theme, surface.name, surface] as const),
);

describe("the accent the app accepts (#803)", () => {
  // The sweeps below are only meaningful if these accents can really reach
  // --su-accent. `stationTokens` is the production emitter every path funnels
  // into (AppearanceSection -> themeStore.setCustomColors ->
  // applyThemeToDocument -> stationTokens; StationProvider calls it directly).
  it.each([
    ["#ffffff", "white -- the worst case for --su-text ink on a dark palette"],
    ["#000000", "black -- the worst case for --su-text ink on Light"],
    ["#191e2e", "the dark panel itself, i.e. an invisible tint"],
    ["#F3F4EF", "the Light panel, uppercase (the regex is case-insensitive)"],
  ])("keeps %s verbatim (%s)", (accent) => {
    for (const theme of THEMES_IDS) {
      expect(
        (stationTokens(theme, accent) as Record<string, string>)["--su-accent"],
      ).toBe(accent);
    }
  });

  it("has no contrast gate: only malformed values fall back", () => {
    for (const malformed of ["", "red", "#fff", "#12345g", "rgb(1,2,3)"]) {
      expect(
        (stationTokens("dark", malformed) as Record<string, string>)[
          "--su-accent"
        ],
        `${malformed} should fall back to the brand orange`,
      ).toBe(DEFAULT_ACCENT_HEX);
    }
    // ...and a well-formed accent that is illegible against the panel is still
    // accepted as the accent; only the *derived* ink token falls back.
    const tokens = stationTokens("dark", "#191e2e") as Record<string, string>;
    expect(tokens["--su-accent"]).toBe("#191e2e");
    expect(tokens["--su-accent-text"]).toBe(stationPalettes.dark.info);
  });
});

describe("raw accent ink on an accent tint has no safe alpha (#803)", () => {
  it.each(SWEEP)(
    "%s / %s: some accepted accent is illegible on its own /10 tint",
    (theme, _name, surface) => {
      const backdrop = surface.backdrop(stationPalettes[theme]);
      let worst = Infinity;
      let worstAccent = "";
      for (const accent of ACCEPTED_GAMUT) {
        const ratio = stationContrast(
          accent,
          compositeOnSurface(accent, 0.1, backdrop),
        );
        if (ratio < worst) {
          worst = ratio;
          worstAccent = accent;
        }
      }
      // 1.10:1 is the largest of the sixteen minima (high-contrast canvas);
      // the rest are 1.00-1.06. Nothing here is close to 4.5, and this is the
      // *lowest* tint alpha in use -- so no cap on N makes this pairing legible.
      expect(worst, `worst accepted accent ${worstAccent}`).toBeLessThan(1.11);
    },
  );

  it("fails for the brand default on the shipped Light theme, no custom accent involved", () => {
    const light = stationPalettes.light;
    const ratio = stationContrast(
      DEFAULT_ACCENT_HEX,
      compositeOnSurface(DEFAULT_ACCENT_HEX, 0.2, light.panel),
    );
    expect(ratio).toBeLessThan(AA);
    expect(ratio).toBeCloseTo(2.11, 2);
  });

  it("is not rescued by --su-accent-text either", () => {
    // The brand default clears 4.5 on every guaranteed surface (#811), so
    // --su-accent-text resolves to the accent itself and the tint still eats it.
    const ink = (stationTokens("dark", DEFAULT_ACCENT_HEX) as Record<
      string,
      string
    >)["--su-accent-text"];
    expect(ink).toBe(DEFAULT_ACCENT_HEX);
    expect(
      stationContrast(
        ink,
        compositeOnSurface(
          DEFAULT_ACCENT_HEX,
          0.2,
          stationPalettes.dark.panel,
        ),
      ),
    ).toBeLessThan(AA);
  });
});

describe("--su-text ink clears the floor on an accent tint up to /20 (#803)", () => {
  const cases = SWEEP.flatMap((entry) =>
    [0.1, 0.15, TINT_CAP].map((alpha) => [...entry, alpha] as const),
  );

  it.each(cases)(
    "%s / %s at alpha %s: every accepted accent clears 4.5",
    (theme, _name, surface, alpha) => {
      const palette = stationPalettes[theme];
      const { ratio, accent } = worstOnTint(
        palette.text,
        ACCEPTED_GAMUT,
        alpha,
        surface.backdrop(palette),
      );
      expect(
        ratio,
        `${theme} ${surface.name} /${alpha * 100}: worst accent ${accent}`,
      ).toBeGreaterThanOrEqual(AA);
    },
  );

  it("still clears at /30 for every accent the app ships", () => {
    for (const theme of THEMES_IDS) {
      const palette = stationPalettes[theme];
      for (const surface of SURFACES) {
        const { ratio, accent } = worstOnTint(
          palette.text,
          SHIPPED_ACCENTS,
          0.3,
          surface.backdrop(palette),
        );
        expect(
          ratio,
          `${theme} ${surface.name} /30: worst shipped accent ${accent}`,
        ).toBeGreaterThanOrEqual(AA);
      }
    }
  });

  it("does not clear above /20 over the whole accepted range -- the cap is real", () => {
    // Dark, Card glass over panel, accent #ffffff: 4.37:1 at /25, 3.70:1 at
    // /30. This is what makes TINT_CAP a measurement rather than a preference.
    const backdrop = compositeOnSurface(
      stationPalettes.dark.line,
      0.1,
      stationPalettes.dark.panel,
    );
    expect(
      stationContrast(
        stationPalettes.dark.text,
        compositeOnSurface("#ffffff", 0.25, backdrop),
      ),
    ).toBeLessThan(AA);
  });
});

interface TintedSite {
  /** Repo-relative path of the call site. */
  file: string;
  /** What the tinted element carries, for the test name. */
  what: string;
  /** Exact snippet the site ships; binds the table to the source. */
  snippet: string;
  /**
   * For sites whose class string is assembled outside a `className=`
   * attribute (a `const x = ...`/ternary, an object-map key line): a unique
   * snippet on the OPENING line of that declaration, resolved by
   * `extractClassSourceValue` into the full declaration text. When present,
   * this -- not `extractClassNameValue` -- is what `measuredAlpha` measures,
   * so a rogue tint on a sibling branch or entry of the same declaration is
   * caught even though it never touches `snippet`'s own line.
   */
  classSource?: string;
}

/**
 * Highest `bg-plasma-orange/N` alpha the snippet itself encodes (rest or
 * hover) -- parsed from the string that is already proven to be a substring
 * of the shipped file, instead of a hand-written field that could drift from
 * it silently. The snippet must include every `bg-plasma-orange/N` class the
 * site ships (rest and hover), even when the hover class sits on a different
 * source line than `text-su-text`, or this under-counts the real alpha.
 */
function deriveAlpha(snippet: string): number {
  const alphas = [...snippet.matchAll(/bg-plasma-orange\/(\d+)/g)].map((m) =>
    Number(m[1]),
  );
  return Math.max(...alphas) / 100;
}

/**
 * Pulls the full text of the `className` attribute that contains `snippet`,
 * not just the source line the snippet's own substring match falls on. A
 * plain `className="..."` is one line, so this is equivalent to the line for
 * most sites; but some sites build their className from a template literal
 * with an interpolated ternary spanning several lines (e.g.
 * `NetFilterControls`' toggle), or an array literal
 * (`className={[...].join(" ")}`, e.g. `PhaseIndicator`'s pill) with
 * branches on separate lines, so a `bg-plasma-orange/N` token appended to a
 * *different* line or branch of the same className would sit outside the
 * snippet's own line yet still land in the rendered class list. This walks
 * back from the snippet to the nearest preceding `className=`, then forward
 * to that attribute's closing quote, closing backtick, or matching closing
 * bracket, so the check below sees the whole value either way.
 *
 * A handful of sites don't build their class string inside a `className=`
 * attribute at all -- it's assembled in a separate variable or object map
 * (e.g. `ActivationPanel`'s `typeBadgeClasses`, `NetMilestoneCard`'s
 * `BADGE_COLORS` record) and interpolated into the real className elsewhere.
 * `lastIndexOf` still finds *some* preceding `className=` in the file in
 * that case -- just not one that actually contains the snippet -- so this
 * validates the snippet's start position actually falls inside the
 * extracted value and throws if not, rather than silently returning an
 * unrelated className from earlier in the file. Those rows carry a
 * `classSource` locator instead, resolved by `extractClassSourceValue`
 * below, so `measuredAlpha` never calls this function for them.
 */
function extractClassNameValue(source: string, snippet: string): string {
  const snippetIndex = source.indexOf(snippet);
  if (snippetIndex === -1) {
    throw new Error(`snippet not found while locating its className:\n${snippet}`);
  }
  const attr = "className=";
  const attrIndex = source.lastIndexOf(attr, snippetIndex);
  if (attrIndex === -1) {
    throw new Error(`no className= attribute precedes snippet:\n${snippet}`);
  }
  const valueStart = attrIndex + attr.length;
  const delimiter = source[valueStart];

  function assertContains(contentStart: number, contentEnd: number): void {
    if (snippetIndex < contentStart || snippetIndex >= contentEnd) {
      throw new Error(
        `nearest className= attribute does not actually contain the snippet -- it is likely assembled in a separate variable and interpolated in:\n${snippet}`,
      );
    }
  }

  if (delimiter === '"' || delimiter === "'") {
    const closeIndex = source.indexOf(delimiter, valueStart + 1);
    assertContains(valueStart + 1, closeIndex);
    return source.slice(valueStart + 1, closeIndex);
  }
  if (delimiter === "{") {
    let i = valueStart + 1;
    while (source[i] === " " || source[i] === "\n" || source[i] === "\t") {
      i++;
    }
    const shapeChar = source[i];
    if (shapeChar === "`") {
      // `className={`...`}` -- the outer backticks bound the value.
      const backtickEnd = source.indexOf("`", i + 1);
      if (backtickEnd === -1) {
        throw new Error(
          `className={\`...\`} near snippet has no closing backtick:\n${snippet}`,
        );
      }
      assertContains(i + 1, backtickEnd);
      return source.slice(i + 1, backtickEnd);
    }
    if (shapeChar === "[") {
      // `className={[...].join(" ")}` -- walk bracket depth to the matching
      // close, skipping over quoted string contents so a `]` inside a class
      // string can't end the match early.
      let depth = 0;
      let j = i;
      let inString: string | null = null;
      for (; j < source.length; j++) {
        const ch = source[j];
        if (inString) {
          if (ch === "\\") {
            j++;
          } else if (ch === inString) {
            inString = null;
          }
          continue;
        }
        if (ch === '"' || ch === "'" || ch === "`") {
          inString = ch;
          continue;
        }
        if (ch === "[") {
          depth++;
        } else if (ch === "]") {
          depth--;
          if (depth === 0) {
            break;
          }
        }
      }
      if (depth !== 0) {
        throw new Error(
          `unterminated array literal in className={[...]} near snippet:\n${snippet}`,
        );
      }
      assertContains(i, j + 1);
      return source.slice(i, j + 1);
    }
    throw new Error(
      `className={...} near snippet is not a backtick template literal or array literal:\n${snippet}`,
    );
  }
  throw new Error(
    `unrecognized className= delimiter '${delimiter}' near snippet:\n${snippet}`,
  );
}

/**
 * Pulls the full text of the declaration that a `classSource` locator opens
 * -- the counterpart to `extractClassNameValue` for the handful of sites
 * whose class string is assembled outside a `className=` attribute (a
 * `const x = ...`/ternary statement, or an object-map entry keyed by a
 * literal like `Platinum:` or `"Bold Explorer":`). `locator` must be a
 * snippet that appears on the OPENING line of that declaration and nowhere
 * else in the file -- this throws if it is absent or matches more than
 * once, since a non-unique locator could silently resolve to the wrong
 * declaration.
 *
 * From the locator's line, this reads forward to the declaration's balanced
 * close: if the line itself opens a brace (a function whose body assembles
 * the string across a `switch`, e.g. `NeededMultsPanel`'s
 * `getTypeBadgeColor`), it walks brace depth to that brace's match, so every
 * branch of the function -- not just the one the snippet names -- is
 * captured. Otherwise it reads to the first top-level `;` (a `const`
 * statement or ternary) or the first top-level `,` (an object-map entry with
 * a trailing comma), or stops just before a `}`/`)`/`]` that would close an
 * enclosing scope (an object-map entry that is the last one, with no
 * trailing comma) -- whichever comes first, skipping over quoted string
 * contents throughout so a comma or brace inside a class string can't end
 * the match early.
 */
function extractClassSourceValue(source: string, locator: string): string {
  const firstIndex = source.indexOf(locator);
  if (firstIndex === -1) {
    throw new Error(`classSource locator not found in source:\n${locator}`);
  }
  if (source.indexOf(locator, firstIndex + 1) !== -1) {
    throw new Error(
      `classSource locator matches more than once in source:\n${locator}`,
    );
  }
  const lineStart = source.lastIndexOf("\n", firstIndex) + 1;
  const nextNewline = source.indexOf("\n", firstIndex);
  const line = source.slice(lineStart, nextNewline === -1 ? source.length : nextNewline);

  let i = lineStart;
  let inString: string | null = null;

  if (line.trimEnd().endsWith("{")) {
    // Balanced-brace declaration: walk `{`/`}` depth from the line's own
    // opening brace to its match.
    let depth = 0;
    for (; i < source.length; i++) {
      const ch = source[i];
      if (inString) {
        if (ch === "\\") {
          i++;
        } else if (ch === inString) {
          inString = null;
        }
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") {
        inString = ch;
        continue;
      }
      if (ch === "{") {
        depth++;
      } else if (ch === "}") {
        depth--;
        if (depth === 0) {
          i++;
          break;
        }
      }
    }
    if (depth !== 0) {
      throw new Error(
        `unterminated declaration for classSource locator:\n${locator}`,
      );
    }
    return source.slice(lineStart, i);
  }

  // Statement or object-map-entry declaration: stop at the first top-level
  // `;` or `,`, or just before a close bracket that would close an
  // enclosing scope.
  let depth = 0;
  for (; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (ch === "\\") {
        i++;
      } else if (ch === inString) {
        inString = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inString = ch;
      continue;
    }
    if (ch === "{" || ch === "(" || ch === "[") {
      depth++;
      continue;
    }
    if (ch === "}" || ch === ")" || ch === "]") {
      if (depth === 0) {
        break;
      }
      depth--;
      continue;
    }
    if (depth === 0 && (ch === ";" || ch === ",")) {
      i++;
      break;
    }
  }
  return source.slice(lineStart, i);
}

/**
 * The single source of truth for what a `FIXED_SITES` row is judged against,
 * for both the alpha derivation below and the ink assertions further down.
 * For a row with `classSource`, this is the full declaration that locator
 * opens (via `extractClassSourceValue`), so a rogue tint or a rogue ink class
 * on a sibling branch or entry of that same declaration is caught even when
 * it never touches `snippet`'s own line -- the #843 round-4 Codex thread,
 * which named the round-3 snippet-only fallback as the same blindness the
 * round-3 fix itself closed for inline classNames. For every other row, this
 * is the whole `className` attribute the snippet lives in (via
 * `extractClassNameValue`), so a `hover:bg-plasma-orange/N` or a rogue
 * `text-plasma-orange` wrapped onto a different line or branch of the same
 * className -- the #843 round-3 Codex thread, reproduced on
 * `ActivationPanel`'s SOTA selector button -- is not missed either.
 *
 * There is no silent fallback: a row whose class string is not literally
 * inside a `className=` attribute must carry `classSource`, or
 * `extractClassNameValue` throws and the row's own test fails, naming it.
 */
function locatedClassText(source: string, site: TintedSite): string {
  if (site.classSource !== undefined) {
    return extractClassSourceValue(source, site.classSource);
  }
  return extractClassNameValue(source, site.snippet);
}

/**
 * The alpha `FIXED_SITES` measures for a site: read fresh from
 * `locatedClassText`, not from `site.snippet` alone. `deriveAlpha` itself is
 * unchanged; this only changes what gets fed to it. Confirmed when this was
 * introduced (#843 round 4): none of the existing 44 `FIXED_SITES` rows'
 * measured alpha actually changed under this rule from what round 3
 * measured -- this is a coverage widening for future regressions, not a
 * correction of a past one.
 */
function measuredAlpha(source: string, site: TintedSite): number {
  return deriveAlpha(locatedClassText(source, site));
}

/**
 * The quoted string literals inside `text`, in order, with escape sequences
 * left intact (they never matter for a class-name substring check). A plain
 * dequoted `className="..."` value (`extractClassNameValue`'s quote-delimited
 * case) has no quotes of its own, so this returns no segments for it --
 * `tintedBranches` below treats that as a single implicit branch. A backtick
 * template with an interpolated ternary, an array literal, or a
 * `classSource` declaration all carry their alternatives as separate quoted
 * strings (plus, for a `classSource` declaration, unrelated quoted
 * identifiers like a switch's `case` labels or a ternary's own comparison
 * value -- harmless, since nothing downstream judges a segment that carries
 * no accent tint).
 */
function quotedSegments(text: string): string[] {
  const segments: string[] = [];
  let i = 0;
  while (i < text.length) {
    const quote = text[i];
    if (quote === '"' || quote === "'" || quote === "`") {
      let j = i + 1;
      let content = "";
      while (j < text.length && text[j] !== quote) {
        if (text[j] === "\\") {
          content += text.slice(j, j + 2);
          j += 2;
          continue;
        }
        content += text[j];
        j++;
      }
      segments.push(content);
      i = j + 1;
      continue;
    }
    i++;
  }
  return segments;
}

/**
 * The branches of `text` an ink check should judge separately: each quoted
 * string literal it carries, or -- when it carries none, i.e. it is already
 * a single dequoted class-list string -- the whole text as one branch.
 */
function tintedBranches(text: string): string[] {
  const segments = quotedSegments(text);
  return segments.length > 0 ? segments : [text];
}

/**
 * Every branch of `text` that carries a `bg-plasma-orange/N` tint must also
 * carry `text-su-text` and must not carry `text-plasma-orange` -- branches
 * without a tint of their own (an untinted sibling in a ternary, a switch
 * case for another type, a comparison value that happens to be quoted) are
 * not judged, since they ship no accent ink for the contrast table below to
 * answer for. Judging `locatedClassText`'s branches, not `site.snippet`,
 * means a rogue ink class added to a *different* branch of the same
 * declaration -- one `snippet` never names -- is still caught, matching how
 * `measuredAlpha` above already reads the whole declaration rather than the
 * snippet alone.
 */
function assertInkOnTintedBranches(text: string, what: string): void {
  for (const branch of tintedBranches(text)) {
    if (!/bg-plasma-orange\//.test(branch)) {
      continue;
    }
    expect(
      branch.includes("text-su-text"),
      `${what}: a bg-plasma-orange branch does not carry text-su-text:\n${branch}`,
    ).toBe(true);
    expect(
      branch.includes("text-plasma-orange"),
      `${what}: a bg-plasma-orange branch draws accent ink on its own tint again:\n${branch}`,
    ).toBe(false);
  }
}

/**
 * Sites moved onto the `--su-text` treatment: the original `src/components/ui`
 * sites from #822, plus each sequenced follow-up batch's sites as they land
 * (batch 1: `src/components/contest`; batch 2: `src/components/nets`,
 * `src/components/cluster`, `src/components/activation`,
 * `src/components/activity`; #803). Each ships an accent tint at or below
 * `TINT_CAP` with a neutral label; steps that exceeded the cap at rest came
 * down to `/15` -> `hover:/20` so the hovered state stays inside the
 * measured cap and still reads as a step. Reverting any of them to
 * `text-plasma-orange` breaks its snippet assertion here, and a
 * `src/components/ui` entry also breaks the dedicated `src/components/ui`
 * clause of the census guard below. Alpha is measured (`measuredAlpha`
 * above) on the whole containing `className` for most rows, or on the whole
 * `classSource` declaration for the rows that carry one -- so a hover class
 * or sibling branch wrapped onto a different line of the same className or
 * declaration is caught here either way, and a row with neither a resolvable
 * `className=` nor a `classSource` fails its own test rather than falling
 * back to measuring `snippet` alone. The per-line census guard further below
 * is NOT upgraded the same way -- it stays a same-line-only regex, exactly
 * as documented at its own describe block, because `FIXED_SITES` is what
 * exists to cover the multi-line and multi-branch cases for the sites it
 * lists.
 */
const FIXED_SITES: TintedSite[] = [
  {
    file: "src/components/ui/SyncStatusIndicator.tsx",
    what: "the sync queue pill",
    snippet: `: "bg-plasma-orange/20 text-su-text border-plasma-orange/30";`,
    classSource: `const pillColor = hasFailed`,
  },
  {
    file: "src/components/ui/SyncStatusIndicator.tsx",
    what: 'the "Retry All" button',
    snippet: `rounded bg-plasma-orange/15 text-su-text
                             hover:bg-plasma-orange/20 transition-colors font-medium"`,
  },
  {
    file: "src/components/ui/ConfirmDialog.tsx",
    what: "the default confirm button",
    snippet: `"bg-plasma-orange/15 hover:bg-plasma-orange/20 text-su-text border border-plasma-orange/30",`,
    classSource: `default:`,
  },
  {
    file: "src/components/ui/ImageCropDialog.tsx",
    what: "the crop save button",
    snippet: `bg-plasma-orange/15 hover:bg-plasma-orange/20 text-su-text`,
  },
  {
    file: "src/components/ui/ReferencePanel.tsx",
    what: "the selected band chip",
    snippet: `? "bg-plasma-orange/20 border-plasma-orange/60 text-su-text"`,
  },
  {
    file: "src/components/ui/ShareModal.tsx",
    what: "the copy-link button",
    snippet: `: "bg-plasma-orange/15 text-su-text border border-plasma-orange/50 hover:bg-plasma-orange/20"`,
  },
  {
    file: "src/components/ui/ShortcutsHelpModal.tsx",
    what: "the selected shortcuts tab",
    snippet: `? "bg-plasma-orange/15 text-su-text border border-plasma-orange/40 font-semibold"`,
  },
  {
    file: "src/components/ui/UndoToast.tsx",
    what: "the redo button",
    snippet: `bg-plasma-orange/15 text-su-text
                    hover:bg-plasma-orange/20`,
  },
  {
    file: "src/components/ui/UpgradePrompt.tsx",
    what: 'the "Pro" chip',
    snippet: `rounded bg-plasma-orange/15 text-su-text font-semibold`,
  },
  // Batch 1 (#803): src/components/contest -- 13 files, 17 sites. Card glass
  // (bg-su-line/10 backdrop-blur-md) is composited over canvas or panel for
  // most sites, reached through the `/map` PropSphere dock (ContestDock and
  // its children) or the `/contest` page; the two ContestRateSheet
  // view-mode toggles sit on the opaque `--su-input` role instead --
  // `ViewToggle`'s own `bg-void-black` container (ContestRateSheet.tsx:251)
  // occludes the Card glass its ancestor provides. StationEstimate reads
  // its own root's bare `bg-panel` (StationEstimate.tsx:145). Argued
  // per-site in the PR body.
  {
    file: "src/components/contest/BandAdvisor.tsx",
    what: "the QSY action button",
    snippet: `bg-plasma-orange/15 text-su-text hover:bg-plasma-orange/20`,
  },
  {
    file: "src/components/contest/ContestBandMap.tsx",
    what: "the hovered-spot new-mult status pill",
    snippet: `? "bg-plasma-orange/20 text-su-text"`,
  },
  {
    file: "src/components/contest/ContestCalendar.tsx",
    what: "the mode pill",
    snippet: `bg-plasma-orange/15 text-su-text border border-plasma-orange/25`,
  },
  {
    file: "src/components/contest/ContestCalendar.tsx",
    what: 'the "Start Contest" button',
    snippet: `bg-plasma-orange/15 text-su-text border border-plasma-orange/30 hover:bg-plasma-orange/20`,
  },
  {
    file: "src/components/contest/ContestCalendar.tsx",
    what: "the selected sort key button",
    snippet: `? "bg-plasma-orange/20 text-su-text border border-plasma-orange/30"`,
  },
  {
    file: "src/components/contest/ContestDock.tsx",
    what: '"Prefill in RUN" toggle, active state',
    snippet: `? "bg-plasma-orange/20 text-su-text border-plasma-orange/40"`,
  },
  {
    file: "src/components/contest/ContestRateSheet.tsx",
    what: "the Hourly view-mode toggle, active state",
    snippet: `mode === "hourly"
            ? "bg-plasma-orange/20 text-su-text"`,
  },
  {
    file: "src/components/contest/ContestRateSheet.tsx",
    what: "the 10-Min view-mode toggle, active state",
    snippet: `mode === "10min"
            ? "bg-plasma-orange/20 text-su-text"`,
  },
  {
    file: "src/components/contest/ContestScoreShare.tsx",
    what: '"Share Score" button, uncopied state',
    snippet: `bg-plasma-orange/15 text-su-text hover:bg-plasma-orange/20`,
  },
  {
    file: "src/components/contest/ContestSpotsPanel.tsx",
    what: "the active band-filter button",
    snippet: `bg-plasma-orange/20 text-su-text border border-plasma-orange/50`,
  },
  {
    file: "src/components/contest/ContestVoiceControls.tsx",
    what: '"Apply" candidate button',
    snippet: `bg-plasma-orange/15 text-su-text border border-plasma-orange/40 hover:bg-plasma-orange/20`,
  },
  {
    file: "src/components/contest/MobileContestEntry.tsx",
    what: "the selected mode button",
    snippet: `bg-plasma-orange/20 text-su-text border-2 border-plasma-orange/60`,
  },
  {
    file: "src/components/contest/MultiplierMatrix.tsx",
    what: '"All bands" selector, selected state',
    snippet: `bg-plasma-orange/20 text-su-text border border-plasma-orange/50`,
  },
  {
    file: "src/components/contest/NeededMultsPanel.tsx",
    what: "the CQ/ITU zone type badge",
    snippet: `bg-plasma-orange/20 border-plasma-orange/40 text-su-text`,
    classSource: `function getTypeBadgeColor(type: MultiplierType): string {`,
  },
  {
    file: "src/components/contest/NeededMultsPanel.tsx",
    what: "the top-3 rank indicator",
    snippet: `bg-plasma-orange/20 text-su-text`,
    classSource: `const rankStyle =`,
  },
  {
    file: "src/components/contest/PendingDraftReplaceBanner.tsx",
    what: '"Replace" button',
    snippet: `bg-plasma-orange/15 text-su-text border border-plasma-orange/40 hover:bg-plasma-orange/20`,
  },
  {
    file: "src/components/contest/StationEstimate.tsx",
    what: '"Bold Explorer" tier badge',
    snippet: `text-su-text bg-plasma-orange/15 border-plasma-orange/30`,
    classSource: `"Bold Explorer":`,
  },
  // Batch 2 (#803): src/components/nets, src/components/cluster,
  // src/components/activation, src/components/activity -- 13 files, 19
  // sites. One site (NetFilterControls.tsx's "More Filters" toggle) is not
  // listed here: it nested its own /15->hover:/20 wash around the active
  // filter-count badge below, an effective 0.32/0.36 alpha above the /20
  // cap, so its background was neutralised to bg-su-line/10 (border kept
  // for hue) instead of capped -- it no longer carries any accent tint, so
  // there is nothing left to measure and the census guard alone protects
  // it. Surfaces argued per-site in the PR body; --su-text clears every
  // measured surface (panel, canvas, input, glass-over-panel,
  // glass-over-canvas) at /20, so the exact backdrop does not change the
  // outcome for any of these.
  {
    file: "src/components/activation/ActivationPanel.tsx",
    what: "the SOTA type-selector button, selected state",
    snippet: `bg-plasma-orange/20 text-su-text border-2 border-plasma-orange/40"`,
  },
  {
    file: "src/components/activation/ActivationPanel.tsx",
    what: "the active-activation type badge (SOTA)",
    snippet: `: "bg-plasma-orange/20 text-su-text";`,
    classSource: `const typeBadgeClasses =`,
  },
  {
    file: "src/components/activity/NearbyActivityExplorer.tsx",
    what: '"Target in PropSphere" button',
    snippet: `bg-plasma-orange/10 px-3 py-2 font-medium text-su-text transition-colors hover:bg-plasma-orange/20"`,
  },
  {
    file: "src/components/activity/NearbyActivityExplorer.tsx",
    what: "the band/frequency mode toggle, selected state",
    snippet: `? "bg-plasma-orange/20 text-su-text"`,
  },
  {
    file: "src/components/cluster/ClusterConnectionForm.tsx",
    what: "the compact filter-count badge",
    snippet: `bg-plasma-orange/20 text-su-text text-xs leading-none normal-case tracking-normal"`,
  },
  {
    file: "src/components/cluster/ClusterConnectionForm.tsx",
    what: '"Connect" button, connectable state',
    snippet: `bg-plasma-orange/15 border border-plasma-orange/50 text-su-text hover:bg-plasma-orange/20"`,
  },
  {
    file: "src/components/cluster/ClusterConnectionForm.tsx",
    what: "the selected band/mode filter chip",
    snippet: `bg-plasma-orange/20 text-su-text border border-plasma-orange/50"`,
  },
  {
    file: "src/components/nets/CallsignInput.tsx",
    what: '"Add" callsign button',
    snippet: `bg-plasma-orange/15 text-su-text border border-plasma-orange/30 hover:bg-plasma-orange/20 hover:brightness-110`,
  },
  {
    file: "src/components/nets/ManagerRoster.tsx",
    what: '"Add" manager button',
    snippet: `bg-plasma-orange/15 text-su-text border border-plasma-orange/30 hover:bg-plasma-orange/20 transition-colors shrink-0"`,
  },
  {
    file: "src/components/nets/NetFilterControls.tsx",
    what: "the active-filter-count badge inside the More Filters toggle",
    snippet: `bg-plasma-orange/20 text-su-text min-w-[18px] text-center"`,
  },
  {
    file: "src/components/nets/NetFilterControls.tsx",
    what: "the Net Type quick-filter pill, selected state",
    snippet: `? "bg-plasma-orange/20 text-su-text border-plasma-orange/40"`,
  },
  {
    file: "src/components/nets/NetForm.tsx",
    what: "the selected country option in the country combobox",
    snippet: `? "bg-plasma-orange/15 text-su-text"`,
  },
  {
    file: "src/components/nets/NetMilestoneCard.tsx",
    what: 'the "Platinum" (100th check-in) badge color',
    snippet: `Platinum: "bg-plasma-orange/20 text-su-text border-plasma-orange/30",`,
    classSource: `Platinum:`,
  },
  {
    file: "src/components/nets/PhaseIndicator.tsx",
    what: "the current-session-phase pill",
    snippet: `? "bg-plasma-orange/20 text-su-text font-bold animate-ncs-phase-glow"`,
  },
  {
    file: "src/components/nets/PreambleEditor.tsx",
    what: "an insert-variable chip, hovered state",
    snippet: `hover:bg-plasma-orange/20 hover:text-su-text hover:border-plasma-orange/40`,
  },
  {
    file: "src/components/nets/SpeakerStage.tsx",
    what: '"Start" hero button, idle state',
    snippet: `bg-plasma-orange/15 text-su-text border-plasma-orange/30 hover:bg-plasma-orange/20 hover:border-plasma-orange/50`,
  },
  {
    file: "src/components/nets/SubscribeButton.tsx",
    what: '"Subscribe" button, unsubscribed state',
    snippet: `bg-plasma-orange/15 text-su-text border-plasma-orange/30 hover:bg-plasma-orange/20"`,
  },
  {
    file: "src/components/nets/TuneToNetButton.tsx",
    what: '"Tune to Net" button, idle/tuning state',
    snippet: `bg-plasma-orange/15 text-su-text hover:bg-plasma-orange/20 hover:shadow-[0_0_12px_rgba(255,107,53,0.25)]`,
    classSource: `const colors =`,
  },
  // Batch 3 (#803): src/components/settings -- 14 files, 26 sites, minus one
  // deferred (WatchAlertSettings.tsx's TestSoundButton pairs its /20 tint
  // with an animate-pulse icon whose stroke inherits the same --su-text ink,
  // so its certified contrast is invalidated for half of every cycle; the
  // source fix (cap 30->20, ink swap) still ships, but it is not counted
  // fixed here and its ledger row stays at 1, deferred to #847). 25 sites
  // certified. Two same-text pairs need a preceding discriminator line to
  // stay unique in this table: LocationManager.tsx's two modal buttons
  // (Save vs Set Location, disambiguated by their onClick) and
  // DataAccountSection.tsx's Export ADIF / Clear Map Cache buttons
  // (disambiguated by their ternary condition). Surfaces argued per-site in
  // the PR body; the desktop settings page mounts bare on canvas, the
  // mobile settings sheet wraps in a translucent panel, and modals render
  // on the opaque --su-panel role -- --su-text clears every measured
  // surface at /20 regardless.
  {
    file: "src/components/settings/BandPresetManager.tsx",
    what: "the selected band chip",
    snippet: `? "bg-plasma-orange/20 text-su-text border-plasma-orange/50"`,
  },
  {
    file: "src/components/settings/CATSettings.tsx",
    what: "the selected CAT backend button",
    snippet: `? "bg-plasma-orange/20 text-su-text border border-plasma-orange/50"`,
  },
  {
    file: "src/components/settings/FavoredBandsPicker.tsx",
    what: "the favored-band chip state",
    snippet: `favored:
      "bg-plasma-orange/15 text-su-text border-plasma-orange/50 hover:bg-plasma-orange/20",`,
    classSource: `const stateClasses = {`,
  },
  {
    file: "src/components/settings/LicenseSection.tsx",
    what: '"Save License Info" button, dirty state',
    snippet: `? "bg-plasma-orange/15 border border-plasma-orange/50 text-su-text hover:bg-plasma-orange/20"`,
  },
  {
    file: "src/components/settings/LocationInput.tsx",
    what: "the selected input-mode tab",
    snippet: `? "bg-plasma-orange/20 text-su-text border border-plasma-orange/50"`,
  },
  {
    file: "src/components/settings/LocationInput.tsx",
    what: '"Get Location" button',
    snippet: `bg-plasma-orange/15 border border-plasma-orange/50 rounded-lg
                         text-su-text hover:bg-plasma-orange/20
                         transition-colors text-sm font-medium
                         disabled:opacity-50 disabled:cursor-wait flex items-center gap-2"`,
  },
  {
    file: "src/components/settings/LocationInput.tsx",
    what: "the GPS coordinate convert-to-grid button",
    snippet: `bg-plasma-orange/15 border border-plasma-orange/50 rounded-lg
                         text-su-text hover:bg-plasma-orange/20
                         transition-colors text-sm font-medium"
              title="Convert coordinates to grid"`,
  },
  {
    file: "src/components/settings/LocationManager.tsx",
    what: '"+ Set" temporary-location button',
    snippet: `bg-plasma-orange/15 border border-plasma-orange/40
                         text-su-text hover:bg-plasma-orange/20 transition-colors"`,
  },
  {
    // The edit-home modal's "Save" button (onClick={saveHomeEdits}) and the
    // temporary-location modal's "Set Location" button
    // (onClick={saveTempLocation}) ship the identical class string -- a
    // plain quoted className= attribute has no text of its own to
    // discriminate them by (unlike the DataAccountSection pair below, whose
    // backtick template carries its ternary condition inside the className
    // value itself), and the onClick prop is a sibling JSX attribute
    // outside the className value, so a prefix locator doesn't work either
    // (extractClassNameValue throws if the snippet start doesn't fall
    // inside the located className). Each row instead uses a SUFFIX
    // discriminator: the snippet starts inside the className (so
    // `snippetIndex`/`lastIndexOf("className=")` resolve the right
    // attribute and `measuredAlpha` reads the correct value) and continues
    // past the closing quote into the button's own label text, which is
    // unique per button -- `indexOf` then lands on the right occurrence for
    // each row.
    file: "src/components/settings/LocationManager.tsx",
    what: 'the edit-home modal "Save" button',
    snippet: `bg-plasma-orange/15 border border-plasma-orange/50 rounded-lg
                         text-su-text hover:bg-plasma-orange/20 transition-colors font-medium text-sm"
            >
              Save`,
  },
  {
    file: "src/components/settings/LocationManager.tsx",
    what: 'the temporary-location modal "Set Location" button',
    snippet: `bg-plasma-orange/15 border border-plasma-orange/50 rounded-lg
                         text-su-text hover:bg-plasma-orange/20 transition-colors font-medium text-sm"
            >
              Set Location`,
  },
  {
    file: "src/components/settings/NotificationSettings.tsx",
    what: "the selected band chip",
    snippet: `? "bg-plasma-orange/20 text-su-text border border-plasma-orange/50"`,
  },
  {
    file: "src/components/settings/NotificationSettings.tsx",
    what: "the selected alert-display-style button",
    snippet: `notifications.alertDisplayStyle === opt.value
                      ? "bg-plasma-orange/20 text-su-text border-plasma-orange/50"`,
  },
  {
    file: "src/components/settings/RadioManager.tsx",
    what: '"Add Radio" button',
    snippet: `bg-plasma-orange/15 border border-plasma-orange/50
                     text-su-text rounded-lg hover:bg-plasma-orange/20 transition-colors
                     disabled:opacity-40 disabled:cursor-not-allowed"`,
  },
  {
    file: "src/components/settings/ResearchParticipationSettings.tsx",
    what: '"Save Research Choices" button',
    snippet: `bg-plasma-orange/15 text-su-text border border-plasma-orange/30 hover:bg-plasma-orange/20 disabled:cursor-not-allowed disabled:opacity-50"`,
  },
  {
    file: "src/components/settings/WatchAlertSettings.tsx",
    what: "the selected cooldown-preset button",
    snippet: `? "bg-plasma-orange/20 text-su-text border border-plasma-orange/50"`,
  },
  {
    file: "src/components/settings/sections/AppearanceSection.tsx",
    what: '"Apply" custom-theme button',
    snippet: `bg-plasma-orange/15 text-su-text border border-plasma-orange/30 hover:bg-plasma-orange/20 transition-colors"`,
  },
  {
    file: "src/components/settings/sections/CredentialsSection.tsx",
    what: '"Set Up Passphrase" / "Unlock" vault button',
    snippet: `bg-plasma-orange/15 text-su-text border border-plasma-orange/30
                hover:bg-plasma-orange/20 transition-colors"`,
  },
  {
    file: "src/components/settings/sections/CredentialsSection.tsx",
    what: "the per-service store-credential button, unstored state",
    snippet: `: "bg-plasma-orange/15 text-su-text border border-plasma-orange/25 hover:bg-plasma-orange/20"`,
  },
  {
    file: "src/components/settings/sections/DataAccountSection.tsx",
    what: "the account avatar circle",
    snippet: `bg-plasma-orange/20 flex items-center justify-center text-su-text font-bold"`,
  },
  {
    file: "src/components/settings/sections/DataAccountSection.tsx",
    what: '"Sign In" button',
    snippet: `bg-plasma-orange/15 text-su-text hover:bg-plasma-orange/20 border border-plasma-orange/30 transition-colors"`,
  },
  {
    file: "src/components/settings/sections/DataAccountSection.tsx",
    what: '"Export Settings" button',
    snippet: `bg-plasma-orange/15 text-su-text hover:bg-plasma-orange/20
                     border border-plasma-orange/30 transition-colors"`,
  },
  {
    file: "src/components/settings/sections/DataAccountSection.tsx",
    what: '"Confirm Import" button',
    snippet: `bg-plasma-orange/15 text-su-text hover:bg-plasma-orange/20
                           border border-plasma-orange/30 transition-colors
                           disabled:opacity-50 disabled:cursor-not-allowed"`,
  },
  {
    file: "src/components/settings/sections/DataAccountSection.tsx",
    what: '"Export ADIF" button, entries present',
    snippet: `entries.length > 0
                           ? "bg-plasma-orange/15 text-su-text hover:bg-plasma-orange/20 border border-plasma-orange/30"`,
  },
  {
    file: "src/components/settings/sections/DataAccountSection.tsx",
    what: '"Clear Map Cache" button, cache present',
    snippet: `tileCacheCount !== 0 && !isClearingCache
                           ? "bg-plasma-orange/15 text-su-text hover:bg-plasma-orange/20 border border-plasma-orange/30"`,
  },
  {
    file: "src/components/settings/sections/PreferencesSection.tsx",
    what: "the selected custom-band chip",
    snippet: `isSelected
                      ? "bg-plasma-orange/20 text-su-text border-plasma-orange/50"`,
  },
  // Batch 4a (#803): src/components/sdr/, excluding primitives/RadioBadge.tsx
  // (a peer PR's file) and shack/ (the other half of batch 4). 11 files, 11
  // `FIXED_SITES` rows below (Waterfall.tsx's row was pulled this round --
  // see the note past the SdrSettingsModal rows) -- the ledger's 14-site
  // count includes three sites this table cannot, or no longer needs to,
  // certify: FateBandAdvisor.tsx's fix is inside a JSDoc comment (no
  // className= for the guard to locate); SdrSettingsModal's color-palette
  // swatch label draws its ink from a *different element* than the one
  // carrying the `bg-plasma-orange/10` tint (#873); and Waterfall.tsx's
  // label pill no longer carries a `bg-plasma-orange` tint of its own at
  // all (see below), so there is nothing left on that element for a row to
  // certify. All three fixes ship in source; see the PR body.
  //
  // Two more files fixed this round sit entirely outside the 11-file/14-site
  // census above (neither was part of the original sdr/ count, and neither
  // moves the LEDGER): SpotTagOverlay.tsx's `SPOT_MODE_COLORS.FM` and
  // `DEFAULT_SPOT_COLOR` entries keep their tint and ink on two *different
  // properties of the same object* (`bg`/`text`), which a `FIXED_SITES`
  // `classSource` row cannot certify either -- `assertInkOnTintedBranches`
  // pairs a tint and its ink only when they sit inside the *same quoted
  // string*, and the object's separate `line` tint (no ink of its own) trips
  // that check the same way SdrSettingsModal's cross-element case does; a
  // row was tried and fails for exactly that reason, so both fixes ship in
  // source only (Opus review round, PR #890). DevicePicker.tsx's device-type
  // badge carries a `/10` tint below the census's `/15` floor -- outside the
  // census either way -- but its tint and ink *do* sit in one string
  // together, so it gets a normal `FIXED_SITES` row below.
  //
  // The Fate and Flexible skin shells also paint hard-coded backdrops
  // (`#080810`, `#0a0a14`, `#0c0c16`, `#0d0d14`, `black`) under
  // `.su-fixed-dark` rather than the pinned `--su-panel` color; all of
  // those literals are darker than the pinned panel, so any contrast
  // measured against the panel in this table is a safe lower bound there
  // too (monotonicity: a darker backdrop only raises the same-alpha tint's
  // contrast against light ink).
  {
    file: "src/components/sdr/EqBandPanel.tsx",
    what: "the active notch-band button",
    snippet: `"bg-plasma-orange/20 border-plasma-orange/40 text-su-text"`,
    classSource: `const activeClasses = isNotch`,
  },
  {
    file: "src/components/sdr/MemoryPanel.tsx",
    what: "memory bank C's badge color",
    snippet: `C: "bg-plasma-orange/20 text-su-text border-plasma-orange/30",`,
    classSource: `C: "bg-plasma-orange/20`,
  },
  {
    file: "src/components/sdr/SdrSettingsModal.tsx",
    what: '"Auto" line-color button, active state',
    snippet: `lineColor === "auto"
                  ? "bg-plasma-orange/15 text-su-text border-plasma-orange/30"`,
  },
  {
    file: "src/components/sdr/SdrSettingsModal.tsx",
    what: "Blend Mode segmented button, selected state",
    snippet: `blendMode === mode
                  ? "bg-plasma-orange/15 text-su-text border-plasma-orange/30"`,
  },
  // Waterfall.tsx's frequency-marker label pill is deliberately NOT a row
  // here: its static class list already carries `bg-su-panel/90`, and
  // Tailwind emits `.bg-plasma-orange\/N` before `.bg-su-panel\/90` (theme
  // key order -- `plasma-orange` is a top-level color, `su.panel` is
  // declared later, inside the nested `su` namespace, in
  // tailwind.config.js), so an accent fill added to this element can never
  // win the cascade against the panel fill already there -- it would be
  // dead CSS, not a real tint. The orange branch of `labelColorClass`
  // carries no `bg-plasma-orange` for that reason; it uses `text-su-text`,
  // not `text-su-accent-text`, for its ink -- Waterfall's root is scoped
  // under `.su-fixed-dark`, which pins the rendered panel to the fixed-dark
  // color regardless of the active palette, but `--su-accent-text` is
  // computed against the *active palette's* panel, so a pale custom accent
  // could compute safe there while still rendering unsafe here (Codex,
  // ~2.47:1 on the pinned panel); `--su-text` is itself pinned fixed-dark,
  // so it stays fitted to the panel this element actually renders on. There
  // is no accent-tint pairing on this element for `FIXED_SITES` to certify
  // either way (Opus review round, PR #890).
  {
    file: "src/components/sdr/primitives/DspBadge.tsx",
    what: 'the "plasma-orange" active-color variant',
    snippet: `"bg-plasma-orange/20 text-su-text border-plasma-orange/30 shadow-[0_0_6px_rgba(255,107,53,0.15)]",`,
    classSource: `"plasma-orange":`,
  },
  {
    file: "src/components/sdr/shared/RadioControlsCard.tsx",
    what: '"Stop/Start Audio" button, audio-enabled state',
    snippet: `? "bg-plasma-orange/10 border-plasma-orange/30 text-su-text hover:bg-plasma-orange/20"`,
  },
  {
    file: "src/components/sdr/skins/SkinSwitcher.tsx",
    what: "the active skin tab",
    snippet: `activeSkin === skin
              ? "bg-plasma-orange/15 text-su-text"`,
  },
  {
    file: "src/components/sdr/skins/fate/FateBandActivity.tsx",
    what: 'the "NEW" station badge',
    snippet: `bg-plasma-orange/20 text-su-text text-[7px] px-1 rounded font-bold leading-normal"`,
  },
  {
    file: "src/components/sdr/skins/flexible/FlexSideControls.tsx",
    what: "the selected tuning-step button",
    snippet: `tuningStepHz === opt.value
                ? "bg-plasma-orange/15 text-su-text border-plasma-orange/30"`,
  },
  {
    file: "src/components/sdr/skins/flexible/FlexSideControls.tsx",
    what: '"Stop/Start Audio" button, audio-enabled state',
    snippet: `audioEnabled
                ? "bg-plasma-orange/15 border-plasma-orange/30 text-su-text"`,
  },
  {
    file: "src/components/sdr/skins/flexible/SlicePanelTabs.tsx",
    what: "the RIT toggle button, enabled state",
    snippet: `ritEnabled
                ? "bg-plasma-orange/20 border-plasma-orange/30 text-su-text"`,
  },
  {
    file: "src/components/sdr/DevicePicker.tsx",
    what: "device-type badge, non-SDR device (below the /15 census floor)",
    snippet: `: "bg-plasma-orange/10 border-plasma-orange/30 text-su-text"`,
  },
  // Batch 4b (#803): src/components/shack (+ shack/builder), excluding
  // src/components/sdr (batch 4a, #890). 8 files, 11 ledger sites, all 11
  // now certified via FIXED_SITES. NodeConfigPanel.tsx's AccessoryDetail
  // Badge originally shipped as a plain JSX `color="..."` attribute with no
  // `className=` for extractClassNameValue to bind and no safe
  // `classSource` locator (a statement-scan on that JSX line would walk
  // forward through the rest of the component's returned JSX to the
  // function's closing `);`) -- the same shape batch 4a documented for
  // FateBandAdvisor.tsx. Fixed round two: the class string is hoisted to a
  // module-scope `const ACCESSORY_BADGE_CLASS = "...";` declaration and
  // referenced via `color={ACCESSORY_BADGE_CLASS}`, so `classSource` binds
  // a single unambiguous statement. All four managers (AccessoryManager,
  // AntennaManager, FeedlineManager, InlineComponentManager) share an
  // identical "+ Add X" header button; PresetBuilder.tsx and
  // ChainSelector.tsx have no production mount (fixed anyway, both listed
  // for #798). PresetBuilder's preset cards paint their accent wash on
  // `bg-panel/30` over the builder canvas -- a 30%-panel-over-canvas blend
  // sits between the measured panel and canvas endpoints (both clear at
  // `/20`), so it is bounded but not itself a measured surface. Surfaces
  // argued per-site in the PR body; --su-text clears every measured surface
  // at /20 regardless.
  //
  // Fix round two (Opus second-opinion review of PR #891) added three more
  // in-scope #803 sites the per-line census cannot see, and one
  // nested-wash parent:
  // - ChainSelector.tsx's active chain-list row button shared its `isActive`
  //   predicate with the row's own "Active" badge (a /20 accent child), so
  //   the pre-fix `bg-plasma-orange/10 text-su-text` button composited to
  //   0.20 + 0.8x0.10 = 0.28 whenever the badge was showing -- a false
  //   certification the same shape NEUTRALISED_PARENTS already guards
  //   against elsewhere. The button's own wash was neutralised (no
  //   bg-plasma-orange/ token left in its className); see
  //   NEUTRALISED_PARENTS below.
  // - ShackSchematicView.tsx's "Create Your First Signal Path" empty-state
  //   button wrapped its ink onto a different physical line of a multi-line
  //   className than its tint, invisible to the same-line census, and its
  //   hover value exceeded TINT_CAP; both are fixed and certified below.
  // - BuilderCanvas.tsx's drag-from-drawer drop-target icon (an <svg> whose
  //   own className carries the ink) sits inside a sibling <div> whose
  //   className carries the /20 tint -- a cross-element #873 pairing the
  //   per-line census and a FIXED_SITES row both miss, because neither one
  //   judges a child's own className against a parent's. The svg's ink is
  //   fixed in source; it is deliberately NOT a FIXED_SITES row, because a
  //   row on the svg's own className would be vacuous (no bg-plasma-orange/
  //   token in that className for assertInkOnTintedBranches to judge) and
  //   would falsely read as certifying the parent/child pairing -- shipped
  //   but uncertifiable, same treatment #890 used for SpotTagOverlay. The
  //   sibling <p> "Drop here to add" label sits on a DIFFERENT ancestor's
  //   /10 tint and is untouched (below TINT_CAP), as is the /5 ghost radio
  //   icon further down -- both left for the general #873 backlog.
  // - ChainStripPreview.tsx's `getNodeTypeConfig` returns a `{color, bg}`
  //   pair consumed by two different elements (a circle div for `bg`, an
  //   abbreviation span for `color`) -- another #873 cross-element shape,
  //   this time via a config object rather than the DOM. The "radio" case's
  //   ink is fixed in source; also shipped but uncertifiable, for the same
  //   reason as BuilderCanvas above (the tint and ink live in separate
  //   quoted-string branches of the same object literal, so even a clean
  //   `classSource` bind on `case "radio":` would fail
  //   assertInkOnTintedBranches, which judges each quoted segment alone).
  //   The other three cases (accessory/feedline_run/antenna) use non-accent
  //   tokens and belong to #827, untouched.
  {
    file: "src/components/shack/AccessoryManager.tsx",
    what: '"+ Add Accessory" button',
    snippet: `bg-plasma-orange/15 border border-plasma-orange/50 text-su-text hover:bg-plasma-orange/20 transition-colors"`,
  },
  {
    file: "src/components/shack/AntennaManager.tsx",
    what: '"+ Add Antenna" button',
    snippet: `bg-plasma-orange/15 border border-plasma-orange/50
                     text-su-text rounded-lg hover:bg-plasma-orange/20 transition-colors"`,
  },
  {
    file: "src/components/shack/FeedlineManager.tsx",
    what: '"+ Add Feedline" button',
    snippet: `bg-plasma-orange/15 border border-plasma-orange/50 text-su-text hover:bg-plasma-orange/20 transition-colors"`,
  },
  {
    file: "src/components/shack/InlineComponentManager.tsx",
    what: '"+ Add Inline Component" button',
    snippet: `bg-plasma-orange/15 border border-plasma-orange/50 text-su-text hover:bg-plasma-orange/20 transition-colors"`,
  },
  {
    file: "src/components/shack/PresetBuilder.tsx",
    what: '"Active" preset-card badge',
    snippet: `bg-plasma-orange/20 text-su-text border border-plasma-orange/30 uppercase tracking-wider`,
  },
  {
    file: "src/components/shack/PresetBuilder.tsx",
    what: '"Activate" button on a preset card',
    snippet: `bg-plasma-orange/10 border border-plasma-orange/30 text-su-text hover:bg-plasma-orange/20 transition-colors`,
  },
  {
    file: "src/components/shack/PresetBuilder.tsx",
    what: '"+ Create Preset" header button',
    snippet: `bg-plasma-orange/15 border border-plasma-orange/50
                     text-su-text rounded-lg hover:bg-plasma-orange/20 transition-colors
                     disabled:opacity-40 disabled:cursor-not-allowed"`,
  },
  {
    file: "src/components/shack/PresetBuilder.tsx",
    what: 'the preset-edit modal "Save Changes" / "Create Preset" button',
    snippet: `bg-plasma-orange/15 border border-plasma-orange/50 rounded-lg
                         text-su-text hover:bg-plasma-orange/20 transition-colors font-medium text-sm"`,
  },
  {
    file: "src/components/shack/builder/ChainSelector.tsx",
    what: 'the active chain\'s "Active" badge',
    snippet: `shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-plasma-orange/20 text-su-text`,
  },
  {
    file: "src/components/shack/equipmentCardTypes.ts",
    what: "the orange BADGE_STYLES entry",
    snippet: `orange: "bg-plasma-orange/15 text-su-text",`,
    classSource: `orange:`,
  },
  {
    file: "src/components/shack/builder/ShackSchematicView.tsx",
    what: '"Create Your First Signal Path" empty-state button',
    snippet: `rounded-xl text-su-text text-sm font-semibold
              hover:bg-plasma-orange/20 hover:border-plasma-orange/50`,
  },
  {
    file: "src/components/shack/builder/NodeConfigPanel.tsx",
    what: "the accessory-detail Badge, hoisted to a module constant so classSource has a single declaration to bind",
    snippet: `const ACCESSORY_BADGE_CLASS = "bg-plasma-orange/15 text-su-text";`,
    classSource: `const ACCESSORY_BADGE_CLASS =`,
  },
];

describe("the fixed accent-tint sites ship the --su-text treatment (#803)", () => {
  it.each(FIXED_SITES.map((site) => [site.what, site] as const))(
    "%s still ships the class pair this table measures",
    (_what, site) => {
      const source = readFileSync(resolve(REPO_ROOT, site.file), "utf8");
      expect(
        source.includes(site.snippet),
        `${site.file} no longer contains the measured snippet:\n${site.snippet}`,
      ).toBe(true);
      // The measurement is only honest if every tinted branch of the located
      // declaration really carries the ink the table claims -- checked
      // against `locatedClassText`, the same text `measuredAlpha` reads
      // below, not against `site.snippet` alone. A sibling branch of the
      // same declaration that `snippet` never names is judged too.
      assertInkOnTintedBranches(locatedClassText(source, site), site.what);
      expect(
        measuredAlpha(source, site),
        `${site.what} ships a tint above the measured cap`,
      ).toBeLessThanOrEqual(TINT_CAP);
    },
  );

  it.each(
    FIXED_SITES.flatMap((site) =>
      THEMES_IDS.map((theme) => [site.what, theme, site] as const),
    ),
  )(
    "%s clears the floor in %s for every accepted accent",
    (_what, theme, site) => {
      const source = readFileSync(resolve(REPO_ROOT, site.file), "utf8");
      const palette = stationPalettes[theme];
      for (const surface of SURFACES) {
        const { ratio, accent } = worstOnTint(
          palette.text,
          ACCEPTED_GAMUT,
          measuredAlpha(source, site),
          surface.backdrop(palette),
        );
        expect(
          ratio,
          `${site.file} on ${surface.name}: worst accent ${accent}`,
        ).toBeGreaterThanOrEqual(AA);
      }
    },
  );
});

/**
 * Parents whose own `bg-plasma-orange` wash was neutralised to `bg-su-line/10`
 * because a `/N` accent child (an active-filter-count badge, a sibling
 * button with its own rest/hover wash) sits inside them and composites over
 * their rest/hover tint past `TINT_CAP` -- `effective = child + (1 - child) x
 * parent`, which stays above 0.20 even with the child itself capped at `/20`
 * (0.20 + 0.8 x 0.15 = 0.32 rest / 0.20 + 0.8 x 0.20 = 0.36 hover, worse with
 * the parent's original, pre-fix alpha). The per-line census guard below
 * cannot see this: it has no notion of nesting, so a parent restored to a
 * cap-compliant-looking
 * `bg-plasma-orange/15 hover:bg-plasma-orange/20` reads as fine in isolation
 * and every other assertion in this file stays green. This table pins the
 * neutralised treatment by substring instead, so that regression fails loud.
 */
const NEUTRALISED_PARENTS: TintedSite[] = [
  {
    file: "src/components/contest/PendingDraftReplaceBanner.tsx",
    what: "the pending-draft-replace banner container (wraps the Replace button's own accent wash)",
    snippet: `bg-su-line/10 border border-plasma-orange/30`,
  },
  {
    file: "src/components/nets/NetFilterControls.tsx",
    what: 'the "More Filters" toggle, active-filter state (wraps the count badge)',
    snippet: `bg-su-line/10 text-su-text border border-plasma-orange/40 hover:bg-su-line/20`,
  },
  {
    file: "src/components/shack/builder/ChainSelector.tsx",
    what: "a chain-list row button in its active state (shares the isActive predicate with the sibling Active badge, which carries its own /20 accent wash)",
    snippet: `\${isActive ? "bg-su-line/10 text-su-text" : "text-su-muted hover:bg-su-line/10"}`,
  },
];

// `extractClassNameValue` (used below) is defined earlier in this file,
// right after `deriveAlpha` -- it now also backs the whole-className
// measurement `FIXED_SITES` uses (#843 round 3), so it lives next to the
// primitive it wraps rather than down here with its first caller.

describe("neutralised accent-wash parents stay off the accent tint (#803)", () => {
  it.each(NEUTRALISED_PARENTS.map((site) => [site.what, site] as const))(
    "%s carries no accent wash of its own",
    (_what, site) => {
      const source = readFileSync(resolve(REPO_ROOT, site.file), "utf8");
      expect(
        source.includes(site.snippet),
        `${site.file} no longer contains the neutralised snippet:\n${site.snippet}`,
      ).toBe(true);
      // Not "no wash above cap" -- the regression this guards against is a
      // cap-compliant-looking parent wash (e.g. /15 rest -> hover:/20) that
      // still composites past the cap once the nested child is accounted
      // for, which the per-line census guard cannot see. So the rule is: no
      // bg-plasma-orange/ token anywhere in this element's className -- not
      // against the `site.snippet` fixture (a constant that can never fail
      // on its own no matter what the source says) and not just the source
      // line the snippet happens to match, which a multi-line className can
      // route an added token around. `extractClassNameValue` resolves the
      // whole className value the snippet's line belongs to.
      const classNameValue = extractClassNameValue(source, site.snippet);
      expect(
        /bg-plasma-orange\//.test(classNameValue),
        `${site.what} has regained an accent wash of its own`,
      ).toBe(false);
    },
  );
});

describe("census guard: no new accent ink on an accent tint (#803)", () => {
  /**
   * A per-line regex guard, not a className parser: it only sees a tint and
   * accent ink that sit on the SAME source line, exactly like #795's
   * `aurora-purple` guard. A className that wraps its ink onto a second line
   * escapes it by construction -- the `FIXED_SITES` table above is what covers
   * those.
   *
   * The 123 sites below are the census #803 asks for, as a debt ledger rather
   * than an exemption list: each entry is the number of same-line pairings that
   * file carried at `32cf480c`, minus every batch fixed since, and the
   * assertion is `<=`. A file that gains a pairing fails; a file that is not
   * listed is budgeted at zero, so a brand new site fails; a file whose sites
   * get fixed simply passes with room to spare, so the sequenced follow-up PRs
   * (the 78 files outside this agent's scope on #803) never have to touch
   * this table to land. `src/components/ui` is deliberately absent -- see the
   * explicit clause below.
   */
  const LEDGER = new Map<string, number>([
    ["src/App.tsx", 1],
    ["src/components/ErrorBoundary.tsx", 1],
    ["src/components/alerts/StormImpactPanel.tsx", 1],
    ["src/components/alerts/SwpcAlertDetailModal.tsx", 1],
    ["src/components/atmos/AtmosHeader.tsx", 1],
    ["src/components/atmos/ViewSwitcher.tsx", 1],
    ["src/components/atmos/emcomm/ActivationBanner.tsx", 1],
    ["src/components/atmos/emcomm/ActivationModal.tsx", 1],
    ["src/components/atmos/emcomm/EmCommSidebarPanel.tsx", 1],
    ["src/components/atmos/emcomm/FrequencyQuickTune.tsx", 1],
    ["src/components/atmos/emcomm/ICS213Form.tsx", 1],
    ["src/components/auth/AuthRequiredPlaceholder.tsx", 1],
    ["src/components/dx/BandVerdictPanel.tsx", 3],
    ["src/components/dx/ConditionMatchCard.tsx", 1],
    ["src/components/dx/DXConsole.tsx", 1],
    ["src/components/dx/DXSpotList/FilterControls.tsx", 2],
    ["src/components/dx/SkedScheduler.tsx", 1],
    ["src/components/dx/WSJTXStatusPanel.tsx", 1],
    ["src/components/dx/WorkStationPanel.tsx", 1],
    ["src/components/export/ExportModal.tsx", 1],
    ["src/components/guest/CreateGuestSessionModal.tsx", 2],
    ["src/components/help/HelpCategoryCard.tsx", 1],
    ["src/components/kiosk/KioskChrome.tsx", 1],
    ["src/components/kiosk/LaunchWallSection.tsx", 1],
    ["src/components/kiosk/WallClockDisplay.tsx", 1],
    ["src/components/layout/Header.tsx", 6],
    ["src/components/layout/MobileHeader.tsx", 2],
    ["src/components/location/QuickLocationDialog.tsx", 1],
    ["src/components/logbook/AwardsTracker.tsx", 1],
    ["src/components/logbook/QSLManager.tsx", 1],
    ["src/components/map/BandConditionsPanel.tsx", 1],
    ["src/components/map/GlobeUnavailable.tsx", 1],
    ["src/components/map/MapToolbarSecondaryControls.tsx", 2],
    ["src/components/map/PathAnalysis.tsx", 9],
    ["src/components/map/ProToolbarRibbon.tsx", 1],
    ["src/components/map/PropagationForecastMini.tsx", 3],
    ["src/components/map/ReplayIndicator.tsx", 1],
    ["src/components/map/TimeControl.tsx", 3],
    ["src/components/mobile/MobileDXWizard.tsx", 2],
    ["src/components/onboarding/RadioSetupWizard.tsx", 4],
    ["src/components/onboarding/WelcomeOverlay.tsx", 3],
    ["src/components/operating/BandModeModalContent.tsx", 1],
    ["src/components/operating/BandModeSelector.tsx", 1],
    ["src/components/ops/OpsConsole.tsx", 2],
    ["src/components/ops/OpsLoggerStrip.tsx", 1],
    ["src/components/ops/TurnBeamControl.tsx", 1],
    ["src/components/profile/ActivityFeed.tsx", 1],
    ["src/components/profile/FriendList.tsx", 1],
    ["src/components/profile/LicenseCard.tsx", 1],
    ["src/components/profile/LicenseHistory.tsx", 1],
    ["src/components/profile/ProfileTabBar.tsx", 1],
    ["src/components/profile/QRCodeModal.tsx", 2],
    ["src/components/profile/VisibilitySettings.tsx", 1],
    ["src/components/profile/VisitorProfileCard.tsx", 1],
    ["src/components/qso/ConflictResolutionModal.tsx", 1],
    ["src/components/qso/FilterChips.tsx", 1],
    ["src/components/qso/FrequencyInput.tsx", 1],
    ["src/components/qso/QSOSyncStatusIndicator.tsx", 2],
    ["src/components/radio/RadioPickerModal.tsx", 4],
    ["src/components/satellites/SatelliteFilterControls.tsx", 4],
    // Batch 4a (#803) landed all 14 sdr/ sites: EqBandPanel.tsx (1),
    // MemoryPanel.tsx (1), SdrSettingsModal.tsx (2), Waterfall.tsx (1),
    // primitives/DspBadge.tsx (1), shared/RadioControlsCard.tsx (1),
    // skins/SkinSwitcher.tsx (1), skins/fate/FateBandActivity.tsx (1),
    // skins/fate/FateBandAdvisor.tsx (1, a JSDoc-comment example the census
    // regex reads like code), skins/flexible/FlexSideControls.tsx (2),
    // skins/flexible/SlicePanelTabs.tsx (1) -- all down to 0, so none of
    // those files appear in this ledger anymore.
    // WatchAlertSettings.tsx is not listed: its TestSoundButton fix already
    // ships (capped /30->/20, ink swapped to --su-text), so this file's
    // same-line text-plasma-orange count is 0 -- the census guard only sees
    // classes, not animation. The site is not FIXED_SITES-certified because
    // the button's icon carries animate-pulse on that same --su-text ink
    // while isPlaying, which invalidates certified contrast for half of
    // every cycle; that certification gap is deferred to #847, but it is
    // not expressed as a ledger budget since there is no longer an
    // ink-on-tint pairing for the census to find.
    ["src/components/settings/sections/SubscriptionSection.tsx", 1],
    ["src/components/solar/modals/SolarSummaryModal.tsx", 1],
    ["src/pages/AwardsPage.tsx", 1],
    ["src/pages/BandPlanner.tsx", 1],
    ["src/pages/BridgeInfoPage.tsx", 1],
    ["src/pages/ContestExplorerPage.tsx", 2],
    ["src/pages/DXWizard.tsx", 2],
    ["src/pages/DisplaysPage.tsx", 1],
    ["src/pages/FeaturesPage.tsx", 1],
    ["src/pages/KioskPage.tsx", 3],
    ["src/pages/NetAnalyticsPage.tsx", 1],
    ["src/pages/NetControllerPage.tsx", 3],
    ["src/pages/NetDetailPage.tsx", 1],
    ["src/pages/PairClaimPage.tsx", 1],
    ["src/pages/PropSphere.tsx", 1],
    ["src/pages/SettingsPage.tsx", 1],
  ]);

  /**
   * `text-su-text` on an accent tint is measured safe to `/20` over the whole
   * accepted range; above that only the accents the app ships clear the floor
   * (>= 5.19:1), while a near-white or near-black custom accent drops to
   * 3.70-4.21:1. These two `/30` sites predate #803 and sit in
   * `src/components/alerts`, outside this agent's file scope; they go into the
   * same sequenced follow-up as the 123 above.
   */
  const ABOVE_CAP_LEDGER = new Map<string, number>([
    ["src/components/alerts/AlertRuleBuilder.tsx", 1],
    ["src/components/alerts/ContestAlertProfiles.tsx", 1],
  ]);

  const TINT_RE = /bg-plasma-orange\/(?:1[5-9]|[2-9]\d|100)\b/;
  const ACCENT_INK_RE = /text-plasma-orange\b/;
  const ABOVE_CAP_TINT_RE = /bg-plasma-orange\/(?:2[5-9]|[3-9]\d|100)\b/;
  const NEUTRAL_INK_RE = /text-su-text\b/;

  // Scans .ts/.tsx only and skips anything matching .test. -- a pairing
  // parked in a *.test.tsx fixture or a .css file is outside this census.
  function walk(dir: string, files: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
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

  /** file -> count of lines matching `tint` and `ink`, across `src/**`. */
  function census(tint: RegExp, ink: RegExp): Map<string, number> {
    const counts = new Map<string, number>();
    for (const file of walk(resolve(REPO_ROOT, "src"))) {
      const relPath = relative(REPO_ROOT, file);
      for (const line of readFileSync(file, "utf8").split("\n")) {
        if (tint.test(line) && ink.test(line)) {
          counts.set(relPath, (counts.get(relPath) ?? 0) + 1);
        }
      }
    }
    return counts;
  }

  it("has no file over its accent-ink budget", () => {
    const counts = census(TINT_RE, ACCENT_INK_RE);
    const over: string[] = [];
    for (const [file, count] of counts) {
      const budget = LEDGER.get(file) ?? 0;
      if (count > budget) over.push(`${file}: ${count} > ${budget} budgeted`);
    }
    expect(
      over,
      `new same-line text-plasma-orange on a >=15 plasma-orange tint:\n${over.join("\n")}`,
    ).toEqual([]);
    // The ledger only ever shrinks; a fix that lands must not be able to raise
    // the total past the census this PR measured.
    expect([...counts.values()].reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(
      123,
    );
  });

  it("keeps src/components/ui free of accent ink on an accent tint", () => {
    const offenders = [...census(TINT_RE, ACCENT_INK_RE).keys()].filter(
      (file) => file.startsWith("src/components/ui/"),
    );
    expect(
      offenders,
      `shared design-system components must ship the --su-text treatment:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("has no new --su-text label on a tint above the measured /20 cap", () => {
    const counts = census(ABOVE_CAP_TINT_RE, NEUTRAL_INK_RE);
    const over: string[] = [];
    for (const [file, count] of counts) {
      const budget = ABOVE_CAP_LEDGER.get(file) ?? 0;
      if (count > budget) over.push(`${file}: ${count} > ${budget} budgeted`);
    }
    expect(
      over,
      `same-line text-su-text on a plasma-orange tint above /${TINT_CAP * 100}:\n${over.join("\n")}`,
    ).toEqual([]);
  });
});

/**
 * Status-token same-hue tints (#844)
 *
 * #803 measured `--su-text` on a user-chosen `plasma-orange` tint. The same
 * pairing exists on the four *fixed* status tokens (`signal-green` /
 * `caution-amber` / `alert-red` / `nebula-blue`): the ink is the token's
 * own channels composited over the surface at `N/100`. Light/green on
 * canvas is the cell that fails AA (issue #844: 4.46:1 at /20). The
 * treatment is the same as #803: keep the tint (cap `/20`), draw the
 * label in `--su-text`. Status is never colour-alone -- the wash plus the
 * word on the chip remain.
 *
 * `STATUS_FIXED_SITES` is the #803 `FIXED_SITES` table for these tokens.
 * Batch 1 lands the named same-row siblings (ActivationPanel POTA vs SOTA,
 * SubscribeButton / TuneToNetButton subscribed/tuned vs idle) plus the
 * other same-line `src/components/nets/` green sites that fit the 15-file
 * cap. The census ledgers below budget every remaining same-line pairing
 * at alpha >= 0.15 so a new site fails; a file that joins this table is
 * simply omitted (budget 0).
 */
type StatusToken =
  | "signal-green"
  | "caution-amber"
  | "alert-red"
  | "nebula-blue";

interface StatusTintedSite extends TintedSite {
  token: StatusToken;
  parentClassSnippet?: string;
}

function statusTintHex(
  palette: StationPalette,
  token: StatusToken,
): string {
  switch (token) {
    case "signal-green":
      return palette.success;
    case "caution-amber":
      return palette.warning;
    case "alert-red":
      return palette.danger;
    case "nebula-blue":
      return palette.panel;
  }
}

function deriveStatusAlpha(text: string, token: StatusToken): number {
  const re = new RegExp(`bg-${token}/(\\d+)`, "g");
  const alphas = [...text.matchAll(re)].map((m) => Number(m[1]));
  return Math.max(...alphas) / 100;
}

function measuredStatusAlpha(source: string, site: StatusTintedSite): number {
  const ownClasses = locatedClassText(source, site);
  if (site.parentClassSnippet) {
    // This badge deliberately has no status wash: it inherits its parent's.
    // A new nested wash must fail, not be measured independently at /20.
    expect(ownClasses).not.toMatch(new RegExp(`bg-${site.token}/`));
    return deriveStatusAlpha(
      extractClassNameValue(source, site.parentClassSnippet),
      site.token,
    );
  }
  return deriveStatusAlpha(ownClasses, site.token);
}

function assertStatusInkOnTintedBranches(
  text: string,
  what: string,
  token: StatusToken,
): void {
  const tintRe = new RegExp(`bg-${token}/`);
  const sameHueInk = `text-${token}`;
  for (const branch of tintedBranches(text)) {
    if (!tintRe.test(branch)) {
      continue;
    }
    expect(
      branch.includes("text-su-text"),
      `${what}: a bg-${token} branch does not carry text-su-text:\n${branch}`,
    ).toBe(true);
    expect(
      branch.includes(sameHueInk),
      `${what}: a bg-${token} branch draws same-hue ink on its own tint again:\n${branch}`,
    ).toBe(false);
  }
}

const STATUS_FIXED_SITES: StatusTintedSite[] = [
  {
    file: "src/components/activation/ActivationPanel.tsx",
    what: "the POTA type-selector button, selected state",
    snippet: `? "bg-signal-green/20 text-su-text border-2 border-signal-green/40"`,
    token: "signal-green",
  },
  {
    file: "src/components/activation/ActivationPanel.tsx",
    what: "the active-activation type badge (POTA)",
    snippet: `? "bg-signal-green/20 text-su-text"`,
    classSource: `const typeBadgeClasses =`,
    token: "signal-green",
  },
  {
    file: "src/components/activation/ActivationPanel.tsx",
    what: "the threshold-met chip",
    snippet: `rounded-full bg-signal-green/10 text-su-text text-xs font-medium"`,
    token: "signal-green",
  },
  {
    file: "src/components/activation/ActivationPanel.tsx",
    what: "the Export ADIF button",
    snippet: `bg-nebula-blue/20 text-su-text border border-nebula-blue/20
                       hover:bg-nebula-blue/20 active:scale-[0.98]`,
    token: "nebula-blue",
  },
  {
    file: "src/components/activation/ActivationPanel.tsx",
    what: "the End Activation button",
    snippet: `bg-alert-red/10 text-su-text border border-alert-red/20
                         hover:bg-alert-red/20 active:scale-[0.98]`,
    token: "alert-red",
  },
  {
    file: "src/components/nets/SubscribeButton.tsx",
    what: "the Subscribed state",
    snippet: `? "bg-signal-green/15 text-su-text border-signal-green/30"`,
    token: "signal-green",
  },
  {
    file: "src/components/nets/TuneToNetButton.tsx",
    what: "the copied clipboard-fallback button",
    snippet: `const copyColors = copied
      ? "bg-signal-green/20 text-su-text border border-signal-green/30 shadow-[0_0_12px_rgba(34,197,94,0.25)]"`,
    classSource: `const copyColors =`,
    token: "signal-green",
  },
  {
    file: "src/components/nets/TuneToNetButton.tsx",
    what: "the Tuned state",
    snippet: `phase === "tuned"
      ? "bg-signal-green/20 text-su-text border border-signal-green/30 shadow-[0_0_12px_rgba(34,197,94,0.25)]"`,
    classSource: `const colors =`,
    token: "signal-green",
  },
  {
    file: "src/components/nets/RSVPButton.tsx",
    what: "the RSVP'd button",
    snippet: `"bg-signal-green/15 text-su-text border-signal-green/30 hover:bg-signal-green/20"`,
    token: "signal-green",
  },
  {
    file: "src/components/nets/RSVPButton.tsx",
    what: "the RSVP count badge, RSVP'd state",
    snippet: `? "text-su-text"`,
    parentClassSnippet: `"bg-signal-green/15 text-su-text border-signal-green/30 hover:bg-signal-green/20"`,
    token: "signal-green",
  },
  {
    file: "src/components/nets/CheckinList.tsx",
    what: "the checked-in status badge",
    snippet: `className: "bg-signal-green/15 text-su-text border-signal-green/50",`,
    classSource: `checked_in: {`,
    token: "signal-green",
  },
  {
    file: "src/components/nets/CheckinPhase.tsx",
    what: "the check-in count badge, populated state",
    snippet: `"bg-signal-green/20 text-su-text border border-signal-green/30"`,
    token: "signal-green",
  },
  {
    file: "src/components/nets/SmartNetFinder.tsx",
    what: 'the "Newcomer OK" badge',
    snippet: `shrink-0 bg-signal-green/15 text-su-text text-[10px] rounded-full px-2 py-0.5"`,
    token: "signal-green",
  },
  {
    file: "src/components/nets/PropagationNetSuggestions.tsx",
    what: "an open-band pill",
    snippet: `bg-signal-green/20 text-su-text text-[10px] rounded-full px-2 py-0.5 uppercase tracking-wide"`,
    token: "signal-green",
  },
  {
    file: "src/components/nets/PropagationNetSuggestions.tsx",
    what: 'the "Newcomer OK" badge',
    snippet: `shrink-0 bg-signal-green/15 text-su-text text-[10px] rounded-full px-2 py-0.5"`,
    token: "signal-green",
  },
  {
    file: "src/components/nets/ProtocolCheatSheet.tsx",
    what: 'the "Newcomer Friendly" badge',
    snippet: `inline-flex items-center gap-1.5 bg-signal-green/15 text-su-text border border-signal-green/30 rounded-full`,
    token: "signal-green",
  },
  {
    file: "src/components/nets/NetFilterControls.tsx",
    what: "the Newcomer Friendly pill, selected state",
    snippet: `? "bg-signal-green/20 text-su-text border-signal-green/40"`,
    token: "signal-green",
  },
  {
    file: "src/components/nets/PhaseIndicator.tsx",
    what: "a completed (not current) phase pill",
    snippet: `? "text-su-text font-medium bg-signal-green/15 hover:bg-su-line/10 cursor-pointer"`,
    token: "signal-green",
  },
];

describe("same-hue status ink fails AA on Light canvas (#844)", () => {
  it("signal-green on its own /20 tint misses 4.5 on Light canvas", () => {
    const light = stationPalettes.light;
    const ratio = stationContrast(
      light.success,
      compositeOnSurface(light.success, 0.2, light.canvas),
    );
    expect(ratio).toBeLessThan(AA);
    expect(ratio).toBeCloseTo(4.46, 2);
  });

  it("--su-text on that same /20 tint clears the floor", () => {
    const light = stationPalettes.light;
    const ratio = stationContrast(
      light.text,
      compositeOnSurface(light.success, 0.2, light.canvas),
    );
    expect(ratio).toBeGreaterThanOrEqual(AA);
  });
});

describe("the fixed status-tint sites ship the --su-text treatment (#844)", () => {
  it.each(STATUS_FIXED_SITES.map((site) => [site.what, site] as const))(
    "%s still ships the class pair this table measures",
    (_what, site) => {
      const source = readFileSync(resolve(REPO_ROOT, site.file), "utf8");
      expect(
        source.includes(site.snippet),
        `${site.file} no longer contains the measured snippet:\n${site.snippet}`,
      ).toBe(true);
      assertStatusInkOnTintedBranches(
        locatedClassText(source, site),
        site.what,
        site.token,
      );
      expect(
        measuredStatusAlpha(source, site),
        `${site.what} ships a tint above the measured cap`,
      ).toBeLessThanOrEqual(TINT_CAP);
    },
  );

  it.each(
    STATUS_FIXED_SITES.flatMap((site) =>
      THEMES_IDS.map((theme) => [site.what, theme, site] as const),
    ),
  )(
    "%s clears the floor in %s for --su-text on the status tint",
    (_what, theme, site) => {
      const source = readFileSync(resolve(REPO_ROOT, site.file), "utf8");
      const palette = stationPalettes[theme];
      const alpha = measuredStatusAlpha(source, site);
      const tintHex = statusTintHex(palette, site.token);
      for (const surface of SURFACES) {
        const ratio = stationContrast(
          palette.text,
          compositeOnSurface(tintHex, alpha, surface.backdrop(palette)),
        );
        expect(
          ratio,
          `${site.file} on ${surface.name} at alpha ${alpha}`,
        ).toBeGreaterThanOrEqual(AA);
      }
    },
  );
});

describe("census guard: no new same-hue status ink on a status tint (#844)", () => {
  /**
   * Per-line regex, same contract as the #803 plasma-orange ledger: a tint
   * and same-hue ink on the SAME source line, alpha >= 15. Files in
   * `STATUS_FIXED_SITES` are omitted (budget 0). A file that is not listed
   * is also budgeted at zero, so a brand new site fails. Sequenced
   * follow-up batches never have to raise these maps -- they only shrink.
   */
  const SIGNAL_GREEN_LEDGER = new Map<string, number>([
    ["src/App.tsx", 1],
    ["src/components/activation/ParkSearch.tsx", 1],
    ["src/components/alerts/StormImpactPanel.tsx", 1],
    ["src/components/alerts/SwpcAlertDetailModal.tsx", 1],
    ["src/components/atmos/emcomm/ICS213Form.tsx", 1],
    ["src/components/atmos/emcomm/SitRepForm.tsx", 1],
    ["src/components/contest/ContestCalendar.tsx", 3],
    ["src/components/contest/ContestExplorerCard.tsx", 1],
    ["src/components/contest/ContestOneLineEntry.tsx", 1],
    ["src/components/contest/ContestScoreShare.tsx", 1],
    ["src/components/contest/ContestScoreboard.tsx", 1],
    ["src/components/contest/ContestSpotsPanel.tsx", 2],
    ["src/components/contest/MobileContestEntry.tsx", 1],
    ["src/components/contest/MultiplierMatrix.tsx", 2],
    ["src/components/contest/MultiplierTracker.tsx", 4],
    ["src/components/contest/NeededMultsPanel.tsx", 1],
    ["src/components/contest/QuietBandNav.tsx", 1],
    ["src/components/contest/StationEstimate.tsx", 1],
    ["src/components/dx/BandVerdictPanel.tsx", 1],
    ["src/components/dx/DXConsole.tsx", 2],
    ["src/components/dx/LogStatsCard.tsx", 1],
    ["src/components/dx/SkedScheduler.tsx", 1],
    ["src/components/dx/WSJTXStatusPanel.tsx", 1],
    ["src/components/export/ExportModal.tsx", 1],
    ["src/components/guest/CreateGuestSessionModal.tsx", 1],
    ["src/components/location/QuickLocationDialog.tsx", 1],
    ["src/components/logbook/AwardsTracker.tsx", 2],
    ["src/components/logbook/CallsignLookup.tsx", 1],
    ["src/components/map/ActivationDetailPanel.tsx", 1],
    ["src/components/map/BandConditionsHeader.tsx", 1],
    ["src/components/map/BandConditionsPanel.tsx", 2],
    ["src/components/map/DateTimePicker.tsx", 1],
    ["src/components/map/OptimalBandsPanel.tsx", 1],
    ["src/components/map/RecommendationsPanel.tsx", 1],
    ["src/components/map/ViewsPopover.tsx", 1],
    ["src/components/map/WatchPopover.tsx", 2],
    ["src/components/map/modals/PropagationForecastModal.tsx", 1],
    ["src/components/mobile/MobileLogbook.tsx", 1],
    ["src/components/onboarding/RadioSetupWizard.tsx", 1],
    ["src/components/operating/BandSuggestToast.tsx", 1],
    ["src/components/ops/OpsConsole.tsx", 1],
    ["src/components/ops/OpsLoggerStrip.tsx", 1],
    ["src/components/profile/ActivityFeed.tsx", 1],
    ["src/components/profile/CallsignLookupSuggestions.tsx", 1],
    ["src/components/profile/LicenseCard.tsx", 1],
    ["src/components/profile/LicenseHistory.tsx", 1],
    ["src/components/profile/PrivilegeMatrix.tsx", 1],
    ["src/components/profile/VisitorProfileCard.tsx", 1],
    ["src/components/qso/ConflictResolutionModal.tsx", 1],
    ["src/components/qso/QSOSyncStatusIndicator.tsx", 1],
    ["src/components/qso/QslStatusIcons.tsx", 1],
    ["src/components/satellites/SatelliteCard.tsx", 1],
    ["src/components/satellites/SatelliteDetailModal.tsx", 3],
    ["src/components/satellites/SatelliteFilterControls.tsx", 1],
    ["src/components/sdr/EqBandPanel.tsx", 1],
    ["src/components/sdr/Ft8BandPresetBar.tsx", 1],
    ["src/components/sdr/Ft8DecoderPanel.tsx", 1],
    ["src/components/sdr/MemoryPanel.tsx", 1],
    ["src/components/sdr/SdrSettingsModal.tsx", 1],
    ["src/components/sdr/Waterfall.tsx", 1],
    ["src/components/sdr/primitives/DspBadge.tsx", 1],
    ["src/components/sdr/primitives/GainSlider.tsx", 1],
    ["src/components/sdr/shared/RadioControlsCard.tsx", 1],
    ["src/components/sdr/skins/fate/FateBandActivity.tsx", 1],
    ["src/components/sdr/skins/fate/FateTopBar.tsx", 3],
    ["src/components/sdr/skins/flexible/FlexSideControls.tsx", 2],
    ["src/components/sdr/skins/flexible/SlicePanelAud.tsx", 1],
    ["src/components/sdr/skins/flexible/SlicePanelDsp.tsx", 1],
    ["src/components/settings/CATSettings.tsx", 1],
    ["src/components/settings/sections/CredentialsSection.tsx", 1],
    ["src/components/shack/BandCapabilityStrip.tsx", 1],
    ["src/components/shack/EquipmentDetailModal.tsx", 2],
    ["src/components/shack/EquipmentHeroCard.tsx", 1],
    ["src/components/shack/builder/NodeConfigPanel.tsx", 1],
    ["src/components/shack/equipmentCardTypes.ts", 1],
    ["src/components/ui/PanelCard.tsx", 1],
    ["src/components/ui/ShareModal.tsx", 1],
    ["src/hooks/useQsoBadge.ts", 1],
    ["src/pages/Contest.tsx", 1],
    ["src/pages/FeaturesPage.tsx", 1],
    ["src/pages/SetupGuidePage.tsx", 1],
  ]);

  const CAUTION_AMBER_LEDGER = new Map<string, number>([
    ["src/components/alerts/AlertDetailModal.tsx", 1],
    ["src/components/alerts/StormImpactPanel.tsx", 1],
    ["src/components/alerts/SwpcAlertDetailModal.tsx", 1],
    ["src/components/atmos/AtmosHeader.tsx", 1],
    ["src/components/atmos/emcomm/ActivationBanner.tsx", 1],
    ["src/components/atmos/emcomm/ActivationModal.tsx", 1],
    ["src/components/atmos/emcomm/ICS213Form.tsx", 1],
    ["src/components/atmos/emcomm/SkywarnBadge.tsx", 1],
    ["src/components/contest/AuditQueuePanel.tsx", 1],
    ["src/components/contest/ContestCalendar.tsx", 2],
    ["src/components/contest/ContestExplorerCard.tsx", 1],
    ["src/components/contest/StationEstimate.tsx", 1],
    ["src/components/dx/DXSpotList/DXSpotList.tsx", 1],
    ["src/components/location/QuickLocationControl.tsx", 2],
    ["src/components/map/BandConditionsHeader.tsx", 1],
    ["src/components/map/BandConditionsPanel.tsx", 1],
    ["src/components/map/OptimalBandsPanel.tsx", 1],
    ["src/components/map/ProToolbarRibbon.tsx", 1],
    ["src/components/map/WatchPopover.tsx", 2],
    ["src/components/map/modals/PropagationForecastModal.tsx", 1],
    ["src/components/ops/OpsConsole.tsx", 1],
    ["src/components/profile/ActivityFeed.tsx", 1],
    ["src/components/profile/LicenseCard.tsx", 1],
    ["src/components/profile/PrivilegeMatrix.tsx", 1],
    ["src/components/qso/BandMapControls.tsx", 1],
    ["src/components/qso/ConflictBadge.tsx", 1],
    ["src/components/qso/ContestQslBatch.tsx", 1],
    ["src/components/qso/DxccStatusBadge.tsx", 1],
    ["src/components/satellites/SatelliteCard.tsx", 1],
    ["src/components/satellites/SatelliteDetailModal.tsx", 3],
    ["src/components/sdr/MemoryPanel.tsx", 1],
    ["src/components/sdr/primitives/DspBadge.tsx", 1],
    ["src/components/sdr/primitives/RadioBadge.tsx", 1],
    ["src/components/sdr/skins/fate/FateBandActivity.tsx", 1],
    ["src/components/sdr/skins/fate/FateBandAdvisor.tsx", 1],
    ["src/components/sdr/skins/flexible/SlicePanelTabs.tsx", 1],
    ["src/components/settings/sections/SubscriptionSection.tsx", 1],
    ["src/components/settings/spots/LibraryConfirmDialog.tsx", 1],
    ["src/components/shack/builder/NodeConfigPanel.tsx", 1],
    ["src/components/shack/equipmentCardTypes.ts", 1],
  ]);

  const ALERT_RED_LEDGER = new Map<string, number>([
    ["src/components/alerts/AlertDetailModal.tsx", 1],
    ["src/components/alerts/AlertHistoryModal.tsx", 1],
    ["src/components/alerts/SpotAlertToast.tsx", 1],
    ["src/components/alerts/StormImpactPanel.tsx", 1],
    ["src/components/alerts/SwpcAlertDetailModal.tsx", 1],
    ["src/components/atmos/AtmosHeader.tsx", 1],
    ["src/components/atmos/WeatherAlertToast.tsx", 1],
    ["src/components/atmos/emcomm/ActivationBanner.tsx", 1],
    ["src/components/atmos/emcomm/ActivationModal.tsx", 1],
    ["src/components/atmos/emcomm/EmCommQuickActions.tsx", 1],
    ["src/components/atmos/emcomm/ICS213Form.tsx", 1],
    ["src/components/cluster/ClusterConnectionForm.tsx", 1],
    ["src/components/contest/AuditQueuePanel.tsx", 1],
    ["src/components/contest/BandAdvisor.tsx", 1],
    ["src/components/contest/ContestCalendar.tsx", 1],
    ["src/components/contest/ContestEntryForm.tsx", 1],
    ["src/components/contest/ContestLiteHudPill.tsx", 1],
    ["src/components/contest/ContestOneLineEntry.tsx", 1],
    ["src/components/contest/ContestQSOTable.tsx", 1],
    ["src/components/contest/ContestRunControls.tsx", 1],
    ["src/components/contest/ContestSpotsPanel.tsx", 1],
    ["src/components/contest/ContestTimer.tsx", 1],
    ["src/components/contest/ContestVoiceControls.tsx", 1],
    ["src/components/contest/EndContestModal.tsx", 1],
    ["src/components/contest/RigStatusBar.tsx", 1],
    ["src/components/dx/DXConsole.tsx", 1],
    ["src/components/dx/DXSpotList/DXSpotList.tsx", 1],
    ["src/components/dx/SkedScheduler.tsx", 1],
    ["src/components/dx/WSJTXStatusPanel.tsx", 1],
    ["src/components/guest/CreateGuestSessionModal.tsx", 1],
    ["src/components/guest/GuestModeToggle.tsx", 1],
    ["src/components/map/ProToolbarRibbon.tsx", 1],
    ["src/components/map/WatchPopover.tsx", 1],
    ["src/components/nets/CloseoutPhase.tsx", 1],
    ["src/components/qso/QSOBulkActions.tsx", 1],
    ["src/components/qso/QSODetailModal.tsx", 1],
    ["src/components/qso/QSOSyncStatusIndicator.tsx", 1],
    ["src/components/satellites/SatelliteCard.tsx", 1],
    ["src/components/satellites/SatelliteDetailModal.tsx", 3],
    ["src/components/sdr/EqBandPanel.tsx", 1],
    ["src/components/sdr/MemoryPanel.tsx", 1],
    ["src/components/sdr/SdrConsoleHeader.tsx", 1],
    ["src/components/sdr/Waterfall.tsx", 1],
    ["src/components/sdr/primitives/DspBadge.tsx", 1],
    ["src/components/sdr/primitives/RadioBadge.tsx", 1],
    ["src/components/sdr/shared/RadioControlsCard.tsx", 1],
    ["src/components/sdr/shared/RadioDeviceCard.tsx", 1],
    ["src/components/sdr/skins/flexible/FlexSideControls.tsx", 2],
    ["src/components/settings/CATSettings.tsx", 1],
    ["src/components/settings/LocationManager.tsx", 1],
    ["src/components/settings/ResearchParticipationSettings.tsx", 1],
    ["src/components/settings/sections/DataAccountSection.tsx", 1],
    ["src/components/settings/spots/LibraryConfirmDialog.tsx", 1],
    ["src/components/shack/BandCapabilityStrip.tsx", 1],
    ["src/components/shack/PresetBuilder.tsx", 1],
    ["src/components/shack/builder/NodeConfigPanel.tsx", 1],
    ["src/components/shack/equipmentCardTypes.ts", 1],
    ["src/hooks/useQsoBadge.ts", 1],
    ["src/pages/Contest.tsx", 2],
    ["src/pages/DisplaysPage.tsx", 1],
  ]);

  const NEBULA_BLUE_LEDGER = new Map<string, number>([
    ["src/components/atmos/AtmosHeader.tsx", 1],
    ["src/components/atmos/emcomm/ActivationModal.tsx", 1],
    ["src/components/atmos/emcomm/ICS213Form.tsx", 1],
    ["src/components/contest/ContestCalendar.tsx", 2],
    ["src/components/contest/ContestExplorerCard.tsx", 1],
    ["src/components/contest/StationEstimate.tsx", 1],
    ["src/components/map/ProToolbarRibbon.tsx", 1],
    ["src/components/map/layers/SatMatchPanel.tsx", 1],
    ["src/components/nets/NetSessionHistory.tsx", 1],
    ["src/components/profile/ActivityFeed.tsx", 1],
    ["src/components/profile/CallsignLookupSuggestions.tsx", 1],
    ["src/components/profile/LicenseCard.tsx", 1],
    ["src/components/qso/BandMapControls.tsx", 1],
    ["src/components/qso/QSOSyncStatusIndicator.tsx", 1],
    ["src/components/sdr/MemoryPanel.tsx", 1],
    ["src/components/settings/sections/DataAccountSection.tsx", 1],
    ["src/components/shack/builder/NodeConfigPanel.tsx", 4],
  ]);

  const SIGNAL_GREEN_TINT_RE = /bg-signal-green\/(?:1[5-9]|[2-9]\d|100)\b/;
  const SIGNAL_GREEN_INK_RE = /text-signal-green\b/;
  const CAUTION_AMBER_TINT_RE = /bg-caution-amber\/(?:1[5-9]|[2-9]\d|100)\b/;
  const CAUTION_AMBER_INK_RE = /text-caution-amber\b/;
  const ALERT_RED_TINT_RE = /bg-alert-red\/(?:1[5-9]|[2-9]\d|100)\b/;
  const ALERT_RED_INK_RE = /text-alert-red\b/;
  const NEBULA_BLUE_TINT_RE = /bg-nebula-blue\/(?:1[5-9]|[2-9]\d|100)\b/;
  const NEBULA_BLUE_INK_RE = /text-nebula-blue\b/;

  function walk(dir: string, files: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
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

  function census(tint: RegExp, ink: RegExp): Map<string, number> {
    const counts = new Map<string, number>();
    for (const file of walk(resolve(REPO_ROOT, "src"))) {
      const relPath = relative(REPO_ROOT, file);
      for (const line of readFileSync(file, "utf8").split("\n")) {
        if (tint.test(line) && ink.test(line)) {
          counts.set(relPath, (counts.get(relPath) ?? 0) + 1);
        }
      }
    }
    return counts;
  }

  function overBudget(
    counts: Map<string, number>,
    ledger: Map<string, number>,
  ): string[] {
    const over: string[] = [];
    for (const [file, count] of counts) {
      const budget = ledger.get(file) ?? 0;
      if (count > budget) over.push(`${file}: ${count} > ${budget} budgeted`);
    }
    return over;
  }

  it("has no file over its signal-green ink budget", () => {
    const counts = census(SIGNAL_GREEN_TINT_RE, SIGNAL_GREEN_INK_RE);
    const over = overBudget(counts, SIGNAL_GREEN_LEDGER);
    expect(
      over,
      `new same-line text-signal-green on a >=15 signal-green tint:\n${over.join("\n")}`,
    ).toEqual([]);
    expect([...counts.values()].reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(
      98,
    );
  });

  it("has no file over its caution-amber ink budget", () => {
    const counts = census(CAUTION_AMBER_TINT_RE, CAUTION_AMBER_INK_RE);
    const over = overBudget(counts, CAUTION_AMBER_LEDGER);
    expect(
      over,
      `new same-line text-caution-amber on a >=15 caution-amber tint:\n${over.join("\n")}`,
    ).toEqual([]);
    expect([...counts.values()].reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(
      45,
    );
  });

  it("has no file over its alert-red ink budget", () => {
    const counts = census(ALERT_RED_TINT_RE, ALERT_RED_INK_RE);
    const over = overBudget(counts, ALERT_RED_LEDGER);
    expect(
      over,
      `new same-line text-alert-red on a >=15 alert-red tint:\n${over.join("\n")}`,
    ).toEqual([]);
    expect([...counts.values()].reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(
      64,
    );
  });

  it("has no file over its nebula-blue ink budget", () => {
    const counts = census(NEBULA_BLUE_TINT_RE, NEBULA_BLUE_INK_RE);
    const over = overBudget(counts, NEBULA_BLUE_LEDGER);
    expect(
      over,
      `new same-line text-nebula-blue on a >=15 nebula-blue tint:\n${over.join("\n")}`,
    ).toEqual([]);
    expect([...counts.values()].reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(
      21,
    );
  });
});
