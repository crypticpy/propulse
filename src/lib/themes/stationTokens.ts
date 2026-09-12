/**
 * Station design tokens
 *
 * Canonical palette for the unified design system. The dark palette is the
 * Propulse default; the other themes are token swaps of the same roles.
 * Consumers only ever read the semantic `--su-*` custom properties, which are
 * emitted on the document root by `applyThemeToDocument` and, scoped to a
 * subtree, by `StationProvider`.
 *
 * This module must not import from `src/components/**`: `src/lib/themes/index.ts`
 * depends on it.
 */

import type { CSSProperties } from "react";
import { COLOR_BLIND_PALETTES, type ColorBlindMode } from "./colorblind";
import type { ThemeId } from "./index";
import { scaleHexChroma } from "./oklch";

/** Appearance saturation slider: 80 % … 140 % in 5 % steps, stored as 0.8…1.4. */
export const SATURATION_MIN = 0.8;
export const SATURATION_MAX = 1.4;
export const SATURATION_STEP = 0.05;
export const SATURATION_DEFAULT = 1;

const TONE_ROLES = [
  "accent",
  "info",
  "success",
  "warning",
  "danger",
] as const;

/** Snap a stored or slider value onto the allowed 0.05 grid. Missing/invalid → 1. */
export function clampSaturation(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return SATURATION_DEFAULT;
  }
  const stepped = Math.round(value / SATURATION_STEP) * SATURATION_STEP;
  const clamped = Math.min(SATURATION_MAX, Math.max(SATURATION_MIN, stepped));
  return Math.round(clamped * 20) / 20;
}

export type StationTokenStyle = CSSProperties &
  Record<`--su-${string}`, string>;

/** Custom accents that fail validation fall back to this brand orange. */
export const DEFAULT_ACCENT_HEX = "#ff6b35";

/**
 * The dark palette's canvas hex, hoisted so `hexToChannels`'s fallback
 * channels can be derived from the same value instead of duplicating it as a
 * magic `"20 24 39"` literal.
 */
const DARK_CANVAS_HEX = "#141827";

/**
 * The roles every station palette must define. Spelling the keys out (rather
 * than `Record<string, string>`) is what makes a role missing from one of the
 * four palettes a compile error instead of an `undefined` token at runtime.
 * `purple` (Tailwind's `aurora-purple`) is a decorative accent hue, not a
 * status tone — see the colour-blind swap in `stationTokens` below.
 */
type StationPalette = Record<
  | "canvas"
  | "panel"
  | "input"
  | "text"
  | "muted"
  | "line"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "purple",
  string
>;

/** Canonical palette; components only consume semantic --su-* properties. */
export const stationPalettes = {
  dark: {
    canvas: DARK_CANVAS_HEX,
    panel: "#191e2e",
    input: "#111624",
    text: "#cad2dc",
    muted: "#a0abba",
    line: "#637088",
    info: "#85c4d0",
    success: "#8bdbb0",
    warning: "#f5cf79",
    danger: "#fda4af",
    purple: "#b975f0",
  },
  light: {
    canvas: "#e9ece7",
    panel: "#f3f4ef",
    input: "#edf0ea",
    text: "#1e293b",
    muted: "#425168",
    line: "#748297",
    info: "#176477",
    success: "#166534",
    warning: "#854d0e",
    danger: "#9f1239",
    purple: "#8719e1",
  },
  "high-contrast": {
    canvas: "#000000",
    panel: "#080808",
    input: "#000000",
    text: "#e7e5df",
    muted: "#dddddd",
    line: "#aaaaaa",
    info: "#99eeff",
    success: "#aaffbb",
    warning: "#ffdd88",
    danger: "#ffb4c0",
    purple: "#ad5eed",
  },
  midnight: {
    canvas: "#090b16",
    panel: "#111525",
    input: "#080c17",
    text: "#c4cdd7",
    muted: "#b0b9ca",
    line: "#637088",
    info: "#9fcddb",
    success: "#97dfb7",
    warning: "#efd29a",
    danger: "#f5b2c4",
    purple: "#b268ee",
  },
} satisfies Record<ThemeId, StationPalette>;

function luminance(hex: string) {
  const values = [1, 3, 5].map((start) => {
    const channel = parseInt(hex.slice(start, start + 2), 16) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
}

export function stationContrast(first: string, second: string) {
  const a = luminance(first),
    b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** The design system's floor for status text (`docs/designs/design-system`). */
export const STATUS_TEXT_CONTRAST = 4.5;

/** Floor for graphical accent objects (rules, rings, icon strokes). */
export const GRAPHICAL_CONTRAST = 3;

/** Alpha for Card's default glass surface (`bg-su-line/10`, `Card.tsx`). */
export const CARD_GLASS_ALPHA = 0.1;

type StationPaletteValues = (typeof stationPalettes)[ThemeId];

/**
 * Flatten `hex` at `alpha` over opaque `surface` — what the browser paints for
 * `bg-<token>/N` — and return the resulting opaque `#rrggbb`.
 */
export function compositeOnSurface(
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

/**
 * Surfaces `toneOnPanel` and `--su-accent-text` / `--su-accent-edge` guarantee
 * legibility on: bare panel, Card glass over panel, Card glass over canvas.
 */
export function guaranteedTextSurfaces(
  palette: StationPaletteValues,
): string[] {
  return [
    palette.panel,
    compositeOnSurface(palette.line, CARD_GLASS_ALPHA, palette.panel),
    compositeOnSurface(palette.line, CARD_GLASS_ALPHA, palette.canvas),
  ];
}

function worstContrast(ink: string, surfaces: string[]): number {
  return Math.min(...surfaces.map((surface) => stationContrast(ink, surface)));
}

function meetsContrastFloor(
  ink: string,
  surfaces: string[],
  floor: number,
): boolean {
  return worstContrast(ink, surfaces) >= floor;
}

/** Blend `hex` `amount` of the way toward `toward`; both are `#rrggbb`. */
function mixHex(hex: string, toward: string, amount: number): string {
  const from = hexToChannels(hex).split(" ").map(Number);
  const to = hexToChannels(toward).split(" ").map(Number);
  return `#${from
    .map((channel, index) =>
      Math.round(channel + (to[index] - channel) * amount)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/**
 * Fit a colour-blind tone to the active palette.
 *
 * `COLOR_BLIND_PALETTES` is one fixed set of hues chosen for distinguishability,
 * but the station palettes are not fixed: tritanopia's `#DDCC77` reads at
 * 1.5:1 on the Light panel and deuteranopia's `#0077BB` at 3.7:1 on the dark
 * one, and DS-09 routes the app-wide `text-caution-amber`/`text-signal-green`
 * utilities through these tokens. Blend the tone toward the pole furthest from
 * the surface until it clears the status-text floor on every guaranteed
 * surface (bare panel and Card glass over panel/canvas): lightness moves, the
 * hue that makes the mode legible does not.
 */
function toneOnPanel(tone: string, palette: StationPaletteValues): string {
  const surfaces = guaranteedTextSurfaces(palette);
  if (meetsContrastFloor(tone, surfaces, STATUS_TEXT_CONTRAST)) return tone;
  const pole = luminance(palette.panel) > 0.18 ? "#000000" : "#ffffff";
  for (let amount = 0.1; amount < 1; amount += 0.1) {
    const mixed = mixHex(tone, pole, amount);
    if (meetsContrastFloor(mixed, surfaces, STATUS_TEXT_CONTRAST)) return mixed;
  }
  return pole;
}

/** Custom accents get a contrasting label; malformed persisted values use plasma. */
export function stationTokens(
  theme: ThemeId,
  requestedAccent: string,
  colorBlindMode: ColorBlindMode = "none",
  saturation: number = SATURATION_DEFAULT,
): StationTokenStyle {
  const palette = stationPalettes[theme];
  const accent = /^#[0-9a-f]{6}$/i.test(requestedAccent)
    ? requestedAccent
    : DEFAULT_ACCENT_HEX;
  const colors: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(palette).map(([name, value]) => [`--su-${name}`, value]),
    ),
    "--su-accent": accent,
  };
  // Colour-blind mode swaps the three tone roles for a palette whose hues stay
  // distinguishable. It is folded in here (rather than layered on afterwards by
  // a CSS rule or a second pass) so the document root and every scoped
  // `.station-ui` subtree agree, and so a later theme/accent change cannot
  // silently overwrite the swap.
  // `purple` is deliberately not in this swap: the three roles below carry
  // status meaning (good/fair/poor), which is what a colour-blind operator
  // needs kept distinguishable. `purple` is a decorative accent hue (Pro
  // badges, RTTY, hazardous AQI), so remapping it would spend one of the
  // palette's distinguishable hues on a colour that carries no state.
  const colorBlind = COLOR_BLIND_PALETTES[colorBlindMode];
  if (colorBlind) {
    colors["--su-success"] = toneOnPanel(colorBlind.good, palette);
    colors["--su-warning"] = toneOnPanel(colorBlind.fair, palette);
    colors["--su-danger"] = toneOnPanel(colorBlind.poor, palette);
  }
  // Saturation scales chroma of the five tone tokens after the colour-blind
  // swap. Surfaces (canvas/panel/input/text/muted/line) and decorative purple
  // stay put. Factor 1 is a no-op so existing lockstep tests keep matching.
  const factor = clampSaturation(saturation);
  if (factor !== SATURATION_DEFAULT) {
    for (const role of TONE_ROLES) {
      colors[`--su-${role}`] = scaleHexChroma(colors[`--su-${role}`], factor);
    }
    // Chroma scaling happens after toneOnPanel already fit the colour-blind
    // swap to the status-text floor, and can push a status tone back below
    // it (e.g. tritanopia's danger tone on the dark panel at 140%). `accent`
    // is excluded: its text use (`--su-accent-text` below) already re-checks
    // contrast against the scaled value and falls back to `info`.
    for (const role of ["info", "success", "warning", "danger"] as const) {
      colors[`--su-${role}`] = toneOnPanel(colors[`--su-${role}`], palette);
    }
  }
  const scaledAccent = colors["--su-accent"];
  const info = colors["--su-info"];
  const textSurfaces = guaranteedTextSurfaces(palette);
  colors["--su-on-accent"] =
    stationContrast(scaledAccent, "#000000") >=
    stationContrast(scaledAccent, "#ffffff")
      ? "#000000"
      : "#ffffff";
  colors["--su-accent-edge"] = meetsContrastFloor(
    scaledAccent,
    textSurfaces,
    GRAPHICAL_CONTRAST,
  )
    ? scaledAccent
    : info;
  // A custom brand color is never assumed to be legible as text on a panel.
  colors["--su-accent-text"] = meetsContrastFloor(
    scaledAccent,
    textSurfaces,
    STATUS_TEXT_CONTRAST,
  )
    ? scaledAccent
    : info;
  // Channel triplets so Tailwind opacity modifiers (text-su-text/70) resolve
  // inside a scoped StationProvider as well as on the document root.
  const channels = Object.fromEntries(
    Object.entries(colors).map(([name, value]) => [
      `${name}-rgb`,
      hexToChannels(value),
    ]),
  );
  return {
    ...colors,
    ...channels,
    colorScheme: theme === "light" ? "light" : "dark",
  };
}

/** `hexPairsToChannels("141827")` -> `"20 24 39"`; expects six lowercase-safe hex digits, no `#`. */
function hexPairsToChannels(sixDigitHex: string): string {
  return sixDigitHex
    .match(/../g)!
    .map((pair) => parseInt(pair, 16))
    .join(" ");
}

/** `DARK_CANVAS_HEX`'s channels, precomputed so the fallback below never recurses into `hexToChannels`. */
const DARK_CANVAS_CHANNELS = hexPairsToChannels(DARK_CANVAS_HEX.slice(1));

/**
 * `"#ff6b35"` -> `"255 107 53"`; three-digit hex expands first (`"#abc"` ->
 * `"170 187 204"`). Anything that is not a hex colour falls back to the dark
 * palette's canvas channels (`DARK_CANVAS_HEX`) rather than emitting an
 * invalid custom property — callers normalise user-supplied accents before
 * they reach here.
 */
export function hexToChannels(hex: string): string {
  const raw = hex.trim().replace(/^#/, "");
  const expanded =
    raw.length === 3 ? raw.replace(/./g, (digit) => digit + digit) : raw;
  if (!/^[0-9a-f]{6}$/i.test(expanded)) return DARK_CANVAS_CHANNELS;
  return expanded
    .match(/../g)!
    .map((pair) => parseInt(pair, 16))
    .join(" ");
}
