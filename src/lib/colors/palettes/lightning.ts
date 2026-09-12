/**
 * Canvas lightning colors and retained legacy legend constants.
 * Globe and Atmos bolt glyphs use lightningGlyph's live theme tone instead.
 * The legacy globe legend is corrected separately in #1286.
 */

/** Peak current in kA strictly above which Canvas uses a white core. */
export const LIGHTNING_STRONG_KA = 100;
/** Retained for the legacy globe legend; not the current glyph tone. */
export const LIGHTNING_COLOR_WEAK = "#66ccff";
export const LIGHTNING_COLOR_STRONG = "#ffffff";
/** Canvas glow and non-strong core. Exactly 100 kA remains amber. */
export const LIGHTNING_COLOR_FLAT = "#ffe566";

export function getCanvasLightningCoreColor(currentKA: number): string {
  return currentKA > LIGHTNING_STRONG_KA
    ? LIGHTNING_COLOR_STRONG
    : LIGHTNING_COLOR_FLAT;
}
