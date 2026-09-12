/** Per-view style and density, nested by layer so this stays a readable
 * table as more layers move onto shared draw code (#1091). Every field is a
 * measured flat-vs-azimuthal difference or a knob a reviewer sets per view.
 * A constant equal on both maps stays in the layer module instead (e.g.
 * firesLayer.ts's glow-radius-scale and core-alpha constants), not here. */
export interface MapLayerProfile {
  readonly id: "flat" | "azimuthal";
  fires: {
    /** Floor for a fire dot's core radius, on-screen px. */
    minRadiusPx: number;
    /** Cap for the same. */
    maxRadiusPx: number;
    /** MW of fire radiative power per px of core radius. */
    frpPerRadiusPx: number;
    glowAlpha: number;
  };
  quakes: {
    /** Cap for a quake marker's core radius, on-screen px. */
    maxRadiusPx: number;
    /** On-screen px of radius growth per unit of magnitude above the baseline. */
    pxPerMagnitude: number;
  };
}

export const FLAT_LAYER_PROFILE: MapLayerProfile = {
  id: "flat",
  fires: {
    minRadiusPx: 1.5,
    maxRadiusPx: 6,
    frpPerRadiusPx: 80,
    glowAlpha: 0.2,
  },
  quakes: {
    maxRadiusPx: 20,
    pxPerMagnitude: 3,
  },
};

export const AZIMUTHAL_LAYER_PROFILE: MapLayerProfile = {
  id: "azimuthal",
  fires: {
    minRadiusPx: 1.5,
    maxRadiusPx: 5,
    frpPerRadiusPx: 100,
    glowAlpha: 0.25,
  },
  quakes: {
    maxRadiusPx: 15,
    pxPerMagnitude: 2.5,
  },
};
