/**
 * Map Overlay Types
 *
 * Renderer-agnostic models for overlay layers (markers/arcs) that can be
 * rendered consistently across 3D globe and 2D canvas map views.
 */

export type MapInteractionMode = "normal" | "contest-targeting";

export interface OverlayMarker {
  id: string;
  lat: number;
  lon: number;
  /** Hex or CSS color string */
  color: string;
  label?: string;
  /** 0..1 */
  opacity?: number;
  /** Suggested pixel radius (2D) / scale hint (3D) */
  size?: number;
}

export interface OverlayArc {
  id: string;
  fromLat: number;
  fromLon: number;
  toLat: number;
  toLon: number;
  color: string;
  opacity?: number;
  width?: number;
}

export type OverlayLayerModel =
  | { type: "markers"; markers: OverlayMarker[] }
  | { type: "arcs"; arcs: OverlayArc[] }
  | { type: "mixed"; markers: OverlayMarker[]; arcs: OverlayArc[] };

