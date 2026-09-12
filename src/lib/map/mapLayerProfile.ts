/** Per-view style and density. Every field is a measured flat-vs-azimuthal difference or a knob a reviewer sets per view (#1091). Constants equal on both maps stay in the layer module. */
export interface MapLayerProfile {
  readonly id: "flat" | "azimuthal";
  /** Floor for a fire dot's core radius, on-screen px. */
  fireMinRadiusPx: number;
  /** Cap for the same. */
  fireMaxRadiusPx: number;
  /** MW of fire radiative power per px of core radius. */
  fireFrpPerRadiusPx: number;
  /** Outer glow radius as a multiple of the core radius. */
  fireGlowRadiusScale: number;
  fireGlowAlpha: number;
  fireCoreAlpha: number;
}

export const FLAT_LAYER_PROFILE: MapLayerProfile = {
  id: "flat",
  fireMinRadiusPx: 1.5,
  fireMaxRadiusPx: 6,
  fireFrpPerRadiusPx: 80,
  fireGlowRadiusScale: 2,
  fireGlowAlpha: 0.2,
  fireCoreAlpha: 0.7,
};

export const AZIMUTHAL_LAYER_PROFILE: MapLayerProfile = {
  id: "azimuthal",
  fireMinRadiusPx: 1.5,
  fireMaxRadiusPx: 5,
  fireFrpPerRadiusPx: 100,
  fireGlowRadiusScale: 2,
  fireGlowAlpha: 0.25,
  fireCoreAlpha: 0.7,
};
