import * as THREE from "three";

import { GLOBE_OVERLAY_MATERIAL } from "@/lib/map/globeRenderOrder";

/** Create a cloud shell that cannot render a white wash before imagery loads. */
export function createCloudOverlayMaterial(): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({
    opacity: 0.55,
    blending: THREE.NormalBlending,
    side: THREE.FrontSide,
    ...GLOBE_OVERLAY_MATERIAL,
  });
  material.visible = false;
  return material;
}

/** Replace renderer-observed imagery and keep visibility in lockstep with it. */
export function replaceCloudOverlayTexture(
  material: THREE.MeshBasicMaterial,
  texture: THREE.Texture | null,
): void {
  if (material.map && material.map !== texture) material.map.dispose();
  material.map = texture;
  material.visible = texture !== null;
  material.needsUpdate = true;
}
