import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";

import {
  createCloudOverlayMaterial,
  replaceCloudOverlayTexture,
} from "./cloudOverlayMaterial";

describe("cloud overlay material lifecycle", () => {
  it("stays hidden until imagery exists and clears failed refreshes", () => {
    const material = createCloudOverlayMaterial();
    const texture = new THREE.Texture();
    const dispose = vi.spyOn(texture, "dispose");

    expect(material.visible).toBe(false);
    expect(material.map).toBeNull();

    replaceCloudOverlayTexture(material, texture);
    expect(material.visible).toBe(true);
    expect(material.map).toBe(texture);

    replaceCloudOverlayTexture(material, null);
    expect(dispose).toHaveBeenCalledOnce();
    expect(material.visible).toBe(false);
    expect(material.map).toBeNull();

    material.dispose();
  });
});
