/**
 * Lightning strike colors, shared by all three renderers and the legend.
 *
 * The globe and the 2D renderers deliberately encode strike strength
 * differently, so both ramps live here rather than in one view's file:
 *
 * - Globe (LightningOverlay3D) interpolates the strike core continuously
 *   between weak and strong by peak current.
 * - Flat / azimuthal draw a fixed amber marker and switch the core to white
 *   only above {@link LIGHTNING_STRONG_KA}.
 *
 * Keeping both here means LayerLegend can describe whichever view is active
 * without either palette drifting.
 */

/** Peak current (kA) above which the 2D renderers draw a white core. */
export const LIGHTNING_STRONG_KA = 100;

/** Globe: electric blue for a weak strike. */
export const LIGHTNING_COLOR_WEAK = "#66ccff";

/** Globe and 2D: white-hot for the strongest strikes. */
export const LIGHTNING_COLOR_STRONG = "#ffffff";

/** Flat / azimuthal: amber glow and core for anything below the threshold. */
export const LIGHTNING_COLOR_FLAT = "#ffe566";
