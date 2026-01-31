/**
 * Propagation types for PropSphere Professional
 * Types for ionospheric modeling and HF radio wave propagation analysis
 */

/**
 * Ionospheric layer type identifier
 * Represents the major ionospheric layers used in HF propagation
 */
export type IonosphericLayer = "E" | "F1" | "F2";

/**
 * Ionospheric layer parameters from real-time or modeled data
 * These values characterize the ionosphere's ability to refract radio waves
 */
export interface IonosphericParameters {
  /** F2 layer critical frequency in MHz - primary layer for long-distance HF */
  f0F2: number;
  /** F1 layer critical frequency in MHz - present during daytime */
  f0F1: number;
  /** E layer critical frequency in MHz - lower layer, shorter skip distances */
  f0E: number;
  /** F2 layer peak height in km - typically 250-400 km */
  hmF2: number;
  /** F1 layer peak height in km - typically 150-220 km */
  hmF1: number;
  /** E layer peak height in km - typically 90-130 km */
  hmE: number;
  /** M(3000)F2 propagation factor - used for MUF calculations */
  m3000F2: number;
}

/**
 * Frequency limits for a specific propagation path
 * These define the usable frequency range for reliable communication
 */
export interface FrequencyLimits {
  /** Maximum Usable Frequency in MHz - highest frequency that will propagate */
  muf: number;
  /** Frequency of Optimum Traffic in MHz - typically 80-85% of MUF */
  fot: number;
  /** Lowest Usable Frequency in MHz - below this, D-layer absorption is too high */
  luf: number;
  /** Highest Probable Frequency in MHz - 90% probability of MUF (90% MUF) */
  hpf: number;
}

/**
 * Single hop geometry in a multi-hop propagation path
 * Describes the ray path between ground reflections
 */
export interface PropagationHop {
  /** Takeoff angle from the horizontal in degrees (typically 3-30 degrees) */
  takeoffAngle: number;
  /** Height of ionospheric reflection point in km */
  reflectionHeight: number;
  /** Ground distance covered by this single hop in km */
  groundDistance: number;
  /** Ionospheric layer used for this reflection */
  layer: IonosphericLayer;
}

/**
 * Complete propagation path analysis between two stations
 * Combines geographic and ionospheric path characteristics
 */
export interface PropagationPath {
  /** Total great-circle path distance in km */
  distance: number;
  /** Initial bearing from transmitter to receiver in degrees from true north (0-360) */
  bearing: number;
  /** Array of ionospheric hops comprising the complete path */
  hops: PropagationHop[];
  /** Latitude of the path midpoint in decimal degrees (-90 to 90) */
  midpointLat: number;
  /** Longitude of the path midpoint in decimal degrees (-180 to 180) */
  midpointLon: number;
  /** Percentage of path currently illuminated by the sun (0-100) */
  pathIllumination: number;
}
