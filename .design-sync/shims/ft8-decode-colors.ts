// Design-sync-only build shim for `@/components/map/layers/Ft8DecodeLayer3D`.
// src/lib/map/layerLegends.ts imports only FT8_DECODE_COLORS; the real file
// imports `three` and `@react-three/fiber`. Verbatim port of lines ~87-93.
export const FT8_DECODE_COLORS = {
  cq: "#00ff88", // Green
  qso: "#22d3ee", // Cyan
  needed: "#f59e0b", // Orange
  callingMe: "#ef4444", // Red
  dupe: "#6b7280", // Dim gray
} as const;
