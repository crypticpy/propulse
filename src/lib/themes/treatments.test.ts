import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postcss, { type Rule } from "postcss";
import { describe, expect, it } from "vitest";
import tailwindConfig from "../../../tailwind.config.js";
import type { ColorBlindMode } from "./colorblind";
import {
  applyThemeToDocument,
  getAccentPreset,
  getTheme,
  type ThemeId,
} from "./index";
import { scaleHexChroma } from "./oklch";
import {
  CARD_GLASS_ALPHA,
  SATURATION_MAX,
  SATURATION_MIN,
  SATURATION_STEP,
  SOLID_TEXT_CONTRAST,
  STATUS_TEXT_CONTRAST,
  resolveSolidTreatment,
  stationPalettes,
  stationTokens,
} from "./stationTokens";
import {
  STATION_TREATMENT_STRENGTH,
  STATION_TREATMENT_TONES,
} from "./treatments";

type Rgb = [number, number, number];
const THEMES = Object.keys(stationPalettes) as ThemeId[];
const MODES: ColorBlindMode[] = [
  "none",
  "deuteranopia",
  "protanopia",
  "tritanopia",
];
const ROLES = STATION_TREATMENT_TONES;
const ACCENTS = [
  "#000000",
  "#ffffff",
  "#ff0000",
  "#00ff00",
  "#0000ff",
  "#ffff00",
  "#00ffff",
  "#ff00ff",
  "#777777",
  "#767676",
  "#808080",
  "#010101",
  "#fefefe",
  "#ff6b35",
  "#c020ff",
  "#e020e0",
  "#a0e000",
  "#608020",
  "#123456",
  "#abcdef",
];
const SATURATIONS = Array.from(
  {
    length: Math.round((SATURATION_MAX - SATURATION_MIN) / SATURATION_STEP) + 1,
  },
  (_, index) => Number((SATURATION_MIN + index * SATURATION_STEP).toFixed(2)),
);

/** Independent oracle: retain fractional sRGB channels through every CSS layer. */
function rgb(hex: string): Rgb {
  if (!/^#[\da-f]{6}$/i.test(hex))
    throw new Error(`Not a resolved hex: ${hex}`);
  return [1, 3, 5].map((offset) =>
    parseInt(hex.slice(offset, offset + 2), 16),
  ) as Rgb;
}

function mix(front: Rgb, alpha: number, back: Rgb): Rgb {
  return front.map(
    (channel, index) => channel * alpha + back[index] * (1 - alpha),
  ) as Rgb;
}

function luminance(color: Rgb) {
  const linear = color.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrast(first: Rgb, second: Rgb) {
  const a = luminance(first),
    b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function minimum() {
  let ratio = Infinity;
  let context = "no samples";
  return {
    record(next: number, description: string) {
      if (next < ratio) {
        ratio = next;
        context = description;
      }
    },
    expectAtLeast(floor: number) {
      expect(ratio, `Worst case: ${context}`).toBeGreaterThanOrEqual(floor);
    },
  };
}

describe("shared station treatment contrast", () => {
  it.each(THEMES)(
    "keeps %s base, subtle and solid reading contracts across appearance settings",
    (theme) => {
      const baseMinimum = minimum();
      const restMinimum = minimum();
      const activeMinimum = minimum();
      const solidMinimum = minimum();
      const softInks = [
        stationPalettes.light.text,
        stationPalettes["high-contrast"].text,
      ];
      const failures: string[] = [];

      for (const mode of MODES)
        for (const saturation of SATURATIONS)
          for (const accent of ACCENTS) {
            const tokens = stationTokens(theme, accent, mode, saturation);
            const context = `${theme}/${mode}/${saturation}/${accent}`;
            const text = rgb(tokens["--su-text"]);
            const panel = rgb(tokens["--su-panel"]);

            // Solid fitting must never rewrite the custom accent after its existing transform.
            if (tokens["--su-accent"] !== scaleHexChroma(accent, saturation)) {
              failures.push(
                `${context}: raw accent changed by solid resolution`,
              );
            }
            for (const surface of ["canvas", "panel", "input"]) {
              baseMinimum.record(
                contrast(text, rgb(tokens[`--su-${surface}`])),
                `${context}/${surface}`,
              );
            }
            for (const role of ROLES) {
              const raw = tokens[`--su-${role === "neutral" ? "muted" : role}`];
              const tone = rgb(raw);
              const label = `${context}/${role}`;
              restMinimum.record(
                contrast(
                  text,
                  mix(tone, STATION_TREATMENT_STRENGTH.rest, panel),
                ),
                label,
              );
              activeMinimum.record(
                contrast(
                  text,
                  mix(tone, STATION_TREATMENT_STRENGTH.active, panel),
                ),
                label,
              );

              const fill = tokens[`--su-solid-${role}-fill`];
              const ink = tokens[`--su-solid-${role}-ink`];
              solidMinimum.record(contrast(rgb(fill), rgb(ink)), label);
              if (!softInks.includes(ink))
                failures.push(`${label}: noncanonical solid ink ${ink}`);
              const alreadyReadable = softInks.some(
                (candidate) =>
                  contrast(tone, rgb(candidate)) >= SOLID_TEXT_CONTRAST,
              );
              if (alreadyReadable && fill !== raw)
                failures.push(`${label}: changed already-readable fill`);
            }
          }

      expect(failures).toEqual([]);
      baseMinimum.expectAtLeast(7);
      restMinimum.expectAtLeast(7);
      activeMinimum.expectAtLeast(STATUS_TEXT_CONTRAST);
      solidMinimum.expectAtLeast(SOLID_TEXT_CONTRAST);
    },
  );

  it("keeps strengths and opaque solid pairs outside the RGB opacity API", () => {
    const tokens = stationTokens("dark", "#ff6b35");
    for (const [state, strength] of Object.entries(
      STATION_TREATMENT_STRENGTH,
    )) {
      expect(tokens[`--su-treatment-${state}-strength`]).toBe(
        `${strength * 100}%`,
      );
      expect(tokens[`--su-treatment-${state}-strength-rgb`]).toBeUndefined();
    }
    for (const role of ROLES)
      for (const part of ["fill", "ink"] as const) {
        const name = `--su-solid-${role}-${part}` as const;
        expect(tokens[name]).toMatch(/^#[\da-f]{6}$/i);
        expect(tokens[`${name}-rgb`]).toBeUndefined();
      }
  });

  it("fits previously unreadable fills without introducing pure-white text", () => {
    const softInks = [
      stationPalettes.light.text,
      stationPalettes["high-contrast"].text,
    ];
    for (const fill of ["#777777", "#c020ff", "#e400e4"]) {
      expect(
        Math.max(...softInks.map((ink) => contrast(rgb(fill), rgb(ink)))),
      ).toBeLessThan(STATUS_TEXT_CONTRAST);
      const fitted = resolveSolidTreatment(fill);
      expect(fitted.fill).not.toBe(fill);
      expect(softInks).toContain(fitted.ink);
      expect(
        contrast(rgb(fitted.fill), rgb(fitted.ink)),
      ).toBeGreaterThanOrEqual(SOLID_TEXT_CONTRAST);
      expect(resolveSolidTreatment(fitted.fill).fill).toBe(fitted.fill);
    }
    for (const fill of ["#ff6b35", "#000000", "#ffffff"]) {
      expect(resolveSolidTreatment(fill).fill).toBe(fill);
    }
  });

  it("keeps the malformed custom-accent fallback paired and readable", () => {
    const fallback = stationTokens("dark", "#ff6b35");
    const malformed = stationTokens("dark", "invalid persisted color");
    for (const name of ["accent", "solid-accent-fill", "solid-accent-ink"]) {
      expect(malformed[`--su-${name}`]).toBe(fallback[`--su-${name}`]);
    }
  });

  it("rejects unresolved or alpha-bearing solid input at the numerical boundary", () => {
    for (const value of [
      "",
      "#fff",
      "#12345g",
      "#12345678",
      "rgba(1, 2, 3, 0.5)",
      "var(--su-accent)",
    ]) {
      expect(() => resolveSolidTreatment(value)).toThrow(TypeError);
    }
    const pair = resolveSolidTreatment("#ABCDEF");
    expect(pair.fill).toBe("#ABCDEF");
    expect(contrast(rgb(pair.fill), rgb(pair.ink))).toBeGreaterThanOrEqual(
      SOLID_TEXT_CONTRAST,
    );
  });

  it("demonstrates why active fills replace rest fills and own descendant ink", () => {
    const tokens = stationTokens("dark", "#ffffff");
    const text = rgb(tokens["--su-text"]),
      tone = rgb(tokens["--su-accent"]);
    const panel = rgb(tokens["--su-panel"]),
      muted = rgb(tokens["--su-muted"]);
    const rest = mix(tone, STATION_TREATMENT_STRENGTH.rest, panel);
    const active = mix(tone, STATION_TREATMENT_STRENGTH.active, panel);
    const incorrectlyStacked = mix(
      tone,
      STATION_TREATMENT_STRENGTH.active,
      rest,
    );
    expect(contrast(text, active)).toBeGreaterThanOrEqual(STATUS_TEXT_CONTRAST);
    expect(contrast(text, incorrectlyStacked)).toBeLessThan(
      STATUS_TEXT_CONTRAST,
    );
    expect(contrast(muted, rest)).toBeGreaterThanOrEqual(STATUS_TEXT_CONTRAST);
    expect(contrast(muted, active)).toBeLessThan(STATUS_TEXT_CONTRAST);
  });

  it("distinguishes opaque rest backgrounds from extra tints on nested glass", () => {
    const tokens = stationTokens("dark", "#ffffff");
    const text = rgb(tokens["--su-text"]),
      tone = rgb(tokens["--su-accent"]);
    const panel = rgb(tokens["--su-panel"]),
      line = rgb(tokens["--su-line"]);
    const glass = mix(line, CARD_GLASS_ALPHA, panel);
    const hoveredGlass = mix(line, CARD_GLASS_ALPHA, glass);
    expect(
      contrast(text, mix(tone, STATION_TREATMENT_STRENGTH.rest, panel)),
    ).toBeGreaterThanOrEqual(7);
    expect(
      contrast(text, mix(tone, STATION_TREATMENT_STRENGTH.rest, hoveredGlass)),
    ).toBeLessThan(7);
  });

  it("keeps startup and fixed-dark fallback pairs consistent with the resolver", () => {
    const css = postcss.parse(
      readFileSync(resolve("src/styles/globals.css"), "utf8"),
    );
    const declarations = (selector: string) => {
      const rule = css.nodes.find(
        (node): node is Rule =>
          node.type === "rule" && node.selector === selector,
      );
      expect(rule, `Missing fallback scope ${selector}`).toBeDefined();
      const values: Record<string, string> = {};
      rule!.walkDecls((declaration) => {
        values[declaration.prop] = declaration.value;
      });
      return values;
    };
    const root = declarations(":root");
    const fixedDark = declarations(".su-fixed-dark");
    const tokens = stationTokens("dark", "#ff6b35");
    // Tailwind delegates fallback ownership to :root instead of copying RGB values.
    const colors = tailwindConfig.theme?.extend?.colors;
    if (
      !colors ||
      typeof colors === "function" ||
      typeof colors.su !== "object"
    ) {
      throw new Error(
        "Expected static station color aliases in Tailwind config",
      );
    }
    for (const [name, alias] of Object.entries(colors.su)) {
      expect(alias).toBe(`rgb(var(--su-${name}-rgb) / <alpha-value>)`);
      expect(root[`--su-${name}-rgb`]).toMatch(/^\d+ \d+ \d+$/);
      expect(root[`--su-${name}-rgb`]).toBe(tokens[`--su-${name}-rgb`]);
    }
    for (const state of Object.keys(STATION_TREATMENT_STRENGTH)) {
      const name = `--su-treatment-${state}-strength` as const;
      expect(root[name]).toBe(tokens[name]);
      expect(root[`${name}-rgb`]).toBeUndefined();
    }
    for (const role of ROLES)
      for (const part of ["fill", "ink"] as const) {
        const name = `--su-solid-${role}-${part}` as const;
        expect(root[name]).toBe(tokens[name]);
        expect(root[`${name}-rgb`]).toBeUndefined();
        if (role === "accent") {
          // Fixed-dark skins intentionally retain the user's accent pair.
          expect(fixedDark[name]).toBeUndefined();
        } else {
          const fixedName = `--su-fixed-dark-solid-${role}-${part}`;
          expect(root[fixedName]).toBe(tokens[name]);
          expect(fixedDark[name]).toBe(`var(${fixedName})`);
        }
      }
  });

  it("updates fixed-dark solid pairs with accessibility and saturation independently of the active theme", () => {
    const root = document.documentElement;
    const previousStyle = root.style.cssText;
    const previousClass = root.className;
    try {
      for (const theme of THEMES)
        for (const mode of MODES)
          for (const saturation of SATURATIONS) {
            applyThemeToDocument(
              getTheme(theme),
              getAccentPreset("plasma"),
              mode,
              saturation,
            );
            const dark = stationTokens("dark", "#ff6b35", mode, saturation);
            for (const role of ROLES) {
              if (role === "accent") continue;
              for (const part of ["fill", "ink"] as const) {
                expect(
                  root.style.getPropertyValue(
                    `--su-fixed-dark-solid-${role}-${part}`,
                  ),
                ).toBe(dark[`--su-solid-${role}-${part}`]);
              }
            }
          }
    } finally {
      root.style.cssText = previousStyle;
      root.className = previousClass;
    }
  });

  it("connects the measured equations to CSS fills, state replacement and descendant ink", () => {
    const css = postcss.parse(
      readFileSync(resolve("src/components/station-ui/treatments.css"), "utf8"),
    );
    const rules: Rule[] = [];
    css.walkRules((rule) => {
      rules.push(rule);
    });
    const normalize = (value: string) => value
      .replace(/\s+/g, " ")
      .replace(/\(\s+/g, "(")
      .replace(/\s+\)/g, ")");
    function properties(selector: string) {
      const rule = rules.find(
        (candidate) =>
          candidate.selector === selector && candidate.parent?.type === "root",
      );
      expect(rule, `Missing root recipe ${selector}`).toBeDefined();
      const declarations: Record<string, string> = {};
      rule!.walkDecls((declaration) => {
        declarations[declaration.prop] = normalize(declaration.value);
      });
      return declarations;
    }
    const equation = (state: keyof typeof STATION_TREATMENT_STRENGTH) =>
      `color-mix(in srgb, var(--su-tone) var(--su-treatment-${state}-strength, ${STATION_TREATMENT_STRENGTH[state] * 100}%), var(--su-panel))`;
    const base = properties(".su-treatment.su-treatment");
    expect(base["--su-treatment-fill"]).toBe(equation("rest"));
    expect(base["background-color"]).toBe("var(--su-treatment-fill)");
    expect(base.color).toBe("var(--su-treatment-ink)");
    expect(base["--su-treatment-ink"]).toBe("var(--su-text)");
    expect(base["--su-treatment-secondary-ink"]).toBe(
      "var(--su-treatment-ink)",
    );
    expect(properties(".su-treatment .su-treatment-secondary").color).toBe(
      "var(--su-treatment-secondary-ink)",
    );

    const activeSelectors: string[] = [];
    css.walkDecls("--su-treatment-fill", (declaration) => {
      if (!declaration.value.includes("--su-treatment-active-strength")) return;
      expect(normalize(declaration.value)).toBe(equation("active"));
      activeSelectors.push((declaration.parent as Rule).selector);
    });
    expect(activeSelectors).toHaveLength(2);
    expect(
      activeSelectors.some((selector) => selector.includes(":hover")),
    ).toBe(true);
    expect(
      activeSelectors.some((selector) =>
        selector.includes('[aria-selected="true"]'),
      ),
    ).toBe(true);
    expect(
      activeSelectors.every((selector) =>
        selector.includes(":not(.su-treatment--solid)"),
      ),
    ).toBe(true);

    const solid = properties(".su-treatment.su-treatment--solid");
    expect(solid["--su-treatment-fill"]).toBe("var(--su-treatment-solid-fill)");
    expect(solid["--su-treatment-ink"]).toBe("var(--su-treatment-solid-ink)");
    expect(
      properties(".su-treatment.su-treatment:focus-visible")["box-shadow"],
    ).toBe("none");
    for (const role of ROLES) {
      const tone = properties(`.su-tone-${role}`);
      expect(tone["--su-tone"]).toBe(
        `var(--su-${role === "neutral" ? "muted" : role})`,
      );
      expect(tone["--su-treatment-solid-fill"]).toBe(
        `var(--su-solid-${role}-fill)`,
      );
      expect(tone["--su-treatment-solid-ink"]).toBe(
        `var(--su-solid-${role}-ink)`,
      );
    }
    // Opacity/filter/inset wash would invalidate the opaque pairs measured above.
    css.walkDecls((declaration) => {
      if (declaration.prop === "opacity") expect(declaration.value).toBe("1");
      if (declaration.prop === "box-shadow")
        expect(declaration.value).toBe("none");
      expect(["filter", "background-image"]).not.toContain(declaration.prop);
    });
    const stationCss = postcss.parse(
      readFileSync(resolve("src/components/station-ui/station-ui.css"), "utf8"),
    );
    stationCss.walkRules((rule) => {
      for (const selector of rule.selectors) {
        if (selector.includes(".su-button") && selector.includes(":hover")) {
          expect(selector).toContain(":not(.su-treatment)");
        }
      }
    });
  });
});
