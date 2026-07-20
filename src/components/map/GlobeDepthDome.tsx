/**
 * GlobeDepthDome Component
 *
 * Invisible, depth-only sphere rendered right after the base globe. It
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
  // Pass placement is load-bearing. The XYZ tile meshes are created with
  // `transparent: true` (3d-tiles-renderer ImageFormatPlugin), so the whole
  // satellite basemap draws in the TRANSPARENT pass at renderOrder 0. The
  // dome's depth write must land after the basemap's color but before every
  // depth-tested overlay (renderOrder >= tileLabels), so the dome is also
  // transparent-pass, at renderOrder 1. An opaque dome would write depth
  // before the tiles ever draw and depth-discard the entire basemap
  // (black globe). The EarthSphere fallback is opaque and always draws in
  // the earlier opaque pass, so this ordering holds for both basemaps.
  return (
    <mesh name="globe-depth-dome" raycast={NO_RAYCAST} renderOrder={1}>
      <sphereGeometry args={[GLOBE_DEPTH_DOME_RADIUS, 128, 64]} />
      {/* colorWrite: false keeps it out of the framebuffer; depthWrite must
          stay explicitly on (three does not disable it for transparent
          materials, but the intent matters here) — the mesh exists only
          for its depth. */}
      <meshBasicMaterial transparent colorWrite={false} depthWrite={true} />
    </mesh>
  );
}
