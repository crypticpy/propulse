// Design-sync-only build shim for `./IonosphericShells` (src/components/map/IonosphericShells.tsx).
// IonosphereLegend imports only these two display maps; the real file imports
// `three` at module top. Verbatim port of lines ~58-72.
export const IONOSPHERE_LAYER_COLORS = {
  D: "#f23020", // red — absorption
  E: "#33d966", // green — sporadic E
  F1: "#4da6f2", // blue — minor refraction
  F2: "#b34dfa", // purple — primary refraction
} as const;

export const IONOSPHERE_LAYER_NAMES = {
  D: "D absorb",
  E: "E skip",
  F1: "F1 refract",
  F2: "F2 bounce",
} as const;
