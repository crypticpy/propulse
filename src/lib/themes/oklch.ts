/**
 * Hex ↔ OKLCH helpers for the Appearance saturation slider.
 *
 * OKLab matrices are Björn Ottosson's 2021 sRGB implementation. No colour
 * library is on the dependency list, and the only operation we need is
 * "multiply C, stay in gamut, return #rrggbb".
 */

export interface Oklch {
  L: number;
  C: number;
  h: number;
}

function srgbToLinear(channel: number): number {
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(channel: number): number {
  return channel <= 0.0031308
    ? 12.92 * channel
    : 1.055 * channel ** (1 / 2.4) - 0.055;
}

function parseHex(hex: string): [number, number, number] | null {
  const raw = hex.trim().replace(/^#/, "");
  const expanded =
    raw.length === 3 ? raw.replace(/./g, (digit) => digit + digit) : raw;
  if (!/^[0-9a-f]{6}$/i.test(expanded)) return null;
  return [
    parseInt(expanded.slice(0, 2), 16) / 255,
    parseInt(expanded.slice(2, 4), 16) / 255,
    parseInt(expanded.slice(4, 6), 16) / 255,
  ];
}

function toHex(r: number, g: number, b: number): string {
  const channel = (value: number) =>
    Math.round(Math.min(1, Math.max(0, value)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

function linearRgbToOklab(
  r: number,
  g: number,
  b: number,
): { L: number; a: number; b: number } {
  // Ottosson 2021-01-25 linear sRGB → LMS (ok_color.h / the Oklab post).
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);
  return {
    L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  };
}

function oklabToLinearRgb(
  L: number,
  a: number,
  b: number,
): { r: number; g: number; b: number } {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
}

function inSrgbGamut(r: number, g: number, b: number): boolean {
  return r >= 0 && r <= 1 && g >= 0 && g <= 1 && b >= 0 && b <= 1;
}

function chromaInGamut(L: number, C: number, h: number): boolean {
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const rgb = oklabToLinearRgb(L, a, b);
  return inSrgbGamut(rgb.r, rgb.g, rgb.b);
}

/** Reduce C until the colour fits sRGB. L and hue stay put. */
function clampChromaToGamut(L: number, C: number, h: number): number {
  if (C === 0 || chromaInGamut(L, C, h)) return C;
  let lo = 0;
  let hi = C;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (chromaInGamut(L, mid, h)) lo = mid;
    else hi = mid;
  }
  return lo;
}

export function hexToOklch(hex: string): Oklch | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const lab = linearRgbToOklab(
    srgbToLinear(rgb[0]),
    srgbToLinear(rgb[1]),
    srgbToLinear(rgb[2]),
  );
  const C = Math.hypot(lab.a, lab.b);
  return {
    L: lab.L,
    C,
    h: C === 0 ? 0 : Math.atan2(lab.b, lab.a),
  };
}

/**
 * Multiply OKLCH chroma by `factor` and return an in-gamut `#rrggbb`.
 * Factor 1 is a true identity: the input string is returned unchanged so
 * lockstep tests against source CSS keep matching.
 */
export function scaleHexChroma(hex: string, factor: number): string {
  if (factor === 1) return hex;
  const oklch = hexToOklch(hex);
  if (!oklch) return hex;
  const C = clampChromaToGamut(oklch.L, oklch.C * factor, oklch.h);
  const a = C * Math.cos(oklch.h);
  const b = C * Math.sin(oklch.h);
  const linear = oklabToLinearRgb(oklch.L, a, b);
  return toHex(
    linearToSrgb(linear.r),
    linearToSrgb(linear.g),
    linearToSrgb(linear.b),
  );
}
