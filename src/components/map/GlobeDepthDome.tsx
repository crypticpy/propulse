/**
 * GlobeDepthDome Component
 *
 * Invisible, depth-only sphere rendered with the opaque base globe. It
 * writes an analytic near-surface depth at GLOBE_DEPTH_DOME_RADIUS — just
 * above the tile meshes (exactly 1.0, chords dipping below), just below
 * GLOBE_MIN_OVERLAY_RADIUS — so every depth-tested overlay wins the
 * near-side depth contest and gets exact far-side occlusion from the GPU.
 * See the stacking contract in src/lib/map/globeRenderOrder.ts.
 */

import { GLOBE_DEPTH_DOME_RADIUS } from "@/lib/map/globeRenderOrder";

/** Never intercept pointer/pick rays — the dome is not interactive. */
const NO_RAYCAST = () => null;

export function GlobeDepthDome() {
  // renderOrder 1: must draw AFTER the base globe / tile meshes
  // (renderOrder 0). Three's opaque sort ties on material.id before depth,
  // and this material is created before tile/fallback materials load —
  // without the explicit order the dome can draw first and its 1.001 depth
  // discards the globe's near face (radius 1.0). Drawing last in the opaque
  // pass is equivalent for overlay clipping: the transparent pass runs
  // after the whole opaque pass.
  return (
    <mesh name="globe-depth-dome" raycast={NO_RAYCAST} renderOrder={1}>
      <sphereGeometry args={[GLOBE_DEPTH_DOME_RADIUS, 128, 64]} />
      {/* Opaque pipeline (transparent: false) so its depth is in place
          before every transparent overlay. colorWrite: false keeps it out
          of the framebuffer; it exists only for its depth. */}
      <meshBasicMaterial colorWrite={false} />
    </mesh>
  );
}
