/** Per-view style and density, nested by layer so this stays a readable
 * table as more layers move onto shared draw code (#1091). Every field is a
 * measured flat-vs-azimuthal difference or a knob a reviewer sets per view.
 * A constant equal on both maps stays in the layer module instead (e.g.
 * firesLayer.ts's glow-radius-scale and core-alpha constants), not here. */
export interface MapLayerProfile {
  readonly id: "flat" | "azimuthal";
  readonly fires: {
    /** Floor for a fire dot's core radius, on-screen px. */
    readonly minRadiusPx: number;
    /** Cap for the same. */
    readonly maxRadiusPx: number;
    /** MW of fire radiative power per px of core radius. */
    readonly frpPerRadiusPx: number;
    readonly glowAlpha: number;
  };
  readonly quakes: {
    /** Cap for a quake marker's core radius, on-screen px. */
    readonly maxRadiusPx: number;
    /** On-screen px of radius growth per unit of magnitude above the baseline. */
    readonly pxPerMagnitude: number;
  };
  readonly weatherAlerts: {
    /** event label drawn when projection.zoomScale is greater than this; 0 means at every zoom */
    readonly labelMinZoomScale: number;
  };
  /** Terminator polyline sampling density for the night-boosted border
   * clip (`bordersLayer.ts`'s `drawNightBoostedBordersLayer`, #1091 PR 7).
   * Differs between the two maps (2 deg on the flat map, 3 deg on the
   * disc) -- a measured visual-density choice per view, not a physical
   * constant. */
  readonly nightClip: {
    readonly stepDeg: number;
  };
  /** Consumed by the azimuthal per-vertex seam strategy in
   * bordersLayer.ts's `traceRing` (#1091 PR 6). Required on both profiles
   * so `traceRing` can read `profile.borders` without a null-check; the
   * flat map's seam (`addWrappedRingPath`, wrap-and-repeat) never reads
   * this group, so FLAT_LAYER_PROFILE carries the azimuthal disc's own
   * values as an intentionally-inert placeholder rather than numbers a
   * flat-map reader would mistake for meaningful. */
  readonly borders: {
    /** Drop a ring vertex when its normalised distance from the disc centre
     * exceeds this. */
    readonly rimDrop: number;
    /** Jump-break (moveTo instead of lineTo) when a step's squared canvas
     * distance exceeds this fraction of the disc radius squared. */
    readonly jumpBreakFraction: number;
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
  weatherAlerts: {
    labelMinZoomScale: 1.5,
  },
  nightClip: {
    stepDeg: 2,
  },
  // Never read by the flat map's wrap-and-repeat seam -- see the interface
  // doc comment above.
  borders: {
    rimDrop: 0.99,
    jumpBreakFraction: 0.25,
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
  weatherAlerts: {
    labelMinZoomScale: 0,
  },
  nightClip: {
    stepDeg: 3,
  },
  borders: {
    rimDrop: 0.99,
    jumpBreakFraction: 0.25,
  },
};
